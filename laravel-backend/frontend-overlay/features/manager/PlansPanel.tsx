import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Coins, Plus, RefreshCw, Ticket, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApiError, apiFetch } from '@/core/api/client';
import { formatMoney, toFaDigits } from '@/core/currency/currency';
import { cn } from '@/lib/utils';
import type { SubscriptionPlan } from '@/features/subscription/subscription-types';

interface Coupon {
  id: number;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  plan_code: string | null;
  used_count: number;
  max_uses: number | null;
  is_active: boolean;
  is_usable: boolean;
  ends_at: string | null;
}

const cardClass = 'border-white/10 bg-white/[0.04] text-white';

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

interface PlanForm {
  code: string;
  name: string;
  tier: 'pro' | 'proplus';
  base_monthly: string;
  extra_user_monthly: string;
  min_seats: string;
  max_seats: string;
  features: string;
  price_note: string;
}

const emptyForm: PlanForm = {
  code: '',
  name: '',
  tier: 'pro',
  base_monthly: '0',
  extra_user_monthly: '0',
  min_seats: '1',
  max_seats: '50',
  features: '',
  price_note: '',
};

/**
 * مدیریت تعرفه‌ها و کدهای تخفیف (فقط مدیر).
 *
 * تغییر قیمت، پلن را برای خریدهای بعدی عوض می‌کند؛ سفارش‌های قبلی مبلغ خودشان
 * را نگه می‌دارند. هر تغییر قیمت در تاریخچه ثبت می‌شود.
 */
export function PlansPanel() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [couponForm, setCouponForm] = useState({
    code: '',
    type: 'percent' as 'percent' | 'fixed',
    value: '10',
    max_uses: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [planResponse, couponResponse] = await Promise.all([
        apiFetch<{ plans: SubscriptionPlan[] }>('/api/manager/plans'),
        apiFetch<{ coupons: Coupon[] }>('/api/manager/coupons'),
      ]);
      setPlans(planResponse.plans);
      setCoupons(couponResponse.coupons);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (plan: SubscriptionPlan) => {
    setEditing(plan.code);
    setForm({
      code: plan.code,
      name: plan.name,
      tier: plan.tier,
      base_monthly: String(plan.base_monthly),
      extra_user_monthly: String(plan.extra_user_monthly),
      min_seats: String(plan.min_seats),
      max_seats: String(plan.max_seats),
      features: plan.features.join('\n'),
      price_note: '',
    });
  };

  const submitPlan = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const payload = {
      ...(editing === null ? { code: form.code } : {}),
      name: form.name,
      tier: form.tier,
      base_monthly: Number(form.base_monthly),
      extra_user_monthly: Number(form.extra_user_monthly),
      min_seats: Number(form.min_seats),
      max_seats: Number(form.max_seats),
      features: form.features
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      price_note: form.price_note.trim() || undefined,
    };

    try {
      if (editing) {
        await apiFetch(`/api/manager/plans/${editing}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        toast.success('تعرفهٔ پلن به‌روزرسانی شد.');
      } else {
        await apiFetch('/api/manager/plans', { method: 'POST', body: JSON.stringify(payload) });
        toast.success('پلن جدید ساخته شد.');
      }
      setEditing(null);
      setForm(emptyForm);
      await load();
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const togglePlan = async (plan: SubscriptionPlan) => {
    try {
      await apiFetch(`/api/manager/plans/${plan.code}/toggle`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !plan.is_active }),
      });
      await load();
    } catch (caught) {
      toast.error(errorMessage(caught));
    }
  };

  const submitCoupon = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await apiFetch('/api/manager/coupons', {
        method: 'POST',
        body: JSON.stringify({
          code: couponForm.code.trim(),
          type: couponForm.type,
          value: Number(couponForm.value),
          max_uses: couponForm.max_uses ? Number(couponForm.max_uses) : null,
        }),
      });
      toast.success('کد تخفیف ساخته شد.');
      setCouponForm({ code: '', type: 'percent', value: '10', max_uses: '' });
      await load();
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const deleteCoupon = async (coupon: Coupon) => {
    try {
      await apiFetch(`/api/manager/coupons/${coupon.id}`, { method: 'DELETE' });
      await load();
    } catch (caught) {
      toast.error(errorMessage(caught));
    }
  };

  const totalRevenue = plans.reduce((sum, plan) => sum + (plan.sales?.revenue ?? 0), 0);

  return (
    <section className="mt-6 dark">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-white">
          <Coins className="h-5 w-5 text-[var(--glass-gold,theme(colors.amber.400))]" aria-hidden />
          مدیریت اشتراک‌ها و تعرفه‌ها
        </h2>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw aria-hidden className={loading ? 'animate-spin' : undefined} />
          تازه‌سازی
        </Button>
      </div>

      {error && (
        <Card className={cardClass}>
          <CardContent className="p-6 text-center text-sm text-red-300">{error}</CardContent>
        </Card>
      )}

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <Card className={cardClass}>
          <CardContent className="p-4">
            <p className="text-xs text-white/60">درآمد کل اشتراک‌ها</p>
            <p className="mt-1 text-xl font-extrabold">{formatMoney(totalRevenue, 'toman')}</p>
          </CardContent>
        </Card>
        <Card className={cardClass}>
          <CardContent className="p-4">
            <p className="text-xs text-white/60">تعداد سفارش‌های پرداخت‌شده</p>
            <p className="mt-1 text-xl font-extrabold">
              {toFaDigits(plans.reduce((sum, plan) => sum + (plan.sales?.orders ?? 0), 0))}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className={cardClass}>
        <CardContent className="p-0">
          <ul className="divide-y divide-white/[0.06]">
            {plans.map((plan) => (
              <li key={plan.code} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                <span
                  className={cn(
                    'rounded-lg px-2 py-0.5 text-[11px] font-bold',
                    plan.is_active
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-red-500/15 text-red-300',
                  )}
                >
                  {plan.is_active ? 'فعال' : 'غیرفعال'}
                </span>
                <span className="font-semibold text-white/90">{plan.name}</span>
                <span dir="ltr" className="text-xs text-white/40">
                  {plan.code}
                </span>
                <span className="text-xs text-white/70">
                  پایه {formatMoney(plan.base_monthly, 'toman')} + هر کاربر اضافه{' '}
                  {formatMoney(plan.extra_user_monthly, 'toman')}
                </span>
                <span className="text-xs text-white/50">
                  {toFaDigits(plan.sales?.orders ?? 0)} فروش ·{' '}
                  {formatMoney(plan.sales?.revenue ?? 0, 'toman')}
                </span>
                <span className="ms-auto flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => startEdit(plan)}>
                    ویرایش تعرفه
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void togglePlan(plan)}>
                    {plan.is_active ? 'غیرفعال' : 'فعال'}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* فرم پلن */}
      <Card className={cn('mt-3', cardClass)}>
        <CardContent className="p-4">
          <form onSubmit={submitPlan} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-white/70">
                {editing ? 'کد پلن (غیرقابل تغییر)' : 'کد پلن (لاتین)'}
              </Label>
              <Input
                dir="ltr"
                value={form.code}
                disabled={editing !== null}
                onChange={(event) => setForm({ ...form, code: event.target.value })}
                placeholder="pro"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-white/70">نام پلن</Label>
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-white/70">سطح دسترسی</Label>
              <Select
                value={form.tier}
                onValueChange={(value) => setForm({ ...form, tier: value as 'pro' | 'proplus' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pro">حرفه‌ای</SelectItem>
                  <SelectItem value="proplus">حرفه‌ای پلاس</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="plan-base" className="text-white/70">
                قیمت پایهٔ ماهانه (تومان)
              </Label>
              <Input
                id="plan-base"
                dir="ltr"
                inputMode="numeric"
                value={form.base_monthly}
                onChange={(event) => setForm({ ...form, base_monthly: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="plan-extra" className="text-white/70">
                هزینهٔ هر کاربر اضافه (ماهانه)
              </Label>
              <Input
                id="plan-extra"
                dir="ltr"
                inputMode="numeric"
                value={form.extra_user_monthly}
                onChange={(event) => setForm({ ...form, extra_user_monthly: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-white/70">حداقل کاربران</Label>
              <Input
                dir="ltr"
                inputMode="numeric"
                value={form.min_seats}
                onChange={(event) => setForm({ ...form, min_seats: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-white/70">حداکثر کاربران</Label>
              <Input
                dir="ltr"
                inputMode="numeric"
                value={form.max_seats}
                onChange={(event) => setForm({ ...form, max_seats: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-white/70">یادداشت تغییر قیمت</Label>
              <Input
                value={form.price_note}
                onChange={(event) => setForm({ ...form, price_note: event.target.value })}
                placeholder="مثلاً تعرفه سال ۱۴۰۶"
              />
            </div>
            <div className="space-y-1 sm:col-span-2 lg:col-span-4">
              <Label className="text-white/70">امکانات (هر خط یک مورد)</Label>
              <textarea
                className="min-h-24 w-full rounded-xl border border-white/10 bg-white/5 p-2 text-sm text-white"
                value={form.features}
                onChange={(event) => setForm({ ...form, features: event.target.value })}
              />
            </div>
            <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
              <Button type="submit" variant="neon" disabled={busy}>
                <Plus aria-hidden />
                {editing ? 'ذخیرهٔ تغییرات' : 'ساخت پلن'}
              </Button>
              {editing && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditing(null);
                    setForm(emptyForm);
                  }}
                >
                  انصراف
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* کدهای تخفیف */}
      <Card className={cn('mt-3', cardClass)}>
        <CardContent className="space-y-3 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-white">
            <Ticket className="h-4 w-4" aria-hidden />
            کدهای تخفیف
          </p>

          {coupons.length === 0 ? (
            <p className="text-sm text-white/60">هنوز کد تخفیفی ساخته نشده است.</p>
          ) : (
            <ul className="divide-y divide-white/[0.06] text-sm">
              {coupons.map((coupon) => (
                <li key={coupon.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span dir="ltr" className="font-mono text-xs text-white/90">
                    {coupon.code}
                  </span>
                  <span className="text-white/70">
                    {coupon.type === 'percent'
                      ? `${toFaDigits(coupon.value)}٪`
                      : formatMoney(coupon.value, 'toman')}
                  </span>
                  <span className="text-xs text-white/50">
                    مصرف: {toFaDigits(coupon.used_count)}
                    {coupon.max_uses ? ` از ${toFaDigits(coupon.max_uses)}` : ''}
                  </span>
                  {!coupon.is_usable && (
                    <span className="rounded-lg bg-red-500/15 px-2 py-0.5 text-[11px] font-bold text-red-300">
                      غیرفعال/منقضی
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ms-auto"
                    onClick={() => void deleteCoupon(coupon)}
                  >
                    <Trash2 aria-hidden />
                    حذف
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={submitCoupon} className="grid gap-2 sm:grid-cols-4">
            <Input
              dir="ltr"
              placeholder="کد (لاتین)"
              value={couponForm.code}
              onChange={(event) => setCouponForm({ ...couponForm, code: event.target.value })}
            />
            <Select
              value={couponForm.type}
              onValueChange={(value) =>
                setCouponForm({ ...couponForm, type: value as 'percent' | 'fixed' })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">درصدی</SelectItem>
                <SelectItem value="fixed">مبلغ ثابت</SelectItem>
              </SelectContent>
            </Select>
            <Input
              dir="ltr"
              inputMode="numeric"
              placeholder="مقدار"
              value={couponForm.value}
              onChange={(event) => setCouponForm({ ...couponForm, value: event.target.value })}
            />
            <div className="flex gap-2">
              <Input
                dir="ltr"
                inputMode="numeric"
                placeholder="سقف استفاده"
                value={couponForm.max_uses}
                onChange={(event) => setCouponForm({ ...couponForm, max_uses: event.target.value })}
              />
              <Button type="submit" variant="neon" disabled={busy || !couponForm.code.trim()}>
                <Plus aria-hidden />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
