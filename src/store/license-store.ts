/**
 * استور لایسنس — کلید در جدول license دیتابیس Dexie نگهداری و هنگام اجرا دوباره راستی‌آزمایی می‌شود.
 */
import { create } from 'zustand';
import { db } from '@/core/db/db';
import {
  FREE_LICENSE_INFO,
  licenseVerifier,
  tierHasFeature,
  type Feature,
  type LicenseInfo,
} from '@/core/license/license-core';

const LICENSE_ROW_KEY = 'current';

interface LicenseState {
  info: LicenseInfo;
  ready: boolean;
  init: () => Promise<void>;
  activate: (key: string) => Promise<LicenseInfo>;
  deactivate: () => Promise<void>;
  can: (feature: Feature) => boolean;
}

export const useLicenseStore = create<LicenseState>()((set, get) => ({
  info: FREE_LICENSE_INFO,
  ready: false,
  init: async () => {
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
  },
  activate: async (key) => {
    const info = await licenseVerifier.verify(key); // در صورت خطا LicenseError پرتاب می‌شود
    await db.license.put({ key: LICENSE_ROW_KEY, value: key.trim() });
    set({ info, ready: true });
    return info;
  },
  deactivate: async () => {
    await db.license.delete(LICENSE_ROW_KEY);
    set({ info: FREE_LICENSE_INFO, ready: true });
  },
  can: (feature) => tierHasFeature(get().info.tier, feature),
}));
