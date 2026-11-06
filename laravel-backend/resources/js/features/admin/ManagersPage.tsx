import { useState, type FormEvent } from 'react';
import { ShieldCheck, UserPlus } from 'lucide-react';
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
import type { ManagerAccount } from './admin-types';

export function ManagersPage() {
  const { data, loading, error, reload } = useAsync(() => adminApi.managers(), []);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ManagerAccount | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const managers = data?.managers ?? [];

  const startCreate = () => {
    setEditing(null);
    setForm({ name: '', email: '', password: '' });
    setOpen(true);
  };

  const startEdit = (manager: ManagerAccount) => {
    setEditing(manager);
    setForm({ name: manager.name, email: manager.email, password: '' });
    setOpen(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await adminApi.updateManager(editing.id, {
          name: form.name.trim(),
          email: form.email.trim(),
          ...(form.password ? { password: form.password } : {}),
        });
        toast.success('حساب مدیر به‌روزرسانی شد.');
      } else {
        await adminApi.createManager({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
        });
        toast.success('مدیر جدید ساخته شد.');
      }
      setOpen(false);
      await reload();
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (manager: ManagerAccount) => {
    setBusyId(manager.id);
    try {
      if (manager.is_active) {
        await adminApi.deactivateManager(manager.id);
        toast.success('حساب مدیر غیرفعال شد.');
      } else {
        await adminApi.updateManager(manager.id, { is_active: true });
        toast.success('حساب مدیر فعال شد.');
      }
      await reload();
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200">
        حساب مدیر کل به همهٔ داده‌ها و عملیات مالی دسترسی دارد. رمزها را قوی انتخاب کنید و حساب‌های بلااستفاده را
        غیرفعال نگه دارید. هر تغییر در دفتر رویدادها ثبت می‌شود.
      </div>

      <Panel
        title="مدیران"
        subtitle="ساخت، ویرایش و غیرفعال‌سازی حساب‌های مدیر کل"
        icon={ShieldCheck}
        actions={
          <div className="flex items-center gap-2">
            <RefreshButton onClick={() => void reload()} loading={loading} />
            <Button size="sm" variant="neon" onClick={startCreate}>
              <UserPlus aria-hidden />
              مدیر جدید
            </Button>
          </div>
        }
      >
        {error && <p className="mb-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
        {loading && !data && <LoadingRows rows={3} />}
        {!loading && managers.length === 0 && <EmptyState text="مدیری ثبت نشده است." />}

        {managers.length > 0 && (
          <ul className="divide-y divide-white/[0.06] text-xs">
            {managers.map((manager) => (
              <li key={manager.id} className="flex flex-wrap items-center gap-2 py-3">
                <span className="font-bold text-white/90">{manager.name}</span>
                <span dir="ltr" className="text-white/45">
                  {manager.email}
                </span>
                <Pill tone={manager.is_active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}>
                  {manager.is_active ? 'فعال' : 'غیرفعال'}
                </Pill>
                {manager.is_self && <Pill tone="bg-sky-500/15 text-sky-300">شما</Pill>}
                <span className="text-white/35">
                  آخرین ورود: {manager.last_login_at ? formatJalaliLongISO(manager.last_login_at) : '—'}
                </span>
                <span className="ms-auto flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="text-white/70" onClick={() => startEdit(manager)}>
                    ویرایش
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={manager.is_active ? 'text-amber-300' : 'text-emerald-300'}
                    disabled={manager.is_self || busyId === manager.id}
                    onClick={() => void toggle(manager)}
                  >
                    {manager.is_active ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-white/10 bg-[#0b1424] text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'ویرایش مدیر' : 'مدیر جدید'}</DialogTitle>
            <DialogDescription className="text-white/50">
              {editing ? 'برای تغییر رمز، فیلد رمز را پر کنید؛ در غیر این صورت خالی بگذارید.' : 'رمز موقت بسازید و به مدیر تحویل دهید.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="manager-name" className="text-xs text-white/70">
                نام
              </Label>
              <Input id="manager-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required className="border-white/10 bg-white/[0.05] text-white" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="manager-email" className="text-xs text-white/70">
                ایمیل
              </Label>
              <Input id="manager-email" type="email" dir="ltr" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required className="border-white/10 bg-white/[0.05] text-white" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="manager-password" className="text-xs text-white/70">
                {editing ? 'رمز جدید (اختیاری)' : 'رمز عبور (حداقل ۸ نویسه)'}
              </Label>
              <Input
                id="manager-password"
                type="password"
                dir="ltr"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                required={!editing}
                minLength={editing ? undefined : 8}
                className="border-white/10 bg-white/[0.05] text-white"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" className="text-white/70" onClick={() => setOpen(false)} disabled={saving}>
                انصراف
              </Button>
              <Button type="submit" variant="neon" disabled={saving}>
                {editing ? 'ذخیره' : 'ساخت مدیر'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
