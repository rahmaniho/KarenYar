import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserMinus, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, apiFetch } from '@/core/api/client';
import { toFaDigits } from '@/core/currency/currency';
import { cn } from '@/lib/utils';
import type { SeatUsage } from './subscription-types';

interface Member {
  id: number;
  name: string;
  email: string;
  is_active: boolean;
  last_login_at: string | null;
}

interface TeamResponse {
  members: Member[];
  usage: SeatUsage;
}

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
 * کاربران فروشگاه و سقف اشتراک.
 *
 * سقف کاربران در سرور کنترل می‌شود؛ اگر پر باشد، افزودن کاربر با پیام روشن
 * رد می‌شود و راه افزایش سقف (خرید کاربر اضافه) پیشنهاد می‌گردد.
 */
export function TeamPanel() {
  const navigate = useNavigate();
  const [data, setData] = useState<TeamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiFetch<TeamResponse>('/api/team'));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const usage = data?.usage;
  const full = usage ? !usage.can_add : false;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch<{ member: Member; usage: SeatUsage }>('/api/team', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm({ name: '', email: '', password: '' });
      toast.success('کاربر جدید اضافه شد.');
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (member: Member) => {
    setBusy(true);
    try {
      await apiFetch(`/api/team/${member.id}${member.is_active ? '' : '/restore'}`, {
        method: member.is_active ? 'DELETE' : 'POST',
      });
      toast.success(member.is_active ? 'کاربر غیرفعال شد.' : 'کاربر فعال شد.');
      await load();
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mt-4 border-navy-200 dark:border-navy-700">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-5 w-5 text-primary dark:text-neon-400" aria-hidden />
          کاربران فروشگاه
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {usage && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/60 p-3 text-sm">
            <span>
              {toFaDigits(usage.used)} کاربر فعال از {toFaDigits(usage.allowed)} کاربر مجاز
            </span>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-bold',
                full
                  ? 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
              )}
            >
              {full ? 'سقف پر است' : `${toFaDigits(usage.remaining)} ظرفیت آزاد`}
            </span>
            {full && (
              <Button
                size="sm"
                variant="neon"
                className="ms-auto"
                onClick={() => navigate('/subscription')}
              >
                افزایش تعداد کاربران
              </Button>
            )}
          </div>
        )}

        {loading && !data && (
          <p className="text-sm text-muted-foreground">در حال خواندن کاربران…</p>
        )}

        {data && (
          <ul className="divide-y text-sm">
            {data.members.map((member) => (
              <li key={member.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="font-medium">{member.name}</span>
                <span dir="ltr" className="text-xs text-muted-foreground">
                  {member.email}
                </span>
                {!member.is_active && (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-700 dark:bg-slate-500/20 dark:text-slate-300">
                    غیرفعال
                  </span>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="ms-auto"
                  disabled={busy}
                  onClick={() => void toggle(member)}
                >
                  {member.is_active ? <UserMinus aria-hidden /> : <UserPlus aria-hidden />}
                  {member.is_active ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form
          onSubmit={submit}
          className="grid gap-2 rounded-xl border border-dashed p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
        >
          <div className="space-y-1">
            <Label htmlFor="team-name">نام</Label>
            <Input
              id="team-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="team-email">ایمیل</Label>
            <Input
              id="team-email"
              type="email"
              dir="ltr"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="team-password">رمز عبور</Label>
            <Input
              id="team-password"
              type="password"
              dir="ltr"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
          </div>
          <Button
            type="submit"
            className="self-end"
            disabled={
              busy || full || !form.name.trim() || !form.email.trim() || form.password.length < 8
            }
          >
            <UserPlus aria-hidden />
            افزودن
          </Button>
        </form>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {full && (
          <p className="text-xs text-muted-foreground">
            برای افزودن کاربر جدید، ابتدا ظرفیت اشتراک را افزایش دهید یا یک کاربر غیرفعال را حذف
            کنید.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
