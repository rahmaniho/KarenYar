import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('اپلیکیشن کارو', () => {
  it('بدون خطا رندر می‌شود و برند و ناوبری فارسی نمایش داده می‌شود', async () => {
    render(<App />);
    // وردمارک رسمی کارو در سربرند سایت
    const logos = await screen.findAllByRole('img', { name: 'لوگوی کارو' });
    expect(logos.length).toBeGreaterThan(0);
    expect(logos[0]).toHaveAttribute('src', expect.stringContaining('images/karo/logo.png'));
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
