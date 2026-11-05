/**
 * استور لایسنس — دو حالت:
 *
 * ۱) آفلاین/دمو (پیش‌فرض): همان کلید HMAC قبلی (KS1) در جدول license.
 * ۲) سروری (فقط وقتی VITE_LICENSE_API_BASE در بیلد ست شده باشد): فعال‌سازی با کد
 *    یک‌بارمصرف، کلید دستگاه Ed25519، توکن کوتاه‌مدت HY2 و تمدید امضاشده.
 *
 * قرارداد مهم: انقضا یا لغو لایسنس هرگز دسترسی به داده‌های خود کاربر و خروجی
 * گرفتن از آن‌ها را نمی‌بندد؛ بعد از اولین فعال‌سازی، پشتیبان‌گیری و PDF همیشه باز می‌مانند.
 */
import { create } from 'zustand';
import { db } from '@/core/db/db';
import {
  FREE_LICENSE_INFO,
  LicenseError,
  licenseVerifier,
  tierHasFeature,
  type Feature,
  type LicenseInfo,
  type LicenseTier,
} from '@/core/license/license-core';
import { getServerLicenseConfig } from '@/core/license/server/config';
import {
  PERMANENT_REJECTION_CODES,
  ServerLicenseError,
  activateWithServer,
  refreshWithServer,
  type LicenseSession,
} from '@/core/license/server/api';
import {
  deviceLabelFromUserAgent,
  ensureDeviceIdentity,
  loadDeviceIdentity,
} from '@/core/license/server/device-identity';
import { verifyLicenseToken } from '@/core/license/server/token';

const LICENSE_ROW_KEY = 'current';
const SESSION_ROW_KEY = 'server-license-session';
const EVER_ACTIVATED_ROW_KEY = 'server-license-ever-activated';
/** حداقل فاصله‌ی دو تمدید خودکار — دکمه‌ی «بررسی آنلاین» این فاصله را نادیده می‌گیرد. */
const MIN_SYNC_INTERVAL_MS = 10 * 60 * 1000;

export type LicenseMode = 'offline' | 'server';
export type ServerLicenseStatus =
  'inactive' | 'active' | 'offline' | 'expired' | 'revoked' | 'error';

interface LicenseState {
  info: LicenseInfo;
  ready: boolean;
  mode: LicenseMode;
  status: ServerLicenseStatus;
  statusMessage: string;
  deviceKeyId: string | null;
  syncing: boolean;
  lastCheckedAt: string | null;
  /** آیا این دستگاه قبلاً لایسنس سروری فعال داشته؟ (حق خروجی‌گرفتن از داده‌ها همیشه می‌ماند) */
  everActivated: boolean;
  init: () => Promise<void>;
  activate: (key: string) => Promise<LicenseInfo>;
  deactivate: () => Promise<void>;
  /** بررسی آنلاین و تمدید توکن با سرور؛ force=true یعنی بدون توجه به فاصله‌ی زمانی */
  sync: (force?: boolean) => Promise<void>;
  can: (feature: Feature) => boolean;
}

const ACTIVATION_ERROR_MESSAGES: Record<string, string> = {
  invalid_activation_code: 'کد فعال‌سازی معتبر نیست یا منقضی شده است. کد جدید بگیرید.',
  device_limit_reached:
    'سقف دستگاه‌های فعال این لایسنس پر شده است. یک دستگاه را از پنل مدیریت لغو کنید.',
  device_revoked: 'این دستگاه قبلاً لغو شده است. برای فعال‌سازی دوباره با پشتیبانی تماس بگیرید.',
  device_already_registered:
    'این دستگاه به لایسنس دیگری متصل است. ابتدا لایسنس قبلی را روی همین دستگاه غیرفعال کنید یا با پشتیبانی تماس بگیرید.',
  device_key_mismatch: 'شناسه‌ی دستگاه با ثبت سرور نمی‌خواند. با پشتیبانی تماس بگیرید.',
  rate_limited: 'تلاش‌های بیش از حد؛ حدود ۱۰ دقیقه صبر کنید و دوباره امتحان کنید.',
};

const PERMANENT_REJECTION_MESSAGES: Record<string, string> = {
  device_or_license_invalid: 'دستگاه یا لایسنس در سرور لغو شده است.',
  license_or_device_not_found: 'لایسنس یا دستگاه در سرور یافت نشد.',
  device_not_active: 'این دستگاه از طرف مدیریت لغو شده است.',
  license_not_active: 'لایسنس از طرف مدیریت غیرفعال شده است.',
  product_not_active: 'محصول در سرور غیرفعال شده است.',
  customer_not_active: 'حساب مشتری در سرور غیرفعال شده است.',
  license_expired: 'اعتبار لایسنس تمام شده است. برای تمدید با فروشنده تماس بگیرید.',
  device_mismatch: 'اطلاعات دستگاه با سرور نمی‌خواند.',
  license_plan_changed: 'پلن لایسنس تغییر کرده است؛ یک بار دیگر بررسی آنلاین کنید.',
};

function cryptoFailureMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  if (code === 'ed25519_unsupported' || code === 'webcrypto_missing') {
    return 'مرورگر شما از کلید امن دستگاه (Ed25519) پشتیبانی نمی‌کند. از نسخه‌ی جدید Chrome استفاده کنید.';
  }
  return 'ساخت کلید امن دستگاه ناموفق بود.';
}

function tierFromPlan(plan: string): LicenseTier {
  return plan === 'pro' || plan === 'proplus' ? plan : 'free';
}

let lastSyncAttempt = 0;
let initPromise: Promise<void> | null = null;

export const useLicenseStore = create<LicenseState>()((set, get) => {
  async function readSession(): Promise<LicenseSession | null> {
    const row = await db.license.get(SESSION_ROW_KEY);
    const value = row?.value as Partial<LicenseSession> | undefined;
    return value && typeof value.token === 'string' && typeof value.kid === 'string'
      ? (value as LicenseSession)
      : null;
  }

  /** امضای توکن ذخیره‌شده را آفلاین بررسی می‌کند و وضعیت را از روی ادعاها می‌سازد. */
  async function applySession(
    session: LicenseSession,
    deviceKeyId: string,
    checkedAt: string | null,
  ): Promise<void> {
    const config = getServerLicenseConfig();
    if (!config) return;
    try {
      const { claims } = await verifyLicenseToken(session.token, {
        publicKeyB64: session.issuerPublicKeyB64,
        kid: session.kid,
        environment: config.environment,
        product: 'hesabyar',
        deviceKeyId,
      });
      const licenseExpiry =
        session.licenseExpiresAt !== undefined
          ? session.licenseExpiresAt
            ? Date.parse(`${session.licenseExpiresAt.replace(' ', 'T')}Z`)
            : null
          : typeof claims.license_exp === 'number'
            ? claims.license_exp * 1000
            : null;
      set({
        info: {
          tier: tierFromPlan(claims.plan),
          holderName: claims.sub,
          issuedAt: new Date(claims.iat * 1000).toISOString(),
          // انقضای خود لایسنس اگر سرور داده باشد؛ وگرنه انقضای توکن کوتاه‌مدت
          expiresAt:
            licenseExpiry !== null && Number.isFinite(licenseExpiry)
              ? new Date(licenseExpiry).toISOString()
              : licenseExpiry === null && session.licenseExpiresAt === null
                ? null
                : new Date(claims.exp * 1000).toISOString(),
          isExpired: false,
        },
        status: 'active',
        statusMessage: '',
        lastCheckedAt: checkedAt,
      });
    } catch (error) {
      const expired = error instanceof LicenseError && error.message.includes('منقضی');
      set({
        info: { ...FREE_LICENSE_INFO, isExpired: expired },
        status: expired ? 'expired' : 'error',
        statusMessage: expired
          ? 'توکن لایسنس منقضی شده است؛ برای تمدید، برنامه را به اینترنت وصل کنید. داده‌های شما دست‌نخورده است.'
          : 'توکن لایسنس قابل تأیید نیست؛ یک بار فعال‌سازی را تکرار کنید. داده‌های شما دست‌نخورده است.',
      });
    }
  }

  async function runInit(): Promise<void> {
    const config = getServerLicenseConfig();
    if (!config) {
      // —— حالت آفلاین/دمو: رفتار قبلی بدون تغییر ——
      try {
        const row = await db.license.get(LICENSE_ROW_KEY);
        const key = typeof row?.value === 'string' ? row.value : null;
        if (key) {
          const info = await licenseVerifier.verify(key);
          set({ info, ready: true });
          return;
        }
      } catch {
        // کلید ذخیره‌شده نامعتبر/منقضی است → نسخه‌ی رایگان
      }
      set({ info: FREE_LICENSE_INFO, ready: true });
      return;
    }

    // —— حالت سروری ——
    try {
      const [device, session, ever] = await Promise.all([
        loadDeviceIdentity(),
        readSession(),
        db.license.get(EVER_ACTIVATED_ROW_KEY),
      ]);
      set({ deviceKeyId: device?.deviceKeyId ?? null, everActivated: ever?.value === true });
      if (session && device) {
        await applySession(session, device.deviceKeyId, null);
      } else if (session && !device) {
        // توکن بدون کلید دستگاه قابل استفاده نیست
        await db.license.delete(SESSION_ROW_KEY);
      }
    } catch {
      set({
        info: FREE_LICENSE_INFO,
        status: 'error',
        statusMessage: 'خواندن اطلاعات لایسنس از حافظه‌ی دستگاه ناموفق بود.',
      });
    }
    set({ ready: true });
    // تمدید/بررسی آنلاین در پس‌زمینه؛ رابط کاربری معطل شبکه نمی‌ماند
    void get().sync();
  }

  return {
    info: FREE_LICENSE_INFO,
    ready: false,
    mode: getServerLicenseConfig() ? 'server' : 'offline',
    status: 'inactive',
    statusMessage: '',
    deviceKeyId: null,
    syncing: false,
    lastCheckedAt: null,
    everActivated: false,

    init: () => {
      if (!initPromise) initPromise = runInit();
      return initPromise;
    },

    activate: async (input) => {
      const config = getServerLicenseConfig();
      if (!config) {
        const info = await licenseVerifier.verify(input);
        await db.license.put({ key: LICENSE_ROW_KEY, value: input.trim() });
        set({ info, ready: true });
        return info;
      }

      const code = input.trim();
      if (!code || code.length > 128) {
        throw new LicenseError('کد فعال‌سازی را کامل وارد کنید.');
      }
      let device;
      try {
        device = await ensureDeviceIdentity();
      } catch (error) {
        throw new LicenseError(cryptoFailureMessage(error));
      }
      set({ deviceKeyId: device.deviceKeyId });

      let session: LicenseSession;
      try {
        const label = deviceLabelFromUserAgent(
          typeof navigator === 'undefined' ? '' : navigator.userAgent,
        );
        session = await activateWithServer(config, code, device, label);
      } catch (error) {
        if (error instanceof ServerLicenseError) {
          throw new LicenseError(
            ACTIVATION_ERROR_MESSAGES[error.code] ?? `فعال‌سازی ناموفق بود (${error.code}).`,
          );
        }
        throw error;
      }

      const now = new Date().toISOString();
      await db.license.put({ key: SESSION_ROW_KEY, value: session });
      await db.license.put({ key: EVER_ACTIVATED_ROW_KEY, value: true });
      set({ everActivated: true });
      await applySession(session, device.deviceKeyId, now);
      lastSyncAttempt = Date.now();
      return get().info;
    },

    deactivate: async () => {
      const config = getServerLicenseConfig();
      if (!config) {
        await db.license.delete(LICENSE_ROW_KEY);
        set({ info: FREE_LICENSE_INFO, ready: true });
        return;
      }
      // فقط لایسنس از این دستگاه حذف می‌شود؛ کلید دستگاه می‌ماند تا فعال‌سازی
      // دوباره‌ی همان لایسنس، دستگاه جدید مصرف نکند. لغو دستگاه در سرور با پنل ادمین است.
      await db.license.delete(SESSION_ROW_KEY);
      set({
        info: FREE_LICENSE_INFO,
        status: 'inactive',
        statusMessage: '',
        lastCheckedAt: null,
        ready: true,
      });
    },

    sync: async (force = false) => {
      const config = getServerLicenseConfig();
      if (!config || get().syncing) return;
      const session = await readSession();
      if (!session) return;
      if (!force && Date.now() - lastSyncAttempt < MIN_SYNC_INTERVAL_MS) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        if (get().status === 'active') {
          set({
            status: 'offline',
            statusMessage: 'آفلاین هستید؛ لایسنس تا پایان اعتبار توکن کار می‌کند.',
          });
        }
        return;
      }
      set({ syncing: true });
      lastSyncAttempt = Date.now();
      try {
        const device = await loadDeviceIdentity();
        if (!device) {
          await db.license.delete(SESSION_ROW_KEY);
          set({ info: FREE_LICENSE_INFO, status: 'inactive', statusMessage: '' });
          return;
        }
        const fresh = await refreshWithServer(config, device);
        const now = new Date().toISOString();
        await db.license.put({ key: SESSION_ROW_KEY, value: fresh });
        await applySession(fresh, device.deviceKeyId, now);
      } catch (error) {
        const code = error instanceof ServerLicenseError ? error.code : null;
        if (code && PERMANENT_REJECTION_CODES.has(code)) {
          await db.license.delete(SESSION_ROW_KEY);
          const expired = code === 'license_expired';
          set({
            info: { ...FREE_LICENSE_INFO, isExpired: expired },
            status: expired ? 'expired' : 'revoked',
            statusMessage: `${PERMANENT_REJECTION_MESSAGES[code] ?? 'لایسنس دیگر معتبر نیست.'} داده‌های شما دست‌نخورده است و خروجی گرفتن همیشه باز است.`,
            lastCheckedAt: new Date().toISOString(),
          });
        } else if (code === 'network_error') {
          if (get().status === 'active') {
            set({
              status: 'offline',
              statusMessage: 'ارتباط با سرور برقرار نشد؛ لایسنس تا پایان اعتبار توکن کار می‌کند.',
            });
          }
        } else if (get().status === 'active') {
          // خطای موقت سرور (مثل rate_limited) لایسنس معتبر را نمی‌بندد
          set({
            statusMessage: `بررسی آنلاین موقتاً ناموفق بود (${code ?? 'unknown'})؛ تلاش بعدی خودکار است.`,
          });
        }
      } finally {
        set({ syncing: false });
      }
    },

    can: (feature) => {
      const state = get();
      // حق دسترسی به داده‌های خود کاربر: بعد از اولین فعال‌سازی، پشتیبان‌گیری و
      // خروجی PDF حتی پس از انقضا/لغو برای همیشه باز می‌ماند.
      if (
        state.mode === 'server' &&
        state.everActivated &&
        (feature === 'backup' || feature === 'pdf-export')
      ) {
        return true;
      }
      return tierHasFeature(state.info.tier, feature);
    },
  };
});
