import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** ترکیب کلاس‌های Tailwind به سبک shadcn/ui */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * مسیر پایه‌ی استقرار برنامه.
 *
 * نکته: `import.meta.env.BASE_URL` در Laravel به پوشه‌ی build (مثلاً /build/)
 * اشاره می‌کند، نه ریشه‌ی برنامه. بنابراین مسیر عمومی اپ را جدا نگه می‌داریم.
 * برای استقرار در زیرمسیر، مقدار VITE_APP_BASE را تنظیم کنید.
 */
export const APP_BASE_URL = (import.meta.env.VITE_APP_BASE ?? '/').replace(/\/?$/, '/');

/** basename مناسب برای React Router (بدون اسلش انتهایی) */
export function appBasename(): string {
  return APP_BASE_URL.replace(/\/$/, '') || '/';
}

/**
 * مسیر فایل‌های public آگاه از base استقرار — مثلاً /KarenYar/
 * ورودی بدون اسلش ابتدایی: assetUrl('images/karensoft/mark.png')
 */
export function assetUrl(path: string): string {
  return `${APP_BASE_URL}${path.replace(/^\//, '')}`;
}
