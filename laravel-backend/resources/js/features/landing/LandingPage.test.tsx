import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  demoLogin: vi.fn(async () => ({ id: 1 })),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

const plansResponse = vi.hoisted(() => ({
  plans: [
    {
      code: 'basic',
      name: 'پایه',
      tier: 'pro',
      description: 'برای کسب‌وکار تازه',
      base_monthly: 30_000,
      extra_user_monthly: 15_000,
      min_seats: 1,
      max_seats: 1,
      is_lifetime: false,
      is_active: true,
      features: ['فاکتور نامحدود', 'صندوق فروش', 'گزارش روزانه'],
    },
    {
      code: 'pro',
      name: 'حرفه‌ای',
      tier: 'pro',
      description: null,
      base_monthly: 60_000,
      extra_user_monthly: 15_000,
      min_seats: 1,
      max_seats: 10,
      is_lifetime: false,
      is_active: true,
      features: ['همهٔ امکانات پایه', 'چند کاربر'],
    },
  ],
  trial_days: 14,
  currency_label: 'تومان',
  public_registration: true,
}));

const apiFetch = vi.hoisted(() => vi.fn(async () => plansResponse));

vi.mock('sonner', () => ({ toast }));

vi.mock('@/core/api/client', () => ({
  ApiError: class ApiError extends Error {
    status = 422;
    errors?: Record<string, string[]>;
  },
  apiFetch,
}));

vi.mock('@/store/auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ demoLogin: auth.demoLogin }),
}));

import { LandingPage } from './LandingPage';

describe('LandingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockImplementation(async () => plansResponse);
  });

  it('تیتر معرفی، دکمهٔ دمو و مسیرهای ورود/ثبت‌نام را نشان می‌دهد', async () => {
    const onLogin = vi.fn();
    const onSignup = vi.fn();

    render(<LandingPage onLogin={onLogin} onSignup={onSignup} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('حسابداری فروشگاه');

    fireEvent.click(screen.getAllByRole('button', { name: /شروع رایگان/ })[0]);
    expect(onSignup).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'ورود' }));
    expect(onLogin).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/api/subscription/plans'));
  });

  it('تعرفه‌ها را از سرور می‌خواند و قیمت پایه را نشان می‌دهد', async () => {
    window.sessionStorage.clear();
    const onSignup = vi.fn();
    render(<LandingPage onLogin={vi.fn()} onSignup={onSignup} />);

    expect(await screen.findByText('پایه')).toBeInTheDocument();
    expect(screen.getByText('حرفه‌ای')).toBeInTheDocument();
    expect(screen.getAllByText(/تومان/).length).toBeGreaterThan(0);

    const planButtons = screen.getAllByRole('button', { name: /شروع با این پلن/ });
    expect(planButtons).toHaveLength(2);

    fireEvent.click(planButtons[1]);
    expect(onSignup).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem('karo:signup-plan')).toBe('pro');
  });

  it('با دکمهٔ دمو، دموی امن می‌سازد', async () => {
    render(<LandingPage onLogin={vi.fn()} onSignup={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /امتحان دموی امن/ }));

    await waitFor(() => expect(auth.demoLogin).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('اگر تعرفه‌ها در دسترس نباشند، پیام جایگزین می‌دهد', async () => {
    apiFetch.mockRejectedValueOnce(new Error('offline'));

    render(<LandingPage onLogin={vi.fn()} onSignup={vi.fn()} />);

    expect(
      await screen.findByText(/فعلاً نمایش تعرفه‌ها ممکن نیست/),
    ).toBeInTheDocument();
  });
});
