import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { stringifyApplicationJson } from '@onecrew/runtime-contracts/json';
import { Button } from '@/components/ui/button';
import { cloudApi } from './api';

const requests = z.object({ requests: z.array(z.object({ webhook_id: z.string().uuid(), data_request_id: z.string(), created_at: z.number(), delivered_at: z.number().nullable() })) });

export default function PrivacyRequests() {
  const [items, setItems] = useState<z.infer<typeof requests>['requests'] | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lifetime = useRef(new AbortController());
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort(); }, []);

  async function load() {
    setBusy(true); setError('');
    await cloudApi('/api/privacy/requests', requests, { signal: lifetime.current.signal }).then(value => setItems(value.requests), failure => { if (!lifetime.current.signal.aborted) setError(failure instanceof Error ? failure.message : '请求加载失败，请重试。'); });
    setBusy(false);
  }
  async function download(id: string) {
    setBusy(true); setError('');
    await cloudApi(`/api/privacy/requests/${id}/export`, z.record(z.string(), z.unknown()), { signal: lifetime.current.signal }).then(async report => {
      const url = URL.createObjectURL(new Blob([stringifyApplicationJson(report)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `onecrew-customer-data-${id}.json`; document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      await cloudApi(`/api/privacy/requests/${id}/delivered`, z.object({ delivered: z.literal(true) }), { body: {}, signal: lifetime.current.signal });
      const refreshed = await cloudApi('/api/privacy/requests', requests, { signal: lifetime.current.signal }); setItems(refreshed.requests);
    }).catch(failure => { if (!lifetime.current.signal.aborted) setError(failure instanceof Error ? failure.message : '下载失败，请重试。'); });
    setBusy(false);
  }
  return <details className="space-y-4 rounded-lg border p-4" onToggle={event => { if (event.currentTarget.open && items === null && !busy) void load(); }}>
    <summary className="cursor-pointer text-sm font-medium">客户数据请求</summary>
    <p className="text-sm text-muted-foreground">店铺所有者可下载 Shopify 客户数据请求的结果。收到文件后，服务器会清除导出中的个人资料。</p>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button variant="outline" disabled={busy} onClick={() => void load()}>{busy ? '正在处理…' : '刷新请求'}</Button>
    {items?.length === 0 && <p role="status" className="text-sm text-muted-foreground">暂无客户数据请求。</p>}
    <ul className="space-y-3">{items?.map(item => <li key={item.webhook_id} className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>请求 {item.data_request_id} · {item.delivered_at === null ? '待下载' : '已提供'}</span>{item.delivered_at === null && <Button variant="outline" disabled={busy} onClick={() => void download(item.webhook_id)}>下载结果</Button>}</li>)}</ul>
  </details>;
}
