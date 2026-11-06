/**
 * استور لایسنس — لایسنس فروشگاه‌محور.
 *
 * لایسنس از طرف مدیر کل برای هر فروشگاه تعریف می‌شود (زمان‌دار یا مادام‌العمر)
 * و همراه اطلاعات کاربر در `/api/me` برمی‌گردد. این استور همان خروجی لایسنس را
 * به قابلیت‌های برنامه نگاشت می‌کند.
 *
 * قرارداد امنیتی: انقضا یا لغو لایسنس هرگز دسترسی به داده‌های خود کاربر و
 * خروجی گرفتن از آن‌ها را نمی‌بندد.
 */
import { create } from 'zustand';
import { toFaDigits } from '@/core/currency/currency';
import {
  FREE_LICENSE_INFO,
  tierHasFeature,
  type Feature,
  type LicenseInfo,
  type LicenseTier,
} from '@/core/license/license-core';
import { useAuthStore, type StoreLicense } from './auth-store';

export type StoreLicenseStatus = 'active' | 'expired' | 'inactive' | 'none';

interface LicenseState {
  info: LicenseInfo;
  ready: boolean;
  license: StoreLicense | null;
  status: StoreLicenseStatus;
  statusMessage: string;
  isLifetime: boolean;
  everActivated: boolean;
  refresh: () => Promise<void>;
  can: (feature: Feature) => boolean;
}

interface Derived {
  info: LicenseInfo;
  license: StoreLicense | null;
  status: StoreLicenseStatus;
  statusMessage: string;
  isLifetime: boolean;
  everActivated: boolean;
}

function deriveLicenseState(): Derived {
  const user = useAuthStore.getState().user;
  const license = user?.store?.license ?? null;
  const storeName = user?.store?.name ?? null;

  if (!license) {
    return {
      info: FREE_LICENSE_INFO,
      license: null,
      status: 'none',
      statusMessage:
        'برای این فروشگاه هنوز لایسنسی تعریف نشده است. برای فعال‌سازی با مدیر تماس بگیرید.',
      isLifetime: false,
      everActivated: false,
    };
  }

  const expired =
    !license.is_lifetime &&
    license.expires_at !== null &&
    new Date(license.expires_at).getTime() < Date.now();
  const active = license.is_active && (license.is_lifetime || !expired);
  const tier: LicenseTier = active ? license.tier : 'free';

  const info: LicenseInfo = {
    tier,
    holderName: storeName,
    issuedAt: license.starts_at,
    expiresAt: license.is_lifetime ? null : license.expires_at,
    isExpired: expired,
  };

  let status: StoreLicenseStatus = 'active';
  let statusMessage = license.is_lifetime
    ? 'لایسنس مادام‌العمر این فروشگاه فعال است.'
    : 'لایسنس این فروشگاه فعال است.';

  if (!license.is_active) {
    status = 'inactive';
    statusMessage = 'لایسنس این فروشگاه از طرف مدیر غیرفعال شده است. داده‌های شما محفوظ است.';
  } else if (expired) {
    status = 'expired';
    statusMessage = 'اعتبار لایسنس این فروشگاه به پایان رسیده است. برای تمدید با مدیر تماس بگیرید.';
  } else if (
    !license.is_lifetime &&
    license.days_remaining !== null &&
    license.days_remaining <= 14
  ) {
    statusMessage = `اعتبار لایسنس تا ${toFaDigits(String(license.days_remaining))} روز دیگر به پایان می‌رسد.`;
  }

  return {
    info,
    license,
    status,
    statusMessage,
    isLifetime: license.is_lifetime,
    everActivated: true,
  };
}

export const useLicenseStore = create<LicenseState>()((set, get) => ({
  ...deriveLicenseState(),
  ready: true,

  refresh: async () => {
    await useAuthStore.getState().refresh();
    set({ ...deriveLicenseState(), ready: true });
  },

  can: (feature) => {
    const state = get();
    // داده‌های خود کاربر و خروجی گرفتن از آن‌ها هرگز قفل نمی‌شود.
    if (state.everActivated && (feature === 'backup' || feature === 'pdf-export')) {
      return true;
    }
    return tierHasFeature(state.info.tier, feature);
  },
}));

// با هر تغییر در احراز هویت (ورود/خروج/تمدید لایسنس) وضعیت لایسنس بازمحاسبه می‌شود.
useAuthStore.subscribe(() => {
  useLicenseStore.setState({ ...deriveLicenseState(), ready: true });
});
