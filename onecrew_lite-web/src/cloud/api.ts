import { z } from 'zod';
import { parseApplicationJson, stringifyApplicationJson } from '@onecrew/runtime-contracts/json';
import { platform } from './campaign-contracts.ts';

declare global { interface Window { shopify?: { idToken(): Promise<string> } } }
export { platform };
export type Platform = z.infer<typeof platform>;
export const platformLabels: Record<Platform, string> = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram' };
export const installation = z.object({ workspace: z.object({ shop: z.string(), user: z.object({ id: z.string(), email: z.string() }).optional() }), platforms: z.array(platform) });
export const products = z.object({ products: z.object({ nodes: z.array(z.object({ id: z.string(), title: z.string() })), pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }) }) });
export const searchResults = z.object({ hits: z.array(z.object({ source_url: z.string().url(), title: z.string(), author_label: z.string() })) });
export const connection = z.object({ path: z.literal('/connections/socket'), protocol: z.string().regex(/^onecrew\.[a-f0-9]{64}$/), expires_at: z.number(), session_seconds: z.number() });
export const platformAuth = z.object({ platform, profile_ref: z.string(), status: z.enum(['logged_in', 'session_detected', 'not_logged_in', 'unknown', 'error', 'public_read']), checked_at: z.number().int(), method: z.enum(['full', 'quick', 'skipped']), issue: z.string().nullable() });
export const savedConnection = z.object({ saved: z.literal(true), auth: platformAuth.nullable(), check_error: z.string().nullable() });
export type SavedConnection = z.infer<typeof savedConnection>;
export const filledLogin = z.object({ filled: z.array(z.enum(['identifier', 'password'])) });

export function createCloudApi(getToken: () => Promise<string | null>, local = false, accountWorkspace?: string) {
  return async function request<S extends z.ZodTypeAny>(path: string, schema: S, options: { body?: unknown; signal?: AbortSignal } = {}): Promise<z.output<S>> {
  const token = await getToken();
  const response = await fetch(path, { method: options.body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: { ...(token === null ? {} : { authorization: `Bearer ${token}` }), ...(accountWorkspace ? { 'x-onecrew-workspace': accountWorkspace } : {}), 'content-type': 'application/json' }, ...(options.body === undefined ? {} : { body: stringifyApplicationJson(options.body) }), signal: options.signal ?? null });
  const value = parseApplicationJson(new Uint8Array(await response.arrayBuffer()));
  if (!response.ok) {
    const failure = z.object({ error: z.object({ code: z.string() }) }).parse(value);
    if (accountWorkspace && (response.status === 401 || failure.error.code === 'cloud.account_changed')) {
      location.assign('/');
      throw new Error('OneCrew 登录状态已更新，正在重新打开工作区。');
    }
    if (failure.error.code === 'cloud.onecrew_login_required') throw new Error('请先连接 OneCrew 账号，无需 Shopify 店铺。');
    if (failure.error.code === 'cloud.native_mail_unavailable') throw new Error('本机 OneCrew 邮件服务无法连接，请启动或重启后重试。');
    if (failure.error.code === 'cloud.native_mail_session_changed') throw new Error('邮箱登录状态已更新，请刷新邮箱连接后重试。');
    if (failure.error.code === 'access.account_changed') throw new Error('OneCrew 账号已切换，请重新启动本机工作台。');
    if (response.status === 401) throw new Error(local ? '本机工作台连接已失效，请重新打开工作台。' : 'Shopify 会话已失效，请从后台重新打开 OneCrew。');
    if (failure.error.code === 'shopify.privacy_owner_required') throw new Error('请由店铺所有者查看和下载客户数据请求。');
    if (failure.error.code === 'shopify.products_forbidden') throw new Error('当前成员没有商品读取权限，请联系店主授予商品权限后重新打开应用。');
    if (failure.error.code === 'cloud.mail_pairing_required') throw new Error('请先连接 OneCrew 账号。');
    if (failure.error.code === 'cloud.mail_binding_changed') throw new Error('邮箱连接已变更，请刷新后重新连接。');
    if (failure.error.code === 'cloud.mail_not_configured') throw new Error('邮箱服务尚未配置。');
    if (failure.error.code === 'cloud.local_shopify_required') throw new Error('请先连接 Shopify 店铺，再使用此功能。');
    if (['gmail_bulk_invalid_input', 'request.invalid_input'].includes(failure.error.code)) throw new Error('请检查发件邮箱、收件人和邮件内容后重新预览。');
    if (['cloud.mail_recipient_unverified', 'cloud.mail_recommendations_changed'].includes(failure.error.code)) throw new Error('所选 KOL 的邮箱或推荐记录已变化，请从结果表重新选择。');
    if (failure.error.code.startsWith('mail_access_') || failure.error.code.startsWith('access.')) throw new Error('OneCrew 邮箱授权不可用，请检查账号连接后重试。');
    if (failure.error.code === 'discovery.review_material_unavailable') throw new Error('这条来源的原始证据尚未准备完成，请完成核验后再查看。');
    if (failure.error.code === 'discovery.revision_changed') throw new Error('任务条件已更新，请刷新结果后再查看证据。');
    if (['cloud.worker_busy', 'cloud.shop_stopping', 'cloud.campaign_busy'].includes(failure.error.code)) throw new Error('工作区已有任务或浏览器操作，请等待结束，或先停止任务。');
    if (['cloud.login_field_missing', 'cloud.login_page_mismatch', 'cloud.login_page_missing'].includes(failure.error.code)) throw new Error('当前页面没有对应的登录框，请先在窗口中打开账号或密码登录页面。');
    if (failure.error.code === 'cloud.login_field_ambiguous') throw new Error('当前登录框无法确认，请在平台页面选择账号或密码登录后再填入。');
    if (failure.error.code.includes('auth') || failure.error.code.includes('login') || failure.error.code.includes('challenge')) throw new Error('平台需要登录或验证，请打开登录窗口完成后重试。');
    throw new Error(`操作未完成（${failure.error.code}），请重试。`);
  }
  return schema.parse(value);
  };
}

export const cloudApi = createCloudApi(async () => {
  if (!window.shopify) throw new Error('请从 Shopify 后台打开 OneCrew。');
  return window.shopify.idToken();
});
