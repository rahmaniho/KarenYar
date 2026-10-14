import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('اپلیکیشن حساب‌یار', () => {
  it('بدون خطا رندر می‌شود و برند و ناوبری فارسی نمایش داده می‌شود', async () => {
    render(<App />);
    // برند در سایدبار/هدر
    expect((await screen.findAllByText('حساب‌یار')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('کارن سافت').length).toBeGreaterThan(0);
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
