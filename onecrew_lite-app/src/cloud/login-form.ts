import { z } from "zod";
import { cloudPlatform, type CloudPlatform } from "./platforms.ts";
import { CloudHttpError } from "./http-error.ts";

export const cloudLoginInput = z.strictObject({
  platform: cloudPlatform,
  identifier: z.string().max(1024),
  password: z.string().max(1024),
}).refine(value => value.identifier.length > 0 || value.password.length > 0);
export const cloudLoginResult = z.strictObject({ filled: z.array(z.enum(["identifier", "password"])) });

interface LoginPage {
  tabs(): Promise<unknown[]>;
  setActivePage(page: string): void;
  evaluate<T>(fn: (platform: CloudPlatform, field: "identifier" | "password") => T, platform: CloudPlatform, field: "identifier" | "password"): Promise<T>;
  insertText(text: string): Promise<void>;
}

// 只在指定平台的真实登录域名内选择可见字段；返回信息不包含字段值。
function focusLoginField(platform: CloudPlatform, field: "identifier" | "password") {
  const domains = {
    youtube: ["accounts.google.com"],
    tiktok: ["www.tiktok.com", "tiktok.com", "accounts.google.com"],
    instagram: ["www.instagram.com", "instagram.com"],
  };
  if (!domains[platform].includes(location.hostname)) return "wrong_page";
  const identifiers = {
    youtube: 'input[name="identifier"], input[type="email"]',
    tiktok: 'input[name="username"], input[type="email"], input[autocomplete="username"]',
    instagram: 'input[name="username"], input[name="email"]',
  };
  const selector = field === "password"
    ? 'input[type="password"]:not([autocomplete="new-password"])'
    : location.hostname === "accounts.google.com" ? identifiers.youtube : identifiers[platform];
  const inputs = [...document.querySelectorAll<HTMLInputElement>(selector)].filter(input => {
    const style = getComputedStyle(input);
    return !input.disabled && !input.readOnly && input.getClientRects().length > 0 && style.visibility === "visible";
  });
  if (inputs.length === 0) return "missing";
  if (inputs.length !== 1) return "ambiguous";
  const input = inputs[0]!;
  input.focus(); input.select();
  return document.activeElement === input ? "focused" : "unfocused";
}

export async function fillBrowserLogin(page: LoginPage, input: z.infer<typeof cloudLoginInput>) {
  const tabs = z.array(z.object({ page: z.string(), active: z.boolean().optional() })).parse(await page.tabs());
  const target = tabs.find(tab => tab.active);
  if (!target) throw new CloudHttpError("cloud.login_page_missing", 409);
  page.setActivePage(target.page);
  const filled: ("identifier" | "password")[] = [];
  for (const field of ["identifier", "password"] as const) {
    if (!input[field]) continue;
    const status = await page.evaluate(focusLoginField, input.platform, field);
    if (status === "missing") continue;
    if (status !== "focused") throw new CloudHttpError(status === "wrong_page" ? "cloud.login_page_mismatch" : "cloud.login_field_ambiguous", 409);
    // 原生输入不把凭据拼入脚本、进程参数、命令结果或剪贴板。
    await page.insertText(input[field]);
    filled.push(field);
  }
  if (filled.length === 0) throw new CloudHttpError("cloud.login_field_missing", 409);
  return { filled };
}
