import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { OneCrewMark } from '@/components/brand';
import { NAV_GLYPHS } from '@/components/nav-icons';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { sidebarLayout } from '@/lib/sidebar-layout';

const views = {
  search: { title: 'KOL 搜索', glyph: NAV_GLYPHS.leads },
  accounts: { title: '平台账号', glyph: NAV_GLYPHS.accounts },
  mail: { title: '邮件', glyph: NAV_GLYPHS.mail },
  privacy: { title: '数据与隐私', glyph: NAV_GLYPHS.connect },
};
export type CloudView = keyof typeof views;

function Navigation({ view, onNavigate, local }: { view: CloudView; onNavigate(view: CloudView): void; local: boolean }) {
  const { t } = useTranslation('cloud');
  const { setOpenMobile, toggleSidebar } = useSidebar();
  return <Sidebar collapsible="icon" className="onecrew-navigation border-sidebar-border">
    <SidebarHeader className="h-14 justify-center border-b border-sidebar-border px-2">
      <button type="button" aria-label={t('展开或收起导航')} onClick={toggleSidebar} className="flex h-10 items-center gap-3 rounded-md px-2 text-sidebar-foreground hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
        <OneCrewMark className="size-7 shrink-0" /><span className="truncate text-sm font-semibold group-data-[collapsible=icon]:hidden">OneCrew</span>
      </button>
    </SidebarHeader>
    <SidebarContent className="px-2 py-4"><SidebarMenu className="gap-1">
      {(Object.keys(views) as CloudView[]).filter(id => !local || id !== 'privacy').map(id => {
        const item = views[id], Glyph = view === id ? item.glyph.selected : item.glyph.rest;
        return <SidebarMenuItem key={id}><SidebarMenuButton isActive={view === id} tooltip={t(item.title)} onClick={() => { onNavigate(id); setOpenMobile(false); }} className="h-10 gap-3 px-3 text-sm">
          <Glyph className="size-5 shrink-0" /><span>{t(item.title)}</span>
        </SidebarMenuButton></SidebarMenuItem>;
      })}
    </SidebarMenu></SidebarContent>
    <SidebarFooter className="border-t border-sidebar-border p-4 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
      <a href="/support" target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">{t('使用与支持')}</a>
      <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">{t('隐私政策预览')}</a>
      <a href="/licenses/NOTICE.txt" target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">{t('开源软件声明')}</a>
    </SidebarFooter>
  </Sidebar>;
}

export default function WorkspaceShell({ view, onNavigate, workspace, children, local = false, account = false }: { view: CloudView; onNavigate(view: CloudView): void; workspace: string; children: ReactNode; local?: boolean; account?: boolean }) {
  const { t, i18n } = useTranslation('cloud');
  return <SidebarProvider style={{ '--sidebar-width': sidebarLayout.expandedWidth, '--sidebar-width-icon': sidebarLayout.iconWidth } as CSSProperties}>
    <Navigation view={view} onNavigate={onNavigate} local={local} />
    <SidebarInset className="min-w-0 bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-4 sm:px-6">
        <SidebarTrigger aria-label={t('展开或收起导航')} /><span className="h-4 w-px bg-border" aria-hidden="true" />
        <h1 className="text-sm font-semibold">{t(views[view].title)}</h1>
        <span className="ml-auto max-w-56 truncate text-xs text-muted-foreground">{workspace}</span>
        <select aria-label="语言 / Language" value={i18n.resolvedLanguage} onChange={event => void i18n.changeLanguage(event.target.value)} className="h-8 shrink-0 rounded-md border border-input bg-background px-2 text-xs"><option value="zh-CN">中文</option><option value="en-US">English</option></select>
        {account && <form action="/auth/logout" method="post"><button type="submit" className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t('退出登录')}</button></form>}
      </header>
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
    </SidebarInset>
  </SidebarProvider>;
}
