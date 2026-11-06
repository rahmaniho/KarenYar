import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  dashboard: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('./admin-api', () => ({ adminApi: api }));

import { AdminShell } from './AdminShell';
import { DashboardPage } from './DashboardPage';

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/admin" element={<AdminShell />}>
          <Route index element={<DashboardPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const dashboard = {
  generated_at: '2026-11-06T10:00:00+03:30',
  kpis: {
    revenue_today: 0,
    revenue_month: 1_440_000,
    revenue_prev_month: 1_200_000,
    revenue_year: 9_000_000,
    growth_month_pct: 20,
    mrr: 900_000,
    arr: 10_800_000,
    orders_pending: 2,
    orders_pending_amount: 120_000,
    subs_active: 3,
    subs_trial: 1,
    subs_expiring_7: 1,
    subs_expired: 1,
    subs_suspended: 0,
    stores_total: 4,
    stores_archived: 1,
    stores_new_month: 2,
  },
  revenue_trend: [
    { month: '2026-10', label: 'آبان ۱۴۰۵', amount: 1_440_000, orders: 2 },
    { month: '2026-11', label: 'آذر ۱۴۰۵', amount: 0, orders: 0 },
  ],
  plan_breakdown: [{ plan: 'pro', name: 'حرفه‌ای', orders: 2, revenue: 1_440_000, subscribers: 3 }],
  status_breakdown: [
    { key: 'active', label: 'فعال', value: 2 },
    { key: 'trial', label: 'آزمایشی', value: 1 },
  ],
  recent_orders: [
    {
      id: 12,
      store_id: 3,
      store_name: 'فروشگاه نمونه',
      plan: 'pro',
      plan_label: 'حرفه‌ای',
      tier: 'pro',
      type: 'renewal',
      months: 12,
      seats: 5,
      amount: 1_440_000,
      status: 'paid',
      gateway: 'zarinpal',
      reference_id: 'ZP-1',
      paid_at: '2026-11-05T10:00:00+03:30',
      created_at: '2026-11-05T10:00:00+03:30',
    },
  ],
  expiring_soon: [
    {
      license_id: 11,
      store_id: 3,
      store_name: 'فروشگاه نمونه',
      plan_code: 'pro',
      seats: 5,
      expires_at: '2026-11-20T10:00:00+03:30',
      days_remaining: 14,
      is_trial: false,
    },
  ],
  top_coupons: [{ code: 'NOWRUZ', uses: 3, revenue: 900_000 }],
};

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.dashboard.mockResolvedValue(dashboard);
  });

  it('شاخص‌های کلیدی و درآمد ماه را نشان می‌دهد', async () => {
    renderDashboard();

    expect(await screen.findByText('درآمد این ماه')).toBeInTheDocument();
    expect(screen.getAllByText(/۱٬۴۴۰٬۰۰۰ تومان/).length).toBeGreaterThan(0);
    expect(screen.getByText('پرداخت در انتظار')).toBeInTheDocument();
    expect(screen.getByText('نزدیک انقضا (۷ روز)')).toBeInTheDocument();
  });

  it('برای پرداخت‌های در انتظار اقدام سریع نشان می‌دهد', async () => {
    renderDashboard();

    expect(await screen.findByRole('button', { name: /۲ پرداخت در انتظار تأیید/ })).toBeInTheDocument();
  });

  it('آخرین پرداخت‌ها، کوپن‌ها و انقضای نزدیک را نشان می‌دهد', async () => {
    renderDashboard();

    expect((await screen.findAllByText('فروشگاه نمونه')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('NOWRUZ').length).toBeGreaterThan(0);
    expect(screen.getByText('۱۴ روز')).toBeInTheDocument();
  });
});
