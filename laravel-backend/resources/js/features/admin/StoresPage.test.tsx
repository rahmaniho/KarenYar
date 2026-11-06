import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  dashboard: vi.fn(),
  stores: vi.fn(),
  plans: vi.fn(),
  archiveStore: vi.fn(),
  restoreStore: vi.fn(),
  purgeStore: vi.fn(),
  createStore: vi.fn(),
  updateStore: vi.fn(),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('sonner', () => ({ toast }));
vi.mock('./admin-api', () => ({ adminApi: api }));

import { AdminShell } from './AdminShell';
import { StoresPage } from './StoresPage';
import { DashboardPage } from './DashboardPage';

const store = {
  id: 3,
  name: 'فروشگاه نمونه',
  slug: 'sample',
  owner_name: 'مریم رضایی',
  phone: '09121234567',
  address: null,
  is_active: true,
  archived_at: null,
  is_archived: false,
  users_count: 4,
  active_users_count: 3,
  created_at: '2026-01-01T00:00:00+03:30',
  license: {
    id: 11,
    store_id: 3,
    tier: 'pro' as const,
    plan_code: 'pro',
    seats: 5,
    status: 'active',
    is_lifetime: false,
    is_active: true,
    starts_at: null,
    expires_at: '2026-12-20T10:00:00+03:30',
    notes: null,
    is_valid: true,
    is_expired: false,
    days_remaining: 44,
  },
};

const archived = { ...store, id: 4, name: 'فروشگاه آرشیوی', is_active: false, is_archived: true, archived_at: '2026-10-01T00:00:00+03:30' };

function renderStores() {
  return render(
    <MemoryRouter initialEntries={['/admin/stores']}>
      <Routes>
        <Route path="/admin" element={<AdminShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="stores" element={<StoresPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('StoresPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.dashboard.mockResolvedValue(null);
    api.plans.mockResolvedValue({
      plans: [
        {
          code: 'pro',
          name: 'حرفه‌ای',
          tier: 'pro',
          base_monthly: 60_000,
          extra_user_monthly: 15_000,
          min_seats: 1,
          max_seats: 50,
          is_lifetime: false,
          is_active: true,
          features: [],
        },
      ],
    });
    api.stores.mockResolvedValue({
      stores: [store, archived],
      meta: { page: 1, per_page: 9, total: 2, last_page: 1 },
      totals: { active: 1, archived: 1, active_licenses: 1 },
    });
    api.archiveStore.mockResolvedValue({ archived: true });
    api.restoreStore.mockResolvedValue({ store });
    api.purgeStore.mockResolvedValue({ purged: true });
  });

  it('فروشگاه‌ها را با سقف و مصرف کاربر نشان می‌دهد', async () => {
    renderStores();

    expect(await screen.findByText('فروشگاه نمونه')).toBeInTheDocument();
    expect(screen.getAllByText('۳ / ۵ کاربر').length).toBeGreaterThan(0);
    expect(screen.getByText('آرشیوشده')).toBeInTheDocument();
  });

  it('آرشیو فروشگاه با دلیل ثبت می‌شود و داده حذف نمی‌شود', async () => {
    renderStores();
    await screen.findByText('فروشگاه نمونه');

    const archiveButtons = screen.getAllByRole('button', { name: 'آرشیو' });
    fireEvent.click(archiveButtons[archiveButtons.length - 1]);
    fireEvent.change(await screen.findByLabelText('دلیل (اختیاری)'), {
      target: { value: 'عدم تمدید' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'آرشیو کن' }));

    await waitFor(() => expect(api.archiveStore).toHaveBeenCalledWith(3, 'عدم تمدید'));
    expect(toast.success).toHaveBeenCalled();
  });

  it('حذف دائمی فقط با تایپ دقیق نام فروشگاه فعال می‌شود', async () => {
    renderStores();
    await screen.findByText('فروشگاه آرشیوی');

    fireEvent.click(screen.getByRole('button', { name: /حذف دائمی/ }));
    const confirm = await screen.findByRole('button', { name: 'حذف دائمی' });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/نام فروشگاه:/), {
      target: { value: 'فروشگاه آرشیوی' },
    });
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);
    await waitFor(() => expect(api.purgeStore).toHaveBeenCalledWith(4, 'فروشگاه آرشیوی'));
  });
});
