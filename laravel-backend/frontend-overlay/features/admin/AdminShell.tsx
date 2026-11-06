import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Layers,
  Receipt,
  Search,
  ShieldCheck,
  Store,
  Ticket,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/auth-store';
import { assetUrl, cn } from '@/lib/utils';
import { adminApi } from './admin-api';
import { useAsync } from './admin-lib';

const NAV = [
  { to: '/admin', label: 'داشبورد', icon: LayoutDashboard, end: true },
  { to: '/admin/stores', label: 'فروشگاه‌ها', icon: Store },
  { to: '/admin/subscribers', label: 'مشترکان', icon: Users },
  { to: '/admin/orders', label: 'پرداخت‌ها', icon: Receipt, badge: 'orders' as const },
  { to: '/admin/plans', label: 'تعرفه‌ها', icon: Layers },
  { to: '/admin/coupons', label: 'کدهای تخفیف', icon: Ticket },
  { to: '/admin/audit', label: 'دفتر رویدادها', icon: History },
  { to: '/admin/managers', label: 'مدیران', icon: ShieldCheck },
];

export function AdminShell() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data, loading, reload } = useAsync(() => adminApi.dashboard(), []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const title = useMemo(() => {
    const match = [...NAV].sort((a, b) => b.to.length - a.to.length).find((item) =>
      item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
    );
    return match?.label ?? 'پنل مدیریت';
  }, [location.pathname]);

  const pending = data?.kpis.orders_pending ?? 0;

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const term = search.trim();
    navigate(term ? `/admin/subscribers?q=${encodeURIComponent(term)}` : '/admin/subscribers');
  };

  const sidebar = (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
        <img
          src={assetUrl('images/karo/mark.png')}
          alt="کارو"
          className="h-9 w-9 rounded-lg bg-white object-contain p-0.5"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-white">کارو — پنل مدیریت</p>
          <p className="truncate text-[10px] text-white/45">KarenSoft Subscription Console</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="ms-auto text-white/60 lg:hidden"
          onClick={() => setMenuOpen(false)}
          aria-label="بستن منو"
        >
          <X aria-hidden />
        </Button>
      </div>

      <nav className="flex-1 space-y-1">
        {NAV.map((item) => {
          const Icon = item.icon;
          const badge = item.badge === 'orders' ? pending : 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-emerald-400/15 font-bold text-emerald-300'
                    : 'text-white/65 hover:bg-white/[0.06] hover:text-white',
                )
              }
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span className="flex-1">{item.label}</span>
              {badge > 0 && (
                <span className="rounded-full bg-amber-400 px-1.5 text-[10px] font-extrabold text-navy-900">
                  {badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-xs">
        <p className="truncate font-bold text-white/90">{user?.name ?? 'مدیر'}</p>
        <p dir="ltr" className="truncate text-[10px] text-white/40">
          {user?.email}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2 w-full border-white/15 text-white/80"
          onClick={() => void logout()}
        >
          <LogOut aria-hidden />
          خروج
        </Button>
      </div>
    </div>
  );

  return (
    <div dir="rtl" className="dark min-h-dvh bg-[#060b14] text-white">
      <div className="mx-auto flex max-w-[1500px]">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-e border-white/10 bg-[#080f1c] lg:block">
          {sidebar}
        </aside>

        {menuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              aria-label="بستن منو"
              className="absolute inset-0 bg-black/60"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute inset-y-0 end-0 w-72 border-s border-white/10 bg-[#080f1c]">{sidebar}</div>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-white/10 bg-[#060b14]/90 backdrop-blur">
            <div className="flex flex-wrap items-center gap-2 px-3 py-3 sm:px-5">
              <Button
                variant="ghost"
                size="sm"
                className="text-white/70 lg:hidden"
                onClick={() => setMenuOpen(true)}
                aria-label="باز کردن منو"
              >
                <Menu aria-hidden />
              </Button>

              <div className="me-auto">
                <h1 className="text-base font-extrabold sm:text-lg">{title}</h1>
                <p className="text-[11px] text-white/40">
                  مدیریت اشتراک‌ها، پرداخت‌ها و مشترکان کارو
                </p>
              </div>

              <form onSubmit={submitSearch} className="relative hidden sm:block">
                <Search className="absolute end-2.5 top-2.5 h-4 w-4 text-white/35" aria-hidden />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="جست‌وجوی مشترک، نام یا موبایل…"
                  aria-label="جست‌وجوی سراسری"
                  className="h-9 w-64 border-white/10 bg-white/[0.05] pe-8 text-white placeholder:text-white/35"
                />
              </form>

              <Button
                variant="outline"
                size="sm"
                className="relative border-white/10 text-white/80"
                onClick={() => navigate('/admin/orders?status=pending')}
                aria-label="پرداخت‌های در انتظار"
              >
                <Bell aria-hidden />
                {pending > 0 && (
                  <span className="absolute -start-1 -top-1 rounded-full bg-amber-400 px-1 text-[10px] font-extrabold text-navy-900">
                    {pending}
                  </span>
                )}
              </Button>
            </div>
          </header>

          <main className="px-3 py-4 sm:px-5 sm:py-6">
            <Outlet context={{ dashboard: data, dashboardLoading: loading, reloadDashboard: reload }} />
          </main>
        </div>
      </div>
    </div>
  );
}
