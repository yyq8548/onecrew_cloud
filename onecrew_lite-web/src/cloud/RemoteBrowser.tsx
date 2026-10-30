import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import RFB from '@novnc/novnc';
import { CircleAlert, CircleCheck, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { connection, savedConnection, filledLogin, platformLabels, type Platform, type SavedConnection } from './api';
import { useCloudApi } from './ApiContext';
import { z } from 'zod';

export default function RemoteBrowser({ platform, onClose }: { platform: Platform; onClose(result: SavedConnection | null): void }) {
  const { t } = useTranslation('cloud');
  const cloudApi = useCloudApi();
  const target = useRef<HTMLDivElement>(null), viewer = useRef<RFB | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const saveRequest = useRef<AbortController | null>(null);
  const [view, setView] = useState<{ phase: 'starting' | 'ready' | 'saving' | 'closing' | 'disconnected' | 'failed'; message: string }>({ phase: 'starting', message: '正在启动浏览器并恢复已保存的登录…' });
  const saving = view.phase === 'saving', closing = view.phase === 'closing', starting = view.phase === 'starting';
  const busy = saving || closing;
  const [originalSize, setOriginalSize] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [clipboardText, setClipboardText] = useState(''), [showClipboardText, setShowClipboardText] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [identifier, setIdentifier] = useState(''), [password, setPassword] = useState('');
  const [filling, setFilling] = useState(false), [showPassword, setShowPassword] = useState(false);
  const [loginFeedback, setLoginFeedback] = useState<'identifier' | 'password' | 'error' | null>(null);
  const feedbackFailed = loginFeedback === 'error' || view.phase === 'failed' || view.phase === 'disconnected';
  const fillRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === frame.current);
    document.addEventListener('fullscreenchange', changed);
    return () => { document.removeEventListener('fullscreenchange', changed); };
  }, []);
  useEffect(() => {
    const cancel = new AbortController();
    void cloudApi('/api/connections', connection, { body: { platform }, signal: cancel.signal }).then(ticket => {
      if (cancel.signal.aborted || saveRequest.current || !target.current) return;
      const url = new URL(ticket.path, window.location.href); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const rfb = new RFB(target.current, url.href, { wsProtocols: ['binary', ticket.protocol], shared: false });
      viewer.current = rfb; rfb.scaleViewport = true;
      rfb.addEventListener('connect', () => { if (saveRequest.current) return; rfb.focus(); setView({ phase: 'ready', message: '登录浏览器已就绪。' }); });
      rfb.addEventListener('disconnect', () => {
        if (!cancel.signal.aborted && !saveRequest.current) setView({ phase: 'disconnected', message: '浏览器连接中断。可尝试保存当前会话，或返回后重新打开。' });
      });
    }, error => { if (!cancel.signal.aborted) setView({ phase: 'failed', message: error instanceof Error ? error.message : '浏览器启动失败，请返回后重新打开。' }); });
    return () => { cancel.abort(); fillRequest.current?.abort(); saveRequest.current?.abort(); viewer.current?.disconnect(); viewer.current = null; };
  }, [platform]);
  async function close(checkAuth: boolean) {
    if (closing) return;
    saveRequest.current?.abort();
    const controller = new AbortController(); saveRequest.current = controller;
    setClipboardText(''); setShowClipboardText(false);
    setIdentifier(''); setPassword(''); setShowPassword(false); fillRequest.current?.abort();
    setView(checkAuth ? { phase: 'saving', message: '正在检查当前登录并加密保存，完成后自动返回…' } : { phase: 'closing', message: '正在关闭浏览器并保存会话，完成后自动返回…' });
    if (!checkAuth) viewer.current?.disconnect();
    await cloudApi('/api/connections/close', savedConnection, { body: { platform, check_auth: checkAuth }, signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      if (result.auth && result.auth.platform !== platform) throw new Error('平台核验结果不一致，请重试。');
      viewer.current?.disconnect();
      onClose(checkAuth ? result : null);
    }).catch(error => { if (!controller.signal.aborted) setView({ phase: 'failed', message: error instanceof Error ? error.message : '保存未完成，请重试。' }); });
  }
  async function toggleFullscreen() {
    await (document.fullscreenElement ? document.exitFullscreen() : frame.current!.requestFullscreen()).catch(() => setView(current => ({ ...current, message: '当前浏览器未允许全屏，可以使用原始尺寸。' })));
  }
  async function pasteText() {
    const rfb = viewer.current!;
    setPasting(true);
    try {
      await cloudApi('/api/connections/paste', z.object({ pasted: z.literal(true) }), { body: { platform, text: clipboardText } });
      // 远程浏览器运行在Linux，使用Ctrl+V。
      rfb.sendKey(0xffe3, 'ControlLeft', true);
      rfb.sendKey(0x76, 'KeyV', true); rfb.sendKey(0x76, 'KeyV', false);
      rfb.sendKey(0xffe3, 'ControlLeft', false);
      setClipboardText(''); setShowClipboardText(false); rfb.focus();
    } catch (error) {
      setView(current => ({ ...current, message: error instanceof Error ? error.message : '粘贴未完成，请重试。' }));
    } finally { setPasting(false); }
  }
  async function fillLogin() {
    const controller = new AbortController(); fillRequest.current = controller;
    setFilling(true); setLoginFeedback(null);
    setView(current => ({ ...current, message: '正在填入上方平台的登录框…' }));
    try {
      const result = await cloudApi('/api/connections/login', filledLogin, { body: { platform, identifier, password }, signal: controller.signal });
      if (controller.signal.aborted) return;
      if (result.filled.includes('identifier')) setIdentifier('');
      setLoginFeedback(result.filled.includes('password') ? 'password' : 'identifier');
      setView(current => ({ ...current, message: result.filled.includes('password') ? '密码已填入上方平台页面。' : '账号已填入上方平台页面。' }));
    } catch (error) {
      if (!controller.signal.aborted) { setLoginFeedback('error'); setView(current => ({ ...current, message: error instanceof Error ? error.message : '填入未完成，请重试。' })); }
    } finally { setPassword(''); setShowPassword(false); setFilling(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open) void close(false); }}>
    <DialogContent ref={frame} className="fixed inset-0 flex h-dvh max-w-none flex-col gap-0 rounded-none bg-background p-0 sm:max-w-none" showCloseButton={false} onInteractOutside={event => event.preventDefault()}>
      <header className="flex items-start justify-between gap-3 border-b p-3">
        <div className="space-y-1">
          <DialogTitle>{t('登录 {{platform}}', { platform: platformLabels[platform] })}</DialogTitle>
          <DialogDescription>{t('在下方填写当前步骤的账号或密码，点击「填入上方登录框」。')}</DialogDescription>
        </div>
        <Button variant="ghost" disabled={closing} onClick={() => void close(false)}>{t(closing ? '正在关闭…' : saving ? '取消检查' : '返回工作台')}</Button>
      </header>
      <div className="relative min-h-0 flex-1" aria-busy={starting || busy}>
        <div ref={target} className="h-full overflow-auto" aria-label={t('{{platform}} 登录浏览器', { platform: platformLabels[platform] })} />
        {(starting || busy) && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background p-6 text-center">
          <LoaderCircle className="size-6 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          <p role="status" className="text-sm text-muted-foreground">{t(view.message)}</p>
        </div>}
      </div>
      <footer className="space-y-3 border-t p-3">
        {!(starting || busy) && <div role="status" className={`flex items-start gap-2 rounded-md border p-3 text-sm ${feedbackFailed ? 'border-destructive/30 text-destructive' : loginFeedback ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}>
          {filling ? <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : feedbackFailed ? <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : loginFeedback && <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
          <div className="space-y-1"><p className={loginFeedback ? 'font-medium' : ''}>{t(view.message)}</p>{loginFeedback && !feedbackFailed && <p>{t('输入栏已自动清空，无需重复填写。')}{t(loginFeedback === 'identifier' ? '上方有密码框时，在下方填写密码；分步登录请先点上方「下一步 / Next」。' : '接下来请点击上方的「下一步 / Next」或「登录 / Log in / Continue」，完成验证。')}</p>}</div>
        </div>}
        <form autoComplete="off" onSubmit={event => { event.preventDefault(); void fillLogin(); }} className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1 space-y-1"><label htmlFor="remote-login-identifier" className="text-sm">{t('邮箱或用户名')}</label><Input id="remote-login-identifier" autoComplete="off" value={identifier} disabled={view.phase !== 'ready' || filling} onChange={event => setIdentifier(event.target.value)} /></div>
          <div className="min-w-48 flex-1 space-y-1"><label htmlFor="remote-login-password" className="text-sm">{t('密码')}</label><div className="flex items-center gap-1"><Input id="remote-login-password" type={showPassword ? 'text' : 'password'} autoComplete="off" placeholder={t('仅本次使用，填入后清空')} value={password} disabled={view.phase !== 'ready' || filling} onChange={event => setPassword(event.target.value)} /><Button type="button" variant="ghost" size="icon" aria-label={t(showPassword ? '隐藏密码' : '显示密码')} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</Button></div></div>
          <Button type="submit" disabled={view.phase !== 'ready' || filling || pasting || (!identifier && !password)}>{t(filling ? '正在填入…' : '填入上方登录框')}</Button>
        </form>
        <details><summary className="cursor-pointer text-sm text-muted-foreground">{t('粘贴验证码或其他文字')}</summary><div className="mt-2 flex flex-wrap items-center gap-2">
          <label htmlFor="remote-browser-text" className="sr-only">{t('输入或粘贴文本')}</label>
          <Input id="remote-browser-text" type={showClipboardText ? 'text' : 'password'} autoComplete="off" value={clipboardText} disabled={view.phase !== 'ready' || pasting} placeholder={t('先点远程输入框，在这里输入或粘贴后发送')} onChange={event => setClipboardText(event.target.value)} className="min-w-48 flex-1" />
          <Button variant="ghost" size="icon" aria-label={t(showClipboardText ? '隐藏粘贴内容' : '显示粘贴内容')} aria-pressed={showClipboardText} disabled={view.phase !== 'ready'} onClick={() => setShowClipboardText(!showClipboardText)}>{showClipboardText ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</Button>
          <Button variant="outline" disabled={view.phase !== 'ready' || pasting || clipboardText.length === 0} onClick={() => void pasteText()}>{t(pasting ? '正在粘贴…' : '粘贴到浏览器')}</Button>
        </div></details>
        <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t('已进入平台首页或本人主页后，再保存登录。')}</p>
        <div className="flex flex-wrap gap-2">
          {document.fullscreenEnabled && <Button variant="outline" aria-pressed={fullscreen} disabled={starting || busy} onClick={() => void toggleFullscreen()}>{t(fullscreen ? '退出全屏' : '全屏')}</Button>}
          <Button variant="outline" aria-pressed={originalSize} disabled={starting || busy} onClick={() => { if (viewer.current) viewer.current.scaleViewport = originalSize; setOriginalSize(!originalSize); }}>{t(originalSize ? '适应窗口' : '原始尺寸')}</Button>
          <Button onClick={() => void close(true)} disabled={starting || busy || filling || pasting || !viewer.current}>{t(closing ? '正在关闭…' : saving ? '正在检查并保存…' : starting ? '正在启动…' : '保存并检查')}</Button>
        </div>
        </div>
      </footer>
    </DialogContent>
  </Dialog>;
}
