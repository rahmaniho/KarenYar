import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Archive, ArchiveRestore, Pencil, Plus, Search, Store, Trash2, Users } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { adminApi } from './admin-api';
import {
  EmptyState,
  KpiCard,
  LoadingRows,
  Pagination,
  Panel,
  Pill,
  RefreshButton,
} from './admin-ui';
import { errorMessage, useAsync } from './admin-lib';
import type { AdminPlan, AdminStore } from './admin-types';

interface FormState {
  name: string;
  owner_name: string;
  phone: string;
  address: string;
  is_active: boolean;
  email: string;
  password: string;
  plan_code: string;
  seats: string;
  is_lifetime: boolean;
  expires_at: string;
  license_active: boolean;
  reason: string;
  notes: string;
}

const emptyForm = (): FormState => ({
  name: '',
  owner_name: '',
  phone: '',
  address: '',
  is_active: true,
  email: '',
  password: '',
  plan_code: 'pro',
  seats: '1',
  is_lifetime: false,
  expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  license_active: true,
  reason: '',
  notes: '',
});

export function StoresPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') === 'archived' ? 'archived' : 'active';
  const [page, setPage] = useState(1);
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');

  const [formOpen, setFormOpen] = useState(params.get('new') === '1');
  const [editing, setEditing] = useState<AdminStore | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const [archiveTarget, setArchiveTarget] = useState<AdminStore | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [purgeTarget, setPurgeTarget] = useState<AdminStore | null>(null);
  const [purgeName, setPurgeName] = useState('');

  const storesState = useAsync(
    () => adminApi.stores({ q: query || undefined, status, page, limit: 9 }),
    [query, status, page],
  );
  const plansState = useAsync(() => adminApi.plans(), []);
  const plans: AdminPlan[] = useMemo(() => plansState.data?.plans ?? [], [plansState.data]);

  useEffect(() => {
    if (editing) return;
    const fallback = plans.find((plan) => plan.code === 'pro') ?? plans[0];
    if (fallback && form.plan_code === 'pro' && !plans.some((plan) => plan.code === form.plan_code)) {
      setForm((current) => ({ ...current, plan_code: fallback.code }));
    }
  }, [plans, editing, form.plan_code]);

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormOpen(true);
  };

  const startEdit = (store: AdminStore) => {
    setEditing(store);
    setForm({
      name: store.name,
      owner_name: store.owner_name ?? '',
      phone: store.phone ?? '',
      address: store.address ?? '',
      is_active: store.is_active,
      email: '',
      password: '',
      plan_code: store.license?.plan_code ?? 'pro',
      seats: String(store.license?.seats ?? 1),
      is_lifetime: store.license?.is_lifetime ?? false,
      expires_at: store.license?.expires_at ?? new Date(Date.now() + 30 * 86_400_000).toISOString(),
      license_active: store.license?.is_active ?? true,
      reason: '',
      notes: store.license?.notes ?? '',
    });
    setFormOpen(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing && (!form.email.trim() || form.password.length < 8)) {
      toast.error('ایمیل و رمز عبور (حداقل ۸ نویسه) لازم است.');
      return;
    }
    if (editing && !form.reason.trim()) {
      toast.error('برای تغییر لایسنس، دلیل را بنویسید تا در تاریخچه ثبت شود.');
      return;
    }

    const license = {
      plan_code: form.plan_code,
      seats: Number(form.seats),
      is_lifetime: form.is_lifetime,
      is_active: form.license_active,
      expires_at: form.is_lifetime ? null : form.expires_at,
      notes: form.notes.trim() || null,
      reason: form.reason.trim() || undefined,
    };

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      owner_name: form.owner_name.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      is_active: form.is_active,
      email: form.email.trim() || undefined,
      license,
    };

    if (form.password) payload.password = form.password;

    setSaving(true);
    try {
      if (editing) {
        await adminApi.updateStore(editing.id, payload);
        toast.success('فروشگاه و لایسنس به‌روزرسانی شد.');
      } else {
        await adminApi.createStore(payload);
        toast.success('فروشگاه ساخته شد.');
      }
      setFormOpen(false);
      setParams(new URLSearchParams(), { replace: true });
      await storesState.reload();
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!archiveTarget) return;
    try {
      await adminApi.archiveStore(archiveTarget.id, archiveReason.trim() || undefined);
      toast.success('فروشگاه آرشیو شد؛ داده‌های مالی حفظ شدند.');
      setArchiveTarget(null);
      setArchiveReason('');
      await storesState.reload();
    } catch (caught) {
      toast.error(errorMessage(caught));
    }
  };

  const restore = async (store: AdminStore) => {
    try {
      await adminApi.restoreStore(store.id);
      toast.success('فروشگاه بازگردانی شد.');
      await storesState.reload();
    } catch (caught) {
      toast.error(errorMessage(caught));
    }
  };

  const purge = async () => {
    if (!purgeTarget) return;
    try {
      await adminApi.purgeStore(purgeTarget.id, purgeName.trim());
      toast.success('فروشگاه برای همیشه حذف شد.');
      setPurgeTarget(null);
      setPurgeName('');
      await storesState.reload();
    } catch (caught) {
      toast.error(errorMessage(caught));
    }
  };

  const stores = storesState.data?.stores ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="فروشگاه‌های فعال" value={`${toFaDigits(storesState.data?.totals.active ?? 0)} مورد`} icon={Store} />
        <KpiCard label="لایسنس معتبر" value={`${toFaDigits(storesState.data?.totals.active_licenses ?? 0)} مورد`} icon={Users} tone="neon" />
        <KpiCard label="آرشیوشده" value={`${toFaDigits(storesState.data?.totals.archived ?? 0)} مورد`} icon={Archive} tone="warning" hint="داده حفظ شده، دسترسی بسته" />
      </div>

      <Panel
        title="فروشگاه‌ها"
        subtitle="ساخت، ویرایش لایسنس، آرشیو و بازیابی"
        icon={Store}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RefreshButton onClick={() => void storesState.reload()} loading={storesState.loading} />
            <Button size="sm" variant="neon" onClick={startCreate}>
              <Plus aria-hidden />
              فروشگاه جدید
            </Button>
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <form
            className="relative"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setQuery(term.trim());
            }}
          >
            <Search className="absolute end-2.5 top-2.5 h-4 w-4 text-white/35" aria-hidden />
            <Input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="نام فروشگاه، مالک، موبایل یا ایمیل"
              aria-label="جست‌وجوی فروشگاه"
              className="h-9 w-64 border-white/10 bg-white/[0.05] pe-8 text-white placeholder:text-white/35"
            />
          </form>
          {(['active', 'archived'] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={status === value ? 'default' : 'outline'}
              className={status === value ? '' : 'border-white/15 text-white/75'}
              onClick={() => {
                setPage(1);
                const next = new URLSearchParams(params);
                if (value === 'archived') next.set('status', 'archived');
                else next.delete('status');
                setParams(next, { replace: true });
              }}
            >
              {value === 'archived' ? 'آرشیو' : 'فعال'}
            </Button>
          ))}
        </div>

        {storesState.error && <p className="mb-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{storesState.error}</p>}
        {storesState.loading && !storesState.data && <LoadingRows rows={4} />}
        {!storesState.loading && stores.length === 0 && <EmptyState text="فروشگاهی با این شرایط پیدا نشد." />}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {stores.map((store) => {
            const seats = store.license?.seats ?? 0;
            const active = store.active_users_count ?? 0;
            const usage = seats > 0 ? Math.min(100, Math.round((active / seats) * 100)) : 0;
            return (
              <div key={store.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-sm font-extrabold text-white">
                      {store.name}
                      {store.is_demo && (
                        <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                          دمو
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[11px] text-white/45">
                      {store.owner_name ?? '—'} {store.phone ? `· ${store.phone}` : ''}
                    </p>
                  </div>
                  <Pill tone={store.is_archived ? 'bg-orange-500/15 text-orange-300' : store.license ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-white/60'}>
                    {store.is_archived ? 'آرشیو' : store.license ? 'فعال' : 'بدون لایسنس'}
                  </Pill>
                </div>

                <div className="mt-3 space-y-1 text-[11px] text-white/55">
                  <div className="flex items-center justify-between">
                    <span>پلن: {store.license?.plan_code ?? '—'}</span>
                    <span>
                      {toFaDigits(active)} / {toFaDigits(seats)} کاربر
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div className={cn('h-full rounded-full', usage >= 100 ? 'bg-red-400' : 'bg-emerald-400')} style={{ width: `${usage}%` }} />
                  </div>
                  <p>
                    {store.license?.is_lifetime
                      ? 'مادام‌العمر'
                      : store.license?.expires_at
                        ? `انقضا: ${formatJalaliLongISO(store.license.expires_at)}`
                        : 'بدون تاریخ انقضا'}
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" className="border-white/15 text-white/80" onClick={() => startEdit(store)}>
                    <Pencil aria-hidden />
                    ویرایش
                  </Button>
                  {store.is_archived ? (
                    <Button size="sm" variant="outline" className="border-white/15 text-emerald-300" onClick={() => void restore(store)}>
                      <ArchiveRestore aria-hidden />
                      بازیابی
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="border-white/15 text-amber-300" onClick={() => setArchiveTarget(store)}>
                      <Archive aria-hidden />
                      آرشیو
                    </Button>
                  )}
                  {store.is_archived && (
                    <Button size="sm" variant="ghost" className="text-red-300" onClick={() => setPurgeTarget(store)}>
                      <Trash2 aria-hidden />
                      حذف دائمی
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {storesState.data && <Pagination meta={storesState.data.meta} onChange={setPage} />}
      </Panel>

      {/* فرم فروشگاه */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto border-white/10 bg-[#0b1424] text-white sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'ویرایش فروشگاه و لایسنس' : 'فروشگاه جدید'}</DialogTitle>
            <DialogDescription className="text-white/50">
              اطلاعات فروشگاه، حساب ورود و لایسنس. تغییر لایسنس دلیل می‌خواهد و در تاریخچه ثبت می‌شود.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="نام فروشگاه" htmlFor="store-name">
                <Input id="store-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required className="border-white/10 bg-white/[0.05] text-white" />
              </Field>
              <Field label="نام مالک" htmlFor="store-owner">
                <Input id="store-owner" value={form.owner_name} onChange={(event) => setForm({ ...form, owner_name: event.target.value })} className="border-white/10 bg-white/[0.05] text-white" />
              </Field>
              <Field label="تلفن" htmlFor="store-phone">
                <Input id="store-phone" dir="ltr" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="border-white/10 bg-white/[0.05] text-white" />
              </Field>
              <Field label="وضعیت فروشگاه" htmlFor="store-active">
                <div className="flex h-10 items-center gap-2">
                  <Switch id="store-active" checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} />
                  <span className="text-xs text-white/70">{form.is_active ? 'فعال' : 'غیرفعال'}</span>
                </div>
              </Field>
              <div className="sm:col-span-2">
                <Field label="آدرس" htmlFor="store-address">
                  <Input id="store-address" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} className="border-white/10 bg-white/[0.05] text-white" />
                </Field>
              </div>
            </div>

            <fieldset className="rounded-xl border border-dashed border-white/15 p-3">
              <legend className="px-1 text-xs font-bold text-white/70">حساب ورود مالک</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="ایمیل" htmlFor="store-email">
                  <Input
                    id="store-email"
                    type="email"
                    dir="ltr"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                    required={!editing}
                    placeholder={editing ? 'بدون تغییر = ایمیل فعلی' : ''}
                    className="border-white/10 bg-white/[0.05] text-white"
                  />
                </Field>
                <Field label={editing ? 'رمز عبور جدید (اختیاری)' : 'رمز عبور'} htmlFor="store-password">
                  <Input
                    id="store-password"
                    type="password"
                    dir="ltr"
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                    required={!editing}
                    className="border-white/10 bg-white/[0.05] text-white"
                  />
                </Field>
              </div>
            </fieldset>

            <fieldset className="rounded-xl border border-dashed border-white/15 p-3">
              <legend className="px-1 text-xs font-bold text-white/70">لایسنس</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="پلن" htmlFor="license-plan">
                  <Select value={form.plan_code} onValueChange={(value) => setForm({ ...form, plan_code: value })}>
                    <SelectTrigger id="license-plan" className="border-white/10 bg-white/[0.05] text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.map((plan) => (
                        <SelectItem key={plan.code} value={plan.code}>
                          {plan.name} — {formatMoney(plan.base_monthly, 'toman')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="سقف کاربران" htmlFor="license-seats">
                  <Input
                    id="license-seats"
                    dir="ltr"
                    inputMode="numeric"
                    value={form.seats}
                    onChange={(event) => setForm({ ...form, seats: event.target.value.replace(/[^0-9]/g, '') })}
                    className="border-white/10 bg-white/[0.05] text-white"
                  />
                </Field>
                <Field label="وضعیت لایسنس" htmlFor="license-active">
                  <div className="flex h-10 items-center gap-2">
                    <Switch id="license-active" checked={form.license_active} onCheckedChange={(checked) => setForm({ ...form, license_active: checked })} />
                    <span className="text-xs text-white/70">{form.license_active ? 'فعال' : 'تعلیق'}</span>
                  </div>
                </Field>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <Switch id="license-lifetime" checked={form.is_lifetime} onCheckedChange={(checked) => setForm({ ...form, is_lifetime: checked })} />
                  <Label htmlFor="license-lifetime" className="text-xs text-white/70">
                    مادام‌العمر (بدون انقضا)
                  </Label>
                </div>
                {!form.is_lifetime && (
                  <div className="sm:col-span-2 space-y-1">
                    <Label htmlFor="license-expiry" className="text-xs text-white/70">
                      تاریخ انقضا (شمسی)
                    </Label>
                    <JalaliDateInput id="license-expiry" value={form.expires_at} onChange={(iso) => setForm({ ...form, expires_at: iso })} />
                  </div>
                )}
                <div className="sm:col-span-2">
                  <Field label="دلیل تغییر لایسنس (الزامی در ویرایش)" htmlFor="license-reason">
                    <Input
                      id="license-reason"
                      value={form.reason}
                      onChange={(event) => setForm({ ...form, reason: event.target.value })}
                      placeholder="مثلاً ارتقای توافقی با مشتری"
                      className="border-white/10 bg-white/[0.05] text-white"
                    />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="یادداشت داخلی" htmlFor="license-notes">
                    <Input id="license-notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="border-white/10 bg-white/[0.05] text-white" />
                  </Field>
                </div>
              </div>
            </fieldset>

            <DialogFooter>
              <Button type="button" variant="ghost" className="text-white/70" onClick={() => setFormOpen(false)} disabled={saving}>
                انصراف
              </Button>
              <Button type="submit" variant="neon" disabled={saving}>
                {editing ? 'ذخیرهٔ تغییرات' : 'ساخت فروشگاه'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* آرشیو */}
      <Dialog open={archiveTarget !== null} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <DialogContent className="border-white/10 bg-[#0b1424] text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>آرشیو فروشگاه</DialogTitle>
            <DialogDescription className="text-white/50">
              دسترسی «{archiveTarget?.name}» بسته می‌شود اما داده‌های مالی، فاکتورها و تاریخچه حفظ می‌شوند.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="archive-reason" className="text-xs text-white/70">
              دلیل (اختیاری)
            </Label>
            <Input id="archive-reason" value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} className="border-white/10 bg-white/[0.05] text-white" />
          </div>
          <DialogFooter>
            <Button variant="ghost" className="text-white/70" onClick={() => setArchiveTarget(null)}>
              انصراف
            </Button>
            <Button variant="destructive" onClick={() => void archive()}>
              آرشیو کن
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* حذف دائمی */}
      <Dialog open={purgeTarget !== null} onOpenChange={(open) => !open && setPurgeTarget(null)}>
        <DialogContent className="border-white/10 bg-[#0b1424] text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-300">حذف دائمی فروشگاه</DialogTitle>
            <DialogDescription className="text-white/50">
              این عمل قابل بازگشت نیست و داده‌های این فروشگاه حذف می‌شوند. برای تأیید، نام فروشگاه را دقیقاً تایپ کنید.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="purge-name" className="text-xs text-white/70">
              نام فروشگاه: {purgeTarget?.name}
            </Label>
            <Input id="purge-name" value={purgeName} onChange={(event) => setPurgeName(event.target.value)} className="border-white/10 bg-white/[0.05] text-white" />
          </div>
          <DialogFooter>
            <Button variant="ghost" className="text-white/70" onClick={() => setPurgeTarget(null)}>
              انصراف
            </Button>
            <Button variant="destructive" disabled={purgeName.trim() !== (purgeTarget?.name ?? '')} onClick={() => void purge()}>
              حذف دائمی
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
