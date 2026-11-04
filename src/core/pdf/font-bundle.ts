/**
 * فونت‌های چاپ (TTF) با ?url ایمپورت می‌شوند تا آدرس assetِ buildشده
 * (هش‌شده و نسبت به base) داخل باندل باشد؛ ساخت PDF فاکتور/فیش دیگر
 * به مسیر /fonts/ روی سرور وابسته نیست و در اپ اندروید، PWA آفلاین
 * (ttf در precache سرویس‌ورکر است)، زبانه‌ی ناشناس و استیجینگ هم کار می‌کند.
 *
 * فایل‌های TTF در src/assets/fonts/ هستند؛ scripts/build-fonts-from-repo.py
 * آن‌ها را از فونت متغیر مخزن Qazvintasvir می‌سازد.
 */
import boldUrl from '@/assets/fonts/Vazirmatn-Bold.ttf?url';
import mediumUrl from '@/assets/fonts/Vazirmatn-Medium.ttf?url';
import regularUrl from '@/assets/fonts/Vazirmatn-Regular.ttf?url';

export type PdfFontFileName = 'Regular' | 'Medium' | 'Bold';

const FONT_URLS: Record<PdfFontFileName, string> = {
  Regular: regularUrl,
  Medium: mediumUrl,
  Bold: boldUrl,
};

/**
 * آدرس فونت TTFِ وزن داده‌شده در باندل build؛ اگر به هر دلیلی در دسترس نبود null
 * برمی‌گرداند تا مسیر قدیمی /fonts/ روی سرور به‌عنوان جایگزین استفاده شود.
 */
export function bundledFontUrl(fileName: PdfFontFileName): string | null {
  const url = FONT_URLS[fileName];
  return typeof url === 'string' && url.length > 0 ? url : null;
}
