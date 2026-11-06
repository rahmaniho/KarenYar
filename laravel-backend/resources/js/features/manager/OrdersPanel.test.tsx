import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  orders: [] as unknown[],
  totals: { pending: 0, paid_this_month: 0, revenue_this_month: 0 },
  reject: false,
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const apiFetch = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({ toast }));

vi.mock('@/core/api/client', () => ({
  ApiError: class ApiError extends Error {},
  apiFetch,
}));

import { OrdersPanel } from './OrdersPanel';

const pendingOrder = {
  id: 5,
  plan: 'pro_yearly',
  plan_label: 'حرفه‌ای — سالانه',
  tier: 'pro',
  months: 12,
  is_lifetime: false,
  amount: 4_900_000,
  status: 'pending',
  gateway: 'manual',
  reference_id: null,
  paid_at: null,
  created_at: '2026-11-05T12:00:00+03:30',
  store_name: 'فروشگاه نمونه',
};

describe('OrdersPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.reject = false;
    state.orders = [];
    state.totals = { pending: 0, paid_this_month: 0, revenue_this_month: 0 };

    apiFetch.mockImplementation(async (path: string) => {
      if (state.reject) throw new Error('boom');
      if (path.endsWith('/approve') || path.endsWith('/reject')) {
        return { order: { ...pendingOrder, status: 'paid' } };
      }
      return { orders: state.orders, totals: state.totals };
    });
  });

  it('سفارش در انتظار را با مبلغ و فروشگاه نشان می‌دهد', async () => {
    state.orders = [pendingOrder];
    state.totals = { pending: 1, paid_this_month: 0, revenue_this_month: 0 };

    render(<OrdersPanel />);

    expect(await screen.findByText(/فروشگاه نمونه/)).toBeInTheDocument();
    expect(screen.getByText('در انتظار پرداخت')).toBeInTheDocument();
    expect(screen.getByText('حرفه‌ای — سالانه')).toBeInTheDocument();
  });

  it('تأیید پرداخت را به سرور می‌فرستد و پیام موفقیت می‌دهد', async () => {
    state.orders = [pendingOrder];

    render(<OrdersPanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'تأیید پرداخت' }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/manager/orders/5/approve',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(toast.success).toHaveBeenCalledWith('پرداخت تأیید و لایسنس فروشگاه تمدید شد.');
  });

  it('رد سفارش را ثبت می‌کند', async () => {
    state.orders = [pendingOrder];

    render(<OrdersPanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'رد' }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/manager/orders/5/reject',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('در نبود سفارش پیام خالی و خطای شبکه را نشان می‌دهد', async () => {
    render(<OrdersPanel />);
    expect(await screen.findByText('هنوز سفارشی ثبت نشده است.')).toBeInTheDocument();

    state.reject = true;
    render(<OrdersPanel />);
    await waitFor(() => {
      expect(screen.getAllByText('ارتباط با سرور برقرار نشد.').length).toBeGreaterThan(0);
    });
  });
});
