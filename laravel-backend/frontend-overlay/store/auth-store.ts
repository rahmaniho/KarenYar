/**
 * استور احراز هویت — نشست لاراول.
 *
 * مدیر کل و کاربران فروشگاه هر دو با ایمیل/رمز وارد می‌شوند. نقش و فروشگاه
 * کاربر از سرور خوانده می‌شود و لایسنس فروشگاه همراه آن برمی‌گردد.
 */
import { create } from 'zustand';
import { apiFetch, ApiError } from '@/core/api/client';
import { serverDb } from '@/core/db/db';

export type LicenseTier = 'pro' | 'proplus';

export interface StoreLicense {
  id: number;
  store_id: number;
  tier: LicenseTier;
  plan_code?: string | null;
  seats?: number;
  status?: string;
  is_lifetime: boolean;
  is_active: boolean;
  is_trial?: boolean;
  starts_at: string | null;
  expires_at: string | null;
  notes: string | null;
  is_valid: boolean;
  is_expired: boolean;
  days_remaining: number | null;
}

export interface AuthStore {
  id: number;
  name: string;
  slug: string;
  owner_name: string | null;
  phone: string | null;
  address: string | null;
  is_active: boolean;
  /** فروشگاه آزمایشیِ کوتاه‌عمر (دمو) */
  is_demo?: boolean;
  demo_expires_at?: string | null;
  license: StoreLicense | null;
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: 'manager' | 'store';
  store_id: number | null;
  is_active: boolean;
  store: AuthStore | null;
}

interface AuthState {
  user: AuthUser | null;
  ready: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string, remember?: boolean) => Promise<AuthUser>;
  logout: () => Promise<void>;
  /** ساخت دموی کوتاه‌عمر و ورود فوری (بدون پرداخت جعلی). */
  demoLogin: () => Promise<AuthUser>;
  /** پایان دمو و پاک شدن کامل دادهٔ آن. */
  endDemo: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  ready: false,
  loading: false,

  refresh: async () => {
    try {
      const response = await apiFetch<{ user: AuthUser }>('/api/me');
      set({ user: response.user, ready: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        set({ user: null, ready: true });
        return;
      }
      // خطای شبکه/سرور: کاربر را نامعلوم نگه می‌داریم ولی صفحه را قفل نمی‌کنیم.
      set({ ready: true });
    }
  },

  login: async (email, password, remember = false) => {
    set({ loading: true });
    try {
      const response = await apiFetch<{ user: AuthUser }>('/api/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, remember }),
      });
      serverDb?.reset();
      set({ user: response.user, ready: true, loading: false });
      return response.user;
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  logout: async () => {
    try {
      await apiFetch('/api/logout', { method: 'POST' });
    } catch {
      // خروج حتی با خطای شبکه هم باید در سمت کلاینت انجام شود.
    }
    serverDb?.reset();
    set({ user: null });
  },

  demoLogin: async () => {
    set({ loading: true });
    try {
      const response = await apiFetch<{ user: AuthUser; demo: { expires_at: string; hours: number } }>(
        '/api/demo/session',
        { method: 'POST' },
      );
      serverDb?.reset();
      set({ user: response.user, ready: true, loading: false });
      return response.user;
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  endDemo: async () => {
    try {
      await apiFetch('/api/demo/session', { method: 'DELETE' });
    } finally {
      serverDb?.reset();
      set({ user: null, ready: true, loading: false });
    }
  },
}));
