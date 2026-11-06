import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  summary: {} as Record<string, unknown>,
  checkout: {} as Record<string, unknown>,
  reject: false,
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const refresh = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('sonner', () => ({ toast }));

vi.mock('@/store/auth-store', () => ({
  useAuthStore: Object.assign(() => null, { getState: () => ({ refresh }) }),
}));

vi.mock('@/core/api/client', () => ({
  ApiError: class ApiError extends Error {
    errors?: Record<string, string[]>;
  },
  apiFetch: vi.fn(async (path: string) => {
    if (state.reject) throw new Error('boom');
    if (path === '/api/billing/checkout') return state.checkout;
    return state.summary;
  }),
}));

import { BillingPanel } from './BillingPanel';

function summary(overrides: Record<string, unknown> = {}) {
  return {
    license: {
      id: 1,
      store_id: 7,
      tier: 'pro',
      is_lifetime: false,
      is_active: true,
      is_trial: false,
      starts_at: '2026-10-01T00:00:00+03:30',
      expires_at: '2026-11-20T00:00:00+03:30',
      notes: null,
      is_valid: true,
      is_expired: false,
      days_remaining: 14,
    },
    orders: [],
    plans: [
      {
        key: 'pro_monthly',
        label: 'حرفه‌ای — ماهانه',
        tier: 'pro',
        months: 1,
        amount: 490_000,
        is_lifetime: false,
        description: 'یک ماه',
      },
      {
        key: 'lifetime',
        label: 'مادام‌العمر',
        tier: 'proplus',
        months: null,
        amount: 24_900_000,
        is_lifetime: true,
        description: 'بدون انقضا',
      },
    ],
    gateways: [{ key: 'manual', label: 'کارت به کارت' }],
    pending_order: null,
    currency: 'toman',
    currency_label: 'تومان',
    trial_days: 14,
    ...overrides,
  };
}

describe('BillingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.reject = false;
    state.summary = summary();
    state.checkout = { order: { id: 12 }, redirect_url: null, instructions: null };
    window.history.replaceState({}, '', '/');
  });

  it('وضعیت اشتراک و پلن‌ها را با قیمت تومانی نشان می‌دهد', async () => {
    render(<BillingPanel />);

    expect(await screen.findByText('حرفه‌ای — ماهانه')).toBeInTheDocument();
    expect(screen.getAllByText('مادام‌العمر').length).toBeGreaterThan(0);
    expect(screen.getByText(/اشتراک فعال است/)).toBeInTheDocument();
    expect(screen.getAllByText(/تومان/).length).toBeGreaterThan(0);
  });

  it('کارت‌به‌کارت را به سرور می‌فرستد و اطلاعات واریز را نشان می‌دهد', async () => {
    state.checkout = {
      order: { id: 12, status: 'pending' },
      redirect_url: null,
      instructions: 'به نام: کارو — شماره کارت: 6037-0000-0000-0000 — مبلغ: 490,000 تومان',
    };

    render(<BillingPanel />);
    const buttons = await screen.findAllByRole('button', { name: 'تمدید / ارتقا' });

    fireEvent.click(buttons[0]);

    await waitFor(() => {
      expect(screen.getByText('اطلاعات واریز')).toBeInTheDocument();
    });
    expect(screen.getByText(/6037-0000/)).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalled();
  });

  it('اگر درگاه آدرس هدایت بدهد، کاربر را هدایت می‌کند', async () => {
    const onRedirect = vi.fn();
    state.checkout = {
      order: { id: 13, status: 'pending' },
      redirect_url: 'https://pay.test/13',
      instructions: null,
    };

    render(<BillingPanel onRedirect={onRedirect} />);
    const buttons = await screen.findAllByRole('button', { name: 'تمدید / ارتقا' });

    fireEvent.click(buttons[0]);

    await waitFor(() => {
      expect(onRedirect).toHaveBeenCalledWith('https://pay.test/13');
    });
  });

  it('بازگشت موفق از درگاه را به کاربر اطلاع می‌دهد', async () => {
    window.history.replaceState({}, '', '/settings?payment=success&order=12#license');

    render(<BillingPanel />);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('پرداخت با موفقیت ثبت شد و اشتراک تمدید شد.');
    });
    expect(refresh).toHaveBeenCalled();
    expect(window.location.search).toBe('');
  });

  it('سابقهٔ سفارش‌ها را با وضعیت فارسی نشان می‌دهد', async () => {
    state.summary = summary({
      orders: [
        {
          id: 9,
          plan: 'pro_monthly',
          plan_label: 'حرفه‌ای — ماهانه',
          tier: 'pro',
          months: 1,
          is_lifetime: false,
          amount: 490_000,
          status: 'paid',
          gateway: 'manual',
          reference_id: 'REF-9',
          paid_at: '2026-11-01T10:00:00+03:30',
          created_at: '2026-11-01T09:55:00+03:30',
        },
      ],
    });

    render(<BillingPanel />);

    expect(await screen.findByText('پرداخت‌شده')).toBeInTheDocument();
    expect(screen.getByText('REF-9')).toBeInTheDocument();
  });

  it('خطای شبکه را نمایش می‌دهد', async () => {
    state.reject = true;

    render(<BillingPanel />);

    await waitFor(() => {
      expect(screen.getByText('ارتباط با سرور برقرار نشد. دوباره تلاش کنید.')).toBeInTheDocument();
    });
  });
});
