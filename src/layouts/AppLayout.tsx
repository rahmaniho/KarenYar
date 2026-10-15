import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Crown, Download, LockKeyhole, Menu, Moon, Sun, Wifi, WifiOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TIER_LABELS } from '@/core/license/license-core';
import { useLicenseStore } from '@/store/license-store';
import { useSettingsStore } from '@/store/settings-store';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { useInstallPrompt } from '@/hooks/use-install-prompt';
import { NAV_GROUPS, MOBILE_NAV } from './nav-items';
import { KarenSoftCredit } from '@/components/KarenSoftCredit';
import { GlobalSearch } from '@/components/GlobalSearch';
import { useLockStore } from '@/store/lock-store';
import { AlertsBell } from '@/components/AlertsBell';
import { assetUrl, cn } from '@/lib/utils';

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="حساب‌یار کارن سافت — داشبورد">
      {/* لوگوی خودِ برنامه (حساب‌یار) */}
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl shadow-glow ring-1 ring-black/10">
        <img
          src={assetUrl('images/karensoft/KarenYar.png')}
          alt=""
          width={512}
          height={512}
          className="h-full w-full object-cover"
        />
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className="block text-[15px] font-extrabold">حساب‌یار</span>
          <span className="block text-[11px] text-muted-foreground">کارن سافت</span>
        </span>
      )}
    </Link>
  );
}

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const tier = useLicenseStore((s) => s.info.tier);
  return (
    <div className="flex h-full flex-col">
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="ناوبری اصلی">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="px-2 pb-1.5 text-[11px] font-semibold text-white/40">{group.title}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-white/75 transition hover:bg-white/10 hover:text-white',
                        isActive &&
                          'bg-white/10 text-white shadow-[inset_2px_0_0_0_#39FF88] [&_svg]:text-neon-500',
                      )
                    }
                  >
                    <item.icon className="h-[18px] w-[18px]" aria-hidden />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <Link
          to="/settings#license"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2.5 text-sm text-white/85 transition hover:bg-white/10"
        >
          <Crown className="h-4 w-4 text-neon-500" aria-hidden />
          نسخه‌ی {TIER_LABELS[tier]}
          {tier === 'free' && <span className="ms-auto text-xs text-neon-400">ارتقا ←</span>}
        </Link>
        <p className="px-2 pt-2 text-[11px] text-white/40">نسخه ۱٫۲٫۵ — کاملاً آفلاین</p>
        <KarenSoftCredit className="mt-1.5" />
      </div>
    </div>
  );
}

export function AppLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    if (!location.hash) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname, location.hash]);
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

  return (
    <div className="min-h-dvh bg-background">
      {/* سایدبار دسکتاپ */}
      <aside className="fixed inset-y-0 start-0 z-40 hidden w-64 bg-navy-900 text-white lg:block">
        <div className="border-b border-white/10 px-4 py-4 [&_span]:text-white [&_.text-muted-foreground]:text-white/50">
          <BrandMark />
        </div>
        <NavContent />
      </aside>

      {/* منوی موبایل (کشویی) */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-navy-950/60 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.22 }}
              className="fixed inset-y-0 start-0 z-50 flex w-72 max-w-[85vw] flex-col bg-navy-900 text-white shadow-2xl lg:hidden"
              aria-label="منوی موبایل"
            >
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-4 [&_span]:text-white [&_.text-muted-foreground]:text-white/50">
                <BrandMark />
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/10"
                  aria-label="بستن منو"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <NavContent onNavigate={() => setMobileMenuOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="lg:ps-64">
        {/* هدر */}
        <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="باز کردن منو"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="lg:hidden">
              <BrandMark compact />
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
                  className="hidden md:inline-flex"
                >
                  <Download className="h-4 w-4" />
                  نصب اپلیکیشن
                </Button>
              )}
              <AlertsBell />
              {pinHash && (
                <Button variant="ghost" size="icon" aria-label="قفل‌کردن برنامه" onClick={lock}>
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
                className="hidden sm:inline-flex"
              >
                <Link to="/settings#license">
                  <Crown className="h-4 w-4" />
                  {TIER_LABELS[tier]}
                </Link>
              </Button>
              <span className="hidden text-sm font-bold md:block">حساب‌یار کارن سافت</span>
            </div>
          </div>
        </header>

        {/* محتوای صفحه */}
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className="mx-auto w-full max-w-6xl px-4 pb-24 pt-5 lg:pb-10"
        >
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
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
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
