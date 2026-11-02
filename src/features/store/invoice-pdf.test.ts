import { describe, expect, it } from 'vitest';
import { invoiceFileName } from './invoice-pdf';

describe('سند PDF فاکتور', () => {
  it('نام فایل با شماره‌ی فاکتور ساخته می‌شود', () => {
    expect(invoiceFileName(2)).toBe('factor-2');
    expect(`${invoiceFileName(1024)}.pdf`).toBe('factor-1024.pdf');
  });

  it('شماره‌ی متنی (فارسی) هم پشتیبانی می‌شود', () => {
    expect(invoiceFileName('۱۲')).toBe('factor-۱۲');
  });

  it('فاصله‌ی اضافی نام فایل حذف می‌شود', () => {
    expect(invoiceFileName(' 77 ')).toBe('factor-77');
  });
});
