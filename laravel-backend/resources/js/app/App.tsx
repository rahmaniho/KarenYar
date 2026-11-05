import { useEffect } from 'react';
import { Toaster, type ToasterProps } from 'sonner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LockScreen } from '@/components/LockScreen';
import { LoginPage } from '@/features/auth/LoginPage';
import { ManagerApp } from '@/features/manager/ManagerApp';
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

export function App() {
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
        <LoginPage />
        <Toaster position="top-center" richColors closeButton toastOptions={toastOptions} />
      </ErrorBoundary>
    );
  }

  if (user.role === 'manager') {
    return (
      <ErrorBoundary>
        <ManagerApp />
        <Toaster position="top-center" richColors closeButton toastOptions={toastOptions} />
      </ErrorBoundary>
    );
  }

  return <StoreShell />;
}
