import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { initNativeShell } from '@/lib/native';
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

void initNativeShell().catch(() => undefined);

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('ریشه‌ی برنامه یافت نشد.');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
