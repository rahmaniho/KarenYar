import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** ترکیب کلاس‌های Tailwind به سبک shadcn/ui */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * مسیر فایل‌های public آگاه از base استقرار — مثلاً زیر /KarenYar/ در GitHub Pages.
 * ورودی بدون اسلش ابتدایی: assetUrl('images/karensoft/mark.png')
 */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}
