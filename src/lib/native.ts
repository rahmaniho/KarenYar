/**
 * پوسته‌ی بومی (Capacitor) — روی وب همه‌ی توابع این فایل عملاً بی‌اثرند
 * تا همان خروجی وب/PWA بدون هیچ تغییری کار کند.
 */
import { Capacitor } from '@capacitor/core';

/** آیا برنامه داخل اپ بومی اندروید اجرا می‌شود؟ (در مرورگر همیشه false است) */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * تنظیمات پوسته‌ی بومی: رنگ نوار وضعیت هم‌رنگ هدر برنامه + دکمه‌ی برگشت اندروید.
 * پلاگین‌ها تنبل (dynamic import) لود می‌شوند تا باندل وب هیچ هزینه‌ای ندهد.
 */
export async function initNativeShell(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const [{ App }, { StatusBar, Style }] = await Promise.all([
      import('@capacitor/app'),
      import('@capacitor/status-bar'),
    ]);
    // نوار وضعیت سرمه‌ای هم‌رنگ برند با آیکن‌های روشن
    await StatusBar.setBackgroundColor({ color: '#0B1B3A' });
    await StatusBar.setStyle({ style: Style.Dark });
    // دکمه‌ی برگشت سخت‌افزاری: داخل برنامه عقب‌گرد، در ریشه خروج
    await App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else void App.exitApp();
    });
  } catch {
    // پوسته‌ی بومی در دسترس نیست — برنامه مثل وب عادی به کارش ادامه می‌دهد
  }
}
