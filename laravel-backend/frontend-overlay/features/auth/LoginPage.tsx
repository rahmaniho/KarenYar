import { useState, type FormEvent } from 'react';
import { FlaskConical, LogIn, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/core/api/client';
import { assetUrl } from '@/lib/utils';
import { useAuthStore } from '@/store/auth-store';

/**
 * صفحه‌ی ورود مشترک مدیر کل و کاربران فروشگاه.
 *
 * نقش کاربر و فروشگاهش از سرور تعیین می‌شود؛ بعد از ورود، مدیر به پنل مدیریت
 * و کاربر فروشگاه به برنامه‌ی فروشگاه هدایت می‌شود.
 */
export function LoginPage({ onSignup }: { onSignup?: () => void }) {
  const login = useAuthStore((s) => s.login);
  const demoLogin = useAuthStore((s) => s.demoLogin);
  const loading = useAuthStore((s) => s.loading);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await login(email.trim(), password);
      toast.success('خوش آمدید!');
    } catch (caught) {
      if (caught instanceof ApiError) {
        const firstError = caught.errors
          ? Object.values(caught.errors).flat().find(Boolean)
          : undefined;
        setError(firstError ?? caught.message ?? 'ورود ناموفق بود.');
      } else {
        setError('ارتباط با سرور برقرار نشد. اینترنت را بررسی کنید و دوباره تلاش کنید.');
      }
    }
  };

  const startDemo = async () => {
    setError(null);
    setDemoLoading(true);
    try {
      await demoLogin();
      toast.success('دمو آماده است؛ همه‌چیز آزمایشی و پس از پایان پاک می‌شود.');
    } catch (caught) {
      if (caught instanceof ApiError) {
        const firstError = caught.errors
          ? Object.values(caught.errors).flat().find(Boolean)
          : undefined;
        setError(firstError ?? caught.message ?? 'ساخت دمو ناموفق بود.');
      } else {
        setError('ارتباط با سرور برقرار نشد. اینترنت را بررسی کنید و دوباره تلاش کنید.');
      }
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-navy-900 p-4" dir="rtl">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <img
            src={assetUrl('images/karo/logo.png')}
            alt="لوگوی کارو"
            width={771}
            height={283}
            className="mb-2 h-16 w-auto max-w-full rounded-2xl bg-white p-2 object-contain shadow-glow ring-1 ring-black/10"
          />
          <CardTitle className="text-xl font-extrabold">ورود به کارو</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            با حساب فروشگاه یا مدیر کل خود وارد شوید.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="login-email">ایمیل</Label>
              <Input
                id="login-email"
                type="email"
                dir="ltr"
                autoComplete="username"
                autoFocus
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError(null);
                }}
                aria-invalid={!!error}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="login-password">رمز عبور</Label>
              <Input
                id="login-password"
                type="password"
                dir="ltr"
                autoComplete="current-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError(null);
                }}
                aria-invalid={!!error}
                aria-describedby={error ? 'login-error' : undefined}
              />
            </div>

            {error && (
              <p id="login-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <Button
              type="submit"
              variant="neon"
              size="lg"
              className="w-full"
              disabled={loading || !email.trim() || password.length === 0}
            >
              <LogIn aria-hidden />
              {loading ? 'در حال ورود…' : 'ورود'}
            </Button>

            <div className="space-y-2 border-t pt-3 text-center">
              <p className="text-xs text-muted-foreground">
                فقط می‌خواهید ببینید؟ یک دموی امن و موقت بسازید — بدون پرداخت، داده‌های واقعی
                دست‌نخورده و دادهٔ دمو پس از پایان پاک می‌شود.
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={startDemo}
                disabled={demoLoading || loading}
              >
                <FlaskConical aria-hidden />
                {demoLoading ? 'در حال ساخت دمو…' : 'ورود به دموی امن'}
              </Button>
            </div>

            {onSignup && (
              <div className="space-y-2 border-t pt-3 text-center">
                <p className="text-xs text-muted-foreground">هنوز فروشگاه نساخته‌اید؟</p>
                <Button type="button" variant="outline" className="w-full" onClick={onSignup}>
                  <UserPlus aria-hidden />
                  ساخت فروشگاه و شروع رایگان
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
