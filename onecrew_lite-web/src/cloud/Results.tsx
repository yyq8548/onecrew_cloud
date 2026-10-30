import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import type { DiscoveryReviewMaterial } from '@onecrew/runtime-contracts/discovery';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ReviewMaterialContent } from '@/pages/connect/discovery-review-material';
import { useCloudApi } from './ApiContext';
import { Skeleton } from '@/components/ui/skeleton';
import { campaignResults, reviewMaterial, type CampaignResults } from './result-contracts';
import { platformLabels, type Platform } from './api';
import { Checkbox } from '@/components/ui/checkbox';
import { ExternalLink } from 'lucide-react';
import type { MailSelection } from './Mail';

const failure = (error: unknown) => error instanceof Error ? error.message : '读取失败，请重试。';
type Contact = NonNullable<CampaignResults['library']['creators']>['sources'][number]['contacts'][number];
function ContactValue({ contact }: { contact: Contact }) {
  if (contact.kind === 'email') return <a href={`mailto:${contact.normalized_value}`} className="break-all font-medium underline-offset-4 hover:underline">{contact.normalized_value}</a>;
  if (contact.kind === 'website' || contact.kind === 'social_profile') {
    const url = URL.parse(contact.normalized_value);
    if (url && (url.protocol === 'https:' || url.protocol === 'http:')) return <a href={url.href} title={url.href} target="_blank" rel="noopener noreferrer" className="block truncate underline-offset-4 hover:underline">{url.hostname.replace(/^www\./u, '')}{url.pathname === '/' ? '' : url.pathname}</a>;
  }
  return <span className="break-all">{contact.normalized_value}</span>;
}

export default function Results({ campaignId, revision, refreshKey = 'saved', onMailSelection }: { campaignId: string; revision: number; refreshKey?: string; onMailSelection(selection: MailSelection): void }) {
  const { t, i18n } = useTranslation('cloud');
  const cloudApi = useCloudApi();
  const [data, setData] = useState<CampaignResults | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [more, setMore] = useState(false);
  const [page, setPage] = useState(1);
  const [contactBusy, setContactBusy] = useState(''), [contactNotice, setContactNotice] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [emailChoices, setEmailChoices] = useState<Record<string, string>>({});
  const [evidence, setEvidence] = useState<{ ids: string[]; title: string; selected: string } | null>(null), [material, setMaterial] = useState<DiscoveryReviewMaterial | null>(null), [materialError, setMaterialError] = useState(''), [materialBusy, setMaterialBusy] = useState(false);
  const request = useRef<AbortController | null>(null), evidenceRequest = useRef<AbortController | null>(null);
  useEffect(() => () => { evidenceRequest.current?.abort(); }, []);

  const load = useCallback(async (previous?: CampaignResults) => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setBusy(true); setError('');
    const query = new URLSearchParams();
    if (previous?.hits.length) query.set('after_hit_id', previous.hits.at(-1)!.id);
    if (previous?.candidates.length) query.set('after_candidate_id', previous.candidates.at(-1)!.id);
    if (!previous) setPage(1);
    await cloudApi(`/api/campaigns/${encodeURIComponent(campaignId)}/results?${query}`, campaignResults, { signal: controller.signal }).then(value => {
      controller.signal.throwIfAborted();
      if (value.campaign.id !== campaignId || value.campaign.revision !== revision) throw new Error('任务条件已更新，请刷新任务后查看结果。');
      setMore(value.hits.length === 100 || value.candidates.length === 100);
      setData(previous ? { ...value, hits: [...new Map([...previous.hits, ...value.hits].map(hit => [hit.id, hit])).values()], candidates: [...new Map([...previous.candidates, ...value.candidates].map(candidate => [candidate.id, candidate])).values()] } : value);
    }).catch(error => { if (!controller.signal.aborted) setError(failure(error)); });
    if (!controller.signal.aborted) setBusy(false);
  }, [campaignId, revision, cloudApi]);
  useEffect(() => { void load(); return () => request.current?.abort(); }, [load, refreshKey]);
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
      setContactNotice(result.pages_read === 0 ? t('没有更多已确认来源可供读取。') : t('已读取 {{count}} 个联系页面，结果已更新。', { count: result.pages_read }) + (result.has_more ? t('还可以继续查找。') : ''));
    }).catch(error => setError(failure(error)));
    setContactBusy('');
  }
  const library = data?.library.creators, projection = library?.projection;
  const currentLibrary = library?.state === 'current' && projection?.criteria_revision === revision;
  const contacts = currentLibrary && evidence ? library.sources.find(source => source.search_hit_id === evidence.selected)?.contacts ?? [] : [];
  const recommended = currentLibrary ? library.recommendations.filter(row => row.values.score?.level !== 'low') : [];
  const visiblePage = Math.min(page, Math.max(1, Math.ceil(recommended.length / 25)));
  function sourceIds(group: string) {
    const ids = projection?.groups.find(item => item.group_id === group)?.members.flatMap(member => member.source_hit_ids) ?? [];
    return [...new Set(ids)].filter(id => library?.sources.some(source => source.search_hit_id === id && source.verdict === 'qualified'));
  }
  const rows = recommended.map(row => {
    const candidate = data!.candidates.find(candidate => candidate.verdict === 'qualified' && candidate.profile_url === row.values.name.url);
    const ids = sourceIds(row.id);
    const contacts = [...new Map(library!.sources.filter(source => ids.includes(source.search_hit_id)).flatMap(source => source.contacts).map(contact => [contact.normalized_value, contact])).values()].filter(contact => contact.normalized_value !== row.values.name.url);
    const emails = contacts.filter(contact => contact.kind === 'email' && contact.attribution === 'author_published');
    const recipientEmail = emails.find(contact => contact.normalized_value === emailChoices[row.id]) ?? (emails.length === 1 ? emails[0] : undefined);
    return { row, candidate, ids, contacts, emails, recipientEmail };
  }).sort((first, second) => {
    const firstFollowers = first.candidate?.evidence.assessment?.subscribers_normalized ?? -1;
    const secondFollowers = second.candidate?.evidence.assessment?.subscribers_normalized ?? -1;
    return firstFollowers > secondFollowers ? -1 : firstFollowers < secondFollowers ? 1 : 0;
  });
  const eligible = rows.filter(item => item.recipientEmail), picked = eligible.filter(item => selected.has(item.row.id));
  function compose() {
    onMailSelection({ id: crypto.randomUUID(), campaign_id: campaignId, expected_revision: revision,
      recipients: picked.map(({ row, recipientEmail }) => ({ creator_id: row.id, name: row.values.name.name, email: recipientEmail!.normalized_value, source: recipientEmail!.source_url })) });
  }
  return <section id="campaign-results" className="space-y-5 rounded-lg border bg-card p-4 sm:p-6" aria-label={t('推荐结果与证据')}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">{t('推荐 KOL')}{currentLibrary && <span className="ml-2 font-normal text-muted-foreground">{t('{{count}} 位', { count: recommended.length })}</span>}</h3><p className="mt-1 text-sm text-muted-foreground">{t('查看原文，勾选有公开邮箱的 KOL 后写邮件。')}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy || picked.length === 0} onClick={compose}>{t('给已选 KOL 写邮件')}{picked.length > 0 && ` (${picked.length})`}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void load()}>{t(busy ? '正在读取…' : '刷新结果')}</Button></div></div>
    {busy && !data && <div role="status" aria-label={t('正在读取推荐结果')} className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-24 w-full" /></div>}
    {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
    {contactNotice && <p role="status" className="text-sm">{contactNotice}</p>}
    {data && <>
      <section className="space-y-3" aria-label={t('Library 推荐结果')}>
        <>
          <Table className="table-fixed max-md:block"><TableHeader className="max-md:sr-only"><TableRow><TableHead className="w-1/4"><div className="flex items-center gap-2"><Checkbox aria-label={t('选择所有已确定收件邮箱的 KOL')} disabled={busy || eligible.length === 0} checked={eligible.length > 0 && picked.length === eligible.length ? true : picked.length ? 'indeterminate' : false} onCheckedChange={value => setSelected(value === true ? new Set(eligible.map(item => item.row.id)) : new Set())} /><span>{t('创作者 / 平台')}</span></div></TableHead><TableHead className="w-28 whitespace-normal py-3 leading-5">{t('粉丝数（约）')}</TableHead><TableHead>{t('匹配依据')}</TableHead><TableHead>{t('公开联系方式')}</TableHead></TableRow></TableHeader>
            <TableBody className="max-md:block">{rows.length === 0 && <TableRow><TableCell colSpan={4} className="whitespace-normal py-6 text-muted-foreground"><p role="status">{t(currentLibrary ? '暂未找到符合条件的 KOL。' : '正在整理已找到的 KOL，稍后会显示在这里。')}</p></TableCell></TableRow>}{rows.slice((visiblePage - 1) * 25, visiblePage * 25).map(({ row, candidate, ids, contacts, emails, recipientEmail }) => {
              const primary = emails.length ? emails : contacts.slice(0, 2), extra = contacts.filter(contact => !primary.includes(contact));
              const profile = candidate?.profile_url ?? row.values.name.url, platform = platformLabels[candidate?.platform as Platform] ?? row.values.platform;
              const reason = candidate?.evidence.assessment?.selection?.reason || t('查看已保存的原文依据。');
              return <TableRow key={row.id} className="max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-4 max-md:gap-y-3 max-md:py-5">
              <TableCell className="whitespace-normal align-top py-5 max-md:block max-md:p-0"><div className="flex items-start gap-2"><Checkbox className="mt-0.5 shrink-0" aria-label={`${t('选择创作者')} ${row.values.name.name}${emails.length ? recipientEmail ? '' : t('（请先选择邮箱）') : t('（暂无公开邮箱）')}`} disabled={busy || !recipientEmail} checked={!!recipientEmail && selected.has(row.id)} onCheckedChange={value => setSelected(current => { const next = new Set(current); if (value === true) next.add(row.id); else next.delete(row.id); return next; })} /><div className="min-w-0">{row.values.name.url ? <a href={row.values.name.url} target="_blank" rel="noopener noreferrer" className="font-medium underline-offset-4 hover:underline">{row.values.name.name}</a> : row.values.name.name}<p className="mt-1 text-xs text-muted-foreground">{platformLabels[candidate?.platform as Platform] ?? row.values.platform}</p></div></div></TableCell>
              <TableCell className="align-top py-5 tabular-nums max-md:block max-md:p-0 max-md:text-right"><span className="mb-1 block text-xs text-muted-foreground md:hidden">{t('粉丝数')}</span>{candidate?.evidence.assessment?.subscribers_normalized?.toLocaleString(i18n.resolvedLanguage) ?? t('待核实')}</TableCell>
              <TableCell className="whitespace-normal align-top py-5 text-sm leading-6 max-md:col-span-2 max-md:block max-md:p-0"><p className="line-clamp-3">{reason.startsWith('商品内容符合条件；原文：') ? t('商品内容符合条件；原文：') + reason.slice('商品内容符合条件；原文：'.length) : reason}</p><Button size="sm" variant="link" className="h-auto px-0 pt-2" onClick={() => void openMaterial(ids, row.values.name.name)}>{t('查看原文')}</Button></TableCell>
              <TableCell className="whitespace-normal align-top py-5 text-sm max-md:col-span-2 max-md:block max-md:p-0"><div className="space-y-2">{profile && <a href={profile} aria-label={`${t('{{platform}} 主页', { platform })}: ${row.values.name.name}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium underline underline-offset-4"><ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />{t('{{platform}} 主页', { platform })}</a>}{primary.length ? primary.map(contact => <p key={contact.normalized_value}><ContactValue contact={contact} />{emails.length > 1 && contact.kind === 'email' && <span className="mt-1 block whitespace-pre-wrap text-xs text-muted-foreground">{contact.source_excerpt}</span>}{contact.attribution === 'unconfirmed' && <span className="text-xs text-muted-foreground">{t('归属待核实')}</span>}</p>) : !profile && <p className="text-muted-foreground">{t('暂无公开联系方式')}</p>}</div>{emails.length > 1 && <select aria-label={t('选择 {{name}} 的收件邮箱', { name: row.values.name.name })} className="mt-2 w-full min-w-0 rounded-md border border-input bg-background px-2 py-1.5 text-xs" disabled={busy} value={recipientEmail?.normalized_value ?? ''} onChange={event => { const email = event.target.value; setEmailChoices(current => ({ ...current, [row.id]: email })); setSelected(current => { const next = new Set(current); if (email) next.add(row.id); else next.delete(row.id); return next; }); }}><option value="">{t('选择发信邮箱')}</option>{emails.map(contact => <option key={contact.normalized_value} value={contact.normalized_value}>{contact.normalized_value}</option>)}</select>}{extra.length > 0 && <details className="mt-2 space-y-1"><summary className="cursor-pointer text-xs text-muted-foreground">{t('更多链接 · {{count}}', { count: extra.length })}</summary>{extra.map(contact => <p key={contact.normalized_value}><ContactValue contact={contact} /></p>)}</details>}{candidate && <Button size="sm" variant="link" className="h-auto px-0 pt-2 text-muted-foreground" disabled={busy || contactBusy !== ''} onClick={() => void findContacts(candidate.id)}>{t(contactBusy === candidate.id ? '正在查找…' : '补查联系方式')}</Button>}</TableCell>
            </TableRow>})}</TableBody>
          </Table>
          {recommended.length > 25 && <div className="flex items-center gap-3"><Button variant="outline" disabled={visiblePage <= 1} onClick={() => setPage(visiblePage - 1)}>{t('上一页')}</Button><span>{t('第 {{page}} 页', { page: visiblePage })}</span><Button variant="outline" disabled={visiblePage * 25 >= recommended.length} onClick={() => setPage(visiblePage + 1)}>{t('下一页')}</Button></div>}
        </>
      </section>
      {more && <Button variant="outline" disabled={busy} onClick={() => void load(data)}>{t(busy ? '正在读取…' : '加载更多结果')}</Button>}
    </>}
    <Sheet open={evidence !== null} onOpenChange={open => { if (!open) { evidenceRequest.current?.abort(); setEvidence(null); setMaterial(null); } }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl"><SheetHeader><SheetTitle>{evidence?.title || t('已保存证据')}</SheetTitle><SheetDescription>{t('查看任务已保存的原始材料和来源。')}</SheetDescription></SheetHeader><div className="space-y-4 p-4">
        {evidence && evidence.ids.length > 1 && <div className="space-y-2"><label htmlFor="evidence-source">{t('证据来源')}</label><select id="evidence-source" className="w-full rounded-md border bg-background p-2" value={evidence.selected} onChange={event => void openMaterial(evidence.ids, evidence.title, event.target.value)}>{evidence.ids.map((id, index) => <option key={id} value={id}>{data?.hits.find(hit => hit.id === id)?.title || t('已保存来源 {{count}}', { count: index + 1 })}</option>)}</select></div>}
        {materialBusy && <p role="status">{t('正在读取已保存证据…')}</p>}{materialError && <p role="alert" className="text-destructive">{t(materialError)}</p>}
        {material && <ReviewMaterialContent material={material} compact />}
        {contacts.length > 0 && <section className="space-y-3"><h3 className="font-medium">{t('联系方式来源')}</h3>{contacts.map((contact, index) => <div key={`${contact.normalized_value}:${index}`} className="space-y-1 rounded-md border p-3 text-sm"><p className="break-all">{contact.normalized_value} · {t(contact.attribution === 'author_published' ? '作者公开' : '归属待核实')}</p><a href={contact.source_url} target="_blank" rel="noopener noreferrer" className="break-all underline">{contact.source_url}</a><p className="whitespace-pre-wrap">{contact.source_excerpt}</p></div>)}</section>}
        {evidence && !materialBusy && <Button variant="outline" onClick={() => void openMaterial(evidence.ids, evidence.title, evidence.selected)}>{t('刷新证据')}</Button>}
      </div></SheetContent>
    </Sheet>
  </section>;
}
