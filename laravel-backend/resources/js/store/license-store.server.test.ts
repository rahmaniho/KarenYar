import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore, type StoreLicense } from './auth-store';
import { useLicenseStore } from './license-store';

function setStoreLicense(license: StoreLicense | null): void {
  useAuthStore.setState({
    user: {
      id: 1,
      name: 'مدیر فروشگاه',
      email: 'store@test.local',
      role: 'store',
      store_id: 1,
      is_active: true,
      store: {
        id: 1,
        name: 'فروشگاه تست',
        slug: 'store-test',
        owner_name: null,
        phone: null,
        address: null,
        is_active: true,
        license,
      },
    },
    ready: true,
  });
}

function makeLicense(overrides: Partial<StoreLicense> = {}): StoreLicense {
  return {
    id: 1,
    store_id: 1,
    tier: 'pro',
    is_lifetime: true,
    is_active: true,
    starts_at: '2026-01-01T00:00:00Z',
    expires_at: null,
    notes: null,
    is_valid: true,
    is_expired: false,
    days_remaining: null,
    ...overrides,
  };
}

describe('استور لایسنس فروشگاه‌محور', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, ready: true });
  });

  it('بدون لایسنس، نسخه‌ی رایگان و وضعیت none است', () => {
    setStoreLicense(null);
    const state = useLicenseStore.getState();
    expect(state.info.tier).toBe('free');
    expect(state.status).toBe('none');
    expect(state.can('backup')).toBe(false);
    expect(state.can('pdf-export')).toBe(false);
  });

  it('لایسنس مادام‌العمر همه‌ی قابلیت‌ها را فعال می‌کند', () => {
    setStoreLicense(makeLicense({ is_lifetime: true, expires_at: null }));
    const state = useLicenseStore.getState();
    expect(state.info.tier).toBe('pro');
    expect(state.info.holderName).toBe('فروشگاه تست');
    expect(state.info.expiresAt).toBeNull();
    expect(state.isLifetime).toBe(true);
    expect(state.status).toBe('active');
    expect(state.can('pdf-export')).toBe(true);
    expect(state.can('unlimited-products')).toBe(true);
  });

  it('لایسنس زمان‌دار معتبر، معتبر شناخته می‌شود', () => {
    const future = new Date(Date.now() + 30 * 86400_000).toISOString();
    setStoreLicense(makeLicense({ is_lifetime: false, expires_at: future, days_remaining: 30 }));
    const state = useLicenseStore.getState();
    expect(state.info.tier).toBe('pro');
    expect(state.info.isExpired).toBe(false);
    expect(state.can('pdf-export')).toBe(true);
  });

  it('لایسنس منقضی، نسخه را رایگان می‌کند ولی خروجی داده‌ها باز می‌ماند', () => {
    const past = new Date(Date.now() - 86400_000).toISOString();
    setStoreLicense(makeLicense({ is_lifetime: false, expires_at: past, days_remaining: 0 }));
    const state = useLicenseStore.getState();
    expect(state.info.tier).toBe('free');
    expect(state.info.isExpired).toBe(true);
    expect(state.status).toBe('expired');
    // حق دسترسی به داده‌های خود کاربر هرگز قفل نمی‌شود
    expect(state.can('backup')).toBe(true);
    expect(state.can('pdf-export')).toBe(true);
    expect(state.can('unlimited-products')).toBe(false);
  });

  it('لایسنس غیرفعال، وضعیت inactive می‌دهد', () => {
    setStoreLicense(makeLicense({ is_active: false }));
    const state = useLicenseStore.getState();
    expect(state.status).toBe('inactive');
    expect(state.info.tier).toBe('free');
    expect(state.can('backup')).toBe(true);
  });

  it('نزدیک پایان اعتبار، پیام هشدار نمایش می‌دهد', () => {
    const future = new Date(Date.now() + 5 * 86400_000).toISOString();
    setStoreLicense(makeLicense({ is_lifetime: false, expires_at: future, days_remaining: 5 }));
    expect(useLicenseStore.getState().statusMessage).toContain('۵');
  });
});
