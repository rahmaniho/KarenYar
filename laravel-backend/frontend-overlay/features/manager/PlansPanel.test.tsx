import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const apiFetch = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({ toast }));
vi.mock('@/core/api/client', () => ({
  ApiError: class ApiError extends Error {},
  apiFetch,
}));

import { PlansPanel } from './PlansPanel';

const plans = [
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
    sales: { orders: 3, revenue: 1_440_000 },
  },
];

describe('PlansPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/manager/coupons') return { coupons: [] };
      if (path === '/api/manager/plans') return { plans };
      return { ok: true };
    });
  });

  it('تعرفه و فروش هر پلن را نشان می‌دهد', async () => {
    render(<PlansPanel />);

    expect((await screen.findAllByText('حرفه‌ای')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/۶۰٬۰۰۰ تومان/).length).toBeGreaterThan(0);
    expect(screen.getByText(/۳ فروش/)).toBeInTheDocument();
  });

  it('ویرایش قیمت را به سرور می‌فرستد', async () => {
    render(<PlansPanel />);
    await screen.findAllByText('حرفه‌ای');

    fireEvent.click(screen.getByRole('button', { name: 'ویرایش تعرفه' }));
    fireEvent.change(screen.getByLabelText('قیمت پایهٔ ماهانه (تومان)'), {
      target: { value: '75000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ تغییرات' }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/manager/plans/pro',
        expect.objectContaining({ method: 'PUT' }),
      );
    });

    const call = apiFetch.mock.calls.find(
      (item) => item[0] === '/api/manager/plans/pro',
    ) as unknown as [string, { body: string }];
    expect(JSON.parse(call[1].body)).toMatchObject({
      base_monthly: 75_000,
      extra_user_monthly: 15_000,
    });
  });

  it('پلن را فعال/غیرفعال می‌کند', async () => {
    render(<PlansPanel />);
    await screen.findAllByText('حرفه‌ای');

    fireEvent.click(screen.getByRole('button', { name: 'غیرفعال' }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/manager/plans/pro/toggle',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });
});
