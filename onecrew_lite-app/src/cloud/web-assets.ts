import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Env, Hono } from "hono";
import { getCookie } from "hono/cookie";
import { load } from "cheerio";
import { createShopifyClient, type ShopifyConfiguration } from "../shopify/client.ts";
import { CLOUD_ACCOUNT_COOKIE, type CloudAccountService } from "./account-service.ts";

export async function attachCloudWeb<E extends Env>(app: Hono<E>, directory: string, configuration: ShopifyConfiguration, accounts?: CloudAccountService): Promise<void> {
  if (!isAbsolute(directory)) throw new Error("cloud.absolute_web_directory_required");
  const marker = "__ONECREW_SHOPIFY_API_KEY__";
  if (!/^[a-zA-Z0-9_-]+$/u.test(configuration.apiKey)) throw new Error("cloud.web_configuration_invalid");
  async function readTemplate() {
    const template = await readFile(join(directory, "cloud.html"), "utf8");
    if (template.split(marker).length !== 2) throw new Error("cloud.web_configuration_invalid");
    return template;
  }
  await readTemplate();
  await readFile(join(directory, "cloud-entry.html"), "utf8");
  const client = createShopifyClient(configuration);
  app.get("/", async context => {
    const url = new URL(context.req.url);
    // 构建会替换带哈希的资源，页面始终读取当前构建的引用。
    const template = await readTemplate();
    if (["shop", "hmac", "host", "embedded", "id_token"].some(key => url.searchParams.has(key))) {
      const shop = await client.authenticateDocument(url);
      context.header("Content-Security-Policy", `frame-ancestors https://${shop} https://admin.shopify.com; object-src 'none'; base-uri 'self'`);
      return context.html(template.replace(marker, configuration.apiKey));
    }
    context.header("Referrer-Policy", "same-origin");
    context.header("Content-Security-Policy", "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self' https://access.onecrewai.io");
    const identity = accounts?.current(getCookie(context, CLOUD_ACCOUNT_COOKIE));
    if (identity) {
      const personal = load(template);
      personal('meta[name="shopify-api-key"], script[src*="app-bridge.js"]').remove();
      personal("head").append('<meta name="onecrew-cloud-account" content="__ONECREW_ACCOUNT_WORKSPACE__">');
      return context.html(personal.html().replace("__ONECREW_ACCOUNT_WORKSPACE__", identity.shop));
    }
    const entry = await readFile(join(directory, "cloud-entry.html"), "utf8");
    return context.html(entry.replace("__ONECREW_LOGIN_ERROR__", url.searchParams.get("login_error") === "1" ? "登录没有完成，请重新登录。" : ""));
  });
  app.get("/assets/*", serveStatic({ root: directory }));
  for (const page of ["privacy", "support"] as const) {
    app.get(`/${page}`, async context => {
      context.header("Content-Security-Policy", "frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
      context.header("X-Robots-Tag", "noindex");
      return context.html(await readFile(join(directory, `${page}.html`), "utf8"));
    });
  }
  app.get("/cloud-info.css", serveStatic({ root: directory }));
  app.get("/onecrew-ai-mark.png", serveStatic({ root: directory }));
  app.get("/fonts/*", serveStatic({ root: directory }));
  app.get("/licenses/*", serveStatic({ root: directory }));
}
