import { useMemo, useState, type FormEvent } from 'react';
import { History, Layers, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { formatMoney, toFaDigits } from '@/core/currency/currency';
import { formatJalaliLongISO } from '@/core/jalali/jalali';
import { adminApi } from './admin-api';
import {
  EmptyState,
  LoadingRows,
  Panel,
  Pill,
  RefreshButton,
} from './admin-ui';
import { errorMessage, useAsync } from './admin-lib';
import type { AdminPlan } from './admin-types';

interface PlanForm {
  code: string;
  name: string;
  tier: 'pro' | 'proplus';
  description: string;
  base_monthly: string;
  extra_user_monthly: string;
  min_seats: string;
  max_seats: string;
  is_lifetime: boolean;
  is_active: boolean;
  features: string;
  price_note: string;
}

const emptyForm = (): PlanForm => ({
  code: '',
  name: '',
  tier: 'pro',
  description: '',
  base_monthly: '0',
  extra_user_monthly: '0',
  min_seats: '1',
  max_seats: '50',
  is_lifetime: false,
  is_active: true,
  features: '',
  price_note: '',
});

export function PlansPage() {
  const { data, loading, error, reload } = useAsync(() => adminApi.plans(), []);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminPlan | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [historyFor, setHistoryFor] = useState<AdminPlan | null>(null);
  const history = useAsync(
    () => (historyFor ? adminApi.planPrices(historyFor.code) : Promise.resolve({ history: [] })),
    [historyFor?.code],
  );

  const plans = useMemo(() => data?.plans ?? [], [data]);
  const totalRevenue = plans.reduce((sum, plan) => sum + (plan.sales?.revenue ?? 0), 0);

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  };

  const startEdit = (plan: AdminPlan) => {
    setEditing(plan);
    setForm({
      code: plan.code,
      name: plan.name,
      tier: plan.tier,
      description: plan.description ?? '',
      base_monthly: String(plan.base_monthly),
      extra_user_monthly: String(plan.extra_user_monthly),
      min_seats: String(plan.min_seats),
      max_seats: String(plan.max_seats),
      is_lifetime: plan.is_lifetime,
      is_active: plan.is_active,
      features: plan.features.join('\n'),
      price_note: '',
    });
    setOpen(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...(editing ? {} : { code: form.code.trim() }),
        name: form.name.trim(),
        tier: form.tier,
        description: form.description.trim() || null,
        base_monthly: Number(form.base_monthly),
        extra_user_monthly: Number(form.extra_user_monthly),
        min_seats: Number(form.min_seats),
        max_seats: Number(form.max_seats),
        is_lifetime: form.is_lifetime,
        is_active: form.is_active,
        features: form.features.split('\n').map((line) => line.trim()).filter(Boolean),
        price_note: form.price_note.trim() || undefined,
      };

      await adminApi.savePlan(payload, editing?.code);
      toast.success(editing ? 'تعرفه به‌روزرسانی شد (سفارش‌های قبلی تغییر نمی‌کنند).' : 'پلن ساخته شد.');
      setOpen(false);
      await reload();
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (plan: AdminPlan) => {
    try {
      await adminApi.togglePlan(plan.code, !plan.is_active);
      await reload();
    } catch (caught) {
      toast.error(errorMessage(caught));
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="تعرفه‌ها و پلن‌ها" subtitle={`درآمد کل: ${formatMoney(totalRevenue, 'toman')}`} icon={Layers} actions={
        <div className="flex items-center gap-2">
          <RefreshButton onClick={() => void reload()} loading={loading} />
          <Button size="sm" variant="neon" onClick={startCreate}>
            <Plus aria-hidden />
            پلن جدید
          </Button>
        </div>
      }>
        {error && <p className="mb-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
        {loading && !data && <LoadingRows rows={3} />}
        {plans.length === 0 && !loading && <EmptyState text="پلنی ثبت نشده است." />}

        <div className="grid gap-3 lg:grid-cols-2">
          {plans.map((plan) => (
            <div key={plan.code} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold text-white">{plan.name}</span>
                <span dir="ltr" className="text-[10px] text-white/35">
                  {plan.code}
                </span>
                <Pill tone={plan.is_active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}>
                  {plan.is_active ? 'فعال' : 'غیرفعال'}
                </Pill>
                {plan.is_lifetime && <Pill tone="bg-violet-500/15 text-violet-300">مادام‌العمر</Pill>}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-white/55">
                <span>پایهٔ ماهانه: {formatMoney(plan.base_monthly, 'toman')}</span>
                <span>هر کاربر اضافه: {formatMoney(plan.extra_user_monthly, 'toman')}</span>
                <span>حداقل کاربر: {toFaDigits(plan.min_seats)}</span>
                <span>حداکثر کاربر: {toFaDigits(plan.max_seats)}</span>
                <span>فروش: {toFaDigits(plan.sales?.orders ?? 0)}</span>
                <span>درآمد: {formatMoney(plan.sales?.revenue ?? 0, 'toman')}</span>
              </div>

              {plan.features.length > 0 && (
                <p className="mt-2 line-clamp-2 text-[11px] text-white/40">{plan.features.join(' · ')}</p>
              )}

              <div className="mt-3 flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" className="border-white/15 text-white/80" onClick={() => startEdit(plan)}>
                  <Pencil aria-hidden />
                  ویرایش تعرفه
                </Button>
                <Button size="sm" variant="ghost" className="text-white/60" onClick={() => setHistoryFor(plan)}>
                  <History aria-hidden />
                  تاریخچهٔ قیمت
                </Button>
                <Button size="sm" variant="ghost" className={plan.is_active ? 'text-amber-300' : 'text-emerald-300'} onClick={() => void toggle(plan)}>
                  {plan.is_active ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto border-white/10 bg-[#0b1424] text-white sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? `ویرایش تعرفهٔ ${editing.name}` : 'پلن جدید'}</DialogTitle>
            <DialogDescription className="text-white/50">
              تغییر تعرفه فقط روی خریدهای جدید اثر دارد؛ سفارش‌ها و فاکتورهای قبلی مبلغ خود را نگه می‌دارند.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="کد پلن (لاتین)" htmlFor="plan-code">
                <Input id="plan-code" dir="ltr" value={form.code} disabled={!!editing} onChange={(event) => setForm({ ...form, code: event.target.value })} required className="border-white/10 bg-white/[0.05] text-white" />
              </Field>
              <Field label="نام پلن" htmlFor="plan-name">
                <Input id="plan-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required className="border-white/10 bg-white/[0.05] text-white" />
              </Field>
              <Field label="سطح" htmlFor="plan-tier">
                <Select value={form.tier} onValueChange={(value) => setForm({ ...form, tier: value as 'pro' | 'proplus' })}>
                  <SelectTrigger id="plan-tier" className="border-white/10 bg-white/[0.05] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pro">حرفه‌ای</SelectItem>
                    <SelectItem value="proplus">حرفه‌ای پلاس</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="قیمت پایهٔ ماهانه (تومان)" htmlFor="plan-base">
                <Input id="plan-base" dir="ltr" inputMode="numeric" value={form.base_monthly} onChange={(event) => setForm({ ...form, base_monthly: event.target.value.replace(/[^0-9]/g, '') })} required className="border-white/10 bg-white/[0.05] text-white" />
              </Field>
              <Field label="هزینهٔ هر کاربر اضافه" htmlFor="plan-extra">
                <Input id="plan-extra" dir="ltr" inputMode="numeric" value={form.extra_user_monthly} onChange={(event) => setForm({ ...form, extra_user_monthly: event.target.value.replace(/[^0-9]/g, '') })} required className="border-white/10 bg-white/[0.05] text-white" />
              </Field>
              <Field label="حداقل کاربران" htmlFor="plan-min">
                <Input id="plan-min" dir="ltr" inputMode="numeric" value={form.min_seats} onChange={(event) => setForm({ ...form, min_seats: event.target.value.replace(/[^0-9]/g, '') })} className="border-white/10 bg-white/[0.05] text-white" />
              </Field>
              <Field label="حداکثر کاربران" htmlFor="plan-max">
                <Input id="plan-max" dir="ltr" inputMode="numeric" value={form.max_seats} onChange={(event) => setForm({ ...form, max_seats: event.target.value.replace(/[^0-9]/g, '') })} className="border-white/10 bg-white/[0.05] text-white" />
              </Field>
              <Field label="یادداشت تغییر قیمت" htmlFor="plan-note">
                <Input id="plan-note" value={form.price_note} onChange={(event) => setForm({ ...form, price_note: event.target.value })} placeholder="مثلاً تعرفهٔ ۱۴۰۶" className="border-white/10 bg-white/[0.05] text-white" />
              </Field>
            </div>

            <Field label="امکانات (هر خط یک مورد)" htmlFor="plan-features">
              <textarea
                id="plan-features"
                value={form.features}
                onChange={(event) => setForm({ ...form, features: event.target.value })}
                className="min-h-24 w-full rounded-xl border border-white/10 bg-white/[0.05] p-2 text-sm text-white"
              />
            </Field>

            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-2">
                <Switch id="plan-active" checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} />
                <Label htmlFor="plan-active" className="text-xs text-white/70">
                  فعال برای فروش
                </Label>
              </span>
              <span className="flex items-center gap-2">
                <Switch id="plan-lifetime" checked={form.is_lifetime} onCheckedChange={(checked) => setForm({ ...form, is_lifetime: checked })} />
                <Label htmlFor="plan-lifetime" className="text-xs text-white/70">
                  مادام‌العمر
                </Label>
              </span>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" className="text-white/70" onClick={() => setOpen(false)} disabled={saving}>
                انصراف
              </Button>
              <Button type="submit" variant="neon" disabled={saving}>
                {editing ? 'ذخیرهٔ تعرفه' : 'ساخت پلن'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={historyFor !== null} onOpenChange={(value) => !value && setHistoryFor(null)}>
        <DialogContent className="border-white/10 bg-[#0b1424] text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تاریخچهٔ قیمت {historyFor?.name}</DialogTitle>
            <DialogDescription className="text-white/50">هر تغییر تعرفه با تاریخ ثبت می‌شود.</DialogDescription>
          </DialogHeader>
          {history.loading && <LoadingRows rows={2} />}
          {history.data && history.data.history.length === 0 && <EmptyState text="تغییری ثبت نشده است." />}
          <ul className="divide-y divide-white/[0.06] text-xs">
            {history.data?.history.map((row, index) => (
              <li key={`${row.changed_at}-${index}`} className="flex flex-wrap items-center gap-2 py-2">
                <span className="text-white/70">پایه {formatMoney(row.base_monthly, 'toman')}</span>
                <span className="text-white/50">اضافه {formatMoney(row.extra_user_monthly, 'toman')}</span>
                {row.note && <span className="text-amber-300">{row.note}</span>}
                <span className="ms-auto text-[10px] text-white/35">{row.changed_at ? formatJalaliLongISO(row.changed_at) : '—'}</span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor} className="text-xs text-white/70">
        {label}
      </Label>
      {children}
    </div>
  );
}
