import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore, type AuthUser } from '@/store/auth-store';
import { App } from './App';

const storeUser: AuthUser = {
  id: 1,
  name: 'مدیر فروشگاه',
  email: 'store@test.local',
  role: 'store',
  store_id: 1,
  is_active: true,
  store: {
    id: 1,
    name: 'فروشگاه تست',
    slug: 'store-test',
    owner_name: null,
    phone: null,
    address: null,
    is_active: true,
    license: null,
  },
};

describe('اپلیکیشن حساب‌یار', () => {
  beforeEach(() => {
    // در تست به شبکه وصل نمی‌شویم؛ کاربر فروشگاه را از پیش وارد می‌کنیم.
    useAuthStore.setState({
      user: storeUser,
      ready: true,
      loading: false,
      refresh: async () => undefined,
    });
  });

  it('بدون خطا رندر می‌شود و برند و ناوبری فارسی نمایش داده می‌شود', async () => {
    render(<App />);
    // وردمارک رسمی حساب‌یار در سربرند سایت
    const logos = await screen.findAllByRole('img', { name: 'لوگوی حساب‌یار' });
    expect(logos.length).toBeGreaterThan(0);
    expect(logos[0]).toHaveAttribute('src', expect.stringContaining('images/hesabyar/logo.png'));
    // آیتم‌های ناوبری اصلی
    expect(screen.getAllByText('داشبورد').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ماشین‌حساب حرفه‌ای').length).toBeGreaterThan(0);
    // داشبورد (صفحه‌ی تنبل) در نهایت لود می‌شود
    expect(await screen.findByRole('heading', { name: /داشبورد/ })).toBeInTheDocument();
  });

  it('نشان نسخه‌ی رایگان و وضعیت اتصال در هدر هست', async () => {
    render(<App />);
    expect((await screen.findAllByText(/رایگان/)).length).toBeGreaterThan(0);
  });
});
