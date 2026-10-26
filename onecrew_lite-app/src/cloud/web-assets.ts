import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Env, Hono } from "hono";
import { createShopifyClient, type ShopifyConfiguration } from "../shopify/client.ts";

export async function attachCloudWeb<E extends Env>(app: Hono<E>, directory: string, configuration: ShopifyConfiguration): Promise<void> {
  if (!isAbsolute(directory)) throw new Error("cloud.absolute_web_directory_required");
  const template = await readFile(join(directory, "cloud.html"), "utf8");
  const marker = "__ONECREW_SHOPIFY_API_KEY__";
  if (template.split(marker).length !== 2 || !/^[a-zA-Z0-9_-]+$/u.test(configuration.apiKey)) throw new Error("cloud.web_configuration_invalid");
  const html = template.replace(marker, configuration.apiKey), client = createShopifyClient(configuration);
  app.get("/", async context => {
    const shop = await client.authenticateDocument(new URL(context.req.url));
    context.header("Content-Security-Policy", `frame-ancestors https://${shop} https://admin.shopify.com; object-src 'none'; base-uri 'self'`);
    return context.html(html);
  });
  app.get("/assets/*", serveStatic({ root: directory }));
  app.get("/fonts/*", serveStatic({ root: directory }));
  app.get("/licenses/*", serveStatic({ root: directory }));
}
