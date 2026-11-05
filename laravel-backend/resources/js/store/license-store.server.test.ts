import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/core/db/db';

import { bytesToBase64Url } from '@/core/license/server/token';
import { ServerLicenseError, type LicenseSession } from '@/core/license/server/api';

vi.mock('@/core/license/server/device-identity', () => ({
  deviceLabelFromUserAgent: () => 'حساب‌یار وب — تست',
  loadDeviceIdentity: vi.fn(async () => ({
    deviceKeyId: DEVICE_KEY_ID,
    privateKey: {} as CryptoKey,
    publicKeyB64: 'public',
    createdAt: '2026-11-01T00:00:00.000Z',
  })),
  ensureDeviceIdentity: vi.fn(async () => ({
    deviceKeyId: DEVICE_KEY_ID,
    privateKey: {} as CryptoKey,
    publicKeyB64: 'public',
    createdAt: '2026-11-01T00:00:00.000Z',
  })),
}));

const activateWithServer = vi.fn();
const refreshWithServer = vi.fn();

vi.mock('@/core/license/server/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/license/server/api')>();
  return {
    ...actual,
    activateWithServer: (...args: unknown[]) => activateWithServer(...args),
    refreshWithServer: (...args: unknown[]) => refreshWithServer(...args),
  };
});

const DEVICE_KEY_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ROW_KEY = 'server-license-session';

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  }
});

async function makeSession(plan = 'pro'): Promise<LicenseSession> {
  const pair = (await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const raw = new Uint8Array(await webcrypto.subtle.exportKey('raw', pair.publicKey));
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'EdDSA', typ: 'hesabyar-license', kid: 'k1', env: 'staging' };
  const claims = {
    iss: 'karen-license-staging',
    aud: 'hesabyar-app',
    env: 'staging',
    sub: 'STAGING-CUSTOMER-001',
    jti: 'license-1',
    product: 'hesabyar',
    plan,
    features: ['backup', 'pdf-export'],
    device_key_id: DEVICE_KEY_ID,
    device_id: 1,
    max_devices: 2,
    iat: now,
    nbf: now,
    exp: now + 7 * 86400,
  };
  const h = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(header)));
  const c = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
  const sig = await webcrypto.subtle.sign(
    { name: 'Ed25519' },
    pair.privateKey,
    new TextEncoder().encode(`${h}.${c}`),
  );
  return {
    token: `HY2.${h}.${c}.${bytesToBase64Url(new Uint8Array(sig))}`,
    kid: 'k1',
    issuerPublicKeyB64: bytesToBase64Url(raw),
    updatedAt: new Date().toISOString(),
  };
}

async function loadStore() {
  vi.resetModules();
  const module = await import('./license-store');
  return module.useLicenseStore;
}

beforeEach(async () => {
  vi.stubEnv('VITE_LICENSE_API_BASE', 'https://staging.example/v1');
  vi.stubEnv('VITE_LICENSE_ENV', 'staging');
  await db.license.clear();
  activateWithServer.mockReset();
  refreshWithServer.mockReset();
  refreshWithServer.mockRejectedValue(new ServerLicenseError('network_error', 'offline'));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('استور لایسنس سروری', () => {
  it('فعال‌سازی موفق پلن را اعمال و نشست را ذخیره می‌کند', async () => {
    activateWithServer.mockResolvedValue(await makeSession('pro'));
    const store = await loadStore();
    const info = await store.getState().activate('KS-STAGE-TEST');
    expect(info.tier).toBe('pro');
    expect(store.getState().status).toBe('active');
    expect(store.getState().everActivated).toBe(true);
    expect(await db.license.get(SESSION_ROW_KEY)).toBeTruthy();
  });

  it('خطای سقف دستگاه پیام فارسی actionable می‌دهد', async () => {
    activateWithServer.mockRejectedValue(
      new ServerLicenseError('device_limit_reached', 'device_limit_reached'),
    );
    const store = await loadStore();
    await expect(store.getState().activate('KS-STAGE-TEST')).rejects.toThrow('سقف دستگاه');
    expect(await db.license.get(SESSION_ROW_KEY)).toBeUndefined();
  });

  it('کد خالی به سرور ارسال نمی‌شود', async () => {
    const store = await loadStore();
    await expect(store.getState().activate('   ')).rejects.toThrow(
      'کد فعال‌سازی را کامل وارد کنید',
    );
    expect(activateWithServer).not.toHaveBeenCalled();
  });

  it('لغو دستگاه نشست را پاک می‌کند ولی حق خروجی داده‌ها را نگه می‌دارد', async () => {
    activateWithServer.mockResolvedValue(await makeSession('pro'));
    const store = await loadStore();
    await store.getState().activate('KS-STAGE-TEST');
    refreshWithServer.mockRejectedValue(
      new ServerLicenseError('device_not_active', 'device_not_active'),
    );
    await store.getState().sync(true);
    expect(store.getState().status).toBe('revoked');
    expect(store.getState().info.tier).toBe('free');
    expect(await db.license.get(SESSION_ROW_KEY)).toBeUndefined();
    // داده‌های خود کاربر هرگز قفل نمی‌شوند
    expect(store.getState().can('backup')).toBe(true);
    expect(store.getState().can('pdf-export')).toBe(true);
    expect(store.getState().can('unlimited-products')).toBe(false);
  });

  it('انقضای لایسنس وضعیت expired می‌دهد و پشتیبان‌گیری باز می‌ماند', async () => {
    activateWithServer.mockResolvedValue(await makeSession('pro'));
    const store = await loadStore();
    await store.getState().activate('KS-STAGE-TEST');
    refreshWithServer.mockRejectedValue(
      new ServerLicenseError('license_expired', 'license_expired'),
    );
    await store.getState().sync(true);
    expect(store.getState().status).toBe('expired');
    expect(store.getState().info.isExpired).toBe(true);
    expect(store.getState().can('backup')).toBe(true);
  });

  it('قطعی شبکه لایسنس معتبر را نمی‌بندد', async () => {
    activateWithServer.mockResolvedValue(await makeSession('pro'));
    const store = await loadStore();
    await store.getState().activate('KS-STAGE-TEST');
    refreshWithServer.mockRejectedValue(new ServerLicenseError('network_error', 'network_error'));
    await store.getState().sync(true);
    expect(store.getState().info.tier).toBe('pro');
    expect(store.getState().status).toBe('offline');
  });

  it('خطای موقت سرور مثل rate_limited پلن را حذف نمی‌کند', async () => {
    activateWithServer.mockResolvedValue(await makeSession('pro'));
    const store = await loadStore();
    await store.getState().activate('KS-STAGE-TEST');
    refreshWithServer.mockRejectedValue(new ServerLicenseError('rate_limited', 'rate_limited'));
    await store.getState().sync(true);
    expect(store.getState().info.tier).toBe('pro');
    expect(store.getState().statusMessage).toContain('rate_limited');
  });

  it('غیرفعال‌سازی دستی فقط نشست را پاک می‌کند، نه هویت دستگاه را', async () => {
    activateWithServer.mockResolvedValue(await makeSession('pro'));
    const store = await loadStore();
    await store.getState().activate('KS-STAGE-TEST');
    const identity = { deviceKeyId: DEVICE_KEY_ID, publicKeyB64: 'public' };
    await db.license.put({ key: 'server-device-identity', value: identity });
    await store.getState().deactivate();
    expect((await db.license.get('server-device-identity'))?.value).toEqual(identity);
    expect((await db.license.get('server-license-ever-activated'))?.value).toBe(true);
    expect(store.getState().info.tier).toBe('free');
    expect(store.getState().status).toBe('inactive');
    expect(await db.license.get(SESSION_ROW_KEY)).toBeUndefined();
    expect(store.getState().deviceKeyId).toBe(DEVICE_KEY_ID);
    // فعال‌سازی دوباره همان دستگاه را مصرف می‌کند، نه دستگاه جدید
    await store.getState().activate('KS-STAGE-TEST');
    expect(store.getState().deviceKeyId).toBe(DEVICE_KEY_ID);
  });
});

describe('استور لایسنس در بیلد بدون سرور', () => {
  it('حالت آفلاین باقی می‌ماند و کلید KS1 را می‌پذیرد', async () => {
    vi.stubEnv('VITE_LICENSE_API_BASE', '');
    const store = await loadStore();
    expect(store.getState().mode).toBe('offline');
    await store.getState().init();
    expect(store.getState().info.tier).toBe('free');
    expect(store.getState().can('backup')).toBe(false);
  });
});
