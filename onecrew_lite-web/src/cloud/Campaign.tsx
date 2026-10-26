import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cloudApi, products, platform, platformLabels, type Platform } from './api';
import CampaignPlan from './CampaignPlan';
import Results from './Results';
import { campaignConditions, campaignJob, campaignJobStatus, campaignTemplate, campaignTemplateSummary, type CampaignJob, type CampaignJobStatus, type CampaignTemplateSummary } from './campaign-contracts';

const phases: Record<string, string> = { checking_connection: '检查平台连接', generating_keywords: '生成商品搜索关键词', saving_plan: '保存搜索条件', ready: '准备搜索', searching: '寻找 KOL', verifying: '核验内容与匹配度', cancelling: '正在停止', pausing: '正在停止', paused: '已停止', finished: '本次寻找已结束', needs_evidence: '等待补充证据', error: '执行失败', failed: '任务失败', interrupted: '任务已中断' };
const failureMessages: Record<string, string> = {
  'cloud.service_restarted': '服务重启中断了任务，已保存的结果可以继续查看。',
  'cloud.job_interrupted': '任务已中断，请检查平台连接后继续。',
  'cloud.job_cancelled': '已停止寻找，已保存的结果可以继续查看。',
  semantic_unavailable: '模型服务暂不可用，请稍后重试。',
  semantic_timeout: '生成关键词或评分超时，请稍后重试。',
  semantic_invalid_output: '模型输出未通过校验，请重新开始。',
};
function message(error: unknown) { return error instanceof Error ? error.message : '操作未完成，请重试。'; }

export default function Campaign({ catalog, disabled, loadingProducts, onMoreProducts, onBusyChange }: {
  catalog: z.infer<typeof products>['products'] | null; disabled: boolean; loadingProducts: boolean; onMoreProducts(): void; onBusyChange(value: boolean): void;
}) {
  const [productId, setProductId] = useState(''), [platforms, setPlatforms] = useState<Platform[]>([]);
  const [minimum, setMinimum] = useState(''), [maximum, setMaximum] = useState('');
  const [jobs, setJobs] = useState<CampaignJob[]>([]), [status, setStatus] = useState<CampaignJobStatus | null>(null);
  const [selected, setSelected] = useState(''), [error, setError] = useState(''), [mutating, setMutating] = useState(false), [loaded, setLoaded] = useState(false);
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
    signal.throwIfAborted(); setJobs(response.jobs); setLoaded(true);
    const id = selectedRef.current || response.jobs.find(job => job.state === 'running')?.id || response.jobs[0]?.id || '';
    selectedRef.current = id; setSelected(id);
    if (id) {
      const value = await cloudApi(`/api/campaign-jobs/${encodeURIComponent(id)}`, campaignJobStatus, { signal });
      signal.throwIfAborted(); if (selectedRef.current === id) setStatus(value);
    }
  }, []);
  const loadTemplates = useCallback(async (signal: AbortSignal) => {
    const response = await cloudApi('/api/campaign-templates', z.object({ templates: z.array(campaignTemplateSummary) }), { signal });
    signal.throwIfAborted(); setTemplates(response.templates);
  }, []);
  useEffect(() => {
    const controller = new AbortController(); lifecycle.current = controller;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refresh(controller.signal).catch(error => { if (!controller.signal.aborted) setError(message(error)); });
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 10000);
    };
    void poll(); void loadTemplates(controller.signal).catch(error => { if (!controller.signal.aborted) setError(message(error)); });
    return () => { controller.abort(); clearTimeout(timer); lifecycle.current = null; };
  }, [refresh, loadTemplates]);
  const running = jobs.some(job => job.state === 'running');
  useEffect(() => { onBusyChange(running || mutating); }, [running, mutating, onBusyChange]);
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
      if (!value.template.conditions) throw new Error('该旧模板没有完整的粉丝范围，请自行选择条件。');
      setPlatforms(value.template.conditions.platforms); setMinimum(String(value.template.conditions.min_followers)); setMaximum(String(value.template.conditions.max_followers));
      setTemplateReady(true);
    }).catch(error => { if (!signal.aborted && templateSelection.current === id) setError(message(error)); });
  }
  async function generate(event: FormEvent) {
    event.preventDefault();
    if (!templateReady) { setError('请先成功读取模板条件，或选择自行填写条件。'); return; }
    const conditions = campaignConditions.safeParse({ platforms, min_followers: Number(minimum), max_followers: Number(maximum), target_count: 10 });
    if (!productId || !minimum || !maximum || !conditions.success) { setError('请选择商品、至少一个平台，并填写有效的粉丝范围。'); return; }
    const body = templateId ? { product_id: productId } : { product_id: productId, ...conditions.data };
    const key = JSON.stringify({ templateId, ...body });
    if (createRequest.current?.key !== key) createRequest.current = { id: crypto.randomUUID(), key };
    const id = createRequest.current.id;
    await mutate(async signal => {
      const { job } = await cloudApi(templateId ? `/api/campaign-templates/${encodeURIComponent(templateId)}/generate` : '/api/campaigns', z.object({ job: campaignJob }), { body: { id, ...body }, signal });
      selectedRef.current = job.id; setSelected(job.id); setStatus(null); createRequest.current = null;
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
  const phase = status?.job.state === 'running' && status.job.phase !== 'cancelling' ? status.execution?.stage ?? status.job.phase : status?.job.phase;
  return <section className="space-y-4" aria-labelledby="campaign-heading">
    <h2 id="campaign-heading" className="text-lg font-semibold">寻找匹配商品的 KOL</h2>
    <form onSubmit={event => void generate(event)} className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
      {templates.length > 0 && <div className="flex flex-col gap-2"><label htmlFor="campaign-template" className="text-sm font-medium">使用已保存的条件</label><select id="campaign-template" value={templateId} disabled={blocked} onChange={event => void selectTemplate(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="">自行选择条件</option>{templates.map(item => <option key={item.id} value={item.id} disabled={!item.conditions}>{item.name}{!item.conditions ? '（旧格式）' : ''}</option>)}</select></div>}
      <div className="flex flex-col gap-2"><label htmlFor="campaign-product" className="text-sm font-medium">商品</label><select id="campaign-product" required value={productId} disabled={blocked || !catalog} onChange={event => setProductId(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="">请选择要推广的商品</option>{catalog?.nodes.map(product => <option key={product.id} value={product.id}>{product.title}</option>)}</select>{catalog?.pageInfo.hasNextPage && <Button type="button" variant="link" className="self-start" disabled={loadingProducts} onClick={onMoreProducts}>{loadingProducts ? '正在加载…' : '加载更多商品'}</Button>}</div>
      <fieldset disabled={blocked || !!templateId} className="space-y-2"><legend className="mb-2 text-sm font-medium">平台</legend><div className="flex flex-wrap gap-4">{platform.options.map(value => <label key={value} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={platforms.includes(value)} onChange={event => setPlatforms(current => platform.options.filter(item => item === value ? event.target.checked : current.includes(item)))} />{platformLabels[value]}</label>)}</div></fieldset>
      <fieldset disabled={blocked || !!templateId} className="space-y-2"><legend className="mb-2 text-sm font-medium">粉丝数范围</legend><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><label htmlFor="followers-min" className="text-sm text-muted-foreground">最低粉丝数</label><Input id="followers-min" type="number" min="0" max={Number.MAX_SAFE_INTEGER} step="1" required value={minimum} onChange={event => setMinimum(event.target.value)} placeholder="例如 10000" /></div><div className="space-y-1"><label htmlFor="followers-max" className="text-sm text-muted-foreground">最高粉丝数</label><Input id="followers-max" type="number" min={minimum || '0'} max={Number.MAX_SAFE_INTEGER} step="1" required value={maximum} onChange={event => setMaximum(event.target.value)} placeholder="例如 100000" /></div></div></fieldset>
      <p className="text-sm text-muted-foreground">默认共寻找 10 位匹配商品的 KOL。任务在服务器继续运行，可以稍后回来查看结果。</p>
      <Button type="submit" disabled={blocked || !templateReady || !productId || !platforms.length || !minimum || !maximum}>{mutating ? '正在提交…' : '开始寻找'}</Button>
    </form>
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!loaded && <p role="status" className="text-sm text-muted-foreground">正在读取已保存的任务…</p>}{loaded && jobs.length === 0 && <p className="text-sm text-muted-foreground">还没有 KOL 搜索任务。</p>}
    {jobs.length > 0 && <div className="space-y-4 rounded-lg border p-4 sm:p-6">
      <div className="flex flex-col gap-2"><label htmlFor="campaign-job" className="text-sm font-medium">最近任务</label><select id="campaign-job" value={selected} disabled={mutating} onChange={event => select(event.target.value)} className="h-10 min-w-0 rounded-md border border-input bg-background px-3 text-sm">{jobs.map(job => <option key={job.id} value={job.id}>{new Date(job.created_at).toLocaleString()} · {job.product?.title ?? job.brief.slice(0, 60)}</option>)}</select></div>
      {status && <><p role="status" className="text-sm">{status.job.state === 'running' ? '正在运行：' : ''}{phases[phase ?? ''] ?? phase}</p>{status.job.product && <p className="text-sm">商品：{status.job.product.title}</p>}{code && <p role="alert" className="text-sm text-destructive">{failureMessages[code] ?? '任务未完成，请检查平台连接后重试。'}（{code}）</p>}
        {status.job.state === 'running' && <Button variant="outline" disabled={mutating || status.job.phase === 'cancelling'} onClick={() => void stop()}>停止寻找</Button>}
        {campaign && <div className="space-y-3 text-sm"><details><summary className="cursor-pointer">查看搜索条件</summary><div className="pt-3"><CampaignPlan plan={campaign} /></div></details>
          {!!status.counts && <p>已匹配 {status.counts.qualified} / {campaign.target_count} 位 KOL；待核验 {status.counts.pending} 位；未匹配 {status.counts.rejected} 位。</p>}
          {status.job.state !== 'running' && status.counts && status.counts.qualified < campaign.target_count && <p className="text-muted-foreground">本次已找到 {status.counts.qualified} 位符合条件的 KOL，已保存当前结果。</p>}
          <div className="flex flex-wrap gap-2">{campaign.approved_at !== null && status.job.state !== 'running' && ['active', 'paused'].includes(campaign.phase) && (status.counts?.qualified ?? 0) < campaign.target_count && <Button disabled={blocked} onClick={() => void resume()}>继续寻找</Button>}{campaign.approved_at !== null && campaign.criteria.max_subscribers !== undefined && <Button variant="outline" disabled={blocked} onClick={prepareTemplate}>保存条件模板</Button>}</div>
          <Results key={`${campaign.id}:${campaign.revision}`} campaignId={campaign.id} revision={campaign.revision} />
          {savingTemplate && <div className="space-y-3 rounded-md border p-4"><div className="flex flex-col gap-2"><label htmlFor="template-name">模板名称</label><Input id="template-name" value={templateName} disabled={blocked} onChange={event => setTemplateName(event.target.value)} /></div><p className="text-muted-foreground">保存当前平台、粉丝范围和目标数量，下次选择商品后直接执行。</p><div className="flex gap-2"><Button disabled={blocked || !templateName.trim()} onClick={() => void saveTemplate()}>保存模板</Button><Button variant="outline" disabled={mutating} onClick={() => setSavingTemplate(false)}>取消</Button></div></div>}
        </div>}</>}
    </div>}
  </section>;
}
