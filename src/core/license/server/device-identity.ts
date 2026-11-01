/**
 * هویت دستگاه — کلید Ed25519 غیرقابل‌استخراج در IndexedDB همین دستگاه.
 *
 * کلید خصوصی هرگز از دستگاه خارج نمی‌شود و در خروجی پشتیبان هم نیست
 * (جدول license عمداً در بکاپ نمی‌آید). فقط کلید عمومی برای سرور ارسال می‌شود.
 * توجه: در وب، هر جاوااسکریپتی که روی همین مبدأ اجرا شود می‌تواند با کلید امضا کند؛
 * در فاز APK از نگه‌داری امن بومی (Keystore) استفاده می‌کنیم.
 */
import { db } from '@/core/db/db';
import { bytesToBase64Url } from './token';

export interface DeviceIdentity {
  deviceKeyId: string;
  privateKey: CryptoKey;
  publicKeyB64: string;
  createdAt: string;
}

const ROW_KEY = 'server-device-identity';

export function deviceLabelFromUserAgent(userAgent: string): string {
  const os = /Android/i.test(userAgent)
    ? 'Android'
    : /iPhone|iPad|iPod/i.test(userAgent)
      ? 'iOS'
      : /Windows/i.test(userAgent)
        ? 'Windows'
        : /Macintosh|Mac OS X/i.test(userAgent)
          ? 'macOS'
          : /Linux/i.test(userAgent)
            ? 'Linux'
            : 'ناشناخته';
  const browser = /EdgA?\//i.test(userAgent)
    ? 'Edge'
    : /SamsungBrowser/i.test(userAgent)
      ? 'Samsung Internet'
      : /Firefox|FxiOS/i.test(userAgent)
        ? 'Firefox'
        : /Chrome|CriOS/i.test(userAgent)
          ? 'Chrome'
          : /Safari/i.test(userAgent)
            ? 'Safari'
            : 'مرورگر';
  return `حساب‌یار وب — ${os} / ${browser}`;
}

function isDeviceIdentity(value: unknown): value is DeviceIdentity {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DeviceIdentity>;
  return (
    typeof candidate.deviceKeyId === 'string' &&
    typeof candidate.publicKeyB64 === 'string' &&
    typeof candidate.privateKey === 'object' &&
    candidate.privateKey !== null
  );
}

export async function loadDeviceIdentity(): Promise<DeviceIdentity | null> {
  const row = await db.license.get(ROW_KEY);
  return isDeviceIdentity(row?.value) ? row.value : null;
}

/** اگر هویتی ذخیره شده باشد همان را برمی‌گرداند؛ وگرنه یک کلید جدید می‌سازد. */
export async function ensureDeviceIdentity(): Promise<DeviceIdentity> {
  const existing = await loadDeviceIdentity();
  if (existing) return existing;

  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('webcrypto_missing');
  let pair: CryptoKeyPair;
  try {
    pair = await subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify']);
  } catch {
    throw new Error('ed25519_unsupported');
  }
  const raw = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
  const identity: DeviceIdentity = {
    deviceKeyId: crypto.randomUUID().toLowerCase(),
    privateKey: pair.privateKey,
    publicKeyB64: bytesToBase64Url(raw),
    createdAt: new Date().toISOString(),
  };
  await db.license.put({ key: ROW_KEY, value: identity });
  return identity;
}
