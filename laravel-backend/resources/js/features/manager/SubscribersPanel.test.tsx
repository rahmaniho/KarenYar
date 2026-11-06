import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const apiFetch = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({ toast }));
vi.mock('@/core/api/client', () => ({
  ApiError: class ApiError extends Error {},
  apiFetch,
}));

import { SubscribersPanel } from './SubscribersPanel';

const subscriber = {
  license_id: 11,
  store_id: 3,
  store_name: 'فروشگاه نمونه',
  owner_name: 'مریم',
  phone: '09120000000',
  plan_code: 'pro',
  tier: 'pro',
  seats: 5,
  active_users: 2,
  status: 'active',
  is_trial: false,
  is_lifetime: false,
  expires_at: '2026-12-01T00:00:00+03:30',
  days_remaining: 20,
  last_amount: 1_440_000,
  last_transaction: 'REF-9',
};

const stats = {
  total: 1,
  active: 1,
  expiring_soon: 0,
  expired: 0,
  revenue_total: 1_440_000,
  revenue_month: 1_440_000,
};

describe('SubscribersPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockImplementation(async () => ({ subscribers: [subscriber], stats }));
  });

  it('مشترک را با وضیت، پلن و مصرف کاربر نشان می‌دهد', async () => {
    render(<SubscribersPanel />);

    expect(await screen.findByText('فروشگاه نمونه')).toBeInTheDocument();
    expect(screen.getAllByText('فعال').length).toBeGreaterThan(0);
    expect(screen.getByText(/پلن pro/)).toBeInTheDocument();
    expect(screen.getAllByText(/۱٬۴۴۰٬۰۰۰ تومان/).length).toBeGreaterThan(0);
  });

  it('تمدید با دلیل را به سرور می‌فرستد', async () => {
    render(<SubscribersPanel />);
    await screen.findByText('فروشگاه نمونه');

    fireEvent.click(screen.getByRole('button', { name: 'مدیریت' }));
    fireEvent.change(screen.getByLabelText('دلیل (در تاریخچه ثبت می‌شود)'), {
      target: { value: 'تسویه دستی' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ثبت تمدید' }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/manager/subscribers/11/extend',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    const call = apiFetch.mock.calls.find(
      (item) => item[0] === '/api/manager/subscribers/11/extend',
    ) as unknown as [string, { body: string }];
    expect(JSON.parse(call[1].body)).toMatchObject({
      months: 1,
      seats: 5,
      reason: 'تسویه دستی',
    });
  });

  it('تعلیق بدون دلیل را رد می‌کند', async () => {
    render(<SubscribersPanel />);
    await screen.findByText('فروشگاه نمونه');

    fireEvent.click(screen.getByRole('button', { name: 'مدیریت' }));
    fireEvent.click(screen.getByRole('button', { name: 'تعلیق اشتراک' }));

    expect(toast.error).toHaveBeenCalledWith('برای تغییر وضعیت، دلیل را بنویسید.');
  });
});
