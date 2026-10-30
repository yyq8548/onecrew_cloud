import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { CreatorSearchHit } from "../platforms/opencli/search-results.ts";
import { parseApplicationJson, stringifyApplicationJson } from "../contracts/application-json.ts";
import { browserJobInput, browserJobResult, cloudPublicSourceGrant, type CloudBrowserRead, type CloudBrowserReadResult } from "./browser-operations.ts";
import { OpenCliError } from "../platforms/opencli/errors.ts";
import { cloudCreatorSearch } from "./platforms.ts";
import { CloudHttpError } from "./http-error.ts";
import type { OpenCliReader, VerifiedOpenCliPublicSource } from "../platforms/opencli/reader.ts";

export function dockerCommand(args: readonly string[], input?: string, allowed = [0]): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = execFile("docker", [...args], { timeout: 150000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      const code = error ? typeof error.code === "number" ? error.code : -1 : 0;
      if (!allowed.includes(code)) reject(new CloudHttpError("cloud.docker_command_failed", 503));
      else resolve({ stdout, code });
    });
    child.stdin?.once("error", reject);
    child.stdin?.end(input);
  });
}
export class DockerBrowserClient {
  readonly container: string;
  constructor(container: string) { this.container = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/u).parse(container); }
  async request(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
    const output = await dockerCommand(["exec", "-i", this.container, "node", "/opt/onecrew/request.mjs"], stringifyApplicationJson({ method, path, body }), [0, 1]);
    const decoded = await Promise.resolve().then(() => parseApplicationJson(output.stdout)).then(value => value, () => { throw new CloudHttpError("cloud.browser_transport_invalid", 502); });
    const reply = z.object({ status: z.number().int(), body: z.unknown() }).parse(decoded);
    if (reply.status !== 200 && reply.status !== 202) {
      const failure = z.object({ error: z.string().regex(/^[a-z_.]{1,160}$/u) }).parse(reply.body);
      throw new CloudHttpError(failure.error, reply.status === 409 ? 409 : 502);
    }
    return reply.body;
  }
  async #job(input: z.infer<typeof cloudCreatorSearch> | { read: CloudBrowserRead } | { public_source: z.infer<typeof cloudPublicSourceGrant> }, signal: AbortSignal) {
    signal.throwIfAborted();
    const id = randomUUID();
    const accepted = z.object({ id: z.uuid() }).parse(await this.request("POST", "/jobs", browserJobInput.parse({ ...input, id })));
    if (accepted.id !== id) throw new CloudHttpError("cloud.worker_job_conflict", 502);
    let cancellation: Promise<unknown> | undefined;
    const cancel = () => {
      cancellation ??= this.request("POST", `/jobs/${id}/cancel`);
      void cancellation.then(() => undefined, () => undefined);
    };
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    let received = false;
    let terminal: z.infer<typeof browserJobResult>;
    try {
      terminal = browserJobResult.parse(await this.request("GET", `/jobs/${id}`));
      if (terminal.id !== id) throw new CloudHttpError("cloud.worker_job_conflict", 502);
      received = true;
    } finally {
      signal.removeEventListener("abort", cancel);
      if (!received) cancel();
      if (cancellation) await cancellation.then(value => { if (browserJobResult.parse(value).id !== id) throw new OpenCliError("opencli_cancel_pending"); }, () => { throw new OpenCliError("opencli_cancel_pending"); });
    }
    if (signal.aborted || terminal.state === "cancelled") throw new OpenCliError("opencli_cancelled");
    if (terminal.state === "failed") {
      if (terminal.opencli) {
        if (terminal.opencli.code !== terminal.code) throw new CloudHttpError("cloud.browser_transport_invalid", 502);
        throw new OpenCliError(terminal.opencli.code, terminal.opencli.exit_code, terminal.opencli.diagnostics);
      }
      throw new CloudHttpError(terminal.code, 502);
    }
    return terminal;
  }
  async search(input: z.infer<typeof cloudCreatorSearch>, signal: AbortSignal): Promise<CreatorSearchHit[]> {
    const terminal = await this.#job(input, signal);
    if (!("hits" in terminal)) throw new CloudHttpError("cloud.worker_job_conflict", 502);
    return terminal.hits.map(({ material, ...entry }) => material === undefined ? entry : { ...entry, material });
  }
  async read<T extends CloudBrowserRead>(input: T, signal: AbortSignal): Promise<CloudBrowserReadResult<T>> {
    const terminal = await this.#job({ read: input }, signal);
    if (!("read" in terminal) || terminal.read.method !== input.method) throw new CloudHttpError("cloud.worker_job_conflict", 502);
    // 结果由同版本 worker 中的原 Reader 解码，主进程只接收对应任务和方法的结果。
    return terminal.read.data as CloudBrowserReadResult<T>;
  }
  async readPublicWeb(source: VerifiedOpenCliPublicSource, signal: AbortSignal): Promise<Awaited<ReturnType<OpenCliReader["readPublicWeb"]>>> {
    await source.assertApproved();
    const terminal = await this.#job({ public_source: { url: source.url, grant: randomBytes(32).toString("hex") } }, signal);
    await source.assertApproved();
    if (!("public_page" in terminal)) throw new CloudHttpError("cloud.worker_job_conflict", 502);
    return terminal.public_page as Awaited<ReturnType<OpenCliReader["readPublicWeb"]>>;
  }
  archive() {
    const child = spawn("docker", ["exec", this.container, "tar", "-C", "/data", "--exclude=./profile/SingletonLock", "--exclude=./profile/SingletonCookie", "--exclude=./profile/SingletonSocket", "--exclude=./server.lock", "--exclude=./worker.sock", "-cf", "-", "."], { stdio: ["ignore", "pipe", "ignore"] });
    const finished = once(child, "exit").then(([code]) => { if (code !== 0) throw new CloudHttpError("cloud.browser_archive_failed", 502); });
    return { stream: child.stdout, finished };
  }
  restoration() {
    const child = spawn("docker", ["exec", "-i", this.container, "tar", "-C", "/data", "-xf", "-"], { stdio: ["pipe", "ignore", "ignore"] });
    const finished = once(child, "exit").then(([code]) => { if (code !== 0) throw new CloudHttpError("cloud.browser_restore_failed", 502); });
    return { stream: child.stdin, finished };
  }
}
