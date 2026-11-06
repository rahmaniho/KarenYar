import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  BadgeCheck,
  CalendarClock,
  Infinity as InfinityIcon,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { JalaliDateInput } from '@/components/JalaliDateInput';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { ApiError, apiFetch } from '@/core/api/client';
import { AuditPanel } from './AuditPanel';
import { OrdersPanel } from './OrdersPanel';
import { toFaDigits } from '@/core/currency/currency';
import { formatJalaliLong } from '@/core/jalali/jalali';
import { assetUrl } from '@/lib/utils';
import { useAuthStore, type StoreLicense } from '@/store/auth-store';

interface ManagedStore {
  id: number;
  name: string;
  slug: string;
  owner_name: string | null;
  phone: string | null;
  address: string | null;
  is_active: boolean;
  users_count?: number;
  license: StoreLicense | null;
  created_at?: string;
}

type Tier = 'pro' | 'proplus';

interface FormState {
  name: string;
  owner_name: string;
  phone: string;
  address: string;
  is_active: boolean;
  email: string;
  password: string;
  tier: Tier;
  is_lifetime: boolean;
  expires_at: string;
  license_active: boolean;
  notes: string;
}

const TIER_LABELS: Record<Tier, string> = {
  pro: 'حرفه‌ای',
  proplus: 'کامل (Pro+)',
};

function defaultExpiry(): string {
  return new Date(Date.now() + 30 * 86_400_000).toISOString();
}

function emptyForm(): FormState {
  return {
    name: '',
    owner_name: '',
    phone: '',
    address: '',
    is_active: true,
    email: '',
    password: '',
    tier: 'pro',
    is_lifetime: false,
    expires_at: defaultExpiry(),
    license_active: true,
    notes: '',
  };
}

function formFromStore(store: ManagedStore): FormState {
  const license = store.license;
  return {
    name: store.name,
    owner_name: store.owner_name ?? '',
    phone: store.phone ?? '',
    address: store.address ?? '',
    is_active: store.is_active,
    email: '',
    password: '',
    tier: license?.tier ?? 'pro',
    is_lifetime: license?.is_lifetime ?? false,
    expires_at: license?.expires_at ?? defaultExpiry(),
    license_active: license?.is_active ?? true,
    notes: license?.notes ?? '',
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.errors) {
      const first = Object.values(error.errors).flat().find(Boolean);
      if (first) return first;
    }
    return error.message;
  }
  return 'ارتباط با سرور برقرار نشد. دوباره تلاش کنید.';
}

function licenseBadge(license: StoreLicense | null): {
  label: string;
  variant: BadgeProps['variant'];
} {
  if (!license) {
    return { label: 'بدون لایسنس', variant: 'secondary' };
  }
  if (!license.is_active) {
    return { label: 'غیرفعال', variant: 'destructive' };
  }
  const expired =
    !license.is_lifetime &&
    license.expires_at !== null &&
    new Date(license.expires_at).getTime() < Date.now();
  if (expired) {
    return { label: 'منقضی', variant: 'destructive' };
  }
  if (license.is_lifetime) {
    return { label: 'مادام‌العمر', variant: 'neon' };
  }
  return { label: `تا ${toFaDigits(String(license.days_remaining ?? 0))} روز`, variant: 'success' };
}

const cardClass = 'rounded-3xl border border-white/10 bg-white/95 shadow-soft';

export function ManagerApp() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [stores, setStores] = useState<ManagedStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedStore | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ManagedStore | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch<{ stores: ManagedStore[] }>('/api/manager/stores');
      setStores(response.stores);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const activeLicenses = stores.filter((store) => store.license?.is_valid).length;
    const expired = stores.filter(
      (store) =>
        store.license &&
        !store.license.is_lifetime &&
        store.license.expires_at &&
        new Date(store.license.expires_at).getTime() < Date.now(),
    ).length;
    return { total: stores.length, activeLicenses, expired };
  }, [stores]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (store: ManagedStore) => {
    setEditing(store);
    setForm(formFromStore(store));
    setFormOpen(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      toast.error('نام فروشگاه را وارد کنید.');
      return;
    }
    if (!editing && (!form.email.trim() || form.password.length < 6)) {
      toast.error('ایمیل و رمز عبور (حداقل ۶ نویسه) کاربر فروشگاه لازم است.');
      return;
    }
    if (!form.is_lifetime && !form.expires_at) {
      toast.error('برای لایسنس زمان‌دار، تاریخ انقضا لازم است.');
      return;
    }

    const payload = {
      name: form.name.trim(),
      owner_name: form.owner_name.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      is_active: form.is_active,
      email: form.email.trim(),
      password: form.password,
      license: {
        tier: form.tier,
        is_lifetime: form.is_lifetime,
        is_active: form.license_active,
        expires_at: form.is_lifetime ? null : form.expires_at,
        notes: form.notes.trim() || null,
      },
    };

    setSaving(true);
    try {
      if (editing) {
        const body = { ...payload, password: form.password || undefined };
        await apiFetch(`/api/manager/stores/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        toast.success('فروشگاه به‌روزرسانی شد.');
      } else {
        await apiFetch('/api/manager/stores', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success('فروشگاه جدید ساخته شد.');
      }
      setFormOpen(false);
      await load();
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/manager/stores/${deleteTarget.id}`, { method: 'DELETE' });
      toast.success('فروشگاه و داده‌هایش حذف شد.');
      setStores((prev) => prev.filter((store) => store.id !== deleteTarget.id));
    } catch (caught) {
      toast.error(errorMessage(caught));
      throw caught;
    }
  };

  const update = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));

  return (
    <div dir="rtl" className="min-h-dvh bg-navy-900 pb-16">
      <header className="border-b border-white/10 bg-navy-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
          <img
            src={assetUrl('images/karo/mark.png')}
            alt="کارو"
            className="h-9 w-9 rounded-xl border border-white/10 bg-white object-contain p-0.5"
          />
          <div className="me-auto">
            <p className="text-sm font-bold text-white">پنل مدیر — کارو نرم افزار حسابداری</p>
            <p className="text-xs text-white/60">{user?.name ?? 'مدیر'}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void logout()}>
            <LogOut aria-hidden />
            خروج
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <StatCard label="تعداد فروشگاه‌ها" value={toFaDigits(String(stats.total))} />
          <StatCard label="لایسنس‌های فعال" value={toFaDigits(String(stats.activeLicenses))} />
          <StatCard label="لایسنس‌های منقضی" value={toFaDigits(String(stats.expired))} />
        </div>

        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-extrabold text-white">فروشگاه‌ها</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw aria-hidden className={loading ? 'animate-spin' : undefined} />
              تازه‌سازی
            </Button>
            <Button variant="neon" size="sm" onClick={openCreate}>
              <Plus aria-hidden />
              افزودن فروشگاه
            </Button>
          </div>
        </div>

        {error && (
          <Card className={cardClass}>
            <CardContent className="p-6 text-center text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {!error && !loading && stores.length === 0 && (
          <Card className={cardClass}>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              هنوز فروشگاهی ثبت نشده است. با «افزودن فروشگاه» شروع کنید.
            </CardContent>
          </Card>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          {stores.map((store) => {
            const badge = licenseBadge(store.license);
            return (
              <Card key={store.id} className={cardClass}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <div className="me-auto">
                      <p className="font-bold">{store.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {store.owner_name ?? '—'}
                        {store.phone ? ` • ${toFaDigits(store.phone)}` : ''}
                      </p>
                    </div>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    {!store.is_active && <Badge variant="destructive">غیرفعال</Badge>}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ShieldCheck aria-hidden className="h-4 w-4" />
                    <span>
                      نسخه: {store.license ? TIER_LABELS[store.license.tier] : 'بدون لایسنس'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {store.license?.is_lifetime ? (
                      <>
                        <InfinityIcon aria-hidden className="h-4 w-4" />
                        <span>مادام‌العمر</span>
                      </>
                    ) : store.license?.expires_at ? (
                      <>
                        <CalendarClock aria-hidden className="h-4 w-4" />
                        <span>انقضا: {formatJalaliLong(new Date(store.license.expires_at))}</span>
                      </>
                    ) : (
                      <span>بدون تاریخ انقضا</span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button variant="outline" size="sm" onClick={() => openEdit(store)}>
                      <Pencil aria-hidden />
                      ویرایش
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditing(store);
                        setForm(formFromStore(store));
                        setFormOpen(true);
                      }}
                    >
                      <BadgeCheck aria-hidden />
                      لایسنس
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="ms-auto"
                      onClick={() => setDeleteTarget(store)}
                    >
                      <Trash2 aria-hidden />
                      حذف
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <OrdersPanel />

        <AuditPanel />
      </main>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'ویرایش فروشگاه' : 'افزودن فروشگاه'}</DialogTitle>
            <DialogDescription>
              اطلاعات فروشگاه، حساب ورود کاربر و لایسنس را تعیین کنید.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="نام فروشگاه" htmlFor="store-name">
                <Input
                  id="store-name"
                  value={form.name}
                  onChange={(event) => update({ name: event.target.value })}
                  required
                />
              </Field>
              <Field label="نام مالک" htmlFor="store-owner">
                <Input
                  id="store-owner"
                  value={form.owner_name}
                  onChange={(event) => update({ owner_name: event.target.value })}
                />
              </Field>
              <Field label="تلفن" htmlFor="store-phone">
                <Input
                  id="store-phone"
                  dir="ltr"
                  value={form.phone}
                  onChange={(event) => update({ phone: event.target.value })}
                />
              </Field>
              <Field label="وضعیت" htmlFor="store-active">
                <div className="flex h-10 items-center gap-2">
                  <Switch
                    id="store-active"
                    checked={form.is_active}
                    onCheckedChange={(checked) => update({ is_active: checked })}
                  />
                  <span className="text-sm">{form.is_active ? 'فعال' : 'غیرفعال'}</span>
                </div>
              </Field>
              <div className="sm:col-span-2">
                <Field label="آدرس" htmlFor="store-address">
                  <Input
                    id="store-address"
                    value={form.address}
                    onChange={(event) => update({ address: event.target.value })}
                  />
                </Field>
              </div>
            </div>

            <div className="rounded-2xl border border-dashed p-3">
              <p className="mb-2 text-sm font-bold">حساب ورود فروشگاه</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="ایمیل" htmlFor="store-email">
                  <Input
                    id="store-email"
                    type="email"
                    dir="ltr"
                    value={form.email}
                    onChange={(event) => update({ email: event.target.value })}
                    required={!editing}
                    autoComplete="off"
                  />
                </Field>
                <Field
                  label={editing ? 'رمز عبور جدید (خالی = بدون تغییر)' : 'رمز عبور'}
                  htmlFor="store-password"
                >
                  <Input
                    id="store-password"
                    type="password"
                    dir="ltr"
                    value={form.password}
                    onChange={(event) => update({ password: event.target.value })}
                    autoComplete="new-password"
                    required={!editing}
                  />
                </Field>
              </div>
            </div>

            <div className="rounded-2xl border border-dashed p-3">
              <p className="mb-2 text-sm font-bold">لایسنس</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="سطح لایسنس" htmlFor="license-tier">
                  <Select
                    value={form.tier}
                    onValueChange={(value) => update({ tier: value as Tier })}
                  >
                    <SelectTrigger id="license-tier">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pro">حرفه‌ای</SelectItem>
                      <SelectItem value="proplus">کامل (Pro+)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="وضعیت لایسنس" htmlFor="license-active">
                  <div className="flex h-10 items-center gap-2">
                    <Switch
                      id="license-active"
                      checked={form.license_active}
                      onCheckedChange={(checked) => update({ license_active: checked })}
                    />
                    <span className="text-sm">{form.license_active ? 'فعال' : 'غیرفعال'}</span>
                  </div>
                </Field>

                <div className="sm:col-span-2 flex items-center gap-2">
                  <Switch
                    id="license-lifetime"
                    checked={form.is_lifetime}
                    onCheckedChange={(checked) => update({ is_lifetime: checked })}
                  />
                  <Label htmlFor="license-lifetime">لایسنس مادام‌العمر (بدون انقضا)</Label>
                </div>

                {!form.is_lifetime && (
                  <div className="sm:col-span-2 space-y-1.5">
                    <Label htmlFor="license-expiry">تاریخ انقضا (شمسی)</Label>
                    <JalaliDateInput
                      id="license-expiry"
                      value={form.expires_at}
                      onChange={(iso) => update({ expires_at: iso })}
                    />
                  </div>
                )}

                <div className="sm:col-span-2">
                  <Field label="یادداشت (اختیاری)" htmlFor="license-notes">
                    <Input
                      id="license-notes"
                      value={form.notes}
                      onChange={(event) => update({ notes: event.target.value })}
                    />
                  </Field>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormOpen(false)}
                disabled={saving}
              >
                انصراف
              </Button>
              <Button type="submit" variant="neon" disabled={saving}>
                {saving ? 'در حال ذخیره…' : editing ? 'ذخیره‌ی تغییرات' : 'ساخت فروشگاه'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="حذف فروشگاه"
        description={
          deleteTarget
            ? `با حذف «${deleteTarget.name}» همه‌ی داده‌های مالی، کالاها، مشتریان و حساب ورود آن برای همیشه پاک می‌شود. مطمئن هستید؟`
            : ''
        }
        confirmLabel="بله، حذف کن"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className={cardClass}>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-extrabold">{value}</p>
      </CardContent>
    </Card>
  );
}
