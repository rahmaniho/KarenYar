import { describe, expect, it } from 'vitest';
import { computeQuote, durationLabel, type SubscriptionPlan } from './subscription-types';

function plan(code: 'basic' | 'pro' | 'proplus'): SubscriptionPlan {
  const prices = {
    basic: { base_monthly: 30_000, extra_user_monthly: 15_000 },
    pro: { base_monthly: 60_000, extra_user_monthly: 15_000 },
    proplus: { base_monthly: 120_000, extra_user_monthly: 20_000 },
  }[code];

  return {
    code,
    name: code,
    tier: code === 'proplus' ? 'proplus' : 'pro',
    description: null,
    min_seats: 1,
    max_seats: 50,
    is_lifetime: false,
    is_active: true,
    features: [],
    ...prices,
  };
}

describe('موتور نمایش قیمت اشتراک', () => {
  it('قیمت پایه را مطابق تعرفهٔ رسمی محاسبه می‌کند', () => {
    expect(computeQuote(plan('basic'), 1, 1).total).toBe(30_000);
    expect(computeQuote(plan('basic'), 1, 12).total).toBe(360_000);
    expect(computeQuote(plan('basic'), 2, 1).total).toBe(45_000);
    expect(computeQuote(plan('basic'), 5, 12).total).toBe(1_080_000);
  });

  it('قیمت نسخهٔ حرفه‌ای را مطابق تعرفهٔ رسمی محاسبه می‌کند', () => {
    expect(computeQuote(plan('pro'), 1, 1).total).toBe(60_000);
    expect(computeQuote(plan('pro'), 1, 12).total).toBe(720_000);
    expect(computeQuote(plan('pro'), 2, 1).total).toBe(75_000);
    expect(computeQuote(plan('pro'), 5, 12).total).toBe(1_440_000);
  });

  it('قیمت نسخهٔ حرفه‌ای پلاس را مطابق تعرفهٔ رسمی محاسبه می‌کند', () => {
    expect(computeQuote(plan('proplus'), 1, 1).total).toBe(120_000);
    expect(computeQuote(plan('proplus'), 1, 12).total).toBe(1_440_000);
    expect(computeQuote(plan('proplus'), 2, 1).total).toBe(140_000);
    expect(computeQuote(plan('proplus'), 5, 12).total).toBe(2_400_000);
  });

  it('جزئیات سفارش را کامل برمی‌گرداند', () => {
    const quote = computeQuote(plan('pro'), 5, 12);

    expect(quote.extra_users).toBe(4);
    expect(quote.extra_monthly).toBe(60_000);
    expect(quote.monthly_total).toBe(120_000);
    expect(quote.base_total).toBe(720_000);
    expect(quote.extra_total).toBe(720_000);
    expect(quote.subtotal).toBe(1_440_000);
    expect(quote.discount).toBe(0);
  });

  it('تخفیف درصدی و ثابت را اعمال می‌کند', () => {
    expect(
      computeQuote(plan('pro'), 5, 12, { code: 'OFF10', type: 'percent', value: 10 }).total,
    ).toBe(1_296_000);

    expect(
      computeQuote(plan('pro'), 1, 1, { code: 'FIX', type: 'fixed', value: 50_000 }).total,
    ).toBe(10_000);
  });

  it('تعداد کاربر را در بازهٔ پلن محدود می‌کند', () => {
    const custom = { ...plan('pro'), min_seats: 2, max_seats: 4 };

    expect(computeQuote(custom, 1, 1).seats).toBe(2);
    expect(computeQuote(custom, 9, 1).seats).toBe(4);
  });

  it('برچسب مدت را درست می‌سازد', () => {
    expect(durationLabel(12)).toContain('۱۲');
    expect(durationLabel(1)).toBe('1 ماه');
    expect(durationLabel(1, true)).toBe('مادام‌العمر');
  });
});
