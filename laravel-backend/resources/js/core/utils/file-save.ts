/**
 * ذخیره‌ی فایل خروجی (پشتیبان JSON، CSV، PDF) به‌صورت چندسکویی:
 * - وب/PWA: دانلود معمول مرورگر با لینک موقت.
 * - اپ بومی اندروید (WebView): دانلود مستقیم کار نمی‌کند؛ فایل در حافظه‌ی موقت
 *   نوشته و پنجره‌ی اشتراک‌گذاری/ذخیره‌ی سیستم باز می‌شود تا کاربر خودش مقصد را انتخاب کند.
 */
import { Capacitor } from '@capacitor/core';

function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('خواندن فایل خروجی ناموفق بود'));
    reader.readAsDataURL(blob);
  });
}

/** ذخیره/دانلود یک Blob با نام مشخص — روی هر دو سکو یک امضای واحد دارد. */
export async function saveBlob(fileName: string, blob: Blob): Promise<void> {
  if (!isNativeApp()) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    return;
  }

  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);
  const data = await blobToBase64(blob);
  const written = await Filesystem.writeFile({
    path: fileName,
    data,
    directory: Directory.Cache,
  });
  try {
    await Share.share({
      title: fileName,
      url: written.uri,
      dialogTitle: 'ذخیره یا ارسال فایل',
    });
  } catch {
    // کاربر پنجره‌ی اشتراک‌گذاری را بست؛ فایل در حافظه‌ی موقت موجود است و خطایی رخ نداده
  }
}
