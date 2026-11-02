import { useCallback, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppAlerts } from '@/features/alerts/use-app-alerts';
import { alertsByPath } from './nav-badges';
import { NAV_GROUPS } from '../nav-items';
import { SidebarBrand } from './SidebarBrand';
import { SidebarNav } from './SidebarNav';
import { SidebarSearch } from './SidebarSearch';
import { SidebarUser } from './SidebarUser';
import type { SidebarUi } from './useSidebarUi';

export const SIDEBAR_WIDTH = 292;
export const SIDEBAR_WIDTH_COLLAPSED = 82;

interface GlassSidebarProps {
  ui: SidebarUi;
  /** نسخهی کشوی موبایل همیشه باز است (خوانایی اولویت دارد) */
  isDrawer?: boolean;
  onClose?: () => void;
  onNavigate: () => void;
  shortcutActive: boolean;
  searchId: string;
}

/** بدنهی شیشهای مشترک دسکتاپ و کشوی موبایل — تمام منوها و قابلیتها از اینجا میآیند */
export function GlassSidebar({
  ui,
  isDrawer = false,
  onClose,
  onNavigate,
  shortcutActive,
  searchId,
}: GlassSidebarProps) {
  const location = useLocation();
  const collapsed = isDrawer ? false : ui.collapsed;
  const alerts = useAppAlerts();
  const badges = useMemo(() => alertsByPath(alerts), [alerts]);
  const { isGroupOpen, toggleGroup } = ui;

  // گروهی که صفحهی فعال در آن قرار دارد همیشه باز میماند تا مسیر فعلی گم نشود
  useEffect(() => {
    const activeGroup = NAV_GROUPS.find((group) =>
      group.items.some((item) => item.to !== '/' && location.pathname.startsWith(item.to)),
    );
    if (activeGroup && !isGroupOpen(activeGroup.id)) toggleGroup(activeGroup.id);
  }, [location.pathname, isGroupOpen, toggleGroup]);

  const { collapsed: uiCollapsed, setCollapsed } = ui;
  const expand = useCallback(() => {
    if (uiCollapsed) setCollapsed(false);
  }, [uiCollapsed, setCollapsed]);

  return (
    <div
      className="glass-sidebar flex h-full w-full flex-col"
      style={isDrawer ? undefined : { width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH }}
    >
      <SidebarBrand
        collapsed={collapsed}
        isDrawer={isDrawer}
        alerts={alerts}
        onToggleCollapse={ui.toggleCollapsed}
        onClose={onClose}
        onExpand={expand}
        onNavigate={onNavigate}
      />
      <SidebarSearch
        collapsed={collapsed}
        onExpand={expand}
        onNavigate={onNavigate}
        shortcutActive={shortcutActive}
        id={searchId}
      />
      <SidebarNav ui={ui} collapsed={collapsed} badges={badges} onNavigate={onNavigate} />
      <SidebarUser collapsed={collapsed} onExpand={expand} onNavigate={onNavigate} />
    </div>
  );
}
