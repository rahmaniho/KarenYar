import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  usage: { used: 1, allowed: 2, remaining: 1, can_add: true },
  rejectWith: null as null | Record<string, string[]>,
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const apiFetch = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({ toast }));
vi.mock('@/core/api/client', () => ({
  ApiError: class ApiError extends Error {
    errors?: Record<string, string[]>;
  },
  apiFetch,
}));

import { TeamPanel } from './TeamPanel';

const members = [
  { id: 1, name: 'مالک', email: 'owner@test.local', is_active: true, last_login_at: null },
];

describe('TeamPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.usage = { used: 1, allowed: 2, remaining: 1, can_add: true };
    state.rejectWith = null;

    apiFetch.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (state.rejectWith && options?.method === 'POST') {
        const { ApiError } = await import('@/core/api/client');
        throw Object.assign(new ApiError(422, 'خطا'), { errors: state.rejectWith });
      }
      if (path === '/api/team' && options?.method === 'POST') {
        return { member: { ...members[0], id: 2, name: 'دوم' }, usage: state.usage };
      }
      if (path.startsWith('/api/team/')) return { ok: true, usage: state.usage };
      return { members, usage: state.usage };
    });
  });

  it('مصرف ظرفیت و اعضا را نشان می‌دهد', async () => {
    render(
      <MemoryRouter>
        <TeamPanel />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/۱ کاربر فعال از ۲ کاربر مجاز/)).toBeInTheDocument();
    expect(screen.getByText('owner@test.local')).toBeInTheDocument();
    expect(screen.getByText('۱ ظرفیت آزاد')).toBeInTheDocument();
  });

  it('وقتی سقف پر است فرم افزودن غیرفعال و پیام راهنما نشان داده می‌شود', async () => {
    state.usage = { used: 2, allowed: 2, remaining: 0, can_add: false };

    render(
      <MemoryRouter>
        <TeamPanel />
      </MemoryRouter>,
    );

    expect(await screen.findByText('سقف پر است')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /افزایش تعداد کاربران/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /افزودن/ })).toBeDisabled();
  });

  it('کاربر جدید را به سرور می‌فرستد', async () => {
    render(
      <MemoryRouter>
        <TeamPanel />
      </MemoryRouter>,
    );
    await screen.findByText('owner@test.local');

    fireEvent.change(screen.getByLabelText('نام'), { target: { value: 'کاربر دوم' } });
    fireEvent.change(screen.getByLabelText('ایمیل'), { target: { value: 'two@test.local' } });
    fireEvent.change(screen.getByLabelText('رمز عبور'), { target: { value: 'secret-pass' } });
    fireEvent.click(screen.getByRole('button', { name: /افزودن/ }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/team',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(toast.success).toHaveBeenCalled();
  });

  it('پیام سقف کاربران سرور را نمایش می‌دهد', async () => {
    state.rejectWith = { seats: ['سقف کاربران اشتراک شما ۲ نفر است.'] };

    render(
      <MemoryRouter>
        <TeamPanel />
      </MemoryRouter>,
    );
    await screen.findByText('owner@test.local');

    fireEvent.change(screen.getByLabelText('نام'), { target: { value: 'سوم' } });
    fireEvent.change(screen.getByLabelText('ایمیل'), { target: { value: 'three@test.local' } });
    fireEvent.change(screen.getByLabelText('رمز عبور'), { target: { value: 'secret-pass' } });
    fireEvent.click(screen.getByRole('button', { name: /افزودن/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('سقف کاربران اشتراک شما ۲ نفر است.');
  });
});
