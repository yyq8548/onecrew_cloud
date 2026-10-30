import { createServer } from "node:http";
import { chmod, lstat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { getRequestListener } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { acquireInstanceLock } from "../service/instance-lock.ts";
import { OpenCliAddons } from "../platforms/opencli/addons.ts";
import { OpenCliReader } from "../platforms/opencli/reader.ts";
import { OpenCliError } from "../platforms/opencli/errors.ts";
import { cloudPlatform, CLOUD_PLATFORMS } from "./platforms.ts";
import { stringifyApplicationJson } from "../contracts/application-json.ts";
import { browserJobInput, performCloudBrowserRead, type BrowserJobInput, type BrowserJobResult } from "./browser-operations.ts";
import { startLinuxBrowserEnvironment, type LinuxBrowserConfiguration } from "./linux-browser-host.ts";
import { CloudHttpError } from "./http-error.ts";
import { cloudLoginInput, fillBrowserLogin } from "./login-form.ts";

interface Job { input: BrowserJobInput; cancel: AbortController; finished: boolean; result: Promise<BrowserJobResult> }

// 每个店铺一个进程，串行读取；控制接口仅监听私有 Unix socket。
export async function startBrowserWorker(config: LinuxBrowserConfiguration, signal?: AbortSignal, startCold = false) {
  signal?.throwIfAborted();
  await using opening = new AsyncDisposableStack();
  const lease = await acquireInstanceLock(config.dataDirectory);
  opening.defer(() => lease.close());
  const shutdown = new AbortController();
  const stopped = signal ? AbortSignal.any([signal, shutdown.signal]) : shutdown.signal;
  const failed = Promise.withResolvers<Error>();
  let closing = false;
  let pausing = false;
  let inputFinished: Promise<void> | undefined;
  let current: Job | undefined;
  async function open(signal: AbortSignal) {
    const browser = await startLinuxBrowserEnvironment(config, signal, lease);
    const prepared = await (async () => {
      const reader = await OpenCliReader.inspect(new OpenCliAddons(config.addonsDirectory, config.dataDirectory), { executable: process.execPath, script: config.openCliScript }, signal, true);
      const profiles = await reader.connectedProfiles();
      if (profiles.length !== 1) throw new Error("cloud.worker_single_profile_required");
      return { browser, reader, profile: profiles[0]!.context_id };
    })().then(value => value, async error => { await browser.close(); throw error; });
    void browser.failed.then(error => { failed.resolve(error); });
    return prepared;
  }
  let group: Awaited<ReturnType<typeof open>> | undefined = startCold ? undefined : await open(stopped);
  opening.defer(async () => {
    shutdown.abort(new Error("cloud.worker_stopping"));
    current?.cancel.abort(new Error("cloud.worker_stopping"));
    if (current) await current.result;
    await group?.browser.close();
  });
  async function execute(job: Job): Promise<BrowserJobResult> {
    const signal = AbortSignal.any([stopped, job.cancel.signal]);
    let outcome: BrowserJobResult;
    try {
      signal.throwIfAborted();
      group ??= await open(signal);
      const owned = group;
      const binding = { profile: owned.profile, signal: AbortSignal.any([signal, owned.browser.signal]), async assertCurrent() { lease.assertOwned(); owned.browser.assertRunning(); signal.throwIfAborted(); } };
      const source = "public_source" in job.input ? job.input.public_source : null;
      const result = source
        ? { public_page: await owned.reader.readPublicWeb(binding, { url: source.url, async assertApproved() {
          await binding.assertCurrent();
          if (current !== job || job.finished || !("public_source" in job.input) || job.input.public_source.grant !== source.grant || job.input.public_source.url !== source.url) throw new OpenCliError("opencli_invalid_input");
        } }) }
        : "read" in job.input
        ? { read: { method: job.input.read.method, data: await performCloudBrowserRead(owned.reader, binding, job.input.read) } }
        : "platform" in job.input ? { hits: await owned.reader.creatorSearch(binding, job.input.platform, job.input.query, job.input.limit) } : (() => { throw new OpenCliError("opencli_invalid_input"); })();
      signal.throwIfAborted();
      outcome = { id: job.input.id, state: "completed", ...result };
    } catch (error) {
      if (!signal.aborted && !(error instanceof OpenCliError)) {
        const frames = error instanceof Error ? [...(error.stack ?? "").matchAll(/(?:file:\/\/)?\/opt\/onecrew\/browser-worker\.mjs:(\d+):(\d+)/gu)].slice(0, 4).map(match => ({ line: Number(match[1]), column: Number(match[2]) })) : [];
        console.error(JSON.stringify({ event: "cloud.browser_job_failed", errorClass: error instanceof Error ? error.name : "UnknownError", frames }));
      }
      outcome = signal.aborted ? { id: job.input.id, state: "cancelled" } : error instanceof OpenCliError
        ? { id: job.input.id, state: "failed", code: error.code, opencli: { code: error.code, exit_code: error.exitCode, ...(error.diagnostics ? { diagnostics: error.diagnostics } : {}) } }
        : { id: job.input.id, state: "failed", code: "cloud.browser_job_failed" };
    }
    // daemon 中的页面操作也须停止，取消结果在整套浏览器关闭后才返回。
    if (signal.aborted) {
      await group?.browser.close();
      group = undefined;
    }
    return outcome;
  }
  const app = new Hono();
  app.use("*", async (context, next) => {
    context.header("Cache-Control", "no-store");
    if (closing) throw new CloudHttpError("cloud.worker_stopping", 503);
    await next();
  });
  app.use("*", bodyLimit({ maxSize: 16384, onError: context => context.json({ error: "request.too_large" }, 413) }));
  app.get("/status", context => context.json({ version: "1.8.8", platforms: CLOUD_PLATFORMS, cold: group === undefined, profile: group?.profile ?? null, active_job: current && !current.finished ? current.input.id : null }));
  app.post("/pause", async context => {
    await inputFinished;
    if (pausing || current && !current.finished) throw new CloudHttpError("cloud.worker_busy", 409);
    pausing = true;
    try { await group?.browser.close(); group = undefined; return context.json({ state: "paused" }); }
    finally { pausing = false; }
  });
  app.post("/connect", async context => {
    const { platform } = z.strictObject({ platform: cloudPlatform }).parse(await context.req.json());
    if (pausing || current && !current.finished) throw new CloudHttpError("cloud.worker_busy", 409);
    pausing = true;
    try {
      group ??= await open(stopped);
      const owned = group;
      const binding = { profile: owned.profile, signal: stopped, async assertCurrent() { lease.assertOwned(); owned.browser.assertRunning(); stopped.throwIfAborted(); } };
      await owned.reader.openCreatorLoginPage(binding, platform);
      // 复用镜像内固定版本 SDK，使底层会话覆盖网关既有的十五分钟登录窗口。
      const { Page } = await import(new URL("./browser/page.js", pathToFileURL(config.openCliScript)).href) as { Page: new (session: string, idleTimeout: number, contextId: string, windowMode: string) => { tabs(): Promise<unknown> } };
      await new Page("onecrew-login", 900, owned.profile, "foreground").tabs();
      await binding.assertCurrent();
      return context.json({ opened: true });
    } finally { pausing = false; }
  });
  app.post("/login/fill", async context => {
    const input = cloudLoginInput.parse(await context.req.json());
    if (pausing || !group || current && !current.finished) throw new CloudHttpError("cloud.worker_busy", 409);
    pausing = true;
    const settled = Promise.withResolvers<void>(); inputFinished = settled.promise;
    try {
      lease.assertOwned(); group.browser.assertRunning();
      const { Page } = await import(new URL("./browser/page.js", pathToFileURL(config.openCliScript)).href) as { Page: new (session: string, idleTimeout: number, contextId: string, windowMode: string) => Parameters<typeof fillBrowserLogin>[0] };
      return context.json(await fillBrowserLogin(new Page("onecrew-login", 900, group.profile, "foreground"), input));
    } finally { pausing = false; inputFinished = undefined; settled.resolve(); }
  });
  app.post("/disconnect", async context => {
    const { platform } = z.strictObject({ platform: cloudPlatform }).parse(await context.req.json());
    if (pausing || current && !current.finished) throw new CloudHttpError("cloud.worker_busy", 409);
    pausing = true;
    try {
      group ??= await open(stopped);
      const owned = group;
      const binding = { profile: owned.profile, signal: stopped, async assertCurrent() { lease.assertOwned(); owned.browser.assertRunning(); stopped.throwIfAborted(); } };
      const reader = owned.reader.withDiagnostics(error => console.error(JSON.stringify({ event: "cloud.browser_disconnect_failed", code: error.code, diagnostics: error.diagnostics })));
      const receipt = await reader.disconnectCloudPlatform(binding, platform);
      await owned.browser.close(); group = undefined;
      return context.json(receipt);
    } finally { pausing = false; }
  });
  app.post("/jobs", async context => {
    const input = browserJobInput.parse(await context.req.json());
    if (current?.input.id === input.id) {
      if (JSON.stringify(current.input) !== JSON.stringify(input)) throw new CloudHttpError("cloud.worker_job_conflict", 409);
      return context.json({ id: input.id }, 202);
    }
    if (pausing || current && !current.finished) throw new CloudHttpError("cloud.worker_busy", 409);
    const job: Job = { input, cancel: new AbortController(), finished: false,
      result: Promise.resolve().then(() => execute(job)).then(result => { job.finished = true; return result; }, error => {
        failed.resolve(new Error("cloud.worker_drain_failed"));
        throw error;
      }),
    };
    current = job;
    // 结果由读取或取消请求接收；关闭失败仍由进程 failed 信号向外报告。
    void job.result.then(() => undefined, () => undefined);
    return context.json({ id: input.id }, 202);
  });
  const jobFor = (id: string) => { z.uuid().parse(id); if (!current || current.input.id !== id) throw new CloudHttpError("cloud.worker_job_missing", 404); return current; };
  app.get("/jobs/:id", async context => context.body(stringifyApplicationJson(await jobFor(context.req.param("id")).result), 200, { "content-type": "application/json" }));
  app.post("/jobs/:id/cancel", async context => {
    const job = jobFor(context.req.param("id"));
    if (!job.finished) job.cancel.abort(new Error("cloud.worker_cancelled"));
    return context.body(stringifyApplicationJson(await job.result), 200, { "content-type": "application/json" });
  });
  app.onError((error, context) => context.json({ error: error instanceof CloudHttpError || error instanceof OpenCliError ? error.message : "cloud.worker_request_failed" }, error instanceof CloudHttpError ? error.status : error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 500));
  const server = createServer(getRequestListener(app.fetch));
  const socketPath = join(config.dataDirectory, "worker.sock");
  const prior = await lstat(socketPath).then(value => value, error => { if (error.code === "ENOENT") return null; throw error; });
  if (prior) {
    if (!prior.isSocket() || prior.uid !== process.getuid?.()) throw new Error("cloud.worker_socket_invalid");
    await unlink(socketPath);
  }
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => { server.off("error", reject); resolve(); });
  });
  opening.defer(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  await chmod(socketPath, 0o600);
  const ownership = opening.move();
  let stopping: Promise<void> | undefined;
  return { socketPath, failed: failed.promise, close: () => {
    if (!stopping) { closing = true; shutdown.abort(new Error("cloud.worker_stopping")); current?.cancel.abort(new Error("cloud.worker_stopping")); stopping = ownership.disposeAsync(); }
    return stopping;
  } };
}
