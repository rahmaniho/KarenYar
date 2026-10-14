import { createHmac, webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  HmacLicenseVerifier,
  LicenseError,
  isPayloadExpired,
  parseLicenseKey,
  tierHasFeature,
  type LicensePayload,
} from './license-core';

// در محیط تست (jsdom) ممکن است WebCrypto کامل نباشد؛ از پیاده‌سازی Node استفاده می‌کنیم.
beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  }
});

const SECRET = 'karensoft-hesabyar::license-secret::v1::CHANGE-ME';

function mintKey(payload: LicensePayload, secret: string = SECRET): string {
  const b64url = (buf: Buffer | string) =>
    Buffer.from(buf).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  const payloadB64 = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', secret).update(payloadB64).digest();
  return `KS1.${payloadB64}.${b64url(sig)}`;
}

const verifier = new HmacLicenseVerifier();

describe('لایسنس آفلاین', () => {
  it('کلید معتبر حرفه‌ای تأیید می‌شود', async () => {
    const key = mintKey({ v: 1, tier: 'pro', name: 'فروشگاه تست', iat: '2025-01-01', exp: null });
    const info = await verifier.verify(key);
    expect(info.tier).toBe('pro');
    expect(info.holderName).toBe('فروشگاه تست');
    expect(info.isExpired).toBe(false);
  });

  it('کلید دست‌کاری‌شده رد می‌شود', async () => {
    const key = mintKey({ v: 1, tier: 'pro', name: 'تست', iat: '2025-01-01', exp: null });
    const tampered = key.slice(0, -3) + 'AAA';
    await expect(verifier.verify(tampered)).rejects.toThrow(LicenseError);
  });

  it('کلید با امضای اشتباه رد می‌شود', async () => {
    const key = mintKey({ v: 1, tier: 'proplus', name: 'تست', iat: '2025-01-01', exp: null }, 'secret-دیگر');
    await expect(verifier.verify(key)).rejects.toThrow('امضای کلید معتبر نیست');
  });

  it('قالب نامعتبر پیام فارسی دارد', async () => {
    await expect(verifier.verify('hello-world')).rejects.toThrow('قالب کلید لایسنس معتبر نیست');
    expect(() => parseLicenseKey('KS1.@@@.@@@')).toThrow(LicenseError);
  });

  it('لایسنس منقضی به سطح رایگان برمی‌گردد', async () => {
    const key = mintKey({ v: 1, tier: 'proplus', name: 'تست', iat: '2020-01-01', exp: '2020-12-31' });
    const info = await verifier.verify(key);
    expect(info.isExpired).toBe(true);
    expect(info.tier).toBe('free');
  });

  it('تشخیص انقضا برای مادام‌العمر همیشه false است', () => {
    expect(isPayloadExpired({ v: 1, tier: 'pro', name: 'x', iat: '2020-01-01', exp: null })).toBe(false);
  });
});

describe('گیت قابلیت‌ها بر اساس سطح', () => {
  it('رایگان هیچ قابلیت ویژه‌ای ندارد', () => {
    expect(tierHasFeature('free', 'pdf-export')).toBe(false);
    expect(tierHasFeature('free', 'backup')).toBe(false);
    expect(tierHasFeature('free', 'unlimited-products')).toBe(false);
  });

  it('حرفه‌ای و Pro+ همه‌ی قابلیت‌ها را دارند', () => {
    for (const tier of ['pro', 'proplus'] as const) {
      expect(tierHasFeature(tier, 'pdf-export')).toBe(true);
      expect(tierHasFeature(tier, 'backup')).toBe(true);
      expect(tierHasFeature(tier, 'unlimited-transactions')).toBe(true);
    }
  });
});
