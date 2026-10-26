import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { discoveryQualityScore, type DiscoveryReviewMaterial } from '@onecrew/runtime-contracts/discovery';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DiscoveryCandidateCard } from '@/pages/connect/discovery-candidate-card';
import { ReviewMaterialContent } from '@/pages/connect/discovery-review-material';
import { cloudApi } from './api';
import { campaignResults, reviewMaterial, type CampaignResults } from './result-contracts';

const verdicts = { qualified: '已匹配', pending: '待核验', rejected: '未匹配' };
const qualityLabels = { excellent: '非常匹配', good: '匹配', medium: '一般', low: '较低' };
const reasons: Record<string, string> = { subscriber_count_unverified: '粉丝数量尚未核实', subscriber_count_near_threshold: '显示粉丝数接近要求，实际数量待核实', subscriber_count_below_minimum: '粉丝数量未达到要求', language_unverified: '语言尚未核实', language_mismatch: '内容语言不符合要求', category_unverified: '内容类别尚未核实', category_mismatch: '内容类别不符合要求', region_unverified: '所在地尚未核实', region_mismatch: '所在地不符合要求' };
const failure = (error: unknown) => error instanceof Error ? error.message : '读取失败，请重试。';

export default function Results({ campaignId, revision }: { campaignId: string; revision: number }) {
  const [data, setData] = useState<CampaignResults | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [more, setMore] = useState(false);
  const [filter, setFilter] = useState<'all' | keyof typeof verdicts>('all'), [page, setPage] = useState(1);
  const [contactBusy, setContactBusy] = useState(''), [contactNotice, setContactNotice] = useState('');
  const [evidence, setEvidence] = useState<{ ids: string[]; title: string; selected: string } | null>(null), [material, setMaterial] = useState<DiscoveryReviewMaterial | null>(null), [materialError, setMaterialError] = useState(''), [materialBusy, setMaterialBusy] = useState(false);
  const request = useRef<AbortController | null>(null), evidenceRequest = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); evidenceRequest.current?.abort(); }, []);

  async function load(append = false) {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setBusy(true); setError('');
    const query = new URLSearchParams();
    if (append && data?.hits.length) query.set('after_hit_id', data.hits.at(-1)!.id);
    if (append && data?.candidates.length) query.set('after_candidate_id', data.candidates.at(-1)!.id);
    if (!append) { setData(null); setPage(1); }
    await cloudApi(`/api/campaigns/${encodeURIComponent(campaignId)}/results?${query}`, campaignResults, { signal: controller.signal }).then(value => {
      controller.signal.throwIfAborted();
      if (value.campaign.id !== campaignId || value.campaign.revision !== revision) throw new Error('任务条件已更新，请刷新任务后查看结果。');
      setMore(value.hits.length === 100 || value.candidates.length === 100);
      setData(previous => append && previous ? { ...value, hits: [...new Map([...previous.hits, ...value.hits].map(hit => [hit.id, hit])).values()], candidates: [...new Map([...previous.candidates, ...value.candidates].map(candidate => [candidate.id, candidate])).values()] } : value);
    }).catch(error => { if (!controller.signal.aborted) setError(failure(error)); });
    if (!controller.signal.aborted) setBusy(false);
  }
  async function openMaterial(ids: string[], title: string, selected = ids[0]) {
    if (!selected) return;
    evidenceRequest.current?.abort(); const controller = new AbortController(); evidenceRequest.current = controller;
    setEvidence({ ids, title, selected }); setMaterial(null); setMaterialError(''); setMaterialBusy(true);
    await cloudApi(`/api/campaigns/${encodeURIComponent(campaignId)}/hits/${encodeURIComponent(selected)}/material?revision=${revision}`, reviewMaterial, { signal: controller.signal }).then(value => {
      controller.signal.throwIfAborted();
      if (value.material.campaign_id !== campaignId || value.material.criteria_revision !== revision || value.material.hit.id !== selected) throw new Error('证据归属已变化，请刷新结果。');
      setMaterial(value.material);
    }).catch(error => { if (!controller.signal.aborted) setMaterialError(failure(error)); });
    if (!controller.signal.aborted) setMaterialBusy(false);
  }
  async function findContacts(candidate: string) {
    setContactBusy(candidate); setContactNotice(''); setError('');
    await cloudApi(`/api/campaigns/${encodeURIComponent(campaignId)}/candidates/${encodeURIComponent(candidate)}/contacts`, z.object({ pages_read: z.number().int(), has_more: z.boolean() }), { body: { expected_revision: revision } }).then(async result => {
      await load();
      setContactNotice(result.pages_read === 0 ? '没有更多已确认来源可供读取。' : `已读取 ${result.pages_read} 个联系页面，结果已更新。${result.has_more ? '还可以继续查找。' : ''}`);
    }).catch(error => setError(failure(error)));
    setContactBusy('');
  }
  const library = data?.library.creators, projection = library?.projection;
  const currentLibrary = library?.state === 'current' && projection?.criteria_revision === revision;
  const contacts = currentLibrary && evidence ? library.sources.find(source => source.search_hit_id === evidence.selected)?.contacts ?? [] : [];
  const recommended = currentLibrary ? library.recommendations : [];
  const visiblePage = Math.min(page, Math.max(1, Math.ceil(recommended.length / 25)));
  const candidates = data?.candidates.filter(item => filter === 'all' || item.verdict === filter) ?? [];
  const reasonLabels = Object.fromEntries((data?.candidates ?? []).flatMap(item => (item.evidence.assessment?.reasons ?? []).map(reason => [reason, reasons[reason] ?? '请查看原始证据，确认该项条件。'])));
  function sourceIds(group: string) {
    const ids = projection?.groups.find(item => item.group_id === group)?.members.flatMap(member => member.source_hit_ids) ?? [];
    return [...new Set(ids)].filter(id => library?.sources.some(source => source.search_hit_id === id && source.verdict === 'qualified'));
  }
  return <details className="space-y-4 rounded-lg border p-4" onToggle={event => { if (event.currentTarget.open && data === null && !busy) void load(); }}>
    <summary className="cursor-pointer font-medium">结果与证据</summary>
    <Button variant="outline" disabled={busy} onClick={() => void load()}>{busy ? '正在读取…' : '刷新结果'}</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {contactNotice && <p role="status" className="text-sm">{contactNotice}</p>}
    {data && <>
      <section className="space-y-3" aria-label="Library 推荐结果">
        <h3 className="font-medium">Library 推荐 · {currentLibrary ? recommended.length : '等待同步'}</h3>
        {!currentLibrary ? <p role="status" className="text-muted-foreground">推荐结果尚未同步完成。下方可以查看已保存的候选和来源。</p> : recommended.length === 0 ? <p role="status">当前还没有符合条件的推荐结果。</p> : <>
          <Table><TableHeader><TableRow><TableHead>创作者</TableHead><TableHead>类别 / 平台</TableHead><TableHead>评分</TableHead><TableHead>联系方式</TableHead><TableHead>证据</TableHead></TableRow></TableHeader>
            <TableBody>{recommended.slice((visiblePage - 1) * 25, visiblePage * 25).map(row => <TableRow key={row.id}>
              <TableCell>{row.values.name.url ? <a href={row.values.name.url} target="_blank" rel="noopener noreferrer" className="underline">{row.values.name.name}</a> : row.values.name.name}</TableCell>
              <TableCell className="whitespace-normal">{row.values.category ?? '未分类'} · {row.values.platform}</TableCell>
              <TableCell className="max-w-sm whitespace-normal">{row.values.score ? <>{discoveryQualityScore(row.values.score.level)} · {qualityLabels[row.values.score.level]}{row.values.score.reason && <p className="mt-1 text-xs text-muted-foreground">{row.values.score.reason}</p>}</> : '尚未评分'}</TableCell>
              <TableCell className="whitespace-pre-wrap break-words">{row.values.contacts || '尚无公开联系方式'}</TableCell>
              <TableCell><Button size="sm" variant="outline" onClick={() => void openMaterial(sourceIds(row.id), row.values.name.name)}>查看证据</Button></TableCell>
            </TableRow>)}</TableBody>
          </Table>
          {recommended.length > 25 && <div className="flex items-center gap-3"><Button variant="outline" disabled={visiblePage <= 1} onClick={() => setPage(visiblePage - 1)}>上一页</Button><span>第 {visiblePage} 页</span><Button variant="outline" disabled={visiblePage * 25 >= recommended.length} onClick={() => setPage(visiblePage + 1)}>下一页</Button></div>}
        </>}
      </section>
      <section className="space-y-3" aria-label="全部候选">
        <div className="flex flex-wrap items-center gap-3"><h3 className="font-medium">全部候选</h3><label htmlFor="result-filter">状态</label><select id="result-filter" value={filter} onChange={event => setFilter(event.target.value as typeof filter)} className="rounded-md border bg-background px-2 py-1"><option value="all">全部</option>{Object.entries(verdicts).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></div>
        <p className="text-muted-foreground">已匹配 {data.counts.qualified} 位，待核验 {data.counts.pending} 位，未匹配 {data.counts.rejected} 位；当前已加载 {data.candidates.length} 位。</p>
        <ul className="space-y-3">{candidates.map(candidate => <DiscoveryCandidateCard key={candidate.id} item={candidate} campaign={data.campaign} reasonLabels={reasonLabels}>
          <span className="self-center text-muted-foreground">{verdicts[candidate.verdict]}</span>
          {candidate.verdict === 'qualified' && <Button size="sm" variant="outline" disabled={busy || contactBusy !== ''} onClick={() => void findContacts(candidate.id)}>{contactBusy === candidate.id ? '正在查找…' : '查找联系方式'}</Button>}
          {candidate.evidence.source_urls.map(url => { const hit = data.hits.find(hit => hit.source_url === url); return hit ? <Button key={url} size="sm" variant="outline" onClick={() => void openMaterial([hit.id], candidate.display_name)}>查看证据</Button> : <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="underline">查看原始来源</a>; })}
        </DiscoveryCandidateCard>)}</ul>
        {candidates.length === 0 && <p role="status">当前已加载的记录中没有此状态的创作者。</p>}
      </section>
      <details className="space-y-3"><summary className="cursor-pointer">已保存来源 · {data.hits.length} 条</summary>
        <ul className="space-y-3">{data.hits.map(hit => <li key={hit.id} className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3"><div className="min-w-0 flex-1"><a href={hit.source_url} target="_blank" rel="noopener noreferrer" className="break-words underline">{hit.title || '查看原始内容'}</a><p className="text-muted-foreground">{hit.author_label} · {hit.search_keyword}</p></div><Button size="sm" variant="outline" onClick={() => void openMaterial([hit.id], hit.title || hit.author_label)}>查看证据</Button></li>)}</ul>
        {data.hits.length === 0 && <p role="status">当前尚未保存搜索来源。</p>}
      </details>
      {more && <Button variant="outline" disabled={busy} onClick={() => void load(true)}>{busy ? '正在读取…' : '加载更多候选和来源'}</Button>}
    </>}
    <Sheet open={evidence !== null} onOpenChange={open => { if (!open) { evidenceRequest.current?.abort(); setEvidence(null); setMaterial(null); } }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl"><SheetHeader><SheetTitle>{evidence?.title || '已保存证据'}</SheetTitle><SheetDescription>查看任务已保存的原始材料和来源。</SheetDescription></SheetHeader><div className="space-y-4 p-4">
        {evidence && evidence.ids.length > 1 && <div className="space-y-2"><label htmlFor="evidence-source">证据来源</label><select id="evidence-source" className="w-full rounded-md border bg-background p-2" value={evidence.selected} onChange={event => void openMaterial(evidence.ids, evidence.title, event.target.value)}>{evidence.ids.map((id, index) => <option key={id} value={id}>{data?.hits.find(hit => hit.id === id)?.title || `已保存来源 ${index + 1}`}</option>)}</select></div>}
        {materialBusy && <p role="status">正在读取已保存证据…</p>}{materialError && <p role="alert" className="text-destructive">{materialError}</p>}
        {material && <ReviewMaterialContent material={material} />}
        {contacts.length > 0 && <section className="space-y-3"><h3 className="font-medium">联系方式来源</h3>{contacts.map((contact, index) => <div key={`${contact.normalized_value}:${index}`} className="space-y-1 rounded-md border p-3 text-sm"><p className="break-all">{contact.normalized_value} · {contact.attribution === 'author_published' ? '作者公开' : '归属待核实'}</p><a href={contact.source_url} target="_blank" rel="noopener noreferrer" className="break-all underline">{contact.source_url}</a><p className="whitespace-pre-wrap">{contact.source_excerpt}</p></div>)}</section>}
        {evidence && !materialBusy && <Button variant="outline" onClick={() => void openMaterial(evidence.ids, evidence.title, evidence.selected)}>刷新证据</Button>}
      </div></SheetContent>
    </Sheet>
  </details>;
}
