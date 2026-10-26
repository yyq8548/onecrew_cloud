import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { lstat, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { acquireInstanceLock, type InstanceLease } from "../service/instance-lock.ts";
import { createPrivateDirectory, verifyPrivateDirectory } from "../storage/private-backup.ts";
import { OpenCliAddons } from "../platforms/opencli/addons.ts";
import { runTrustedOpenCliProcess } from "../platforms/opencli/process.ts";
import { parseOpenCliBridgeStatus, parseOpenCliVersion } from "../platforms/opencli/registry.ts";
import { VERIFIED_OPENCLI_VERSION } from "../platforms/opencli/installation.ts";

const absolutePath = z.string().min(1).refine(value => isAbsolute(value) && !value.includes("\0") && value.isWellFormed());
const configuration = z.strictObject({ dataDirectory: absolutePath, addonsDirectory: absolutePath, chromiumPath: absolutePath, extensionDirectory: absolutePath, openCliScript: absolutePath, daemonScript: absolutePath });
export type LinuxBrowserConfiguration = z.infer<typeof configuration>;

async function verifyImagePath(path: string, directory: boolean): Promise<void> {
  if (await realpath(path) !== resolve(path)) throw new Error("cloud.browser_image_path_alias");
  const info = await lstat(path);
  if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile())) throw new Error("cloud.browser_image_path_invalid");
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  let forced = false;
  const deadline = setTimeout(() => { forced = true; child.kill("SIGKILL"); }, 10000);
  try { await exited; } finally { clearTimeout(deadline); }
  if (forced) throw new Error("cloud.browser_graceful_close_failed");
}

// 一个容器一个用户 home、虚拟显示和浏览器；不复用商家电脑的 Cookie。
export async function startLinuxBrowserEnvironment(input: LinuxBrowserConfiguration, signal?: AbortSignal, owner?: InstanceLease) {
  const config = configuration.parse(input);
  signal?.throwIfAborted();
  if (process.platform !== "linux" || process.getuid?.() === 0) throw new Error("cloud.nonroot_linux_required");
  if (resolve(homedir()) !== resolve(config.dataDirectory)) throw new Error("cloud.browser_home_mismatch");
  await verifyPrivateDirectory(config.dataDirectory);
  await using opening = new AsyncDisposableStack();
  const lease = owner ?? await acquireInstanceLock(config.dataDirectory);
  lease.assertOwned();
  if (resolve(lease.directory) !== resolve(config.dataDirectory)) throw new Error("cloud.browser_directory_owner_mismatch");
  if (!owner) opening.defer(() => lease.close());
  for (const path of [config.chromiumPath, config.openCliScript, config.daemonScript]) await verifyImagePath(path, false);
  await verifyImagePath(config.extensionDirectory, true);
  const profileDirectory = join(config.dataDirectory, "profile");
  const profile = await lstat(profileDirectory).then(value => value, error => { if (error.code === "ENOENT") return null; throw error; });
  if (profile) await verifyPrivateDirectory(profileDirectory);
  else await createPrivateDirectory(profileDirectory);
  const addons = new OpenCliAddons(config.addonsDirectory, config.dataDirectory);
  // Cloud 镜像升级后，用原原子修复流程更新快照内的旧适配器，保留浏览器资料。
  await addons.repair(true);
  const installation = { executable: process.execPath, script: config.openCliScript };
  const version = parseOpenCliVersion((await runTrustedOpenCliProcess(installation, ["--version"], { deadlineMs: 15000, configurationDirectory: addons.configurationDirectory })).stdout);
  if (version !== VERIFIED_OPENCLI_VERSION) throw new Error("cloud.browser_opencli_version_changed");

  const failure = Promise.withResolvers<Error>();
  const cancellation = new AbortController();
  const stopped = signal ? AbortSignal.any([signal, cancellation.signal]) : cancellation.signal;
  let stopping = false;
  const assertRunning = () => { lease.assertOwned(); stopped.throwIfAborted(); };
  const start = async (component: string, executable: string, args: string[], env?: NodeJS.ProcessEnv) => {
    assertRunning();
    const child = spawn(executable, args, { shell: false, stdio: "ignore", env: env ?? process.env });
    await once(child, "spawn");
    child.once("exit", () => {
      if (!stopping) {
        const error = new Error(`cloud.browser_${component}_exited`);
        cancellation.abort(error); failure.resolve(error);
      }
    });
    opening.defer(() => stopChild(child));
    return child;
  };
  // 初始化失败时也先设置停止状态，再关闭已启动的资源。
  let initialized = false;
  try {
    await start("display", "/usr/bin/Xvfb", [":99", "-screen", "0", "1280x800x24", "-nolisten", "tcp"]);
    const environment = { ...process.env, DISPLAY: ":99", OPENCLI_CONFIG_DIR: addons.configurationDirectory };
    const deadline = Date.now() + 30000;
    let displayReady = false;
    while (!displayReady && Date.now() < deadline) {
      assertRunning();
      const probe = spawn("/usr/bin/xdpyinfo", ["-display", ":99"], { stdio: "ignore", timeout: 1000, signal: stopped });
      const [code] = await once(probe, "exit");
      if (code !== 0 && code !== 1) throw new Error("cloud.display_probe_failed");
      displayReady = code === 0;
      if (!displayReady) await delay(100, undefined, { signal: stopped });
    }
    if (!displayReady) throw new Error("cloud.display_unavailable");
    await start("daemon", process.execPath, [config.daemonScript], environment);
    await start("chrome", config.chromiumPath, [
      `--user-data-dir=${profileDirectory}`, "--no-first-run", "--no-default-browser-check", "--disable-dev-shm-usage", "--disable-sync",
      `--disable-extensions-except=${config.extensionDirectory}`, `--load-extension=${config.extensionDirectory}`, "about:blank",
    ], environment);
    let bridgeReady = false;
    while (!bridgeReady && Date.now() < deadline) {
      assertRunning();
      const result = await runTrustedOpenCliProcess(installation, ["daemon", "status"], { deadlineMs: 15000, configurationDirectory: addons.configurationDirectory, signal: stopped });
      const status = parseOpenCliBridgeStatus(result.stdout);
      bridgeReady = status.daemon_running && status.extension_connected;
      if (!bridgeReady) await delay(200, undefined, { signal: stopped });
    }
    if (!bridgeReady) throw new Error("cloud.browser_bridge_unavailable");
    assertRunning();
    const ownership = opening.move();
    let closing: Promise<void> | undefined;
    initialized = true;
    return {
      profileDirectory, version, signal: stopped, failed: failure.promise, assertRunning,
      close(): Promise<void> {
        if (!closing) { stopping = true; cancellation.abort(new Error("cloud.browser_stopping")); closing = ownership.disposeAsync(); }
        return closing;
      },
    };
  } finally { if (!initialized) stopping = true; }
}
