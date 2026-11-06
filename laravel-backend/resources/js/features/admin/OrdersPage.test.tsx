import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  dashboard: vi.fn(),
  orders: vi.fn(),
  approveOrder: vi.fn(),
  rejectOrder: vi.fn(),
  voidOrder: vi.fn(),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('sonner', () => ({ toast }));
vi.mock('./admin-api', () => ({ adminApi: api }));

import { AdminShell } from './AdminShell';
import { OrdersPage } from './OrdersPage';
import { DashboardPage } from './DashboardPage';

const order = {
  id: 21,
  store_id: 3,
  store_name: 'فروشگاه نمونه',
  plan: 'pro',
  plan_label: 'حرفه‌ای',
  tier: 'pro',
  type: 'renewal',
  months: 12,
  seats: 5,
  amount: 1_440_000,
  status: 'pending',
  gateway: 'manual',
  reference_id: null,
  paid_at: null,
  created_at: '2026-11-05T10:00:00+03:30',
  invoice_number: null,
};

function renderOrders() {
  return render(
    <MemoryRouter initialEntries={['/admin/orders']}>
      <Routes>
        <Route path="/admin" element={<AdminShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="orders" element={<OrdersPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('OrdersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.dashboard.mockResolvedValue(null);
    api.orders.mockResolvedValue({
      orders: [order],
      meta: { page: 1, per_page: 12, total: 1, last_page: 1 },
      totals: { pending: 1, pending_amount: 1_440_000, paid_this_month: 0, revenue_this_month: 0 },
    });
    api.approveOrder.mockResolvedValue({ order: { ...order, status: 'paid' } });
    api.rejectOrder.mockResolvedValue({ order: { ...order, status: 'canceled' } });
    api.voidOrder.mockResolvedValue({ order: { ...order, status: 'voided' } });
  });

  it('سفارش در انتظار را با دکمهٔ تأیید نشان می‌دهد', async () => {
    renderOrders();

    expect(await screen.findByText('فروشگاه نمونه')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /تأیید پرداخت/ })).toBeInTheDocument();
  });

  it('تأیید بدون شمارهٔ پیگیری ارسال نمی‌شود', async () => {
    renderOrders();
    await screen.findByText('فروشگاه نمونه');

    fireEvent.click(screen.getByRole('button', { name: /تأیید پرداخت/ }));
    expect(await screen.findByLabelText('شمارهٔ پیگیری بانکی (الزامی)')).toBeRequired();

    fireEvent.click(screen.getByRole('button', { name: 'تأیید و فعال‌سازی' }));
    await waitFor(() => expect(api.approveOrder).not.toHaveBeenCalled());
  });

  it('تأیید با شمارهٔ پیگیری، درخواست درست می‌فرستد', async () => {
    renderOrders();
    await screen.findByText('فروشگاه نمونه');

    fireEvent.click(screen.getByRole('button', { name: /تأیید پرداخت/ }));
    fireEvent.change(screen.getByLabelText('شمارهٔ پیگیری بانکی (الزامی)'), {
      target: { value: 'BANK-7788' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'تأیید و فعال‌سازی' }));

    await waitFor(() => expect(api.approveOrder).toHaveBeenCalledWith(21, 'BANK-7788', undefined));
    expect(toast.success).toHaveBeenCalled();
  });

  it('رد سفارش دلیل می‌خواهد', async () => {
    renderOrders();
    await screen.findByText('فروشگاه نمونه');

    fireEvent.click(screen.getByRole('button', { name: /^رد$/ }));
    expect(await screen.findByLabelText('دلیل رد سفارش (الزامی)')).toBeRequired();
  });
});
