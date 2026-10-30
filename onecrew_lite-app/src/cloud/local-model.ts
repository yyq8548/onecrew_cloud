import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";

export const LOCAL_MODEL_ENDPOINT = "http://127.0.0.1:8789/v1/chat/completions";

export async function startLocalModel(config: { executable: string; file: string; name: string }, signal: AbortSignal) {
  signal.throwIfAborted();
  // 拒绝接管另一个启动进程的模型；停止本服务时只关闭自己创建的子进程。
  const port = createServer();
  await new Promise<void>((resolve, reject) => {
    port.once("error", reject);
    port.listen(8789, "127.0.0.1", () => port.close(error => error ? reject(error) : resolve()));
  });
  signal.throwIfAborted();
  await using opening = new AsyncDisposableStack();
  const exited = Promise.withResolvers<void>(), failed = Promise.withResolvers<Error>();
  let stopping = false;
  const child = spawn(config.executable, [
    "--model", config.file, "--alias", config.name,
    "--host", "127.0.0.1", "--port", "8789", "--ctx-size", "8192", "--parallel", "1", "--threads", "6",
    "--device", "MTL0", "--n-gpu-layers", "99", "--log-verbosity", "4", "--jinja",
    "--chat-template-kwargs", '{"enable_thinking":false}', "--reasoning-budget", "128", "--reasoning-format", "deepseek", "--no-webui", "--no-slots",
  ], { stdio: ["ignore", "inherit", "inherit"] });
  child.once("close", () => exited.resolve());
  child.once("error", error => failed.resolve(error));
  child.once("exit", (code, signal) => {
    if (!stopping) {
      console.error(JSON.stringify({ event: "cloud.model_exited", exit_code: code, signal }));
      failed.resolve(new Error("cloud.model_exited"));
    }
  });
  opening.defer(async () => {
    stopping = true;
    if (child.pid !== undefined && child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await exited.promise;
  });
  const unavailable = failed.promise.then(error => { throw error; });
  const starting = AbortSignal.any([signal, AbortSignal.timeout(120000)]);
  for (;;) {
    starting.throwIfAborted();
    const response = await Promise.race([
      fetch(new URL("/health", LOCAL_MODEL_ENDPOINT), { signal: starting }).then(value => value, error => {
        if (error instanceof TypeError && error.cause instanceof Error && "code" in error.cause && error.cause.code === "ECONNREFUSED") return null;
        throw error;
      }),
      unavailable,
    ]);
    if (response?.status === 200) {
      z.object({ status: z.literal("ok") }).parse(await response.json());
      break;
    }
    if (response && response.status !== 503) throw new Error("cloud.model_health_failed");
    await response?.body?.cancel();
    await Promise.race([delay(250), unavailable]);
  }
  signal.throwIfAborted();
  const ownership = opening.move();
  console.info(JSON.stringify({ event: "cloud.model_ready", model: config.name }));
  return { failed: failed.promise, close: () => ownership.disposeAsync() };
}
