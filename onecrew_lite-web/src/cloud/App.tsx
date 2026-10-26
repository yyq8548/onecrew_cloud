import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { cloudApi, installation, products, platformLabels, platform as platformSchema, type Platform } from './api';
import Campaign from './Campaign';
import PrivacyRequests from './PrivacyRequests';
import Mail from './Mail';
const RemoteBrowser = lazy(() => import('./RemoteBrowser'));

export default function CloudApp() {
  const [workspace, setWorkspace] = useState<z.infer<typeof installation> | null>(null);
  const [catalog, setCatalog] = useState<z.infer<typeof products>['products'] | null>(null);
  const [error, setError] = useState(''), [login, setLogin] = useState<Platform | null>(null);
  const [loading, setLoading] = useState(false), [campaignBusy, setCampaignBusy] = useState(false);
  const [disconnecting, setDisconnecting] = useState<Platform | null>(null), [connectionNotice, setConnectionNotice] = useState('');
  const disconnectRequest = useRef<AbortController | null>(null);
  async function load(signal: AbortSignal) {
    setError(''); setLoading(true);
    await cloudApi('/api/shopify/install', installation, { body: {}, signal }).then(async value => {
      setWorkspace(value); const catalog = await cloudApi('/api/products', products, { signal }); setCatalog(catalog.products);
    }).catch(error => { if (!signal.aborted) setError(error instanceof Error ? error.message : '店铺加载失败，请重试。'); });
    if (!signal.aborted) setLoading(false);
  }
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => { controller.abort(); disconnectRequest.current?.abort(); }; }, []);
  async function disconnect(value: Platform) {
    const controller = new AbortController(); disconnectRequest.current = controller;
    setDisconnecting(value); setError(''); setConnectionNotice('');
    await cloudApi('/api/connections/disconnect', z.object({ platform: platformSchema, cleared: z.literal(true) }), { body: { platform: value }, signal: controller.signal }).then(receipt => {
      if (receipt.platform !== value) throw new Error('平台连接发生变化，请刷新后重试。');
      setConnectionNotice(`已断开 ${platformLabels[value]}，需要使用账号时请重新登录。`);
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '断开未完成，请重试。'); });
    if (!controller.signal.aborted) setDisconnecting(null);
  }
  async function moreProducts() {
    if (!catalog?.pageInfo.hasNextPage || !catalog.pageInfo.endCursor) return;
    setLoading(true); setError('');
    await cloudApi(`/api/products?after=${encodeURIComponent(catalog.pageInfo.endCursor)}`, products).then(value => setCatalog({ nodes: [...catalog.nodes, ...value.products.nodes], pageInfo: value.products.pageInfo }), error => setError(error instanceof Error ? error.message : '商品加载失败，请重试。'));
    setLoading(false);
  }
  return <main className="mx-auto flex max-w-6xl flex-col gap-8 p-4 sm:p-8">
    <header className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-4"><h1 className="text-2xl font-semibold">OneCrew</h1><p className="text-sm text-muted-foreground">{workspace?.workspace.shop ?? '正在连接 Shopify 店铺'}</p></header>
    {error && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive"><p>{error}</p>{!workspace && <Button variant="outline" onClick={() => void load(new AbortController().signal)} disabled={loading}>重新连接店铺</Button>}</div>}
    <section className="space-y-4" aria-labelledby="platforms-heading">
      <h2 id="platforms-heading" className="text-lg font-semibold">平台登录</h2>
      <p className="text-sm text-muted-foreground">搜索需要登录或验证时，在平台页面完成后继续。断开前请先停止任务。</p>
      <div className="flex flex-wrap gap-3">{(workspace?.platforms ?? []).map(value => <div key={value} className="flex items-center gap-1"><Button variant="outline" disabled={campaignBusy || login !== null || disconnecting !== null} onClick={() => setLogin(value)}>登录 {platformLabels[value]}</Button><Button variant="ghost" disabled={campaignBusy || login !== null || disconnecting !== null} onClick={() => void disconnect(value)}>{disconnecting === value ? '正在断开…' : `断开 ${platformLabels[value]}`}</Button></div>)}</div>
      {connectionNotice && <p role="status" className="text-sm text-muted-foreground">{connectionNotice}</p>}
    </section>
    {workspace && <Campaign key={workspace.workspace.shop} catalog={catalog} disabled={login !== null || disconnecting !== null} loadingProducts={loading} onMoreProducts={() => void moreProducts()} onBusyChange={setCampaignBusy} />}
    {login && <Suspense fallback={<p role="status">正在加载登录窗口…</p>}><RemoteBrowser platform={login} onClose={() => setLogin(null)} /></Suspense>}
    {workspace && <PrivacyRequests key={`privacy-${workspace.workspace.shop}`} />}
    {workspace && <Mail key={`mail-${workspace.workspace.shop}`} />}
    <footer className="text-xs text-muted-foreground"><a href="/licenses/NOTICE.txt" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">开源软件声明</a></footer>
  </main>;
}
