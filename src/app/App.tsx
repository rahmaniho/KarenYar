import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { applyTheme, useSettingsStore } from '@/store/settings-store';
import { useLicenseStore } from '@/store/license-store';
import { router } from './router';

export function App() {
  const theme = useSettingsStore((s) => s.theme);
  const initLicense = useLicenseStore((s) => s.init);

  // اعمال تم + دنبال‌کردن تغییر تم سیستم‌عامل در حالت «سیستم»
  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    }
    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, [theme]);

  // بارگذاری و راستی‌آزمایی لایسنس ذخیره‌شده
  useEffect(() => {
    void initLicense();
  }, [initLicense]);

  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
      <Toaster
        position="top-center"
        richColors
        closeButton
        toastOptions={{ style: { fontFamily: 'inherit' } }}
      />
    </ErrorBoundary>
  );
}
