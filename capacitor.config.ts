import type { CapacitorConfig } from '@capacitor/cli';

// پیکربندی نسخه‌ی بومی (اندروید) — همان وب‌اپ کارو داخل WebView اجرا می‌شود.
// شناسه‌ی برنامه: ir.karensoft.hesabyar — نام نمایشی: کارو نرم‌افزار حسابداری
const config: CapacitorConfig = {
  appId: 'ir.karensoft.hesabyar',
  appName: 'کارو نرم‌افزار حسابداری',
  webDir: 'dist',
  backgroundColor: '#000000',
  server: {
    // سرویس‌دهی داخلی روی https://localhost تا IndexedDB و دوربین مثل وب امن در دسترس باشند
    androidScheme: 'https',
  },
};

export default config;
