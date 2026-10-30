import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { installation, products, platformAuth, platformLabels, platform as platformSchema, type Platform, type SavedConnection } from './api';
import { useCloudApi } from './ApiContext';
import WorkspaceShell, { type CloudView } from './WorkspaceShell';
import { Skeleton } from '@/components/ui/skeleton';
import Campaign, { type CampaignActivity } from './Campaign';
import { campaignJob } from './campaign-contracts';
import PrivacyRequests from './PrivacyRequests';
import Mail, { type MailSelection } from './Mail';
import RemoteBrowser from './RemoteBrowser';
const authLabels = { logged_in: '已登录', session_detected: '会话已保存，身份待确认', not_logged_in: '尚未完成登录', unknown: '登录尚未确认', error: '登录检查未完成', public_read: '可公开访问，未确认登录' };

export default function CloudApp({ local = false, account = false }: { local?: boolean; account?: boolean }) {
  const { t, i18n } = useTranslation('cloud');
  const cloudApi = useCloudApi();
  const standalone = local || account;
  const [view, setView] = useState<CloudView>('search');
  const [visited, setVisited] = useState<CloudView[]>(['search']);
  const [mailSelection, setMailSelection] = useState<MailSelection | null>(null), [authorizeUrl, setAuthorizeUrl] = useState('');
  const [workspace, setWorkspace] = useState<z.infer<typeof installation> | null>(null);
  const [catalog, setCatalog] = useState<z.infer<typeof products>['products'] | null>(null);
  const [error, setError] = useState(''), [login, setLogin] = useState<Platform | null>(null);
  const [loading, setLoading] = useState(false), [campaignActivity, setCampaignActivity] = useState<CampaignActivity>({ busy: false, job: null });
  const { busy: campaignBusy, job: runningJob } = campaignActivity;
  const [stoppingJob, setStoppingJob] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<Platform | null>(null), [connectionNotice, setConnectionNotice] = useState('');
  const [authChecks, setAuthChecks] = useState<Partial<Record<Platform, { status: z.infer<typeof platformAuth>['status']; checkedAt: number }>>>({});
  const connectionRequest = useRef<AbortController | null>(null);
  async function load(signal: AbortSignal) {
    setError(''); setLoading(true);
    await cloudApi(standalone ? '/api/workspace' : '/api/shopify/install', installation, { ...(standalone ? {} : { body: {} }), signal }).then(async value => {
      setWorkspace(value);
      if (!standalone) { const catalog = await cloudApi('/api/products', products, { signal }); setCatalog(catalog.products); }
    }).catch(error => { if (!signal.aborted) setError(error instanceof Error ? error.message : '店铺加载失败，请重试。'); });
    if (!signal.aborted) setLoading(false);
  }
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => { controller.abort(); connectionRequest.current?.abort(); }; }, []);
  async function stopSearch(id: string) {
    const controller = new AbortController(); connectionRequest.current = controller;
    setStoppingJob(id); setError(''); setConnectionNotice('');
    await cloudApi(`/api/campaign-jobs/${encodeURIComponent(id)}/cancel`, z.object({ job: campaignJob }), { body: {}, signal: controller.signal }).catch(error => {
      if (!controller.signal.aborted) { setStoppingJob(null); setError(error instanceof Error ? error.message : '停止搜索未完成，请重试。'); }
    });
  }
  async function disconnect(value: Platform) {
    const controller = new AbortController(); connectionRequest.current = controller;
    setDisconnecting(value); setError(''); setConnectionNotice('');
    await cloudApi('/api/connections/disconnect', z.object({ platform: platformSchema, cleared: z.literal(true) }), { body: { platform: value }, signal: controller.signal }).then(receipt => {
      if (receipt.platform !== value) throw new Error('平台连接发生变化，请刷新后重试。');
      setAuthChecks(current => ({ ...current, [value]: { status: 'not_logged_in', checkedAt: Date.now() } }));
      setConnectionNotice(t('已断开 {{platform}}，需要使用账号时请重新登录。', { platform: platformLabels[value] }));
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '断开未完成，请重试。'); });
    if (!controller.signal.aborted) setDisconnecting(null);
  }
  function savedLogin(value: Platform, result: SavedConnection | null) {
    if (!result) {
      setAuthChecks(current => { const next = { ...current }; delete next[value]; return next; });
      setConnectionNotice(t('{{platform}} 窗口已关闭，登录状态未重新核验。', { platform: platformLabels[value] }));
      setLogin(null); return;
    }
    const status = result.auth?.status ?? 'error';
    setAuthChecks(current => ({ ...current, [value]: { status, checkedAt: result.auth ? result.auth.checked_at * 1000 : Date.now() } }));
    setConnectionNotice(status === 'logged_in'
      ? t('{{platform}} 登录已确认，浏览器资料已加密保存。', { platform: platformLabels[value] })
      : status === 'not_logged_in'
        ? t('{{platform}} 浏览器资料已加密保存。请继续登录，进入平台首页或本人主页后再保存检查。', { platform: platformLabels[value] })
        : t('{{platform}} 浏览器资料已加密保存，登录尚未确认。可继续检查平台内的登录状态。', { platform: platformLabels[value] }));
    setLogin(null);
  }
  async function moreProducts() {
    if (!catalog?.pageInfo.hasNextPage || !catalog.pageInfo.endCursor) return;
    setLoading(true); setError('');
    await cloudApi(`/api/products?after=${encodeURIComponent(catalog.pageInfo.endCursor)}`, products).then(value => setCatalog({ nodes: [...catalog.nodes, ...value.products.nodes], pageInfo: value.products.pageInfo }), error => setError(error instanceof Error ? error.message : '商品加载失败，请重试。'));
    setLoading(false);
  }
  return <WorkspaceShell local={standalone} account={account} view={view} onNavigate={value => { setView(value); setVisited(current => current.includes(value) ? current : [...current, value]); }} workspace={standalone ? workspace?.workspace.user?.email ?? t('正在读取个人工作区') : workspace?.workspace.shop ?? t('正在连接店铺')}>
    <div className="mx-auto w-full max-w-screen-2xl space-y-6">
    {error && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive"><p>{t(error)}</p>{!workspace && <Button variant="outline" onClick={() => void load(new AbortController().signal)} disabled={loading}>{t(standalone ? '重新读取工作区' : '重新连接店铺')}</Button>}</div>}
    {local && !workspace && !loading && <div className="space-y-4 rounded-lg border bg-card p-6"><h2 className="font-semibold">{t('连接 OneCrew，开始寻找 KOL')}</h2><p className="text-sm text-muted-foreground">{t('支持手动填写商品，无需 Shopify 店铺。')}</p><Button onClick={() => void cloudApi('/api/mail/pair', z.object({ authorize_url: z.string().url() }), { body: {} }).then(value => setAuthorizeUrl(value.authorize_url), error => setError(error instanceof Error ? error.message : '连接未完成。'))}>{t('连接 OneCrew 账号')}</Button>{authorizeUrl && <Button asChild><a href={authorizeUrl} target="_blank" rel="noopener noreferrer">{t('打开授权页面')}</a></Button>}</div>}
    {!workspace && loading && <div role="status" aria-label={t('正在读取工作区')} className="space-y-4 rounded-lg border bg-card p-6"><Skeleton className="h-6 w-40" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-2/3" /></div>}
    <section hidden={view !== 'accounts'} className="space-y-6" aria-labelledby="platforms-heading">
      <div><h2 id="platforms-heading" className="text-xl font-semibold">{t('平台账号')}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t('在平台内完成登录，进入首页或本人主页后保存。账号选择页还需要点击「继续」。')}</p></div>
      <div className="divide-y rounded-lg border bg-card">{(workspace?.platforms ?? []).map(value => <div key={value} className="flex flex-wrap items-center justify-between gap-4 p-5"><div className="space-y-1"><h3 className="font-medium">{platformLabels[value]}</h3><p className="text-sm text-muted-foreground">{authChecks[value] ? <>{t(authLabels[authChecks[value].status])} · {new Date(authChecks[value].checkedAt).toLocaleTimeString(i18n.resolvedLanguage)}</> : t('尚未检查登录状态')}</p></div><div className="flex items-center gap-2"><Button variant="outline" disabled={campaignBusy || login !== null || disconnecting !== null} onClick={() => setLogin(value)}>{t(!authChecks[value] || authChecks[value].status === 'logged_in' ? '打开浏览器' : authChecks[value].status === 'not_logged_in' ? '继续登录' : '继续检查')}</Button><Button variant="ghost" disabled={campaignBusy || login !== null || disconnecting !== null} onClick={() => void disconnect(value)}>{t(disconnecting === value ? '正在断开…' : '断开账号')}</Button></div></div>)}</div>
      {campaignBusy && <div role="status" className="flex flex-wrap items-center gap-3"><p className="text-sm text-muted-foreground">{t('搜索正在使用浏览器。停止搜索后即可登录平台，已有结果会保留。')}</p>{runningJob && <Button variant="outline" disabled={stoppingJob === runningJob.id || runningJob.phase === 'cancelling'} onClick={() => void stopSearch(runningJob.id)}>{t(stoppingJob === runningJob.id || runningJob.phase === 'cancelling' ? '正在停止搜索…' : '停止搜索，启用登录')}</Button>}</div>}
      {connectionNotice && <p role="status" className="text-sm text-muted-foreground">{connectionNotice}</p>}
    </section>
    {workspace && <div hidden={view !== 'search'}><Campaign key={workspace.workspace.shop} active={view === 'search'} local={standalone} catalog={catalog} disabled={login !== null || disconnecting !== null} loadingProducts={loading} onMoreProducts={() => void moreProducts()} onActivityChange={setCampaignActivity} onMailSelection={selection => { setMailSelection(selection); setView('mail'); setVisited(current => current.includes('mail') ? current : [...current, 'mail']); }} /></div>}
    {login && <RemoteBrowser platform={login} onClose={result => savedLogin(login, result)} />}
    {workspace && !standalone && visited.includes('privacy') && <div hidden={view !== 'privacy'}><PrivacyRequests key={`privacy-${workspace.workspace.shop}`} /></div>}
    {workspace && visited.includes('mail') && <div hidden={view !== 'mail'}><Mail key={`mail-${workspace.workspace.shop}`} selection={mailSelection} local={local} account={account} /></div>}
    </div>
  </WorkspaceShell>;
}
