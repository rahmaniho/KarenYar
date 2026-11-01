import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/core/db/db';

import {
  installTestCrypto,
  makeTestIssuer,
  makeTestSession,
  TEST_AUDIENCE,
  TEST_DEVICE_KEY_ID,
  TEST_ISSUER,
  TEST_ISSUER_KEY_ID,
  type TestIssuer,
} from '@/tests/license-fixtures';
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

const DEVICE_KEY_ID = TEST_DEVICE_KEY_ID;
const SESSION_ROW_KEY = 'server-license-session';
let issuer: TestIssuer;

beforeAll(installTestCrypto);

async function makeSession(plan = 'pro'): Promise<LicenseSession> {
  return makeTestSession(issuer, { plan });
}

async function loadStore() {
  vi.resetModules();
  const module = await import('./license-store');
  return module.useLicenseStore;
}

beforeEach(async () => {
  issuer = await makeTestIssuer();
  vi.stubEnv('VITE_LICENSE_ISSUER', TEST_ISSUER);
  vi.stubEnv('VITE_LICENSE_AUDIENCE', TEST_AUDIENCE);
  vi.stubEnv('VITE_LICENSE_ISSUER_KEY_ID', TEST_ISSUER_KEY_ID);
  vi.stubEnv('VITE_LICENSE_ISSUER_PUBLIC_KEY', issuer.publicKeyB64);
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

  it('کلید ناسازگار پاسخ تمدید، نشست معتبر قبلی را جایگزین نمی‌کند', async () => {
    const session = await makeSession();
    activateWithServer.mockResolvedValue(session);
    const store = await loadStore();
    await store.getState().activate('KS-STAGE-TEST');
    refreshWithServer.mockRejectedValue(
      new ServerLicenseError('issuer_key_mismatch', 'issuer_key_mismatch'),
    );
    await store.getState().sync(true);
    expect(store.getState().info.tier).toBe('pro');
    expect(store.getState().statusMessage).toContain('issuer_key_mismatch');
    expect((await db.license.get(SESSION_ROW_KEY))?.value).toEqual(session);
  });

  it('نشست قبلی با کلید واقعی در قالب base64url، بعد از ارتقا هم معتبر است', async () => {
    const session = await makeSession();
    session.issuerPublicKeyB64 = session.issuerPublicKeyB64
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=$/, '');
    await db.license.put({ key: SESSION_ROW_KEY, value: session });
    await db.license.put({ key: 'server-license-ever-activated', value: true });
    const store = await loadStore();
    await store.getState().init();
    await vi.waitFor(() => expect(store.getState().status).toBe('offline'));
    expect(store.getState().info.tier).toBe('pro');
    expect(store.getState().can('backup')).toBe(true);
  });

  it('توکن ذخیره‌شدهٔ منقضی، حتی هنگام قطعی شبکه expired می‌ماند و خروجی باز است', async () => {
    const now = Math.floor(Date.now() / 1000);
    const session = await makeTestSession(issuer, { iat: now - 100, nbf: now - 100, exp: now - 1 });
    await db.license.put({ key: SESSION_ROW_KEY, value: session });
    await db.license.put({ key: 'server-license-ever-activated', value: true });
    const store = await loadStore();
    await store.getState().init();
    await vi.waitFor(() => expect(refreshWithServer).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(store.getState().syncing).toBe(false));
    expect(store.getState().status).toBe('expired');
    expect(store.getState().info.isExpired).toBe(true);
    expect(store.getState().can('backup')).toBe(true);
    expect(store.getState().can('pdf-export')).toBe(true);
  });

  it.each(['foreign key', 'forged key metadata', 'kid', 'issuer', 'audience'])(
    'نشست IndexedDB با %s دست‌کاری‌شده، آفلاین پذیرفته نمی‌شود',
    async (mutation) => {
      let session = await makeSession();
      if (mutation === 'foreign key' || mutation === 'forged key metadata') {
        const attacker = await makeTestIssuer();
        session = await makeTestSession(attacker, { plan: 'proplus' });
        if (mutation === 'forged key metadata') {
          session.issuerPublicKeyB64 = issuer.publicKeyB64;
        }
      } else if (mutation === 'kid') {
        session.kid = 'untrusted-kid';
      } else {
        session = await makeTestSession(issuer, {
          [mutation === 'issuer' ? 'iss' : 'aud']: 'another-service',
        });
      }
      await db.license.put({ key: SESSION_ROW_KEY, value: session });
      await db.license.put({ key: 'server-license-ever-activated', value: true });
      const store = await loadStore();
      await store.getState().init();
      await vi.waitFor(() => expect(refreshWithServer).toHaveBeenCalledOnce());
      await vi.waitFor(() => expect(store.getState().syncing).toBe(false));
      expect(store.getState().info.tier).toBe('free');
      expect(store.getState().status).toBe('error');
      // Trust failures never wipe financial data or remove the right to export it.
      expect(store.getState().everActivated).toBe(true);
      expect(store.getState().can('backup')).toBe(true);
      expect(store.getState().can('pdf-export')).toBe(true);
    },
  );

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
