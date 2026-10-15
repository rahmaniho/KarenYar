import type { CapacitorConfig } from '@capacitor/cli';

// پیکربندی نسخه‌ی بومی (اندروید) — همان وب‌اپ حساب‌یار داخل WebView اجرا می‌شود.
// شناسه‌ی برنامه: ir.karensoft.hesabyar — نام نمایشی: حساب‌یار کارن سافت
const config: CapacitorConfig = {
  appId: 'ir.karensoft.hesabyar',
  appName: 'حساب‌یار کارن سافت',
  webDir: 'dist',
  backgroundColor: '#0B1B3A',
  server: {
    // سرویس‌دهی داخلی روی https://localhost تا IndexedDB و دوربین مثل وب امن در دسترس باشند
    androidScheme: 'https',
  },
};

export default config;
