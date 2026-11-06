import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type TouchEvent,
} from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Crown, Download, LockKeyhole, Menu, Moon, Sun, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TIER_LABELS } from '@/core/license/license-core';
import { useLicenseStore } from '@/store/license-store';
import { useSettingsStore } from '@/store/settings-store';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { useInstallPrompt } from '@/hooks/use-install-prompt';
import { MOBILE_NAV } from './nav-items';
import { GlobalSearch } from '@/components/GlobalSearch';
import { useLockStore } from '@/store/lock-store';
import { AlertsBell } from '@/components/AlertsBell';
import { DemoBanner } from '@/features/demo/DemoBanner';
import { assetUrl, cn } from '@/lib/utils';
import { GlassSidebar, SIDEBAR_WIDTH, SIDEBAR_WIDTH_COLLAPSED } from './sidebar/GlassSidebar';
import { useSidebarUi } from './sidebar/useSidebarUi';
import '@/styles/glass-sidebar.css';

/** نشان کوچک برند در هدر موبایل (همان لوگوی واقعی پروژه، بدون تغییر نسبت) */
function CompactBrand() {
  return (
    <Link to="/" aria-label="کارو نرم‌افزار حسابداری — داشبورد" className="shrink-0">
      <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-black/10 shadow-sm">
        <img
          src={assetUrl('images/karo/mark.png')}
          alt=""
          width={512}
          height={512}
          className="h-full w-full object-cover"
        />
      </span>
    </Link>
  );
}

export function AppLayout() {
  const ui = useSidebarUi();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [lowPower] = useState(() => {
    const cores = navigator.hardwareConcurrency ?? 0;
    return cores > 0 && cores <= 4;
  });
  const reduceMotion = useReducedMotion();
  const location = useLocation();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const online = useOnlineStatus();
  const { canInstall, promptInstall } = useInstallPrompt();
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const pinHash = useSettingsStore((s) => s.pinHash);
  const lock = useLockStore((s) => s.lock);
  const tier = useLicenseStore((s) => s.info.tier);

  const systemDark =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  const isDark = theme === 'dark' || (theme === 'system' && systemDark);

  const closeDrawer = useCallback(() => {
    setMobileMenuOpen(false);
    menuButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!location.hash) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    setMobileMenuOpen(false);
  }, [location.pathname, location.hash]);

  // قفل اسکرول صفحهی زیرین کشو + بستن با Escape + فوکوس اولیه
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    const frame = requestAnimationFrame(() => {
      drawerRef.current?.querySelector<HTMLElement>('[data-drawer-close]')?.focus();
    });
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      cancelAnimationFrame(frame);
    };
  }, [mobileMenuOpen]);

  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const onTouchEnd = (event: TouchEvent) => {
    const start = touchStartRef.current;
    const touch = event.changedTouches[0];
    touchStartRef.current = null;
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    // کشو در RTL از راست باز میشود؛ swipe به راست آن را میبندد (اسکرول عمودی تداخل نمیکند)
    if (dx > 64 && Math.abs(dx) > Math.abs(dy) * 1.4) closeDrawer();
  };

  const navWidth = ui.collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH;
  const shellStyle = { '--nav-width': `${navWidth}px` } as CSSProperties;

  return (
    <div
      className={cn('app-shell relative min-h-dvh bg-background', lowPower && 'glass-lite')}
      style={shellStyle}
      dir="rtl"
    >
      <div className="app-ambient" aria-hidden />

      {/* سایدبار شناور دسکتاپ */}
      <aside className="fixed inset-y-4 start-4 z-40 hidden md:block" aria-label="منوی اصلی">
        <GlassSidebar
          ui={ui}
          onNavigate={() => undefined}
          shortcutActive={!mobileMenuOpen}
          searchId="nav-search-desktop"
        />
      </aside>

      {/* کشوی موبایل */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            key="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.22 }}
            className="drawer-backdrop fixed inset-0 z-50 md:hidden"
            onClick={closeDrawer}
            aria-hidden
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.aside
            key="drawer"
            ref={drawerRef}
            data-nav-drawer
            role="dialog"
            aria-modal="true"
            aria-label="منوی موبایل"
            initial={{ x: '100%', opacity: 0.7 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0.7 }}
            transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            className="fixed inset-y-3 start-3 z-50 w-[min(86vw,340px)] max-w-[86vw] touch-pan-y md:hidden"
          >
            <GlassSidebar
              ui={ui}
              isDrawer
              onClose={closeDrawer}
              onNavigate={closeDrawer}
              shortcutActive
              searchId="nav-search-mobile"
            />
          </motion.aside>
        )}
      </AnimatePresence>

      <div className="app-content relative z-10">
        {/* هدر — تمام کنترلهای قبلی بدون تغییر عملکرد */}
        <header className="safe-area-top sticky top-0 z-30 px-3">
          <div className="glass-topbar mx-auto flex h-16 max-w-6xl items-center gap-2 rounded-2xl px-3">
            <Button
              ref={menuButtonRef}
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="باز کردن منو"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="md:hidden">
              <CompactBrand />
            </div>
            <div className="ms-auto flex items-center gap-1.5 sm:gap-2">
              <GlobalSearch />
              <Badge variant={online ? 'success' : 'warning'} className="hidden sm:inline-flex">
                {online ? (
                  <Wifi className="h-3 w-3" aria-hidden />
                ) : (
                  <WifiOff className="h-3 w-3" aria-hidden />
                )}
                {online ? 'آنلاین' : 'آفلاین'}
              </Badge>
              {canInstall && (
                <Button
                  size="sm"
                  variant="neon"
                  onClick={promptInstall}
                  className="hidden lg:inline-flex"
                >
                  <Download className="h-4 w-4" />
                  نصب اپلیکیشن
                </Button>
              )}
              <AlertsBell />
              {pinHash && (
                <Button variant="ghost" size="icon" aria-label="قفل کردن برنامه" onClick={lock}>
                  <LockKeyhole className="h-5 w-5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                aria-label={isDark ? 'حالت روشن' : 'حالت تاریک'}
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
              >
                {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </Button>
              <Button
                asChild
                size="sm"
                variant={tier === 'free' ? 'outline' : 'neon'}
                className="hidden lg:inline-flex"
              >
                <Link to="/settings#license">
                  <Crown className="h-4 w-4" />
                  {TIER_LABELS[tier]}
                </Link>
              </Button>
              <span className="hidden text-sm font-bold lg:block">کارو نرم‌افزار حسابداری</span>
            </div>
          </div>
        </header>

        {/* محتوای صفحه */}
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.22 }}
          className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 md:pb-10"
        >
          <DemoBanner />

          <Suspense
            fallback={
              <div className="space-y-4" role="status" aria-label="در حال بارگذاری">
                <div className="h-8 w-56 animate-pulse rounded-lg bg-muted" />
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="h-24 animate-pulse rounded-xl bg-muted" />
                  <div className="h-24 animate-pulse rounded-xl bg-muted" />
                  <div className="h-24 animate-pulse rounded-xl bg-muted" />
                </div>
                <div className="h-64 animate-pulse rounded-xl bg-muted" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </motion.main>
      </div>

      {/* ناوبری پایینی موبایل */}
      <nav
        className="glass-bottom-nav fixed inset-x-3 bottom-3 z-40 rounded-[22px] border md:hidden"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.25rem)' }}
        aria-label="ناوبری موبایل"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {MOBILE_NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground transition',
                    isActive && 'text-primary dark:text-neon-400',
                  )
                }
              >
                <item.icon className="h-5 w-5" aria-hidden />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
