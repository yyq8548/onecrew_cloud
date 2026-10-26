import { z } from 'zod';
import { parseApplicationJson, stringifyApplicationJson } from '@onecrew/runtime-contracts/json';

declare global { interface Window { shopify?: { idToken(): Promise<string> } } }
export const platform = z.enum(['youtube', 'tiktok', 'instagram', 'twitter']);
export type Platform = z.infer<typeof platform>;
export const platformLabels: Record<Platform, string> = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', twitter: 'X' };
export const installation = z.object({ workspace: z.object({ shop: z.string() }), platforms: z.array(platform) });
export const products = z.object({ products: z.object({ nodes: z.array(z.object({ id: z.string(), title: z.string() })), pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }) }) });
export const searchResults = z.object({ hits: z.array(z.object({ source_url: z.string().url(), title: z.string(), author_label: z.string() })) });
export const connection = z.object({ path: z.literal('/connections/socket'), protocol: z.string().regex(/^onecrew\.[a-f0-9]{64}$/), expires_at: z.number(), session_seconds: z.number() });

export async function cloudApi<S extends z.ZodTypeAny>(path: string, schema: S, options: { body?: unknown; signal?: AbortSignal } = {}): Promise<z.output<S>> {
  if (!window.shopify) throw new Error('请从 Shopify 后台打开 OneCrew。');
  const token = await window.shopify.idToken();
  const response = await fetch(path, { method: options.body === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(options.body === undefined ? {} : { body: stringifyApplicationJson(options.body) }), signal: options.signal });
  const value = parseApplicationJson(new Uint8Array(await response.arrayBuffer()));
  if (!response.ok) {
    const failure = z.object({ error: z.object({ code: z.string() }) }).parse(value);
    if (response.status === 401) throw new Error('Shopify 会话已失效，请从后台重新打开 OneCrew。');
    if (failure.error.code === 'shopify.privacy_owner_required') throw new Error('请由店铺所有者查看和下载客户数据请求。');
    if (failure.error.code === 'discovery.review_material_unavailable') throw new Error('这条来源的原始证据尚未准备完成，请完成核验后再查看。');
    if (failure.error.code === 'discovery.revision_changed') throw new Error('任务条件已更新，请刷新结果后再查看证据。');
    if (['cloud.worker_busy', 'cloud.shop_stopping', 'cloud.campaign_busy'].includes(failure.error.code)) throw new Error('店铺已有任务或浏览器操作，请等待结束，或先暂停执行任务。');
    if (failure.error.code.includes('auth') || failure.error.code.includes('login') || failure.error.code.includes('challenge')) throw new Error('平台需要登录或验证，请打开登录窗口完成后重试。');
    throw new Error(`操作未完成（${failure.error.code}），请重试。`);
  }
  return schema.parse(value);
}
