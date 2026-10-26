import { useEffect, useRef, useState } from 'react';
import RFB from '@novnc/novnc';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cloudApi, connection, platformLabels, type Platform } from './api';

export default function RemoteBrowser({ platform, onClose }: { platform: Platform; onClose(): void }) {
  const target = useRef<HTMLDivElement>(null), viewer = useRef<RFB | null>(null);
  const [status, setStatus] = useState('正在启动店铺浏览器…'), [saving, setSaving] = useState(false);
  const [originalSize, setOriginalSize] = useState(false);
  useEffect(() => {
    const cancel = new AbortController();
    void cloudApi('/api/connections', connection, { body: { platform }, signal: cancel.signal }).then(ticket => {
      if (cancel.signal.aborted || !target.current) return;
      const url = new URL(ticket.path, window.location.href); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const rfb = new RFB(target.current, url.href, { wsProtocols: ['binary', ticket.protocol], shared: false });
      viewer.current = rfb; rfb.scaleViewport = true;
      rfb.addEventListener('connect', () => { rfb.focus(); setStatus('已连接。请在平台页面完成登录和验证。'); });
      rfb.addEventListener('disconnect', () => { if (!cancel.signal.aborted) setStatus('登录窗口已断开，请保存并关闭后重新打开。'); });
    }, error => { if (!cancel.signal.aborted) setStatus(error instanceof Error ? error.message : '登录窗口启动失败，请重试。'); });
    return () => { cancel.abort(); viewer.current?.disconnect(); viewer.current = null; };
  }, [platform]);
  async function close() {
    setSaving(true); viewer.current?.disconnect();
    await cloudApi('/api/connections/close', z.object({ saved: z.literal(true) }), { body: {} }).then(onClose, error => { setStatus(error instanceof Error ? error.message : '保存未完成，请重试。'); setSaving(false); });
  }
  return <Dialog open onOpenChange={open => { if (!open && !saving) void close(); }}>
    <DialogContent className="fixed inset-0 flex h-dvh max-w-none flex-col gap-3 rounded-none p-3 sm:max-w-none" showCloseButton={false} onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => event.preventDefault()}>
      <DialogTitle>登录 {platformLabels[platform]}</DialogTitle>
      <DialogDescription>在独立浏览器中完成登录。文字太小时可切换原始尺寸，滚动查看页面。窗口最长开放 15 分钟，完成后保存并关闭。</DialogDescription>
      <div ref={target} className="min-h-0 flex-1 overflow-auto rounded-md border" aria-label={`${platformLabels[platform]} 登录浏览器`} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm text-muted-foreground">{status}</p>
        <div className="flex gap-2">
          <Button variant="outline" aria-pressed={originalSize} disabled={saving} onClick={() => { if (viewer.current) viewer.current.scaleViewport = originalSize; setOriginalSize(!originalSize); }}>{originalSize ? '适应窗口' : '原始尺寸'}</Button>
          <Button onClick={() => void close()} disabled={saving}>{saving ? '正在保存…' : '保存并关闭'}</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>;
}
