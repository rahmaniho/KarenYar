import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const demo = vi.hoisted(() => ({
  user: null as null | { store: { is_demo?: boolean; demo_expires_at?: string | null } | null },
  endDemo: vi.fn(async () => undefined),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('sonner', () => ({ toast }));

vi.mock('@/store/auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: demo.user, endDemo: demo.endDemo }),
}));

import { DemoBanner } from './DemoBanner';
import { demoRemainingLabel } from './demo-time';

describe('demoRemainingLabel', () => {
  const now = new Date('2027-01-01T12:00:00Z').getTime();

  it('ساعت و دقیقهٔ باقی‌مانده را فارسی نشان می‌دهد', () => {
    const expires = new Date(now + 3 * 3_600_000 + 25 * 60_000).toISOString();
    expect(demoRemainingLabel(expires, now)).toBe('3 ساعت و 25 دقیقه');
  });

  it('کمتر از یک ساعت را با دقیقه نشان می‌دهد', () => {
    const expires = new Date(now + 20 * 60_000).toISOString();
    expect(demoRemainingLabel(expires, now)).toBe('20 دقیقه');
  });

  it('دموی تمام‌شده و بدون زمان را تشخیص می‌دهد', () => {
    expect(demoRemainingLabel(new Date(now - 1000).toISOString(), now)).toBe('به پایان رسیده');
    expect(demoRemainingLabel(null, now)).toBe('زمان نامشخص');
  });
});

describe('DemoBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    demo.user = null;
  });

  it('برای فروشگاه واقعی هیچ چیزی نشان نمی‌دهد', () => {
    demo.user = { store: { is_demo: false } };
    const { container } = render(<DemoBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('در دمو زمان باقی‌مانده و هشدار پاک شدن داده را نشان می‌دهد', () => {
    demo.user = {
      store: { is_demo: true, demo_expires_at: new Date(Date.now() + 2 * 3_600_000).toISOString() },
    };

    render(<DemoBanner />);

    expect(screen.getByText('حالت دمو — داده‌های نمونه و آزمایشی')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('همهٔ داده‌هایش پس از پایان');
  });

  it('با «پایان دمو» داده را از سرور پاک می‌کند', async () => {
    demo.user = { store: { is_demo: true, demo_expires_at: null } };

    render(<DemoBanner />);
    fireEvent.click(screen.getByRole('button', { name: /پایان دمو/ }));

    await waitFor(() => expect(demo.endDemo).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });
});
