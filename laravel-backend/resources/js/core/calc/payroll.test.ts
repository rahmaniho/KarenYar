import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAYROLL_RATES as RATES,
  calculateEidi,
  calculatePayroll,
  calculateSeverance,
  hourlyRate,
} from './payroll';

describe('محاسبه حقوق — حداقل‌بگیر ۱۴۰۵، مجرد بدون سابقه', () => {
  // حداقل مزد ماهانه‌ی ۱۴۰۵: ۵۵۴٬۱۸۵ × ۳۰ = ۱۶٬۶۲۵٬۵۵۰ تومان
  const result = calculatePayroll(
    { baseSalary: 16_625_550, children: 0, married: false, seniorityYears: 0 },
    RATES,
  );

  it('ناخالص = پایه + مسکن + بن', () => {
    expect(result.gross).toBe(21_825_550);
  });

  it('بیمه‌ی کارگر ۷٪ مبنای بیمه است', () => {
    expect(result.insuranceBase).toBe(21_825_550);
    expect(result.insuranceEmployee).toBe(1_527_789);
  });

  it('زیر سقف معافیت، مالیات صفر و خالص درست است', () => {
    expect(result.tax).toBe(0);
    expect(result.netPay).toBe(21_825_550 - 1_527_789);
  });

  it('بدون سابقه‌ی بالای یک سال، پایه سنوات صفر است', () => {
    expect(result.seniorityPay).toBe(0);
    expect(result.childAllowance).toBe(0);
    expect(result.marriageAllowance).toBe(0);
  });
});

describe('محاسبه حقوق — کارمند ارشد متأهل با دو فرزند', () => {
  const result = calculatePayroll(
    {
      baseSalary: 80_000_000,
      children: 2,
      married: true,
      seniorityYears: 3,
      overtimeHours: 10,
      workedDays: 30,
    },
    RATES,
  );

  it('پایه سنوات روزانه در روزهای کارکرد ضرب می‌شود', () => {
    expect(result.seniorityPay).toBe(16_667 * 30);
  });

  it('اضافه‌کاری با ضریب ۱٫۴ مزد ساعتی است', () => {
    expect(result.overtimePay).toBe(Math.round(hourlyRate(80_000_000) * 1.4 * 10));
  });

  it('حق اولاد مشمول بیمه نیست ولی مزایا کامل‌اند', () => {
    expect(result.childAllowance).toBe(2 * 1_662_555);
    expect(result.marriageAllowance).toBe(500_000);
    expect(result.insuranceBase).toBe(result.gross - result.childAllowance);
  });

  it('مالیات پلکانی و خالص پرداختی دقیق‌اند', () => {
    expect(result.gross).toBe(94_616_029);
    expect(result.insuranceEmployee).toBe(6_390_364);
    expect(result.taxableIncome).toBe(84_900_555);
    expect(result.tax).toBe(4_735_083);
    expect(result.netPay).toBe(83_490_582);
  });

  it('خالص همیشه برابر ناخالص منهای کسورات است', () => {
    expect(result.netPay).toBe(
      result.gross - result.insuranceEmployee - result.tax - result.otherDeductions,
    );
  });
});

describe('عیدی و سنوات', () => {
  it('عیدی حداقل‌بگیر برای یک سال کامل = ۶۰ روز حداقل مزد', () => {
    expect(calculateEidi({ dailyWage: 554_185, daysWorkedInYear: 365 }, RATES)).toBe(60 * 554_185);
  });

  it('عیدی از سقف ۹۰ روز حداقل مزد بیشتر نمی‌شود', () => {
    expect(calculateEidi({ dailyWage: 2_000_000, daysWorkedInYear: 365 }, RATES)).toBe(
      90 * 554_185,
    );
  });

  it('عیدی به نسبت روزهای کارکرد محاسبه می‌شود', () => {
    const full = calculateEidi({ dailyWage: 554_185, daysWorkedInYear: 365 }, RATES);
    const half = calculateEidi({ dailyWage: 554_185, daysWorkedInYear: 182.5 }, RATES);
    expect(half).toBe(Math.round(full / 2));
    expect(calculateEidi({ dailyWage: 554_185, daysWorkedInYear: 0 }, RATES)).toBe(0);
  });

  it('سنوات = هر سال یک ماه حقوق', () => {
    expect(calculateSeverance(20_000_000, 3)).toBe(60_000_000);
    expect(calculateSeverance(20_000_000, 0)).toBe(0);
  });
});
