import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { openCloudStorage } from "./storage.ts";
import { startCloudApplication } from "./application.ts";

process.umask(0o077);
const arguments_ = parseArgs({ options: { "data-directory": { type: "string" } }, allowPositionals: true, strict: true });
const [command] = z.tuple([z.enum(["initialize", "serve"])]).parse(arguments_.positionals);
const directory = z.string().min(1).parse(arguments_.values["data-directory"] ?? process.env.ONECREW_CLOUD_DATA_DIRECTORY);

if (command === "initialize") {
  const storage = await openCloudStorage(directory, true);
  await storage.close();
  console.info(JSON.stringify({ event: "cloud.storage_initialized", directory }));
} else {
  const configuration = z.object({ SHOPIFY_API_KEY: z.string().min(1), SHOPIFY_API_SECRET: z.string().min(1), SHOPIFY_APPLICATION_URL: z.url(), ONECREW_CLOUD_PORT: z.coerce.number().int().min(1).max(65535).default(8788), ONECREW_BROWSER_IMAGE: z.string().min(1).default("onecrew-cloud-browser:worker"), ONECREW_BROWSER_SECCOMP_PROFILE: z.string().min(1), ONECREW_MODEL_ENDPOINT: z.url().default("http://127.0.0.1:8789/v1/chat/completions"), ONECREW_MODEL_NAME: z.string().min(1).default("onecrew-qwen3-4b-q4"), ONECREW_MODEL_REVISION: z.string().min(1).default("Qwen-bc640142-Q4_K_M:7485fe6f:llama-8c74db29") }).parse(process.env);
  let application: Awaited<ReturnType<typeof startCloudApplication>> | undefined;
  let shutdown: Promise<void> | undefined;
  const close = () => {
    shutdown ??= application?.close().then(() => undefined, error => {
      process.exitCode = 1;
      console.error(JSON.stringify({ event: "cloud.shutdown_failed", errorClass: error instanceof Error ? error.name : "UnknownError" }));
    });
    return shutdown;
  };
  application = await startCloudApplication({
    directory, port: configuration.ONECREW_CLOUD_PORT,
    webDirectory: fileURLToPath(new URL("../../../onecrew_lite-web/dist-cloud", import.meta.url)),
    browsers: { image: configuration.ONECREW_BROWSER_IMAGE, seccompProfile: configuration.ONECREW_BROWSER_SECCOMP_PROFILE, dataDirectory: directory },
    model: { endpoint: configuration.ONECREW_MODEL_ENDPOINT, model: configuration.ONECREW_MODEL_NAME, revision: configuration.ONECREW_MODEL_REVISION, timeoutMs: 600000, maximumOutputTokens: 4096, maximumResponseBytes: 1024 * 1024 },
    shopify: { apiKey: configuration.SHOPIFY_API_KEY, apiSecretKey: configuration.SHOPIFY_API_SECRET, applicationUrl: configuration.SHOPIFY_APPLICATION_URL },
    reportFailure: failure => console.error(JSON.stringify({ event: "cloud.request_failed", ...failure })),
    onUninstallFailure: error => {
      process.exitCode = 1;
      console.error(JSON.stringify({ event: "cloud.webhook_processing_failed", errorClass: error instanceof Error ? error.name : "UnknownError" }));
      void close();
    },
    onBackgroundFailure: error => {
      process.exitCode = 1;
      console.error(JSON.stringify({ event: "cloud.background_failed", errorClass: error instanceof Error ? error.name : "UnknownError" }));
      void close();
    },
  });
  console.info(JSON.stringify({ event: "cloud.listening", origin: application.origin }));
  process.once("SIGINT", () => { void close(); });
  process.once("SIGTERM", () => { void close(); });
}
