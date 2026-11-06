import { useState, type FormEvent } from 'react';
import { ArrowRight, Sparkles, Store } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, apiFetch } from '@/core/api/client';
import { toFaDigits } from '@/core/currency/currency';
import { assetUrl } from '@/lib/utils';
import { useAuthStore } from '@/store/auth-store';

/**
 * ثبت‌نام آنلاین فروشگاه.
 *
 * فروشگاه، کاربر مالک و لایسنس آزمایشی در سرور ساخته می‌شوند؛ پس از موفقیت
 * کاربر بلافاصله وارد برنامه می‌شود تا از همان لحظه فاکتور بزند.
 */
export function SignupPage({ onBack, trialDays = 14 }: { onBack: () => void; trialDays?: number }) {
  const [form, setForm] = useState({
    store_name: '',
    owner_name: '',
    phone: '',
    email: '',
    password: '',
    password_confirmation: '',
    terms: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (patch: Partial<typeof form>) => {
    setForm((current) => ({ ...current, ...patch }));
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (form.password.length < 8) {
      setError('رمز عبور باید حداقل ۸ نویسه باشد.');
      return;
    }
    if (form.password !== form.password_confirmation) {
      setError('تکرار رمز عبور یکسان نیست.');
      return;
    }
    if (!form.terms) {
      setError('برای ادامه باید قوانین استفاده را بپذیرید.');
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch('/api/register', {
        method: 'POST',
        body: JSON.stringify({
          store_name: form.store_name.trim(),
          owner_name: form.owner_name.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim(),
          password: form.password,
          password_confirmation: form.password_confirmation,
          terms: form.terms,
        }),
      });

      await useAuthStore.getState().refresh();
      toast.success('فروشگاه شما ساخته شد؛ دورهٔ آزمایشی فعال است.');
    } catch (caught) {
      if (caught instanceof ApiError) {
        const first = caught.errors ? Object.values(caught.errors).flat().find(Boolean) : undefined;
        setError(first ?? caught.message ?? 'ثبت‌نام انجام نشد.');
      } else {
        setError('ارتباط با سرور برقرار نشد. اینترنت را بررسی کنید و دوباره تلاش کنید.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-navy-900 p-4" dir="rtl">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <img
            src={assetUrl('images/karo/logo.png')}
            alt="لوگوی کارو"
            className="mb-2 h-16 w-auto max-w-full rounded-2xl bg-white p-2 object-contain shadow-glow ring-1 ring-black/10"
          />
          <CardTitle className="text-xl font-extrabold">ساخت فروشگاه در کارو</CardTitle>
          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4 text-primary dark:text-neon-400" aria-hidden />
            {toFaDigits(trialDays)} روز استفادهٔ رایگان، بدون کارت بانکی
          </p>
        </CardHeader>

        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="signup-store">نام فروشگاه</Label>
              <Input
                id="signup-store"
                autoFocus
                value={form.store_name}
                onChange={(event) => update({ store_name: event.target.value })}
                placeholder="مثلاً فروشگاه گل‌ها"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="signup-owner">نام و نام خانوادگی</Label>
                <Input
                  id="signup-owner"
                  value={form.owner_name}
                  onChange={(event) => update({ owner_name: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signup-phone">موبایل (اختیاری)</Label>
                <Input
                  id="signup-phone"
                  dir="ltr"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(event) => update({ phone: event.target.value })}
                  placeholder="09xxxxxxxxx"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="signup-email">ایمیل</Label>
              <Input
                id="signup-email"
                type="email"
                dir="ltr"
                autoComplete="username"
                value={form.email}
                onChange={(event) => update({ email: event.target.value })}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="signup-password">رمز عبور</Label>
                <Input
                  id="signup-password"
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) => update({ password: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signup-password2">تکرار رمز عبور</Label>
                <Input
                  id="signup-password2"
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  value={form.password_confirmation}
                  onChange={(event) => update({ password_confirmation: event.target.value })}
                />
              </div>
            </div>

            <label className="flex items-start gap-2 text-xs leading-6 text-muted-foreground">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-primary"
                checked={form.terms}
                onChange={(event) => update({ terms: event.target.checked })}
              />
              قوانین استفاده و سیاست حفظ داده‌ها را می‌پذیرم؛ داده‌های فروشگاه من متعلق به خودم است
              و هر زمان بتوانم کامل خروجی بگیرم.
            </label>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <Button
              type="submit"
              variant="neon"
              size="lg"
              className="w-full"
              disabled={submitting || !form.store_name.trim() || !form.email.trim()}
            >
              <Store aria-hidden />
              {submitting ? 'در حال ساخت فروشگاه…' : 'ساخت فروشگاه و شروع رایگان'}
            </Button>

            <Button type="button" variant="ghost" className="w-full" onClick={onBack}>
              <ArrowRight aria-hidden />
              بازگشت به صفحهٔ ورود
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
