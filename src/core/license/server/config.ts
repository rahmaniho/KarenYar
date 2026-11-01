/// <reference types="vite/client" />
/**
 * پیکربندی لایسنس سروری — فقط با ست‌شدن VITE_LICENSE_API_BASE فعال می‌شود.
 *
 * بیلد اصلی/دمو بدون این متغیر ساخته می‌شود و رفتار آفلاین قبلی را حفظ می‌کند.
 * هیچ کلید محرمانه‌ای اینجا نیست؛ کلید عمومی issuer اختیاری و فقط برای pin کردن است.
 */
export interface ServerLicenseConfig {
  /** مثل '/v1' (هم‌مبدأ) یا 'https://license.example.com/v1' */
  apiBase: string;
  /** محیط مورد انتظار توکن‌ها: 'staging' یا 'production' */
  environment: string;
  /** کلید عمومی Ed25519 issuer به‌صورت base64 خام — اختیاری؛ برای pin کردن */
  issuerPublicKeyB64?: string;
}

export function getServerLicenseConfig(): ServerLicenseConfig | null {
  const apiBase = String(import.meta.env.VITE_LICENSE_API_BASE ?? '')
    .trim()
    .replace(/\/+$/, '');
  if (!apiBase) return null;
  const environment = String(import.meta.env.VITE_LICENSE_ENV ?? 'staging').trim() || 'staging';
  const pinned = String(import.meta.env.VITE_LICENSE_ISSUER_PUBLIC_KEY ?? '').trim();
  return { apiBase, environment, issuerPublicKeyB64: pinned || undefined };
}
