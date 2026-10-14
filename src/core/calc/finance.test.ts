import { describe, expect, it } from 'vitest';
import {
  amortizationSchedule,
  applyDiscount,
  compoundInterest,
  landedCost,
  loanInstallment,
  netFromGross,
  priceWithVat,
  profitFromPrices,
  progressiveTax,
  sellPriceForMargin,
  vatAmount,
  type TaxBracket,
} from './finance';

describe('تخفیف', () => {
  it('تخفیف درصدی', () => {
    expect(applyDiscount(200_000, 'percent', 15)).toEqual({
      discountAmount: 30_000,
      finalPrice: 170_000,
    });
  });

  it('تخفیف مبلغی بیشتر از قیمت، قیمت را منفی نمی‌کند', () => {
    expect(applyDiscount(50_000, 'amount', 80_000)).toEqual({
      discountAmount: 50_000,
      finalPrice: 0,
    });
  });
});

describe('مالیات بر ارزش افزوده', () => {
  it('مبلغ مالیات و قیمت نهایی', () => {
    expect(vatAmount(100_000, 10)).toBe(10_000);
    expect(priceWithVat(100_000, 10)).toBe(110_000);
  });

  it('استخراج مبلغ خالص از قیمت شامل مالیات', () => {
    expect(netFromGross(110_000, 10)).toBe(100_000);
  });
});

describe('قیمت تمام‌شده و سود', () => {
  it('قیمت تمام‌شده = خرید + مالیات + حمل + سربار', () => {
    expect(
      landedCost({
        buyPrice: 100_000,
        taxPercent: 10,
        shippingPerUnit: 5_000,
        overheadPerUnit: 2_000,
      }),
    ).toBe(117_000);
  });

  it('حاشیه سود و درصد روی تمام‌شده', () => {
    const result = profitFromPrices(150_000, 100_000);
    expect(result.grossProfit).toBe(50_000);
    expect(result.marginPercent).toBeCloseTo(33.333, 2);
    expect(result.markupPercent).toBe(50);
  });

  it('قیمت فروش برای حاشیه‌ی هدف معکوس حاشیه سود است', () => {
    const price = sellPriceForMargin(100_000, 25);
    expect(profitFromPrices(price, 100_000).marginPercent).toBeCloseTo(25, 1);
  });
});

describe('سود مرکب', () => {
  it('یک سال با نرخ ۲۰٪', () => {
    expect(compoundInterest(10_000_000, 20, 1)).toEqual({
      finalAmount: 12_000_000,
      totalInterest: 2_000_000,
    });
  });

  it('ترکیب ماهانه از سالانه بیشتر است', () => {
    const yearly = compoundInterest(10_000_000, 12, 1, 1);
    const monthly = compoundInterest(10_000_000, 12, 1, 12);
    expect(monthly.finalAmount).toBeGreaterThan(yearly.finalAmount);
  });
});

describe('وام و اقساط', () => {
  it('وام بدون سود اقساط مساوی دارد', () => {
    expect(loanInstallment(120_000_000, 0, 12)).toEqual({
      monthlyPayment: 10_000_000,
      totalPayment: 120_000_000,
      totalInterest: 0,
    });
  });

  it('قسط وام با فرمول EMI درست است', () => {
    const result = loanInstallment(10_000_000, 12, 12);
    expect(result.monthlyPayment).toBeCloseTo(888_488, -1);
    expect(result.totalInterest).toBeGreaterThan(600_000);
  });

  it('جدول استهلاک در پایان به مانده‌ی صفر می‌رسد', () => {
    const schedule = amortizationSchedule(50_000_000, 18, 24);
    expect(schedule).toHaveLength(24);
    expect(schedule[schedule.length - 1].remainingBalance).toBe(0);
    const principalSum = schedule.reduce((sum, row) => sum + row.principalPart, 0);
    expect(principalSum).toBe(50_000_000);
  });
});

describe('مالیات پلکانی', () => {
  const brackets: TaxBracket[] = [
    { upTo: 24_000_000, ratePercent: 0 },
    { upTo: 30_000_000, ratePercent: 10 },
    { upTo: 38_000_000, ratePercent: 15 },
    { upTo: 50_000_000, ratePercent: 20 },
    { upTo: 66_666_667, ratePercent: 25 },
    { upTo: null, ratePercent: 30 },
  ];

  it('تا سقف معافیت مالیات صفر است', () => {
    expect(progressiveTax(20_000_000, brackets).tax).toBe(0);
    expect(progressiveTax(24_000_000, brackets).tax).toBe(0);
  });

  it('فقط مازاد هر پله با نرخ همان پله حساب می‌شود', () => {
    expect(progressiveTax(30_000_000, brackets).tax).toBe(600_000);
    // ۶۰۰هزار (پله ۱۰٪) + ۸میلیون×۱۵٪ + ۲میلیون×۲۰٪
    expect(progressiveTax(40_000_000, brackets).tax).toBe(2_200_000);
  });

  it('نرخ مؤثر برای درآمد بالا بین صفر و بالاترین پله است', () => {
    const result = progressiveTax(100_000_000, brackets);
    expect(result.effectiveRatePercent).toBeGreaterThan(10);
    expect(result.effectiveRatePercent).toBeLessThan(30);
  });
});
