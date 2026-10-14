/**
 * سیستم لایسنس آفلاین حساب‌یار کارن سافت
 *
 * طراحی Interface-based: قرارداد `LicenseVerifier` ثابت می‌ماند و پیاده‌سازی فعلی
 * (HMAC-SHA256 با کلید داخلی + تاریخ انقضا) بعداً بدون تغییر در بقیه‌ی کد می‌تواند
 * با امضای RSA/Ed25519 یا سرور آنلاین جایگزین شود.
 *
 * ⚠️ توجه امنیتی: کلید محرمانه‌ی HMAC فقط برای نسخه‌ی آفلاین/دمو است و باید در
 * نسخه‌ی فروش نهایی از سورس مشتری حذف/چرخانده شود (اسکریپت: scripts/generate-license.mjs).
 * قالب کلید: KS1.<payload-base64url>.<signature-base64url>
 */

export type LicenseTier = 'free' | 'pro' | 'proplus';

export interface LicensePayload {
  v: 1;
  tier: Exclude<LicenseTier, 'free'>;
  /** نام دارنده‌ی لایسنس */
  name: string;
  /** تاریخ صدور ISO (yyyy-mm-dd) */
  iat: string;
  /** تاریخ انقضا ISO یا null برای مادام‌العمر */
  exp: string | null;
}

export interface LicenseInfo {
  tier: LicenseTier;
  holderName: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  isExpired: boolean;
}

export const FREE_LICENSE_INFO: LicenseInfo = {
  tier: 'free',
  holderName: null,
  issuedAt: null,
  expiresAt: null,
  isExpired: false,
};

export const TIER_LABELS: Record<LicenseTier, string> = {
  free: 'رایگان',
  pro: 'حرفه‌ای (Lifetime)',
  proplus: 'Pro+ (اشتراکی)',
};

/** قابلیت‌های قابل گیت‌کردن در اپ */
export type Feature =
  | 'pdf-export'
  | 'backup'
  | 'unlimited-products'
  | 'unlimited-transactions';

export const FEATURE_LABELS: Record<Feature, string> = {
  'pdf-export': 'خروجی PDF فاکتور و فیش حقوقی',
  backup: 'پشتیبان‌گیری و بازیابی داده‌ها',
  'unlimited-products': 'ثبت کالای نامحدود',
  'unlimited-transactions': 'ثبت تراکنش نامحدود',
};

export const TIER_FEATURES: Record<LicenseTier, Feature[]> = {
  free: [],
  pro: ['pdf-export', 'backup', 'unlimited-products', 'unlimited-transactions'],
  proplus: ['pdf-export', 'backup', 'unlimited-products', 'unlimited-transactions'],
};

/** سقف‌های نسخه‌ی رایگان */
export const FREE_LIMITS = {
  products: 1,
  transactions: 10,
} as const;

export function tierHasFeature(tier: LicenseTier, feature: Feature): boolean {
  return TIER_FEATURES[tier].includes(feature);
}

export class LicenseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LicenseError';
  }
}

// ————— ابزارهای base64url —————

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlToBytes(text: string): Uint8Array {
  const normalized = text.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ————— قرارداد تأییدکننده (قابل جایگزینی با RSA/سرور در فاز بعد) —————

export interface LicenseVerifier {
  verify(key: string): Promise<LicenseInfo>;
}

/**
 * محرمانه‌ی امضای HMAC — باید با اسکریپت تولید کلید یکسان باشد.
 * در محصول نهایی این مقدار را با متغیر محیطی build یا سرور امضا جایگزین کنید.
 */
const LICENSE_HMAC_SECRET =
  import.meta.env.VITE_LICENSE_SECRET ?? 'karensoft-hesabyar::license-secret::v1::CHANGE-ME';

async function hmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new LicenseError('مرورگر شما از رمزنگاری امن پشتیبانی نمی‌کند.');
  const encoder = new TextEncoder();
  const cryptoKey = await subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return new Uint8Array(signature);
}

export function isPayloadExpired(payload: LicensePayload, now: Date = new Date()): boolean {
  if (!payload.exp) return false;
  const expiry = new Date(`${payload.exp}T23:59:59`);
  return now.getTime() > expiry.getTime();
}

/** تجزیه‌ی ساختار کلید بدون بررسی امضا (برای نمایش خطاهای دقیق‌تر) */
export function parseLicenseKey(key: string): LicensePayload {
  const parts = key.trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'KS1') {
    throw new LicenseError('قالب کلید لایسنس معتبر نیست. کلید را دقیق و کامل وارد کنید.');
  }
  let payload: LicensePayload;
  try {
    const json = new TextDecoder().decode(base64UrlToBytes(parts[1]));
    payload = JSON.parse(json) as LicensePayload;
  } catch {
    throw new LicenseError('کلید لایسنس خوانا نیست. از کپی کامل کلید مطمئن شوید.');
  }
  if (
    payload.v !== 1 ||
    (payload.tier !== 'pro' && payload.tier !== 'proplus') ||
    typeof payload.name !== 'string'
  ) {
    throw new LicenseError('اطلاعات داخل کلید لایسنس معتبر نیست.');
  }
  return payload;
}

/** تأییدکننده‌ی پیش‌فرض آفلاین (HMAC-SHA256) */
export class HmacLicenseVerifier implements LicenseVerifier {
  async verify(key: string): Promise<LicenseInfo> {
    const trimmed = key.trim();
    const payload = parseLicenseKey(trimmed);
    const parts = trimmed.split('.');
    const expectedSignature = bytesToBase64Url(await hmacSha256(LICENSE_HMAC_SECRET, parts[1]));
    if (expectedSignature !== parts[2]) {
      throw new LicenseError('امضای کلید معتبر نیست. کلید را از فروشنده دریافت کنید.');
    }
    const expired = isPayloadExpired(payload);
    return {
      tier: expired ? 'free' : payload.tier,
      holderName: payload.name,
      issuedAt: payload.iat,
      expiresAt: payload.exp,
      isExpired: expired,
    };
  }
}

export const licenseVerifier: LicenseVerifier = new HmacLicenseVerifier();
