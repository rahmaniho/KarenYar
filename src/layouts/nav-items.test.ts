import { describe, expect, it } from 'vitest';
import { MOBILE_NAV, NAV_GROUPS, NAV_INDEX, normalizeNavText, searchNavItems } from './nav-items';

/** مسیرهای واقعی router.tsx — اگر منویی حذف یا اضافه شود این تست fail میشود */
const ROUTER_PATHS = [
  '/',
  '/store/pos',
  '/store/inventory',
  '/store/finance',
  '/store/products',
  '/store/invoices',
  '/store/reports',
  '/store/customers',
  '/personal/transactions',
  '/personal/budgets',
  '/personal/debts',
  '/payroll/employees',
  '/payroll/calculate',
  '/payroll/settings',
  '/calculator',
  '/settings',
];

describe('مدل ناوبری', () => {
  it('همهی مسیرهای روتر دقیقاً یکبار در منو وجود دارند', () => {
    expect(NAV_INDEX).toHaveLength(ROUTER_PATHS.length);
    expect([...NAV_INDEX.map((i) => i.to)].sort()).toEqual([...ROUTER_PATHS].sort());
    expect(new Set(NAV_INDEX.map((i) => i.to)).size).toBe(ROUTER_PATHS.length);
  });

  it('پنج گروه و ناوبری پایینی موبایل دستنخوردهاند', () => {
    expect(NAV_GROUPS.map((g) => g.title)).toEqual([
      'اصلی',
      'حساب\u200cیار فروشگاهی',
      'مدیریت مالی',
      'دستمزد\u200cیار',
      'ابزارها',
    ]);
    expect(MOBILE_NAV.map((i) => i.to)).toEqual([
      '/',
      '/store/pos',
      '/personal/transactions',
      '/calculator',
      '/settings',
    ]);
    expect(NAV_GROUPS.find((g) => g.id === 'main')?.items[0].end).toBe(true);
  });

  it('مسیرها فقط از صفحات موجود ساخته شدهاند (هیچ مسیر ساختگی نیست)', () => {
    for (const entry of NAV_INDEX) {
      expect(entry.to.startsWith('/')).toBe(true);
      expect(ROUTER_PATHS).toContain(entry.to);
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.icon).toBeTruthy();
    }
  });
});

describe('جستجوی منو', () => {
  it('نرمالسازی فارسی: نیمفاصله، ی/ک عربی و ارقام', () => {
    expect(normalizeNavText('ماشین\u200cحساب')).toBe('ماشینحساب');
    expect(normalizeNavText('فاكتور')).toBe('فاکتور');
    expect(normalizeNavText('۱۲۳')).toBe('123');
    expect(normalizeNavText('  دَفتر  ')).toBe('دفتر');
  });

  it('با نام صفحه، واژهی هممعنا، گروه و مسیر نتیجه میدهد', () => {
    expect(searchNavItems('فاکتور')[0]?.to).toBe('/store/invoices');
    expect(searchNavItems('فاكتور')[0]?.to).toBe('/store/invoices');
    expect(searchNavItems('صورتحساب').map((r) => r.to)).toContain('/store/invoices');
    expect(searchNavItems('دستمزد').length).toBeGreaterThan(0);
    expect(searchNavItems('payroll/calculate').some((r) => r.to === '/payroll/calculate')).toBe(
      true,
    );
  });

  it('عبارت خالی یا نامربوط نتیجهای برنمیگرداند و سقف نتایج رعایت میشود', () => {
    expect(searchNavItems('')).toEqual([]);
    expect(searchNavItems('   ')).toEqual([]);
    expect(searchNavItems('zzzzz')).toEqual([]);
    expect(searchNavItems('ها', 3).length).toBeLessThanOrEqual(3);
  });
});
