import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  demoLogin: vi.fn(async () => ({ id: 1 })),
  login: vi.fn(async () => ({ id: 1 })),
  loading: false,
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('sonner', () => ({ toast }));

vi.mock('@/store/auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ ...auth, login: auth.login, demoLogin: auth.demoLogin }),
}));

import { ApiError } from '@/core/api/client';
import { LoginPage } from './LoginPage';

describe('LoginPage — دموی امن', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('با یک کلیک دموی امن می‌سازد و وارد می‌شود', async () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: /ورود به دموی امن/ }));

    await waitFor(() => expect(auth.demoLogin).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('خطای سرور در ساخت دمو را نشان می‌دهد', async () => {
    auth.demoLogin.mockRejectedValueOnce(
      Object.assign(new ApiError(422, 'ظرفیت پر است'), {
        errors: { demo: ['ظرفیت دموهای هم‌زمان پر است؛ چند دقیقهٔ دیگر دوباره تلاش کنید.'] },
      }),
    );

    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: /ورود به دموی امن/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('ظرفیت دموهای هم‌زمان پر است');
  });
});
