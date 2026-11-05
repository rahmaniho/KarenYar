import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Dialog, DialogContent, DialogTitle } from './dialog';

/**
 * رگرسیون: فرم‌های ثبت (دیالوگ) باید همیشه وسطِ صفحه باشند.
 * انیمیشن ورود اگر ترنسفورمِ وسط‌چین را خنثی کند، گوشه‌ی دیالوگ روی مرکز صفحه
 * می‌نشیند و نیمی از فرم بیرون صفحه می‌افتد — این تست همان را قفل می‌کند.
 */
describe('دیالوگ (فرم‌های ثبت)', () => {
  it('وسط‌چین است و انیمیشن ورودش ترنسفورم وسط‌چین را حذف نمی‌کند', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>فرم ثبت</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    const content = screen.getByRole('dialog');
    // وسط‌چین با ترنسفورم
    expect(content.className).toContain('left-1/2');
    expect(content.className).toContain('top-1/2');
    expect(content.className).toContain('-translate-x-1/2');
    expect(content.className).toContain('-translate-y-1/2');
    // انیمیشن مجاز فقط dialog-pop است (ترنسفورم وسط‌چین داخل کی‌فریم‌های خودش حفظ شده)
    expect(content.className).toContain('animate-dialog-pop');
    expect(content.className).not.toContain('animate-slide-up');
    // در موبایل تمام‌عرضِ امن و در صورت بلندی، اسکرول داخلی
    expect(content.className).toContain('max-h-[92dvh]');
    expect(content.className).toContain('overflow-y-auto');
  });
});
