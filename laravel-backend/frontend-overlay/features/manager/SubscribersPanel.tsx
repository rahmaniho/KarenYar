import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, RefreshCw, Search, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, apiFetch } from '@/core/api/client';
import { formatMoney, toFaDigits } from '@/core/currency/currency';
import { formatJalaliLongISO } from '@/core/jalali/jalali';
import { cn } from '@/lib/utils';
import { STATUS_LABELS, STATUS_TONES } from '@/features/subscription/subscription-types';

interface Subscriber {
  license_id: number;
  store_id: number;
  store_name: string | null;
  owner_name: string | null;
  phone: string | null;
  plan_code: string | null;
  tier: string;
  seats: number;
  active_users: number;
  status: string;
  is_trial: boolean;
  is_lifetime: boolean;
  expires_at: string | null;
  days_remaining: number | null;
  last_amount: number | null;
  last_transaction: string | null;
}

interface Stats {
  total: number;
  active: number;
  expiring_soon: number;
  expired: number;
  revenue_total: number;
  revenue_month: number;
}

const cardClass = 'border-white/10 bg-white/[0.04] text-white';

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: '', label: 'همه' },
  { key: 'active', label: 'فعال' },
  { key: 'expired', label: 'منقضی' },
  { key: 'suspended', label: 'تعلیق' },
];

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.errors) {
      const first = Object.values(error.errors).flat().find(Boolean);
      if (first) return first;
    }
    return error.message;
  }
  return 'ارتباط با سرور برقرار نشد.';
}

/**
 * فهرست مشترکان با جست‌وجو/فیلتر و تمدید یا اصلاح اشتراک (با دلیل).
 */
export function SubscribersPanel() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<Subscriber | null>(null);
  const [form, setForm] = useState({ months: '1', seats: '', reason: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (status) params.set('status', status);
      const response = await apiFetch<{ subscribers: Subscriber[]; stats: Stats }>(
        `/api/manager/subscribers?${params.toString()}`,
      );
      setSubscribers(response.subscribers);
      setStats(response.stats);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [query, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const extend = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await apiFetch(`/api/manager/subscribers/${selected.license_id}/extend`, {
        method: 'POST',
        body: JSON.stringify({
          months: Number(form.months),
          seats: form.seats ? Number(form.seats) : null,
          reason: form.reason.trim(),
        }),
      });
      toast.success('اشتراک تمدید شد و در تاریخچه ثبت گردید.');
      setSelected(null);
      setForm({ months: '1', seats: '', reason: '' });
      await load();
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (next: 'active' | 'suspended') => {
    if (!selected || form.reason.trim().length < 3) {
      toast.error('برای تغییر وضعیت، دلیل را بنویسید.');
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/manager/subscribers/${selected.license_id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: next, reason: form.reason.trim() }),
      });
      toast.success(next === 'active' ? 'اشتراک فعال شد.' : 'اشتراک تعلیق شد.');
      setSelected(null);
      setForm({ months: '1', seats: '', reason: '' });
      await load();
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-white">
          <Users className="h-5 w-5 text-[var(--glass-gold,theme(colors.amber.400))]" aria-hidden />
          مشترکان
        </h2>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw aria-hidden className={loading ? 'animate-spin' : undefined} />
          تازه‌سازی
        </Button>
      </div>

      {stats && (
        <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className={cardClass}>
            <CardContent className="p-4">
              <p className="text-xs text-white/60">کل مشترکان</p>
              <p className="mt-1 text-xl font-extrabold">{toFaDigits(stats.total)}</p>
            </CardContent>
          </Card>
          <Card className={cardClass}>
            <CardContent className="p-4">
              <p className="text-xs text-white/60">فعال</p>
              <p className="mt-1 text-xl font-extrabold">{toFaDigits(stats.active)}</p>
            </CardContent>
          </Card>
          <Card className={cardClass}>
            <CardContent className="p-4">
              <p className="text-xs text-white/60">نزدیک انقضا (۷ روز)</p>
              <p className="mt-1 text-xl font-extrabold">{toFaDigits(stats.expiring_soon)}</p>
            </CardContent>
          </Card>
          <Card className={cardClass}>
            <CardContent className="p-4">
              <p className="text-xs text-white/60">درآمد این ماه</p>
              <p className="mt-1 text-xl font-extrabold">
                {formatMoney(stats.revenue_month, 'toman')}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute end-2 top-2.5 h-4 w-4 text-white/40" aria-hidden />
          <Input
            className="pe-8"
            placeholder="جست‌وجوی نام فروشگاه، مالک، موبایل یا ایمیل"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {STATUS_FILTERS.map((item) => (
          <Button
            key={item.key}
            size="sm"
            variant={status === item.key ? 'default' : 'outline'}
            onClick={() => setStatus(item.key)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {error && (
        <Card className={cardClass}>
          <CardContent className="p-6 text-center text-sm text-red-300">{error}</CardContent>
        </Card>
      )}

      {!error && !loading && subscribers.length === 0 && (
        <Card className={cardClass}>
          <CardContent className="p-8 text-center text-sm text-white/60">
            مشترکی با این شرایط پیدا نشد.
          </CardContent>
        </Card>
      )}

      {subscribers.length > 0 && (
        <Card className={cardClass}>
          <CardContent className="p-0">
            <ul className="divide-y divide-white/[0.06]">
              {subscribers.map((subscriber) => (
                <li
                  key={subscriber.license_id}
                  className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm"
                >
                  <span
                    className={cn(
                      'rounded-lg px-2 py-0.5 text-[11px] font-bold',
                      STATUS_TONES[subscriber.status] ?? 'bg-white/10 text-white/70',
                    )}
                  >
                    {STATUS_LABELS[subscriber.status] ?? subscriber.status}
                  </span>
                  <span className="font-medium text-white/90">{subscriber.store_name ?? '—'}</span>
                  {subscriber.phone && (
                    <span dir="ltr" className="text-xs text-white/50">
                      {subscriber.phone}
                    </span>
                  )}
                  <span className="text-xs text-white/60">
                    پلن {subscriber.plan_code ?? subscriber.tier} · {toFaDigits(subscriber.seats)}{' '}
                    کاربر ({toFaDigits(subscriber.active_users)} فعال)
                  </span>
                  <span className="flex items-center gap-1 text-xs text-white/50">
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                    {subscriber.is_lifetime
                      ? 'مادام‌العمر'
                      : subscriber.expires_at
                        ? formatJalaliLongISO(subscriber.expires_at)
                        : '—'}
                    {typeof subscriber.days_remaining === 'number' && !subscriber.is_lifetime
                      ? ` (${toFaDigits(subscriber.days_remaining)} روز)`
                      : ''}
                  </span>
                  {subscriber.last_amount !== null && (
                    <span className="text-xs text-white/50">
                      آخرین پرداخت: {formatMoney(subscriber.last_amount, 'toman')}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="ms-auto"
                    onClick={() => {
                      setSelected(subscriber);
                      setForm({ months: '1', seats: String(subscriber.seats), reason: '' });
                    }}
                  >
                    مدیریت
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {selected && (
        <Card className={cn('mt-3', cardClass)}>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold text-white">
                {selected.store_name} — {selected.owner_name ?? 'بدون مالک'}
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="ms-auto"
                onClick={() => setSelected(null)}
              >
                بستن
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="extend-months" className="text-white/70">
                  تمدید (ماه)
                </Label>
                <Input
                  id="extend-months"
                  dir="ltr"
                  inputMode="numeric"
                  value={form.months}
                  onChange={(event) => setForm({ ...form, months: event.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="extend-seats" className="text-white/70">
                  سقف کاربران
                </Label>
                <Input
                  id="extend-seats"
                  dir="ltr"
                  inputMode="numeric"
                  value={form.seats}
                  onChange={(event) => setForm({ ...form, seats: event.target.value })}
                />
              </div>
              <div className="space-y-1 sm:col-span-3">
                <Label htmlFor="extend-reason" className="text-white/70">
                  دلیل (در تاریخچه ثبت می‌شود)
                </Label>
                <Input
                  id="extend-reason"
                  placeholder="مثلاً تسویه دستی یا ارتقای توافقی"
                  value={form.reason}
                  onChange={(event) => setForm({ ...form, reason: event.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="neon" disabled={busy} onClick={() => void extend()}>
                ثبت تمدید
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => void changeStatus('active')}>
                فعال‌سازی اشتراک
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void changeStatus('suspended')}
              >
                تعلیق اشتراک
              </Button>
            </div>
            <p className="text-xs text-white/50">
              تمدید از تاریخ پایان فعلی ادامه می‌یابد و روزهای باقی‌مانده حفظ می‌شود.
            </p>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
