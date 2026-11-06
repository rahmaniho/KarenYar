import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  dashboard: vi.fn(),
  managers: vi.fn(),
  createManager: vi.fn(),
  updateManager: vi.fn(),
  deactivateManager: vi.fn(),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('sonner', () => ({ toast }));
vi.mock('./admin-api', () => ({ adminApi: api }));

import { AdminShell } from './AdminShell';
import { ManagersPage } from './ManagersPage';
import { DashboardPage } from './DashboardPage';

const managers = [
  { id: 1, name: 'مدیر کل', email: 'admin@karo.test', is_active: true, last_login_at: null, created_at: null, is_self: true },
  { id: 2, name: 'مدیر دوم', email: 'two@karo.test', is_active: true, last_login_at: null, created_at: null, is_self: false },
];

function renderManagers() {
  return render(
    <MemoryRouter initialEntries={['/admin/managers']}>
      <Routes>
        <Route path="/admin" element={<AdminShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="managers" element={<ManagersPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('ManagersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.dashboard.mockResolvedValue(null);
    api.managers.mockResolvedValue({ managers });
    api.createManager.mockResolvedValue({ manager: managers[1] });
    api.deactivateManager.mockResolvedValue({ manager: { ...managers[1], is_active: false } });
  });

  it('مدیر جاری را مشخص می‌کند و غیرفعال‌سازی خود را می‌بندد', async () => {
    renderManagers();

    expect(await screen.findByText('مدیر کل')).toBeInTheDocument();
    expect(screen.getByText('شما')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'غیرفعال‌سازی' })[0]).toBeDisabled();
  });

  it('مدیر جدید با ایمیل و رمز ساخته می‌شود', async () => {
    renderManagers();
    await screen.findByText('مدیر دوم');

    fireEvent.click(screen.getByRole('button', { name: /مدیر جدید/ }));
    fireEvent.change(await screen.findByLabelText('نام'), { target: { value: 'مدیر سوم' } });
    fireEvent.change(screen.getByLabelText('ایمیل'), { target: { value: 'three@karo.test' } });
    fireEvent.change(screen.getByLabelText('رمز عبور (حداقل ۸ نویسه)'), {
      target: { value: 'strong-pass-3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ساخت مدیر' }));

    await waitFor(() =>
      expect(api.createManager).toHaveBeenCalledWith({
        name: 'مدیر سوم',
        email: 'three@karo.test',
        password: 'strong-pass-3',
      }),
    );
  });

  it('غیرفعال‌سازی مدیر دیگر درخواست می‌فرستد', async () => {
    renderManagers();
    await screen.findByText('مدیر دوم');

    const buttons = screen.getAllByRole('button', { name: 'غیرفعال‌سازی' });
    fireEvent.click(buttons[1]);

    await waitFor(() => expect(api.deactivateManager).toHaveBeenCalledWith(2));
  });
});
