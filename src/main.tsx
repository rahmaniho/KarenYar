import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from '@/app/App';
import { initNativeShell, isNativeApp } from '@/lib/native';
import '@/styles/globals.css';

// سرویس‌ورکر PWA فقط روی وب ثبت می‌شود؛ در اپ بومی اندروید دارایی‌ها داخل خود برنامه‌اند
// و سرویس‌ورکر فقط باعث ماندن نسخه‌ی قدیمی بعد از به‌روزرسانی APK می‌شود.
if (!isNativeApp()) {
  registerSW({ immediate: true });
}
void initNativeShell();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('ریشه‌ی برنامه یافت نشد.');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
