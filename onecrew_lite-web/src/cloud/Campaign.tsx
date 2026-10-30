import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { products, platform, platformLabels, type Platform } from './api';
import { useCloudApi } from './ApiContext';
import { Skeleton } from '@/components/ui/skeleton';
import CampaignPlan from './CampaignPlan';
import CampaignIssues from './CampaignIssues';
import Results from './Results';
import { campaignConditions, campaignJob, campaignJobStatus, campaignTemplate, campaignTemplateSummary, manualProduct, type CampaignJob, type CampaignJobStatus, type CampaignTemplateSummary } from './campaign-contracts';
import type { MailSelection } from './Mail';

const phases: Record<string, string> = { checking_connection: '检查平台连接', generating_keywords: '生成商品搜索关键词', saving_plan: '保存搜索条件', ready: '准备搜索', searching: '寻找 KOL', verifying: '核验内容与匹配度', finding_contacts: '推荐已保存，正在补查公开联系方式', contacts_incomplete: '推荐已保存，部分联系方式待补查', cancelling: '正在停止', pausing: '正在停止', paused: '已停止', finished: '本次寻找已结束', needs_evidence: '等待补充证据', error: '执行失败', failed: '任务失败', interrupted: '任务已中断' };
const failureMessages: Record<string, string> = {
  'cloud.service_restarted': '服务重启中断了任务，已保存的结果可以继续查看。',
  'cloud.job_interrupted': '任务已中断，请检查平台连接后继续。',
  'cloud.job_cancelled': '已停止寻找，已保存的结果可以继续查看。',
  semantic_unavailable: '模型服务暂不可用，请稍后重试。',
  semantic_timeout: '生成关键词或评分超时，请稍后重试。',
  semantic_invalid_output: '模型输出未通过校验，请重新开始。',
};
function message(error: unknown) { return error instanceof Error ? error.message : '操作未完成，请重试。'; }

export type CampaignActivity = { busy: boolean; job: CampaignJob | null };

export default function Campaign({ catalog, disabled, loadingProducts, onMoreProducts, onActivityChange, onMailSelection, local = false, active }: {
  catalog: z.infer<typeof products>['products'] | null; disabled: boolean; loadingProducts: boolean; onMoreProducts(): void; onActivityChange(value: CampaignActivity): void; onMailSelection(selection: MailSelection): void; local?: boolean; active: boolean;
}) {
  const { t, i18n } = useTranslation('cloud');
  const cloudApi = useCloudApi();
  const [showForm, setShowForm] = useState(false);
  const [productId, setProductId] = useState(''), [platforms, setPlatforms] = useState<Platform[]>([...platform.options]);
  const [manual, setManual] = useState(local), [title, setTitle] = useState(''), [description, setDescription] = useState(''), [vendor, setVendor] = useState(''), [productUrl, setProductUrl] = useState('');
  const [minimum, setMinimum] = useState('2000');
  const [jobs, setJobs] = useState<CampaignJob[]>([]), [status, setStatus] = useState<CampaignJobStatus | null>(null);
  const [selected, setSelected] = useState(''), [error, setError] = useState(''), [mutating, setMutating] = useState(false), [loaded, setLoaded] = useState(false);
  const [pollError, setPollError] = useState('');
  const [templates, setTemplates] = useState<CampaignTemplateSummary[]>([]), [templateId, setTemplateId] = useState(''), [templateReady, setTemplateReady] = useState(true);
  const [savingTemplate, setSavingTemplate] = useState(false), [templateName, setTemplateName] = useState(''), [notice, setNotice] = useState('');
  const templateSelection = useRef('');
  const templateSource = useRef<{ campaign_id: string; expected_revision: number } | null>(null);
  const templateRequest = useRef<{ id: string; name: string; campaign_id: string; expected_revision: number } | null>(null);
  const selectedRef = useRef(''), lifecycle = useRef<AbortController | null>(null), submitting = useRef(false);
  const createRequest = useRef<{ id: string; key: string } | null>(null);
  const executionRequest = useRef<{ campaign: string; id: string; expected_revision: number } | null>(null);
  const refresh = useCallback(async (signal: AbortSignal) => {
    const response = await cloudApi('/api/campaign-jobs', z.object({ jobs: z.array(campaignJob) }), { signal });
    signal.throwIfAborted();
    const id = selectedRef.current || response.jobs.find(job => job.state === 'running')?.id || response.jobs[0]?.id || '';
    selectedRef.current = id; setSelected(id);
    if (id && active) {
      const value = await cloudApi(`/api/campaign-jobs/${encodeURIComponent(id)}`, campaignJobStatus, { signal });
      signal.throwIfAborted(); if (selectedRef.current === id) setStatus(value);
    }
    setJobs(response.jobs); setLoaded(true); setPollError('');
  }, [cloudApi, active]);
  const loadTemplates = useCallback(async (signal: AbortSignal) => {
    const response = await cloudApi('/api/campaign-templates', z.object({ templates: z.array(campaignTemplateSummary) }), { signal });
    signal.throwIfAborted(); setTemplates(response.templates);
  }, [cloudApi]);
  useEffect(() => {
    const controller = new AbortController(); lifecycle.current = controller;
    void loadTemplates(controller.signal).catch(error => { if (!controller.signal.aborted) setError(message(error)); });
    return () => { controller.abort(); lifecycle.current = null; };
  }, [loadTemplates]);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch(error => { if (!controller.signal.aborted) setPollError(message(error)); });
    return () => controller.abort();
  }, [active, refresh]);
  const runningJob = jobs.find(job => job.state === 'running') ?? null;
  const running = runningJob !== null;
  useEffect(() => {
    if (!running) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refresh(controller.signal).catch(error => { if (!controller.signal.aborted) setPollError(message(error)); });
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 10000);
    };
    timer = setTimeout(() => void poll(), 10000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [active, running, refresh]);
  useEffect(() => { onActivityChange({ busy: running || mutating, job: runningJob }); }, [runningJob, mutating, onActivityChange]);
  async function mutate(work: (signal: AbortSignal) => Promise<void>) {
    if (submitting.current || !lifecycle.current) return;
    submitting.current = true; setMutating(true); setError(''); setNotice('');
    const signal = lifecycle.current.signal;
    await work(signal).then(() => refresh(signal)).catch(error => { if (!signal.aborted) setError(message(error)); });
    submitting.current = false; if (!signal.aborted) setMutating(false);
  }
  function select(id: string) {
    selectedRef.current = id; setSelected(id); setStatus(null); setSavingTemplate(false);
    if (lifecycle.current) void refresh(lifecycle.current.signal).catch(error => { if (lifecycle.current && !lifecycle.current.signal.aborted) setError(message(error)); });
  }
  async function selectTemplate(id: string) {
    templateSelection.current = id; setTemplateId(id); setError(''); setTemplateReady(!id);
    const signal = lifecycle.current?.signal;
    if (!id || !signal) return;
    await cloudApi(`/api/campaign-templates/${encodeURIComponent(id)}`, z.object({ template: campaignTemplate }), { signal }).then(value => {
      if (signal.aborted || templateSelection.current !== id) return;
      if (!value.template.conditions) throw new Error('该旧模板没有完整的粉丝条件，请自行选择条件。');
      setPlatforms(value.template.conditions.platforms); setMinimum(String(value.template.conditions.min_followers));
      setTemplateReady(true);
    }).catch(error => { if (!signal.aborted && templateSelection.current === id) setError(message(error)); });
  }
  async function generate(event: FormEvent) {
    event.preventDefault();
    if (!templateReady) { setError('请先成功读取模板条件，或选择自行填写条件。'); return; }
    const conditions = campaignConditions.safeParse({ platforms, min_followers: Number(minimum), target_count: 10 });
    if (!conditions.success) { setError('请选择至少一个平台，并填写有效的最低粉丝数。'); return; }
    let choice: { source: 'manual'; product: z.infer<typeof manualProduct> } | { product_id: string };
    if (manual) {
      const entered = manualProduct.safeParse({ title, description, ...(vendor.trim() ? { vendor: vendor.trim() } : {}), onlineStoreUrl: productUrl.trim() || null });
      if (!entered.success) { setError('请填写商品名称、商品说明及有效的商品链接。'); return; }
      choice = { source: 'manual', product: entered.data };
    } else choice = { product_id: productId };
    const body = templateId ? choice : { ...choice, ...conditions.data };
    const key = JSON.stringify({ templateId, ...body });
    if (createRequest.current?.key !== key) createRequest.current = { id: crypto.randomUUID(), key };
    const id = createRequest.current.id;
    await mutate(async signal => {
      const { job } = await cloudApi(templateId ? `/api/campaign-templates/${encodeURIComponent(templateId)}/generate` : '/api/campaigns', z.object({ job: campaignJob }), { body: { id, ...body }, signal });
      selectedRef.current = job.id; setSelected(job.id); setStatus(null); createRequest.current = null;
      setShowForm(false);
    });
  }
  async function resume() {
    const campaign = status?.campaign;
    if (!campaign) return;
    if (executionRequest.current?.campaign !== campaign.id || executionRequest.current.expected_revision !== campaign.revision) executionRequest.current = { campaign: campaign.id, id: crypto.randomUUID(), expected_revision: campaign.revision };
    const { id, expected_revision } = executionRequest.current;
    await mutate(async signal => {
      const { job } = await cloudApi(`/api/campaigns/${encodeURIComponent(campaign.id)}/start`, z.object({ job: campaignJob }), { body: { id, expected_revision }, signal });
      selectedRef.current = job.id; setSelected(job.id); setStatus(null); executionRequest.current = null;
    });
  }
  async function stop() {
    if (!status) return;
    const id = status.job.id;
    await mutate(async signal => { await cloudApi(`/api/campaign-jobs/${encodeURIComponent(id)}/cancel`, z.object({ job: campaignJob }), { body: {}, signal }); });
  }
  function prepareTemplate() {
    if (!status?.campaign) return;
    templateSource.current = { campaign_id: status.campaign.id, expected_revision: status.campaign.revision };
    setTemplateName(''); setSavingTemplate(true); setNotice('');
  }
  async function saveTemplate() {
    const source = templateSource.current;
    if (!source || source.campaign_id !== status?.campaign?.id) { setError('任务已切换，请重新保存模板。'); return; }
    const name = templateName.trim(), previous = templateRequest.current;
    if (!previous || previous.name !== name || previous.campaign_id !== source.campaign_id || previous.expected_revision !== source.expected_revision) templateRequest.current = { id: crypto.randomUUID(), name, ...source };
    const input = templateRequest.current!;
    await mutate(async signal => {
      await cloudApi('/api/campaign-templates', z.object({ template: campaignTemplate }), { body: input, signal });
      await loadTemplates(signal); templateRequest.current = null; setSavingTemplate(false); setNotice('模板已保存，下次选择商品即可再次寻找 KOL。');
    });
  }
  const blocked = disabled || running || mutating || !loaded;
  const campaign = status?.campaign, code = status?.job.error_code;
  const searchExhausted = campaign?.criteria.automatic_query_expansion === false && campaign.scopes.every(scope => campaign.platform_runs.some(run => run.platform === scope.platform && run.profile_ref === scope.profile_ref && run.status === 'completed' && run.calls_used >= scope.keywords.length));
  const phase = status?.job.state === 'running' && !['cancelling', 'finding_contacts'].includes(status.job.phase) ? status.execution?.stage ?? status.job.phase : status?.job.phase;
  return <section className="space-y-4" aria-labelledby="campaign-heading">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 id="campaign-heading" className="text-xl font-semibold">{t('寻找匹配商品的 KOL')}</h2><p className="mt-2 text-sm text-muted-foreground">{t(local ? '填写商品、选择平台和最低粉丝数，推荐 10 位符合条件的创作者。' : '选择商品、平台和最低粉丝数，推荐 10 位符合条件的创作者。')}</p></div>{loaded && jobs.length > 0 && <Button variant={showForm ? 'outline' : 'default'} onClick={() => {
      setShowForm(value => !value);
      if (!showForm && campaign) {
        setProductId(status.job.product?.id ?? ''); setTemplateId(''); setTemplateReady(true);
        const product = status.job.product;
        if (product) { setTitle(product.title); setDescription(product.description); setVendor(product.vendor ?? ''); setProductUrl(product.onlineStoreUrl ?? ''); setManual(local || 'source' in product); }
        setPlatforms(platform.options.filter(value => campaign.scopes.some(scope => scope.platform === value)));
        setMinimum('2000');
      }
    }}>{t(showForm ? '收起条件' : local ? '填写商品' : '新建搜索')}</Button>}</div>
    {loaded && (showForm || jobs.length === 0) && <form onSubmit={event => void generate(event)} className="space-y-5 rounded-lg border bg-card p-4 sm:p-6">
      {templates.length > 0 && <div className="flex flex-col gap-2"><label htmlFor="campaign-template" className="text-sm font-medium">{t('使用已保存的条件')}</label><select id="campaign-template" value={templateId} disabled={blocked} onChange={event => void selectTemplate(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="">{t('自行选择条件')}</option>{templates.map(item => <option key={item.id} value={item.id} disabled={!item.conditions}>{item.name}{!item.conditions ? t('（旧格式）') : ''}</option>)}</select></div>}
      {!local && <div className="flex gap-2"><Button type="button" size="sm" variant={manual ? 'outline' : 'default'} onClick={() => setManual(false)}>{t('Shopify 商品')}</Button><Button type="button" size="sm" variant={manual ? 'default' : 'outline'} onClick={() => setManual(true)}>{t('手动填写商品')}</Button></div>}
      {manual ? <fieldset disabled={blocked} className="space-y-4"><div className="space-y-2"><label htmlFor="manual-product-title" className="text-sm font-medium">{t('商品名称')}</label><Input id="manual-product-title" required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} placeholder={t('输入要推广的商品')} /></div><div className="space-y-2"><label htmlFor="manual-product-description" className="text-sm font-medium">{t('商品说明')}</label><textarea id="manual-product-description" required maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} className="min-h-24 w-full rounded-md border border-input bg-background p-3 text-sm" placeholder={t('商品的主要用途、特点和适用人群')} /></div><details className="space-y-3"><summary className="cursor-pointer text-sm text-muted-foreground">{t('品牌与链接（选填）')}</summary><div className="grid gap-3 pt-3 sm:grid-cols-2"><div className="space-y-2"><label htmlFor="manual-product-vendor" className="text-sm">{t('品牌名称')}</label><Input id="manual-product-vendor" maxLength={120} value={vendor} onChange={event => setVendor(event.target.value)} /></div><div className="space-y-2"><label htmlFor="manual-product-url" className="text-sm">{t('商品链接')}</label><Input id="manual-product-url" type="url" value={productUrl} onChange={event => setProductUrl(event.target.value)} placeholder="https://" /></div></div></details></fieldset> : <div className="flex flex-col gap-2"><label htmlFor="campaign-product" className="text-sm font-medium">{t('商品')}</label><select id="campaign-product" required value={productId} disabled={blocked || !catalog} onChange={event => setProductId(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="">{t('请选择要推广的商品')}</option>{catalog?.nodes.map(product => <option key={product.id} value={product.id}>{product.title}</option>)}</select>{catalog?.pageInfo.hasNextPage && <Button type="button" variant="link" className="self-start" disabled={loadingProducts} onClick={onMoreProducts}>{t(loadingProducts ? '正在加载…' : '加载更多商品')}</Button>}</div>}
      <fieldset disabled={blocked || !!templateId} className="space-y-2"><legend className="mb-2 text-sm font-medium">{t('平台')}</legend><div className="flex flex-wrap gap-4">{platform.options.map(value => <label key={value} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={platforms.includes(value)} onChange={event => setPlatforms(current => platform.options.filter(item => item === value ? event.target.checked : current.includes(item)))} />{platformLabels[value]}</label>)}</div></fieldset>
      <fieldset disabled={blocked || !!templateId} className="space-y-2"><label htmlFor="followers-min" className="text-sm font-medium">{t('最低粉丝数')}</label><Input id="followers-min" type="number" min="0" max={Number.MAX_SAFE_INTEGER} step="1" required value={minimum} onChange={event => setMinimum(event.target.value)} placeholder={t('例如 2000')} /></fieldset>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><p className="text-sm text-muted-foreground">{t('找到 10 位后自动停止，结果与联系方式自动保存。')}</p><Button type="submit" disabled={blocked || !templateReady}>{t(mutating ? '正在提交…' : '开始寻找')}</Button></div>
    </form>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{t(notice)}</p>}{(error || pollError) && <p role="alert" className="text-sm text-destructive">{t(error || pollError)}</p>}
    {!loaded && <div role="status" aria-label={t('正在读取任务')} className="space-y-4 rounded-lg border bg-card p-6"><Skeleton className="h-10 w-full" /><Skeleton className="h-24 w-full" /></div>}
    {jobs.length > 0 && <div className="space-y-6">
      <div className="flex flex-col gap-2"><label htmlFor="campaign-job" className="text-sm font-medium">{t('最近任务')}</label><select id="campaign-job" value={selected} disabled={mutating} onChange={event => select(event.target.value)} className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm">{jobs.map(job => <option key={job.id} value={job.id}>{new Date(job.created_at).toLocaleString(i18n.resolvedLanguage)} · {job.product?.title ?? job.brief.slice(0, 60)}</option>)}</select></div>
      {status && <><p role="status" className="flex flex-wrap gap-2 text-sm"><span className="font-medium">{status.job.product?.title}</span><span className="text-muted-foreground">{t(phases[phase ?? ''] ?? phase ?? '')}</span></p>{code && <p role="alert" className="text-sm text-destructive">{t(status.job.phase === 'contacts_incomplete' ? '部分联系方式未能补全，推荐结果已保存，可在下方手动继续查询。' : status.execution?.failure_phase === 'metrics' ? '搜索在保存运行统计时中断，已找到的 KOL 和推荐表已保留，可点击继续寻找。' : failureMessages[code] ?? '任务未完成，已保存的结果保留，可继续寻找或稍后重试。')}（{code}）</p>}
        {status.job.state !== 'running' && status.execution?.stage === 'paused' && status.execution.reason === 'busy' && <p role="status" className="text-sm text-muted-foreground">{t('资源暂时被占用，任务已暂停，已有结果保留，可点击继续寻找。')}</p>}
        {campaign && <CampaignIssues runs={campaign.platform_runs} deferredScores={status.execution?.deferred_scores ?? 0} />}
        {status.job.state === 'running' && <Button variant="outline" disabled={mutating || status.job.phase === 'cancelling'} onClick={() => void stop()}>{t('停止寻找')}</Button>}
        {campaign && <div className="space-y-4 text-sm"><div className="flex flex-wrap items-center gap-4">{!!status.counts && <p className="font-medium">{t('已找到 {{count}} / {{target}} 位 KOL', { count: status.counts.qualified, target: campaign.target_count })}</p>}<details className="open:w-full"><summary className="cursor-pointer text-muted-foreground">{t('搜索条件')}</summary><div className="pt-3"><CampaignPlan plan={campaign} /></div></details>
          <div className="ml-auto flex flex-wrap gap-2">{campaign.approved_at !== null && status.job.state !== 'running' && !searchExhausted && ['active', 'paused'].includes(campaign.phase) && (status.counts?.qualified ?? 0) < campaign.target_count && <Button size="sm" disabled={blocked} onClick={() => void resume()}>{t('继续寻找')}</Button>}{campaign.approved_at !== null && campaign.criteria.max_subscribers !== undefined && <Button size="sm" variant="ghost" disabled={blocked} onClick={prepareTemplate}>{t('保存条件模板')}</Button>}</div></div>
          {status.job.state !== 'running' && status.counts && status.counts.qualified < campaign.target_count && <p className="text-muted-foreground">{t('本次已找到 {{count}} 位符合条件的 KOL，已保存当前结果。', { count: status.counts.qualified })}{searchExhausted && t('本次搜索词已全部用完，未达到目标数量。')}</p>}
          <Results key={`${campaign.id}:${campaign.revision}`} campaignId={campaign.id} revision={campaign.revision} refreshKey={`${status.job.state === 'running' ? status.job.phase === 'finding_contacts' ? 'contacts' : 'running' : status.job.phase}:${status.counts?.qualified ?? 0}`} onMailSelection={onMailSelection} />
          {savingTemplate && <div className="space-y-3 rounded-md border p-4"><div className="flex flex-col gap-2"><label htmlFor="template-name">{t('模板名称')}</label><Input id="template-name" value={templateName} disabled={blocked} onChange={event => setTemplateName(event.target.value)} /></div><p className="text-muted-foreground">{t('保存当前平台、粉丝范围和目标数量，下次选择商品后直接执行。')}</p><div className="flex gap-2"><Button disabled={blocked || !templateName.trim()} onClick={() => void saveTemplate()}>{t('保存模板')}</Button><Button variant="outline" disabled={mutating} onClick={() => setSavingTemplate(false)}>{t('取消')}</Button></div></div>}
        </div>}</>}
    </div>}
  </section>;
}
