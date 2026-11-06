import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  error: null as null | { errors?: Record<string, string[]>; message?: string },
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const refresh = vi.hoisted(() => vi.fn(async () => undefined));
const apiFetch = vi.hoisted(() => vi.fn(async () => ({ user: { id: 3 } })));

vi.mock('sonner', () => ({ toast }));

vi.mock('@/store/auth-store', () => ({
  useAuthStore: Object.assign(() => null, { getState: () => ({ refresh }) }),
}));

vi.mock('@/core/api/client', () => ({
  ApiError: class ApiError extends Error {
    errors?: Record<string, string[]>;
  },
  apiFetch,
}));

import { SignupPage } from './SignupPage';

describe('SignupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.error = null;
  });

  it('نام فروشگاه، ایمیل و رمز را به سرور می‌فرستد و کاربر را وارد می‌کند', async () => {
    const onBack = vi.fn();
    apiFetch.mockImplementation(async () => {
      if (state.error) {
        const { ApiError } = await import('@/core/api/client');
        throw Object.assign(new ApiError(422, state.error.message ?? 'خطا'), {
          errors: state.error.errors,
        });
      }
      return { user: { id: 3 } };
    });

    render(<SignupPage onBack={onBack} trialDays={14} />);

    fireEvent.change(screen.getByLabelText('نام فروشگاه'), { target: { value: 'فروشگاه گل‌ها' } });
    fireEvent.change(screen.getByLabelText('ایمیل'), { target: { value: 'owner@test.local' } });
    fireEvent.change(screen.getByLabelText('رمز عبور'), { target: { value: 'secret-pass' } });
    fireEvent.change(screen.getByLabelText('تکرار رمز عبور'), { target: { value: 'secret-pass' } });
    fireEvent.click(screen.getByRole('checkbox'));

    fireEvent.click(screen.getByRole('button', { name: 'ساخت فروشگاه و شروع رایگان' }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/register',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    const body = JSON.parse(
      (apiFetch.mock.calls[0] as unknown as [string, { body: string }])[1].body,
    );
    expect(body).toMatchObject({
      store_name: 'فروشگاه گل‌ها',
      email: 'owner@test.local',
      password: 'secret-pass',
      password_confirmation: 'secret-pass',
      terms: true,
    });

    expect(refresh).toHaveBeenCalled();
  });

  it('رمز کوتاه را بدون تماس با سرور رد می‌کند', async () => {
    render(<SignupPage onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('نام فروشگاه'), { target: { value: 'فروشگاه' } });
    fireEvent.change(screen.getByLabelText('ایمیل'), { target: { value: 'x@test.local' } });
    fireEvent.change(screen.getByLabelText('رمز عبور'), { target: { value: '123' } });
    fireEvent.change(screen.getByLabelText('تکرار رمز عبور'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'ساخت فروشگاه و شروع رایگان' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('رمز عبور باید حداقل ۸ نویسه باشد.');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('خطای اعتبارسنجی سرور را نشان می‌دهد', async () => {
    state.error = { errors: { email: ['این ایمیل قبلاً ثبت شده است.'] } };
    apiFetch.mockImplementation(async () => {
      const { ApiError } = await import('@/core/api/client');
      throw Object.assign(new ApiError(422, 'خطای اعتبارسنجی'), {
        errors: state.error?.errors,
      });
    });

    render(<SignupPage onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('نام فروشگاه'), { target: { value: 'فروشگاه تکراری' } });
    fireEvent.change(screen.getByLabelText('ایمیل'), { target: { value: 'taken@test.local' } });
    fireEvent.change(screen.getByLabelText('رمز عبور'), { target: { value: 'secret-pass' } });
    fireEvent.change(screen.getByLabelText('تکرار رمز عبور'), { target: { value: 'secret-pass' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'ساخت فروشگاه و شروع رایگان' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('این ایمیل قبلاً ثبت شده است.');
  });
});
