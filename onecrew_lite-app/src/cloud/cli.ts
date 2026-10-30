import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { basename, isAbsolute } from "node:path";
import { z } from "zod";
import { openCloudStorage } from "./storage.ts";
import { startCloudApplication } from "./application.ts";
import { CloudHttpError } from "./http-error.ts";
import { LOCAL_MODEL_ENDPOINT, startLocalModel } from "./local-model.ts";

process.umask(0o077);
const arguments_ = parseArgs({ options: { "data-directory": { type: "string" } }, allowPositionals: true, strict: true });
const [command] = z.tuple([z.enum(["initialize", "serve"])]).parse(arguments_.positionals);
const directory = z.string().min(1).parse(arguments_.values["data-directory"] ?? process.env.ONECREW_CLOUD_DATA_DIRECTORY);

if (command === "initialize") {
  const storage = await openCloudStorage(directory, true);
  await storage.close();
  console.info(JSON.stringify({ event: "cloud.storage_initialized", directory }));
} else {
  const configuration = z.object({
    SHOPIFY_API_KEY: z.string().min(1), SHOPIFY_API_SECRET: z.string().min(1), SHOPIFY_APPLICATION_URL: z.url(),
    ONECREW_CLOUD_PORT: z.coerce.number().int().min(1).max(65535).default(8788),
    ONECREW_BROWSER_IMAGE: z.string().min(1).default("onecrew-cloud-browser:worker"),
    ONECREW_BROWSER_SECCOMP_PROFILE: z.string().min(1).default(fileURLToPath(new URL("./assets/browser-seccomp.json", import.meta.url))),
    ONECREW_MODEL_ENDPOINT: z.url().default(LOCAL_MODEL_ENDPOINT).refine(value => process.platform !== "darwin" || value === LOCAL_MODEL_ENDPOINT),
    ONECREW_MODEL_NAME: z.string().min(1).default("onecrew-qwen3-4b-q4"),
    ONECREW_MODEL_EXECUTABLE: z.string().refine(isAbsolute).default(fileURLToPath(new URL("../../../.scratch/llama-macos-b11804/llama-b11804/llama-server", import.meta.url))),
    ONECREW_MODEL_FILE: z.string().refine(value => isAbsolute(value) && basename(value) === "Qwen3-4B-Q4_K_M.gguf").default(fileURLToPath(new URL("../../../.scratch/models/Qwen3-4B-Q4_K_M.gguf", import.meta.url))),
    ONECREW_MODEL_REVISION: z.string().min(1).default(process.platform === "darwin" ? "Qwen-bc640142-Q4_K_M:7485fe6f:llama-c7fc509-macos-metal" : "Qwen-bc640142-Q4_K_M:7485fe6f:llama-8c74db29"),
  }).parse(process.env);
  const shutdown = new AbortController(), finished = Promise.withResolvers<unknown>();
  const stop = () => { shutdown.abort(new Error("cloud.stopping")); finished.resolve(undefined); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await using services = new AsyncDisposableStack();
    if (process.platform === "darwin") {
      const model = await startLocalModel({ executable: configuration.ONECREW_MODEL_EXECUTABLE, file: configuration.ONECREW_MODEL_FILE, name: configuration.ONECREW_MODEL_NAME }, shutdown.signal);
      services.defer(() => model.close());
      void model.failed.then(error => finished.resolve(error));
    }
    shutdown.signal.throwIfAborted();
    const application = await startCloudApplication({
      directory, port: configuration.ONECREW_CLOUD_PORT,
      webDirectory: fileURLToPath(new URL("../../../onecrew_lite-web/dist-cloud", import.meta.url)),
      browsers: { image: configuration.ONECREW_BROWSER_IMAGE, seccompProfile: configuration.ONECREW_BROWSER_SECCOMP_PROFILE, dataDirectory: directory },
      model: { endpoint: configuration.ONECREW_MODEL_ENDPOINT, model: configuration.ONECREW_MODEL_NAME, revision: configuration.ONECREW_MODEL_REVISION, timeoutMs: 600000, maximumOutputTokens: 4096, maximumResponseBytes: 1024 * 1024 },
      shopify: { apiKey: configuration.SHOPIFY_API_KEY, apiSecretKey: configuration.SHOPIFY_API_SECRET, applicationUrl: configuration.SHOPIFY_APPLICATION_URL },
      reportFailure: failure => console.error(JSON.stringify({ event: "cloud.request_failed", ...failure })),
      onUninstallFailure: error => {
        console.error(JSON.stringify({ event: "cloud.webhook_processing_failed", errorClass: error instanceof Error ? error.name : "UnknownError", errorCode: error instanceof CloudHttpError ? error.message : undefined }));
        finished.resolve(error);
      },
      onBackgroundFailure: error => {
        console.error(JSON.stringify({ event: "cloud.background_failed", errorClass: error instanceof Error ? error.name : "UnknownError" }));
        finished.resolve(error);
      },
    });
    services.defer(() => application.close());
    shutdown.signal.throwIfAborted();
    console.info(JSON.stringify({ event: "cloud.listening", origin: application.origin }));
    if (await finished.promise !== undefined) process.exitCode = 1;
  } catch (error) {
    if (!shutdown.signal.aborted || error !== shutdown.signal.reason) throw error;
  }
}
