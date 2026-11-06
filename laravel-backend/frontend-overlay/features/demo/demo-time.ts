/** ابزارهای نمایش زمان دمو (جدا از کامپوننت تا Fast Refresh سالم بماند). */

/** برچسب زمان باقی‌ماندهٔ دمو (فارسی و کوتاه). */
export function demoRemainingLabel(expiresAt?: string | null, now = Date.now()): string {
  if (!expiresAt) {
    return 'زمان نامشخص';
  }

  const remaining = new Date(expiresAt).getTime() - now;

  if (Number.isNaN(remaining)) {
    return 'زمان نامشخص';
  }

  if (remaining <= 0) {
    return 'به پایان رسیده';
  }

  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.max(1, Math.round((remaining % 3_600_000) / 60_000));

  return hours >= 1 ? `${hours} ساعت و ${minutes} دقیقه` : `${minutes} دقیقه`;
}
