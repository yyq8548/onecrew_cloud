import { useEffect, useState } from 'react';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useCloudApi } from './ApiContext';

const statusSchema = z.object({ enabled: z.boolean(), paired: z.boolean(), account_email: z.string().optional(), mailboxes: z.array(z.object({ id: z.string(), email: z.string(), available: z.boolean() })) });
const batchSchema = z.object({ id: z.string(), mailbox_ref_id: z.string(), subject: z.string(), body: z.string(), state: z.enum(['draft', 'running', 'paused', 'cancelled', 'completed']),
  items: z.array(z.object({ id: z.string(), recipient: z.string(), source: z.string(), state: z.enum(['pending', 'attempting', 'accepted', 'sent', 'failed', 'unknown', 'cancelled']), detail: z.string().nullable(), provider_message_id: z.string().nullable() })) });
const batchesSchema = z.object({ batches: z.array(batchSchema) });
const recipientsSchema = z.object({ recipients: z.array(z.object({ email: z.string(), source: z.string() })) });
const stateLabels = { pending: '等待发送', attempting: '正在发送', accepted: '已受理，等待回执', sent: '发送成功', failed: '发送失败', unknown: '结果未知', cancelled: '已取消' };
const batchLabels = { draft: '待确认', running: '发送中', paused: '已暂停', cancelled: '已取消', completed: '处理结束' };
type Batch = z.infer<typeof batchSchema>;
export interface MailSelection {
  id: string; campaign_id: string; expected_revision: number;
  recipients: Array<{ creator_id: string; name: string; email: string; source: string }>;
}

export default function Mail({ selection = null, local = false, account = false }: { selection?: MailSelection | null; local?: boolean; account?: boolean }) {
  const { t } = useTranslation('cloud');
  const cloudApi = useCloudApi();
  const [status, setStatus] = useState<z.infer<typeof statusSchema> | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]), [draft, setDraft] = useState<Batch | null>(null);
  const [contacts, setContacts] = useState<z.infer<typeof recipientsSchema>['recipients']>([]);
  const [mailbox, setMailbox] = useState(''), [to, setTo] = useState(''), [subject, setSubject] = useState(''), [body, setBody] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [authorizeUrl, setAuthorizeUrl] = useState('');
  const [pollError, setPollError] = useState('');
  const [selectedSource, setSelectedSource] = useState<MailSelection | null>(null);
  const addresses = [...new Map(to.split(/[\s,;]+/u).filter(Boolean).map(email => [email.toLowerCase(), email])).values()];
  const contactChoices = [...new Map(contacts.map(contact => [contact.email.toLowerCase(), contact])).values()];
  useEffect(() => {
    if (!selection) return;
    setSelectedSource(selection); setTo(selection.recipients.map(item => item.email).join('\n')); setDraft(null); setError('');
  }, [selection]);
  const showError = (error: unknown) => setError(error instanceof Error ? error.message : '邮件操作失败，请重试。');
  async function refresh(signal?: AbortSignal) {
    const value = await cloudApi('/api/mail/status', statusSchema, { signal });
    setStatus(value);
    setMailbox(current => draft ? draft.mailbox_ref_id : value.mailboxes.some(item => item.id === current && item.available) ? current : value.mailboxes.find(item => item.available)?.id ?? '');
    if (value.paired) {
      const [history, savedContacts] = await Promise.all([cloudApi('/api/mail/batches', batchesSchema, { signal }), local ? Promise.resolve({ recipients: [] }) : cloudApi('/api/mail/recipients', recipientsSchema, { signal })]);
      setBatches(history.batches); setContacts(savedContacts.recipients);
    } else { setBatches([]); setContacts([]); }
    setPollError('');
  }
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal).then(() => undefined, error => { if (!controller.signal.aborted) showError(error); }); return () => controller.abort(); }, []);
  const running = batches.some(batch => batch.state === 'running');
  useEffect(() => {
    if (!running) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => { void cloudApi('/api/mail/batches', batchesSchema, { signal: controller.signal }).then(value => { setBatches(value.batches); setPollError(''); }, error => { if (!controller.signal.aborted) setPollError(error instanceof Error ? error.message : '邮件记录暂时无法读取。'); }); }, 3000);
    return () => { window.clearInterval(timer); controller.abort(); };
  }, [running]);
  async function operation(action: () => Promise<void>) {
    setBusy(true); setError('');
    await action().then(() => undefined, showError);
    setBusy(false);
  }
  async function authorize(path: string) {
    const value = await cloudApi(path, z.object({ authorize_url: z.string().url() }), { body: {} });
    setAuthorizeUrl(value.authorize_url);
  }
  async function prepare() {
    const recipients = addresses.map(email => ({ email, source: selectedSource?.recipients.find(contact => contact.email.toLowerCase() === email.toLowerCase())?.source ?? contacts.find(contact => contact.email.toLowerCase() === email.toLowerCase())?.source ?? '用户输入' }));
    const selected = selectedSource?.recipients.filter(contact => addresses.some(email => email.toLowerCase() === contact.email.toLowerCase())) ?? [];
    const result = await cloudApi('/api/mail/prepare', z.object({ batch: batchSchema }), { body: { mailbox_ref_id: mailbox, subject, body, recipients,
      ...(selectedSource && selected.length ? { selection: { campaign_id: selectedSource.campaign_id, expected_revision: selectedSource.expected_revision, recipients: selected.map(({ creator_id, email }) => ({ creator_id, email })) } } : {}) } });
    setDraft(result.batch);
    setBatches(current => [result.batch, ...current.filter(batch => batch.id !== result.batch.id)]);
  }
  async function control(id: string, action: 'confirm' | 'pause' | 'resume' | 'cancel') {
    const result = await cloudApi('/api/mail/send', z.object({ batch: batchSchema }), { body: { id, action } });
    setBatches(current => [result.batch, ...current.filter(batch => batch.id !== id)]);
    if (draft?.id === id) {
      setDraft(null);
      if (action === 'confirm') { setTo(''); setSubject(''); setBody(''); setSelectedSource(null); }
    }
  }
  const draftMailbox = draft ? status?.mailboxes.find(item => item.id === draft.mailbox_ref_id) : null;
  return <section className="max-w-4xl space-y-6" aria-labelledby="mail-heading">
    <div><h2 id="mail-heading" className="text-xl font-semibold">{t('Gmail 批量发信')}</h2><p className="mt-2 text-sm text-muted-foreground">{t('勾选联系人或粘贴多个邮箱，编辑后统一确认。')}</p></div>
    {(error || pollError) && <p role="alert" className="text-sm text-destructive">{t(error || pollError)}</p>}
    <div className="flex flex-wrap items-center gap-2">
      {!status?.paired && <Button variant="outline" disabled={busy || status === null} onClick={() => void operation(() => authorize('/api/mail/pair'))}>{t('连接 OneCrew 账号')}</Button>}
      {status?.paired && <><span className="text-sm text-muted-foreground">{status.account_email}</span><Button variant="outline" disabled={busy} onClick={() => void operation(() => authorize('/api/mail/connect'))}>{t('授权 Gmail')}</Button>
        {!local && !account && <Button variant="ghost" disabled={busy} onClick={() => void operation(async () => { await cloudApi('/api/mail/disconnect', z.object({ disconnected: z.literal(true) }), { body: {} }); setDraft(null); setAuthorizeUrl(''); await refresh(); })}>{t('断开本应用邮箱连接')}</Button>}</>}
      <Button variant="outline" disabled={busy} onClick={() => void operation(async () => { await refresh(); setAuthorizeUrl(''); })}>{t('刷新邮箱连接')}</Button>
    </div>
    {authorizeUrl && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted p-4 text-sm"><div className="space-y-1"><p className="font-medium">{t('下一步：打开授权页面，完成登录和连接')}</p><p>{t('在新页面确认连接后，返回这里点击「刷新邮箱连接」。')}</p></div><Button asChild><a href={authorizeUrl} target="_blank" rel="noopener noreferrer">{t('前往授权页面')}</a></Button></div>}
    {status?.paired && status.mailboxes.every(item => !item.available) && <p className="text-sm text-muted-foreground">{t('请授权 Gmail 的发送和回执读取权限。')}</p>}
    {mailbox && !draft && <form className="grid gap-4 rounded-lg border bg-card p-4 sm:p-6" onSubmit={event => { event.preventDefault(); void operation(prepare); }}>
      {selectedSource && <p role="status" className="text-sm text-muted-foreground">{t('已载入 {{count}} 位 KOL 的公开邮箱，可在下方修改收件人。', { count: selectedSource.recipients.length })}</p>}
      <div className="grid gap-2 text-sm font-medium"><label htmlFor="mail-sender">{t('发件邮箱')}</label><select id="mail-sender" className="h-10 rounded-md border border-input bg-background px-3 font-normal" disabled={busy} value={mailbox} onChange={event => setMailbox(event.target.value)}>{status?.mailboxes.map(item => <option key={item.id} value={item.id} disabled={!item.available}>{item.email}{!item.available && t('（需重新授权）')}</option>)}</select></div>
      {contactChoices.length > 0 && <details className="space-y-3 text-sm"><summary className="cursor-pointer font-medium">{t('从已保存的联系人批量添加（{{count}} 位）', { count: contactChoices.length })}</summary>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setTo([...new Map([...addresses, ...contactChoices.map(contact => contact.email)].map(email => [email.toLowerCase(), email])).values()].join('\n'))}>{t('添加全部联系人')}</Button>
        <div className="max-h-48 divide-y overflow-y-auto rounded-md border">{contactChoices.map(contact => <label key={contact.email} className="flex items-center gap-3 p-3"><Checkbox aria-label={t('添加 {{email}}', { email: contact.email })} disabled={busy} checked={addresses.some(email => email.toLowerCase() === contact.email.toLowerCase())} onCheckedChange={checked => setTo((checked ? [...addresses, contact.email] : addresses.filter(email => email.toLowerCase() !== contact.email.toLowerCase())).join('\n'))} /><span className="min-w-0 break-all">{contact.email}</span></label>)}</div>
      </details>}
      <div className="space-y-2"><label className="grid gap-2 text-sm font-medium">{t('收件人（每行一个）')}<textarea required aria-describedby="mail-recipient-help" className="min-h-24 rounded-md border border-input bg-background p-3 font-normal" disabled={busy} value={to} onChange={event => setTo(event.target.value)} /></label><p id="mail-recipient-help" className="text-xs text-muted-foreground">{t('也可用逗号或分号分隔。每批最多 100 位，重复邮箱自动合并。')}</p></div>
      <label className="grid gap-2 text-sm font-medium">{t('主题')}<input required className="h-10 rounded-md border border-input bg-background px-3 font-normal" disabled={busy} value={subject} onChange={event => setSubject(event.target.value)} /></label>
      <label className="grid gap-2 text-sm font-medium">{t('正文')}<textarea required className="min-h-48 rounded-md border border-input bg-background p-3 font-normal" disabled={busy} value={body} onChange={event => setBody(event.target.value)} /></label>
      <Button className="justify-self-start" type="submit" disabled={busy || addresses.length === 0 || addresses.length > 100}>{t('预览批量邮件')}{addresses.length > 0 && ` (${addresses.length})`}</Button>
    </form>}
    {draft && <div className="space-y-3 rounded-lg border bg-card p-4 sm:p-6">
      <p className="text-sm">{t('发件邮箱')}：{draftMailbox?.email ?? t('原发件邮箱当前不可用')}</p>
      <p className="font-medium">{t('将分别发送 {{count}} 封邮件', { count: draft.items.length })}</p><p className="text-sm text-muted-foreground">{t('每位收件人只看到自己的邮箱。')}</p><p className="break-words text-sm">{draft.items.map(item => item.recipient).join(', ')}</p>
      <p className="font-medium">{draft.subject}</p><p className="whitespace-pre-wrap text-sm">{draft.body}</p>
      <div className="flex flex-wrap gap-2"><Button disabled={busy || !draftMailbox?.available} onClick={() => void operation(() => control(draft.id, 'confirm'))}>{t('确认发送 {{count}} 封邮件', { count: draft.items.length })}</Button><Button variant="outline" disabled={busy} onClick={() => void operation(() => control(draft.id, 'cancel'))}>{t('取消并修改')}</Button></div>
    </div>}
    {batches.filter(batch => batch.id !== draft?.id).map(batch => <details key={batch.id} open={batch.state === 'running'} className="space-y-3 rounded-md border p-4">
      <summary className="cursor-pointer text-sm font-medium">{batch.subject} · {t(batchLabels[batch.state])} · {t('已发送 {{sent}}/{{total}}', { sent: batch.items.filter(item => item.state === 'sent').length, total: batch.items.length })}</summary>
      <ul className="space-y-1 text-sm">{batch.items.map(item => <li key={item.id} className="break-words">{item.recipient}：{t(stateLabels[item.state])}{item.detail && <span className="text-muted-foreground"> · {t(item.detail)}</span>}{item.provider_message_id && <span className="text-muted-foreground"> · Gmail {item.provider_message_id}</span>}</li>)}</ul>
      <div className="flex flex-wrap gap-2">
        {batch.state === 'draft' && <Button variant="outline" disabled={busy} onClick={() => { setMailbox(batch.mailbox_ref_id); setTo(batch.items.map(item => item.recipient).join('\n')); setSubject(batch.subject); setBody(batch.body); setSelectedSource(null); setDraft(batch); }}>{t('查看并确认')}</Button>}
        {batch.state === 'running' && <Button variant="outline" disabled={busy} onClick={() => void operation(() => control(batch.id, 'pause'))}>{t('暂停')}</Button>}
        {batch.state === 'paused' && <Button variant="outline" disabled={busy} onClick={() => void operation(() => control(batch.id, 'resume'))}>{t('继续待发送邮件')}</Button>}
        {['draft', 'running', 'paused'].includes(batch.state) && <Button variant="ghost" disabled={busy} onClick={() => void operation(() => control(batch.id, 'cancel'))}>{t('取消待发送邮件')}</Button>}
        {batch.items.some(item => ['accepted', 'unknown'].includes(item.state) && item.provider_message_id) && <Button variant="outline" disabled={busy} onClick={() => void operation(async () => { await cloudApi('/api/mail/readback', z.object({ batch: batchSchema }), { body: { id: batch.id } }); await refresh(); })}>{t('核对 Gmail 回执')}</Button>}
      </div>
      {batch.items.some(item => item.state === 'unknown') && <p className="text-sm text-muted-foreground">{t('结果未知的邮件不会自动重发，请在 Gmail 中核对。')}</p>}
    </details>)}
  </section>;
}
