import { useEffect, useState } from 'react';
import { Toaster, type ToasterProps } from 'sonner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LockScreen } from '@/components/LockScreen';
import { LandingPage } from '@/features/landing/LandingPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { SignupPage } from '@/features/subscription/SignupPage';
import { AdminApp } from '@/features/admin/AdminApp';
import { useLicenseSync } from '@/hooks/use-license-sync';
import { useAuthStore } from '@/store/auth-store';
import { useLockStore } from '@/store/lock-store';
import { applyTheme, useSettingsStore } from '@/store/settings-store';
import { AppRouter } from './router';

const toastOptions: ToasterProps['toastOptions'] = {
  style: { fontFamily: 'inherit' },
};

/** پوسته‌ی برنامه‌ی فروشگاه — قفل دستگاه، لایسنس و مسیریابی. */
function StoreShell() {
  const locked = useLockStore((s) => s.locked);
  useLicenseSync();

  if (locked) {
    return (
      <ErrorBoundary>
        <LockScreen />
        <Toaster position="top-center" richColors closeButton toastOptions={toastOptions} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <AppRouter />
      <Toaster position="top-center" richColors closeButton toastOptions={toastOptions} />
    </ErrorBoundary>
  );
}

function Splash() {
  return (
    <div
      dir="rtl"
      className="flex min-h-dvh items-center justify-center bg-navy-900 text-sm text-white/70"
    >
      در حال بارگذاری…
    </div>
  );
}

type GuestScreen = 'landing' | 'login' | 'signup';

export function App() {
  /**
   * صفحهٔ مهمان: ریشه (`/`) لندینگ است؛ ورود/ثبت‌نام از همان‌جا باز می‌شود.
   * پس از «پایان دمو» با پرچم کوتاه‌عمر، مستقیم صفحهٔ ثبت‌نام می‌آید و
   * لینک‌های عمیق (مثل `/store/pos`) کاربر را به ورود می‌برند.
   */
  const [screen, setScreen] = useState<GuestScreen>(() => {
    if (typeof window === 'undefined') {
      return 'landing';
    }

    const openSignup = window.sessionStorage.getItem('karo:open-signup') === '1';
    if (openSignup) {
      window.sessionStorage.removeItem('karo:open-signup');
      return 'signup';
    }

    const path = window.location.pathname.replace(/\/+$/, '');
    return path === '' ? 'landing' : 'login';
  });
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const refresh = useAuthStore((s) => s.refresh);
  const theme = useSettingsStore((s) => s.theme);

  // اعمال تم در همه‌ی حالت‌ها (ورود، پنل مدیر، برنامه‌ی فروشگاه)
  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system' || typeof window.matchMedia !== 'function') {
      return;
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    }
    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, [theme]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!ready) {
    return <Splash />;
  }

  if (!user) {
    return (
      <ErrorBoundary>
        {screen === 'signup' ? (
          <SignupPage onBack={() => setScreen('login')} />
        ) : screen === 'login' ? (
          <LoginPage
            onSignup={() => setScreen('signup')}
            onHome={() => setScreen('landing')}
          />
        ) : (
          <LandingPage
            onLogin={() => setScreen('login')}
            onSignup={() => setScreen('signup')}
          />
        )}
        <Toaster position="top-center" richColors closeButton toastOptions={toastOptions} />
      </ErrorBoundary>
    );
  }

  if (user.role === 'manager') {
    return (
      <ErrorBoundary>
        <AdminApp />
        <Toaster position="top-center" richColors closeButton toastOptions={toastOptions} />
      </ErrorBoundary>
    );
  }

  return <StoreShell />;
}
