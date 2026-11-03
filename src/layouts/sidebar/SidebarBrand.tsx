import { Link } from 'react-router-dom';
import { PanelRightClose, PanelRightOpen, TriangleAlert, X } from 'lucide-react';
import { assetUrl } from '@/lib/utils';
import { toFaDigits } from '@/core/currency/currency';
import type { AppAlert } from '@/features/alerts/alerts';
import { SidebarTooltip } from './SidebarTooltip';

interface SidebarBrandProps {
  collapsed: boolean;
  isDrawer: boolean;
  alerts: AppAlert[];
  onToggleCollapse: () => void;
  onClose?: () => void;
  onExpand: () => void;
  onNavigate: () => void;
}

/** سربرند برند: لوگوی واقعی حسابیار، نام، شعار محصول، شمارش هشدارهای واقعی و دکمهی جمع/باز کردن */
export function SidebarBrand({
  collapsed,
  isDrawer,
  alerts,
  onToggleCollapse,
  onClose,
  onExpand,
  onNavigate,
}: SidebarBrandProps) {
  const logo = (
    <Link
      to="/"
      onClick={onNavigate}
      className="flex shrink-0 items-center justify-center rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[#d6b46a]"
      aria-label="حساب‌یار کارن سافت — داشبورد"
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/20"
        style={{
          boxShadow: '0 0 22px -6px rgb(56 189 248 / 0.65), inset 0 1px 0 rgb(255 255 255 / 0.3)',
        }}
      >
        <img
          src={assetUrl('images/hesabyar/mark.png')}
          alt=""
          width={512}
          height={512}
          className="h-full w-full object-cover"
        />
      </span>
    </Link>
  );

  const toggle = isDrawer ? (
    <button
      type="button"
      onClick={onClose}
      data-drawer-close
      aria-label="بستن منو"
      className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--glass-muted)] transition hover:bg-white/10 hover:text-white"
    >
      <X className="h-[18px] w-[18px]" aria-hidden />
    </button>
  ) : (
    <button
      type="button"
      onClick={onToggleCollapse}
      aria-label={collapsed ? 'باز کردن منو' : 'جمع کردن منو'}
      aria-expanded={!collapsed}
      className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--glass-muted)] transition hover:bg-white/10 hover:text-white"
    >
      {collapsed ? (
        <PanelRightOpen className="h-[18px] w-[18px]" aria-hidden />
      ) : (
        <PanelRightClose className="h-[18px] w-[18px]" aria-hidden />
      )}
    </button>
  );

  if (collapsed) {
    return (
      <div className="relative z-10 flex flex-col items-center gap-2 px-2 pt-4">
        {logo}
        <SidebarTooltip label="باز کردن منو">{toggle}</SidebarTooltip>
        {alerts.length > 0 && (
          <SidebarTooltip label={`${toFaDigits(String(alerts.length))} هشدار نیازمند توجه`}>
            <Link
              to={alerts[0].to}
              onClick={onExpand}
              aria-label={`${toFaDigits(String(alerts.length))} هشدار`}
              className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300"
            >
              <TriangleAlert className="h-[17px] w-[17px]" aria-hidden />
              <span className="absolute -end-0.5 -top-0.5 h-2 w-2 rounded-full bg-destructive" />
            </Link>
          </SidebarTooltip>
        )}
        <div className="nav-group-rule mt-1 h-px w-8" />
      </div>
    );
  }

  return (
    <div className="relative z-10 px-4 pb-3 pt-4">
      <div className="flex items-center gap-3">
        {logo}
        <div className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[15px] font-extrabold text-[var(--glass-ink)]">
            حساب‌یار
          </span>
          <span className="block truncate text-[11px] font-medium text-[var(--glass-muted)]">
            کارن سافت
          </span>
        </div>
        {toggle}
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--glass-gold)] shadow-[0_0_8px_#d6b46a]" />
        <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-[var(--glass-muted)]">
          مدیریت هوشمند امور مالی
        </p>
        {alerts.length > 0 && (
          <Link
            to={alerts[0].to}
            onClick={onNavigate}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 transition hover:bg-amber-400/20"
            aria-label={`${toFaDigits(String(alerts.length))} هشدار نیازمند توجه`}
          >
            <TriangleAlert className="h-3 w-3" aria-hidden />
            {toFaDigits(String(alerts.length))} هشدار
          </Link>
        )}
      </div>
    </div>
  );
}
