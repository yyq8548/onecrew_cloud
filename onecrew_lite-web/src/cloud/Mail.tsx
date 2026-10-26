import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { cloudApi } from './api';

const statusSchema = z.object({ enabled: z.boolean(), paired: z.boolean(), account_email: z.string().optional(), mailboxes: z.array(z.object({ id: z.string(), email: z.string(), available: z.boolean() })) });
const batchSchema = z.object({ id: z.string(), mailbox_ref_id: z.string(), subject: z.string(), body: z.string(), state: z.enum(['draft', 'running', 'paused', 'cancelled', 'completed']),
  items: z.array(z.object({ id: z.string(), recipient: z.string(), source: z.string(), state: z.enum(['pending', 'attempting', 'accepted', 'sent', 'failed', 'unknown', 'cancelled']), detail: z.string().nullable(), provider_message_id: z.string().nullable() })) });
const batchesSchema = z.object({ batches: z.array(batchSchema) });
const recipientsSchema = z.object({ recipients: z.array(z.object({ email: z.string(), source: z.string() })) });
const stateLabels = { pending: '等待发送', attempting: '正在发送', accepted: '已受理，等待回执', sent: '发送成功', failed: '发送失败', unknown: '结果未知', cancelled: '已取消' };
type Batch = z.infer<typeof batchSchema>;

export default function Mail() {
  const [status, setStatus] = useState<z.infer<typeof statusSchema> | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]), [draft, setDraft] = useState<Batch | null>(null);
  const [contacts, setContacts] = useState<z.infer<typeof recipientsSchema>['recipients']>([]);
  const [mailbox, setMailbox] = useState(''), [to, setTo] = useState(''), [subject, setSubject] = useState(''), [body, setBody] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [authorizeUrl, setAuthorizeUrl] = useState('');
  const showError = (error: unknown) => setError(error instanceof Error ? error.message : '邮件操作失败，请重试。');
  async function refresh(signal?: AbortSignal) {
    const value = await cloudApi('/api/mail/status', statusSchema, { signal });
    setStatus(value);
    setMailbox(current => value.mailboxes.some(item => item.id === current && item.available) ? current : value.mailboxes.find(item => item.available)?.id ?? '');
    if (value.paired) {
      const [history, savedContacts] = await Promise.all([cloudApi('/api/mail/batches', batchesSchema, { signal }), cloudApi('/api/mail/recipients', recipientsSchema, { signal })]);
      setBatches(history.batches); setContacts(savedContacts.recipients);
    } else { setBatches([]); setContacts([]); }
  }
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal).then(() => undefined, error => { if (!controller.signal.aborted) showError(error); }); return () => controller.abort(); }, []);
  const running = batches.some(batch => batch.state === 'running');
  useEffect(() => {
    if (!running) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => { void cloudApi('/api/mail/batches', batchesSchema, { signal: controller.signal }).then(value => setBatches(value.batches), error => { if (!controller.signal.aborted) { window.clearInterval(timer); showError(error); } }); }, 3000);
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
    const recipients = [...new Set(to.split(/[\s,;]+/u).filter(Boolean))].map(email => ({ email, source: contacts.find(contact => contact.email === email)?.source ?? '用户输入' }));
    const result = await cloudApi('/api/mail/prepare', z.object({ batch: batchSchema }), { body: { mailbox_ref_id: mailbox, subject, body, recipients } });
    setDraft(result.batch);
  }
  async function control(id: string, action: 'confirm' | 'pause' | 'resume' | 'cancel') {
    await cloudApi('/api/mail/send', z.object({ batch: batchSchema }), { body: { id, action } });
    setDraft(null); setBatches((await cloudApi('/api/mail/batches', batchesSchema)).batches);
  }
  return <section className="space-y-4 border-t pt-6" aria-labelledby="mail-heading">
    <h2 id="mail-heading" className="text-lg font-semibold">Gmail 联系创作者</h2>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap items-center gap-2">
      {!status?.paired && <Button variant="outline" disabled={busy || status === null} onClick={() => void operation(() => authorize('/api/mail/pair'))}>连接 OneCrew 账号</Button>}
      {status?.paired && <><span className="text-sm text-muted-foreground">{status.account_email}</span><Button variant="outline" disabled={busy} onClick={() => void operation(() => authorize('/api/mail/connect'))}>授权 Gmail</Button>
        <Button variant="ghost" disabled={busy} onClick={() => void operation(async () => { await cloudApi('/api/mail/disconnect', z.object({ disconnected: z.literal(true) }), { body: {} }); setDraft(null); setAuthorizeUrl(''); await refresh(); })}>断开本应用邮箱连接</Button></>}
      <Button variant="outline" disabled={busy} onClick={() => void operation(async () => { await refresh(); setAuthorizeUrl(''); })}>刷新邮箱连接</Button>
    </div>
    {authorizeUrl && <p className="text-sm"><a href={authorizeUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">打开授权页面</a>，完成后返回并刷新邮箱连接。</p>}
    {status?.paired && status.mailboxes.every(item => !item.available) && <p className="text-sm text-muted-foreground">请授权 Gmail 的发送和回执读取权限。</p>}
    {mailbox && <form className="grid gap-3" onSubmit={event => { event.preventDefault(); void operation(prepare); }}>
      <label className="grid gap-1 text-sm">发件邮箱<select className="rounded-md border bg-background p-2" disabled={busy || draft !== null} value={mailbox} onChange={event => setMailbox(event.target.value)}>{status?.mailboxes.filter(item => item.available).map(item => <option key={item.id} value={item.id}>{item.email}</option>)}</select></label>
      {contacts.length > 0 && <label className="grid gap-1 text-sm">从已保存的联系方式添加<select className="rounded-md border bg-background p-2" disabled={busy || draft !== null} value="" onChange={event => setTo(current => `${current}${current ? '\n' : ''}${event.target.value}`)}><option value="">选择收件人</option>{contacts.map((contact, index) => <option key={`${contact.email}-${index}`} value={contact.email}>{contact.email} · {contact.source}</option>)}</select></label>}
      <label className="grid gap-1 text-sm">收件人（每行一个）<textarea required className="min-h-20 rounded-md border bg-background p-2" disabled={busy || draft !== null} value={to} onChange={event => setTo(event.target.value)} /></label>
      <label className="grid gap-1 text-sm">主题<input required className="rounded-md border bg-background p-2" disabled={busy || draft !== null} value={subject} onChange={event => setSubject(event.target.value)} /></label>
      <label className="grid gap-1 text-sm">正文<textarea required className="min-h-36 rounded-md border bg-background p-2" disabled={busy || draft !== null} value={body} onChange={event => setBody(event.target.value)} /></label>
      {!draft && <Button className="justify-self-start" type="submit" disabled={busy}>预览邮件</Button>}
    </form>}
    {draft && <div className="space-y-3 rounded-md border p-4">
      <p className="font-medium">确认发送给 {draft.items.length} 位收件人</p><p className="break-words text-sm">{draft.items.map(item => item.recipient).join('、')}</p>
      <p className="font-medium">{draft.subject}</p><p className="whitespace-pre-wrap text-sm">{draft.body}</p>
      <div className="flex gap-2"><Button disabled={busy} onClick={() => void operation(() => control(draft.id, 'confirm'))}>确认发送</Button><Button variant="outline" disabled={busy} onClick={() => void operation(() => control(draft.id, 'cancel'))}>取消并修改</Button></div>
    </div>}
    {batches.filter(batch => batch.id !== draft?.id).map(batch => <article key={batch.id} className="space-y-2 rounded-md border p-4">
      <p className="font-medium">{batch.subject}</p>
      <ul className="space-y-1 text-sm">{batch.items.map(item => <li key={item.id} className="break-words">{item.recipient}：{stateLabels[item.state]}{item.provider_message_id && <span className="text-muted-foreground"> · Gmail {item.provider_message_id}</span>}</li>)}</ul>
      <div className="flex flex-wrap gap-2">
        {batch.state === 'draft' && <Button variant="outline" disabled={busy} onClick={() => setDraft(batch)}>查看并确认</Button>}
        {batch.state === 'running' && <Button variant="outline" disabled={busy} onClick={() => void operation(() => control(batch.id, 'pause'))}>暂停</Button>}
        {batch.state === 'paused' && <Button variant="outline" disabled={busy} onClick={() => void operation(() => control(batch.id, 'resume'))}>继续待发送邮件</Button>}
        {['draft', 'running', 'paused'].includes(batch.state) && <Button variant="ghost" disabled={busy} onClick={() => void operation(() => control(batch.id, 'cancel'))}>取消待发送邮件</Button>}
        {batch.items.some(item => ['accepted', 'unknown'].includes(item.state) && item.provider_message_id) && <Button variant="outline" disabled={busy} onClick={() => void operation(async () => { await cloudApi('/api/mail/readback', z.object({ batch: batchSchema }), { body: { id: batch.id } }); await refresh(); })}>核对 Gmail 回执</Button>}
      </div>
      {batch.items.some(item => item.state === 'unknown') && <p className="text-sm text-muted-foreground">结果未知的邮件不会自动重发，请在 Gmail 中核对。</p>}
    </article>)}
  </section>;
}
