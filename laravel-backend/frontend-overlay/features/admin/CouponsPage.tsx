import { useMemo, useState, type FormEvent } from 'react';
import { Pencil, Plus, Ticket, Trash2 } from 'lucide-react';
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
import { JalaliDateInput } from '@/components/JalaliDateInput';
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
import type { AdminCoupon } from './admin-types';

interface CouponForm {
  code: string;
  type: 'percent' | 'fixed';
  value: string;
  plan_code: string;
  max_uses: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  description: string;
}

const emptyForm = (): CouponForm => ({
  code: '',
  type: 'percent',
  value: '10',
  plan_code: '',
  max_uses: '',
  starts_at: '',
  ends_at: '',
  is_active: true,
  description: '',
});

export function CouponsPage() {
  const { data, loading, error, reload } = useAsync(() => adminApi.coupons(), []);
  const plansState = useAsync(() => adminApi.plans(), []);
  const plans = useMemo(() => plansState.data?.plans ?? [], [plansState.data]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminCoupon | null>(null);
  const [form, setForm] = useState<CouponForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminCoupon | null>(null);

  const coupons = data?.coupons ?? [];

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  };

  const startEdit = (coupon: AdminCoupon) => {
    setEditing(coupon);
    setForm({
      code: coupon.code,
      type: coupon.type,
      value: String(coupon.value),
      plan_code: coupon.plan_code ?? '',
      max_uses: coupon.max_uses ? String(coupon.max_uses) : '',
      starts_at: coupon.starts_at ?? '',
      ends_at: coupon.ends_at ?? '',
      is_active: coupon.is_active,
      description: coupon.description ?? '',
    });
    setOpen(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        type: form.type,
        value: Number(form.value),
        plan_code: form.plan_code || null,
        max_uses: form.max_uses ? Number(form.max_uses) : null,
        starts_at: form.starts_at || null,
        ends_at: form.ends_at || null,
        is_active: form.is_active,
        description: form.description.trim() || null,
      };

      await adminApi.saveCoupon(payload, editing?.id);
      toast.success(editing ? 'کد تخفیف به‌روزرسانی شد.' : 'کد تخفیف ساخته شد.');
      setOpen(false);
      await reload();
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    try {
      await adminApi.deleteCoupon(deleteTarget.id);
      toast.success('کد تخفیف حذف شد.');
      setDeleteTarget(null);
      await reload();
    } catch (caught) {
      toast.error(errorMessage(caught));
    }
  };

  return (
    <div className="space-y-4">
      <Panel
        title="کدهای تخفیف"
        subtitle="درصدی یا مبلغ ثابت، با بازهٔ زمانی، سقف مصرف و محدودیت پلن"
        icon={Ticket}
        actions={
          <div className="flex items-center gap-2">
            <RefreshButton onClick={() => void reload()} loading={loading} />
            <Button size="sm" variant="neon" onClick={startCreate}>
              <Plus aria-hidden />
              کد جدید
            </Button>
          </div>
        }
      >
        {error && <p className="mb-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
        {loading && !data && <LoadingRows rows={3} />}
        {!loading && coupons.length === 0 && <EmptyState text="هنوز کد تخفیفی ساخته نشده است." />}

        {coupons.length > 0 && (
          <ul className="divide-y divide-white/[0.06] text-xs">
            {coupons.map((coupon) => (
              <li key={coupon.id} className="flex flex-wrap items-center gap-2 py-3">
                <span dir="ltr" className="font-mono text-sm font-bold text-white/90">
                  {coupon.code}
                </span>
                <Pill tone={coupon.is_usable ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}>
                  {coupon.is_usable ? 'قابل استفاده' : 'غیرفعال/منقضی'}
                </Pill>
                <span className="text-white/70">
                  {coupon.type === 'percent' ? `${toFaDigits(coupon.value)}٪` : formatMoney(coupon.value, 'toman')}
                </span>
                <span className="text-white/40">{coupon.plan_code ?? 'همهٔ پلن‌ها'}</span>
                <span className="text-white/40">
                  مصرف: {toFaDigits(coupon.used_count)}
                  {coupon.max_uses ? ` از ${toFaDigits(coupon.max_uses)}` : ''}
                </span>
                <span className="text-white/35">
                  {coupon.starts_at ? `از ${formatJalaliLongISO(coupon.starts_at)}` : ''}
                  {coupon.ends_at ? ` تا ${formatJalaliLongISO(coupon.ends_at)}` : ''}
                </span>
                <span className="ms-auto flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="text-white/70" onClick={() => startEdit(coupon)}>
                    <Pencil aria-hidden />
                    ویرایش
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-300" onClick={() => setDeleteTarget(coupon)}>
                    <Trash2 aria-hidden />
                    حذف
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto border-white/10 bg-[#0b1424] text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `ویرایش کد ${editing.code}` : 'کد تخفیف جدید'}</DialogTitle>
            <DialogDescription className="text-white/50">
              اعتبارسنجی کد و محاسبهٔ تخفیف همیشه در سرور انجام می‌شود.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="کد (لاتین)" htmlFor="coupon-code">
                <Input id="coupon-code" dir="ltr" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} required className="border-white/10 bg-white/[0.05] text-white" />
              </Field>
              <Field label="نوع" htmlFor="coupon-type">
                <Select value={form.type} onValueChange={(value) => setForm({ ...form, type: value as 'percent' | 'fixed' })}>
                  <SelectTrigger id="coupon-type" className="border-white/10 bg-white/[0.05] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">درصدی</SelectItem>
                    <SelectItem value="fixed">مبلغ ثابت</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label={form.type === 'percent' ? 'درصد تخفیف' : 'مبلغ تخفیف (تومان)'} htmlFor="coupon-value">
                <Input id="coupon-value" dir="ltr" inputMode="numeric" value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value.replace(/[^0-9]/g, '') })} required className="border-white/10 bg-white/[0.05] text-white" />
              </Field>
              <Field label="محدود به پلن" htmlFor="coupon-plan">
                <Select value={form.plan_code || 'all'} onValueChange={(value) => setForm({ ...form, plan_code: value === 'all' ? '' : value })}>
                  <SelectTrigger id="coupon-plan" className="border-white/10 bg-white/[0.05] text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همهٔ پلن‌ها</SelectItem>
                    {plans.map((plan) => (
                      <SelectItem key={plan.code} value={plan.code}>
                        {plan.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="سقف استفاده" htmlFor="coupon-max">
                <Input id="coupon-max" dir="ltr" inputMode="numeric" value={form.max_uses} onChange={(event) => setForm({ ...form, max_uses: event.target.value.replace(/[^0-9]/g, '') })} placeholder="بدون محدودیت" className="border-white/10 bg-white/[0.05] text-white" />
              </Field>
              <div className="flex items-end gap-2 pb-1">
                <Switch id="coupon-active" checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} />
                <Label htmlFor="coupon-active" className="text-xs text-white/70">
                  فعال
                </Label>
              </div>
              <div className="space-y-1">
                <Label htmlFor="coupon-start" className="text-xs text-white/70">
                  شروع (اختیاری)
                </Label>
                <JalaliDateInput
                  id="coupon-start"
                  value={form.starts_at}
                  allowEmpty
                  onChange={(iso) => setForm({ ...form, starts_at: iso })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="coupon-end" className="text-xs text-white/70">
                  پایان (اختیاری)
                </Label>
                <JalaliDateInput
                  id="coupon-end"
                  value={form.ends_at}
                  allowEmpty
                  onChange={(iso) => setForm({ ...form, ends_at: iso })}
                />
              </div>
            </div>

            <Field label="توضیح داخلی" htmlFor="coupon-description">
              <Input id="coupon-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="border-white/10 bg-white/[0.05] text-white" />
            </Field>

            <DialogFooter>
              <Button type="button" variant="ghost" className="text-white/70" onClick={() => setOpen(false)} disabled={saving}>
                انصراف
              </Button>
              <Button type="submit" variant="neon" disabled={saving}>
                {editing ? 'ذخیره' : 'ساخت کد'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(value) => !value && setDeleteTarget(null)}>
        <DialogContent className="border-white/10 bg-[#0b1424] text-white sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>حذف کد تخفیف</DialogTitle>
            <DialogDescription className="text-white/50">
              کد «{deleteTarget?.code}» حذف شود؟ سفارش‌های قبلی دست‌نخورده می‌مانند.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" className="text-white/70" onClick={() => setDeleteTarget(null)}>
              انصراف
            </Button>
            <Button variant="destructive" onClick={() => void remove()}>
              حذف
            </Button>
          </DialogFooter>
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
