import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  response: {} as unknown,
  reject: false,
}));

vi.mock('@/core/api/client', () => ({
  ApiError: class ApiError extends Error {},
  apiFetch: vi.fn(async () => {
    if (state.reject) throw new Error('boom');
    return state.response;
  }),
}));

import { AuditPanel } from './AuditPanel';
import { AUDIT_ACTION_LABELS } from './audit-labels';

describe('AuditPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.reject = false;
    state.response = { events: [] };
  });

  it('رویدادها را با برچسب فارسی و نام فروشگاه نشان می‌دهد', async () => {
    state.response = {
      events: [
        {
          id: 2,
          action: 'license_updated',
          storeName: 'فروشگاه نمونه',
          userName: 'مدیر کل',
          createdAt: '2026-11-01T10:30:00+03:30',
        },
        {
          id: 1,
          action: 'login_failed',
          userName: null,
          userEmail: 'x@test.local',
          createdAt: '2026-11-01T09:00:00+03:30',
        },
      ],
    };

    render(<AuditPanel />);

    expect(await screen.findByText(AUDIT_ACTION_LABELS.license_updated)).toBeInTheDocument();
    expect(screen.getByText('مدیر کل')).toBeInTheDocument();
    expect(screen.getByText(/فروشگاه نمونه/)).toBeInTheDocument();
    expect(screen.getByText(AUDIT_ACTION_LABELS.login_failed)).toBeInTheDocument();
    // برای ورود ناموفق نام کاربری نداریم، ایمیل نمایش داده می‌شود.
    expect(screen.getByText('x@test.local')).toBeInTheDocument();
  });

  it('در نبود رویداد، پیام خالی نشان می‌دهد', async () => {
    render(<AuditPanel />);

    expect(await screen.findByText('هنوز رویدادی ثبت نشده است.')).toBeInTheDocument();
  });

  it('در خطای شبکه پیام خطا نشان می‌دهد', async () => {
    state.reject = true;

    render(<AuditPanel />);

    await waitFor(() => {
      expect(screen.getByText('خواندن رویدادها ممکن نشد.')).toBeInTheDocument();
    });
  });
});
