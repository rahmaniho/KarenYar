import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from '@/app/App';
import { initNativeShell, isNativeApp } from '@/lib/native';
import '@/styles/globals.css';

// هر خطای اولیه (مثلاً در زبانه‌ی ناشناس که سرویس‌ورکر یا کش در دسترس نیست) به‌جای صفحه‌ی سفید
// روی صفحه نمایش داده می‌شود تا قابل گزارش باشد.
window.addEventListener('error', (event) => {
  const root = document.getElementById('root');
  if (root && !root.childElementCount) {
    root.textContent = `خطا در بارگذاری برنامه: ${event.message}`;
    root.style.cssText = 'padding:2rem;text-align:center;font-family:Tahoma,sans-serif';
  }
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('unhandled rejection:', event.reason);
});

// سرویس‌ورکر PWA فقط روی وب ثبت می‌شود؛ در اپ بومی اندروید دارایی‌ها داخل خود برنامه‌اند
// و سرویس‌ورکر فقط باعث ماندن نسخه‌ی قدیمی بعد از به‌روزرسانی APK می‌شود.
// در برخی محیط‌ها (مثلاً زبانه‌ی ناشناس) ثبت سرویس‌ورکر با خطا مواجه می‌شود؛ آن را نادیده می‌گیریم.
if (!isNativeApp()) {
  try {
    void Promise.resolve(registerSW({ immediate: true }) as unknown).catch(() => undefined);
  } catch {
    // بدون سرویس‌ورکر هم برنامه به‌صورت آنلاین کار می‌کند
  }
}
void initNativeShell().catch(() => undefined);

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('ریشه‌ی برنامه یافت نشد.');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
