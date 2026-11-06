import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ checkout: {} as Record<string, unknown> }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const refresh = vi.hoisted(() => vi.fn(async () => undefined));
const apiFetch = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({ toast }));

vi.mock('@/store/auth-store', () => ({
  useAuthStore: Object.assign(() => null, { getState: () => ({ refresh }) }),
}));

vi.mock('@/core/api/client', () => ({
  ApiError: class ApiError extends Error {},
  apiFetch,
}));

import { SubscriptionPage } from './SubscriptionPage';

const plans = [
  {
    code: 'basic',
    name: 'پایه',
    tier: 'pro',
    description: null,
    base_monthly: 30_000,
    extra_user_monthly: 15_000,
    min_seats: 1,
    max_seats: 50,
    is_lifetime: false,
    is_active: true,
    features: ['فاکتور فروش'],
  },
  {
    code: 'pro',
    name: 'حرفه‌ای',
    tier: 'pro',
    description: null,
    base_monthly: 60_000,
    extra_user_monthly: 15_000,
    min_seats: 1,
    max_seats: 50,
    is_lifetime: false,
    is_active: true,
    features: ['گزارش تحلیلی'],
  },
  {
    code: 'proplus',
    name: 'حرفه‌ای پلاس',
    tier: 'proplus',
    description: null,
    base_monthly: 120_000,
    extra_user_monthly: 20_000,
    min_seats: 1,
    max_seats: 50,
    is_lifetime: false,
    is_active: true,
    features: ['دستمزد'],
  },
];

function summary() {
  return {
    license: null,
    usage: { used: 1, allowed: 2, remaining: 1, can_add: true },
    orders: [],
    invoices: [],
    plans,
    gateways: [{ key: 'manual', label: 'کارت به کارت' }],
    allowed_months: [1, 2, 3, 4, 6, 9, 12, 18, 24],
    currency: 'toman',
    currency_label: 'تومان',
    trial_days: 14,
    pending_order: null,
  };
}

describe('SubscriptionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/subscription');
    state.checkout = {
      order: { id: 7, amount: 1_440_000, status: 'pending' },
      redirect_url: 'https://pay.test/7',
      instructions: null,
    };
    apiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/subscription/checkout') return state.checkout;
      if (path.startsWith('/api/subscription/quote')) {
        return { quote: { discount: 144_000, subtotal: 1_440_000, total: 1_296_000 } };
      }
      return summary();
    });
  });

  it('سه پلن رسمی و قیمت پایه را نشان می‌دهد', async () => {
    render(<SubscriptionPage />);

    expect(
      await screen.findByRole('button', { name: 'انتخاب پلن حرفه‌ای پلاس' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'انتخاب پلن پایه' })).toBeInTheDocument();
    // ۳۰٬۰۰۰ تومان برای نسخهٔ پایه
    expect(screen.getAllByText(/۳۰٬۰۰۰ تومان/).length).toBeGreaterThan(0);
  });

  it('با تغییر تعداد کاربران قیمت بلافاصله به‌روز می‌شود', async () => {
    render(<SubscriptionPage />);
    await screen.findByText('حرفه‌ای');

    fireEvent.click(screen.getByRole('button', { name: 'انتخاب پلن حرفه‌ای' }));

    const plus = screen.getByRole('button', { name: 'افزایش کاربر' });
    for (let i = 0; i < 4; i += 1) fireEvent.click(plus);

    await waitFor(() => {
      expect(screen.getByLabelText('تعداد کاربران')).toHaveValue('5');
    });

    // ۵ کاربر، ۱۲ ماه، پلن حرفه‌ای = ۱٬۴۴۰٬۰۰۰ تومان
    expect(screen.getAllByText(/۱٬۴۴۰٬۰۰۰ تومان/).length).toBeGreaterThan(0);
  });

  it('انتخاب سالانه، ۱۲ برابر ماهانه را نشان می‌دهد', async () => {
    render(<SubscriptionPage />);
    await screen.findByText('حرفه‌ای');

    fireEvent.click(screen.getByRole('button', { name: 'انتخاب پلن حرفه‌ای' }));
    fireEvent.click(screen.getByRole('button', { name: 'ماهانه' }));
    expect(screen.getAllByText(/۶۰٬۰۰۰ تومان/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'سالانه' }));
    expect(screen.getAllByText(/۷۲۰٬۰۰۰ تومان/).length).toBeGreaterThan(0);
  });

  it('سفارش را با پلن، کاربران و مدت انتخاب‌شده ثبت می‌کند', async () => {
    const onRedirect = vi.fn();
    render(<SubscriptionPage onRedirect={onRedirect} />);
    await screen.findByText('حرفه‌ای');

    fireEvent.click(screen.getByRole('button', { name: 'انتخاب پلن حرفه‌ای' }));
    for (let i = 0; i < 4; i += 1)
      fireEvent.click(screen.getByRole('button', { name: 'افزایش کاربر' }));

    fireEvent.click(screen.getByRole('button', { name: /پرداخت و فعال‌سازی/ }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/subscription/checkout',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    const call = apiFetch.mock.calls.find(
      (item) => item[0] === '/api/subscription/checkout',
    ) as unknown as [string, { body: string }];
    expect(JSON.parse(call[1].body)).toMatchObject({
      plan_code: 'pro',
      seats: 5,
      months: 12,
      gateway: 'manual',
    });

    expect(onRedirect).toHaveBeenCalledWith('https://pay.test/7');
  });

  it('کد تخفیف را در سرور اعتبارسنجی می‌کند', async () => {
    render(<SubscriptionPage />);
    await screen.findByText('حرفه‌ای');

    fireEvent.change(screen.getByLabelText('کد تخفیف (اختیاری)'), {
      target: { value: 'OFF10' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'اعمال' }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('/api/subscription/quote?'));
    });
    expect(await screen.findByText(/کد OFF10 اعمال شد/)).toBeInTheDocument();
  });

  it('پرسش‌های متداول را نشان می‌دهد', async () => {
    render(<SubscriptionPage />);
    await screen.findByText('حرفه‌ای');

    expect(screen.getByText('اگر وسط دوره اشتراک را تمدید کنم چه می‌شود؟')).toBeInTheDocument();
  });
});
