import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronUp, Crown, LockKeyhole, Moon, Settings2, Sun, Wifi, WifiOff } from 'lucide-react';
import { assetUrl, cn } from '@/lib/utils';
import { TIER_LABELS } from '@/core/license/license-core';
import { useLicenseStore } from '@/store/license-store';
import { useLockStore } from '@/store/lock-store';
import { useSettingsStore } from '@/store/settings-store';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { KarenSoftCredit } from '@/components/KarenSoftCredit';
import { SidebarTooltip } from './SidebarTooltip';
import { toFaDigits } from '@/core/currency/currency';
import { version as appVersion } from '../../../package.json';

interface SidebarUserProps {
  collapsed: boolean;
  onExpand: () => void;
  onNavigate: () => void;
}

/**
 * پنل پایینی: اطلاعات واقعی موجود در برنامه (دارنده‌ی لایسنس / نام کسبوکار،
 * سطح دسترسی لایسنس، وضعیت اتصال)، تنظیمات، تم و قفل PIN.
 * این برنامهافلاین حساب کاربری، عکس پروفایل یا نشست ورود/خروج ندارد؛
 * بنابراین هیچکدام بهصورت ساختگی اضافه نشده است.
 */
export function SidebarUser({ collapsed, onExpand, onNavigate }: SidebarUserProps) {
  const [open, setOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const holderName = useLicenseStore((s) => s.info.holderName);
  const tier = useLicenseStore((s) => s.info.tier);
  const shopName = useSettingsStore((s) => s.shopName);
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const pinHash = useSettingsStore((s) => s.pinHash);
  const lock = useLockStore((s) => s.lock);
  const online = useOnlineStatus();

  const systemDark =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  const isDark = theme === 'dark' || (theme === 'system' && systemDark);
  const displayName = holderName || shopName || 'حساب‌یار';

  useEffect(() => {
    if (!collapsed && pendingOpen) {
      setOpen(true);
      setPendingOpen(false);
    }
  }, [collapsed, pendingOpen]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const avatar = (className?: string) => (
    <span
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/20',
        className,
      )}
      style={{ boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.25)' }}
    >
      <img
        src={assetUrl('images/hesabyar/mark.png')}
        alt=""
        width={512}
        height={512}
        className="h-full w-full object-cover"
      />
      <span
        className={cn(
          'absolute -bottom-0.5 -end-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#101827]',
          online ? 'bg-[var(--glass-green)]' : 'bg-amber-400',
        )}
        aria-hidden
      />
    </span>
  );

  const menu = open && (
    <div
      role="menu"
      aria-label="تنظیمات حساب و برنامه"
      className="glass-user-menu absolute inset-x-2 bottom-[calc(100%+8px)] rounded-2xl p-1.5"
    >
      <Link
        to="/settings"
        role="menuitem"
        onClick={() => {
          setOpen(false);
          onNavigate();
        }}
        className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[12.5px] text-[var(--glass-muted)] hover:text-white"
      >
        <Settings2 className="h-4 w-4" aria-hidden />
        تنظیمات برنامه
      </Link>
      <Link
        to="/settings#license"
        role="menuitem"
        onClick={() => {
          setOpen(false);
          onNavigate();
        }}
        className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[12.5px] text-[var(--glass-muted)] hover:text-white"
      >
        <Crown className="h-4 w-4 text-[var(--glass-gold)]" aria-hidden />
        لایسنس و سطح دسترسی
      </Link>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          setTheme(isDark ? 'light' : 'dark');
          setOpen(false);
        }}
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-start text-[12.5px] text-[var(--glass-muted)] hover:text-white"
      >
        {isDark ? (
          <Sun className="h-4 w-4" aria-hidden />
        ) : (
          <Moon className="h-4 w-4" aria-hidden />
        )}
        {isDark ? 'حالت روشن' : 'حالت تاریک'}
      </button>
      {pinHash && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setOpen(false);
            lock();
          }}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-start text-[12.5px] text-[var(--glass-muted)] hover:text-white"
        >
          <LockKeyhole className="h-4 w-4" aria-hidden />
          قفل کردن برنامه
        </button>
      )}
      <div className="mt-1 flex items-center gap-1.5 border-t border-white/[0.08] px-3 pb-1 pt-2 text-[10px] text-[var(--glass-dim)]">
        {online ? (
          <Wifi className="h-3 w-3" aria-hidden />
        ) : (
          <WifiOff className="h-3 w-3" aria-hidden />
        )}
        {online ? 'آنلاین' : 'آفلاین'} — نسخه‌ی {TIER_LABELS[tier]}
      </div>
      <div className="border-t border-white/[0.08] px-1 pt-2">
        <KarenSoftCredit className="[&_.ks-credit-label]:text-white/70" />
      </div>
    </div>
  );

  if (collapsed) {
    return (
      <div className="relative z-20 px-2 pb-3">
        <SidebarTooltip label="حساب و تنظیمات">
          <button
            type="button"
            onClick={() => {
              onExpand();
              setPendingOpen(true);
            }}
            aria-label="حساب و تنظیمات"
            className="nav-item flex h-11 w-full items-center justify-center rounded-xl"
          >
            {avatar('h-9 w-9')}
          </button>
        </SidebarTooltip>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="relative z-20 px-3 pb-3">
      {menu}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="حساب و تنظیمات"
        className="glass-user-panel flex w-full items-center gap-2.5 rounded-2xl p-2 text-start"
      >
        {avatar('h-10 w-10')}
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[12.5px] font-bold text-[var(--glass-ink)]">
            {displayName}
          </span>
          <span className="block truncate text-[10.5px] text-[var(--glass-muted)]">
            نسخه‌ی {TIER_LABELS[tier]}
          </span>
        </span>
        <ChevronUp
          className={cn(
            'h-4 w-4 shrink-0 text-[var(--glass-muted)] transition-transform duration-200',
            !open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      <div className="mt-2 flex items-center justify-between gap-2 px-1">
        <Link
          to="/settings#license"
          onClick={onNavigate}
          className="flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-[10.5px] text-[var(--glass-gold)] transition hover:bg-white/[0.06]"
        >
          <Crown className="h-3 w-3" aria-hidden />
          نسخه‌ی {TIER_LABELS[tier]}
          {tier === 'free' && (
            <span className="text-[10px] text-[var(--glass-muted)]">· ارتقا</span>
          )}
        </Link>
        <span className="text-[9.5px] text-[var(--glass-dim)]">
          نسخه {toFaDigits(appVersion).replace(/\./g, '٫')} — آفلاین
        </span>
      </div>
    </div>
  );
}
