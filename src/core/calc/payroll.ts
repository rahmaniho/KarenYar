/**
 * دستمزد‌یار — محاسبات حقوق و دستمزد طبق قانون کار جمهوری اسلامی ایران
 * همه‌ی نرخ‌ها قابل ویرایش‌اند (تنظیمات دستمزد). مقادیر پیش‌فرض: مصوبات سال ۱۴۰۴.
 * همه‌ی مبالغ به تومان هستند.
 */
import { roundMoney } from '../currency/currency';
import { progressiveTax, type TaxBracket, type TaxSlice } from './finance';

export interface PayrollRates {
  /** حداقل مزد روزانه‌ی قانونی */
  minDailyWage: number;
  /** حق مسکن ماهانه */
  housingAllowance: number;
  /** بن خواربار ماهانه */
  groceryAllowance: number;
  /** حق اولاد به‌ازای هر فرزند (ماهانه) */
  childAllowancePerChild: number;
  /** حق تأهل ماهانه */
  marriageAllowance: number;
  /** پایه سنوات روزانه (برای سابقه‌ی بیش از یک سال) */
  seniorityDailyBase: number;
  /** سهم بیمه‌ی کارگر (درصد) */
  insuranceRatePercent: number;
  /** نرخ فوق‌العاده‌ی اضافه‌کاری (ضریب مزد ساعتی) */
  overtimeFactor: number;
  /** نرخ فوق‌العاده‌ی شب‌کاری غیرنوبتی (درصد مزد ساعتی) */
  nightShiftRatePercent: number;
  /** پله‌های مالیات حقوق (ماهانه) */
  taxBrackets: TaxBracket[];
}

/**
 * مقادیر پیش‌فرض سال ۱۴۰۴ (قابل ویرایش در تنظیمات):
 * حداقل مزد ماهانه ۱۰٬۳۹۰٬۹۶۸ تومان | مسکن ۹۰۰٬۰۰۰ | بن ۲٬۲۰۰٬۰۰۰ | اولاد ۱٬۰۳۹٬۰۹۷
 * معافیت مالیاتی ماهانه ۲۴٬۰۰۰٬۰۰۰ تومان و پله‌های ۱۰/۱۵/۲۰/۲۵/۳۰ درصد.
 */
export const DEFAULT_PAYROLL_RATES: PayrollRates = {
  minDailyWage: 346_366,
  housingAllowance: 900_000,
  groceryAllowance: 2_200_000,
  childAllowancePerChild: 1_039_097,
  marriageAllowance: 500_000,
  seniorityDailyBase: 94_000,
  insuranceRatePercent: 7,
  overtimeFactor: 1.4,
  nightShiftRatePercent: 35,
  taxBrackets: [
    { upTo: 24_000_000, ratePercent: 0 },
    { upTo: 30_000_000, ratePercent: 10 },
    { upTo: 38_000_000, ratePercent: 15 },
    { upTo: 50_000_000, ratePercent: 20 },
    { upTo: 66_666_667, ratePercent: 25 },
    { upTo: null, ratePercent: 30 },
  ],
};

/** مزد ساعتی مبنا = حقوق پایه‌ی ماهانه ÷ ۲۲۰ */
export function hourlyRate(baseSalary: number): number {
  return baseSalary / 220;
}

/** مزد روزانه‌ی قراردادی کارگر (مبنای عیدی) */
export function dailyWage(baseSalary: number): number {
  return baseSalary / 30;
}

export interface PayrollInput {
  /** حقوق پایه‌ی ماهانه‌ی قراردادی */
  baseSalary: number;
  children: number;
  married: boolean;
  /** سابقه‌ی کار (سال) — پایه سنوات برای سابقه‌ی بالای یک سال اعمال می‌شود */
  seniorityYears: number;
  /** روزهای کارکرد در ماه (پیش‌فرض ۳۰) */
  workedDays?: number;
  overtimeHours?: number;
  nightShiftHours?: number;
  /** سایر مزایا (تومان) */
  otherBenefits?: number;
  /** سایر کسورات (تومان) — مثل مساعده یا غیبت */
  otherDeductions?: number;
}

export interface PayrollResult {
  baseSalary: number;
  seniorityPay: number;
  housingAllowance: number;
  groceryAllowance: number;
  childAllowance: number;
  marriageAllowance: number;
  overtimePay: number;
  nightShiftPay: number;
  otherBenefits: number;
  /** جمع ناخالص */
  gross: number;
  /** مبنای کسر بیمه */
  insuranceBase: number;
  insuranceEmployee: number;
  taxableIncome: number;
  tax: number;
  taxSlices: TaxSlice[];
  otherDeductions: number;
  /** خالص پرداختی */
  netPay: number;
}

export function calculatePayroll(input: PayrollInput, rates: PayrollRates): PayrollResult {
  const workedDays = input.workedDays ?? 30;
  const overtimeHours = input.overtimeHours ?? 0;
  const nightShiftHours = input.nightShiftHours ?? 0;
  const otherBenefits = input.otherBenefits ?? 0;
  const otherDeductions = input.otherDeductions ?? 0;

  // پایه سنوات: روزانه × روزهای کارکرد (فقط سابقه‌ی بالای یک سال)
  const seniorityPay =
    input.seniorityYears >= 1 ? roundMoney(rates.seniorityDailyBase * workedDays) : 0;

  const housingAllowance = rates.housingAllowance;
  const groceryAllowance = rates.groceryAllowance;
  const childAllowance = roundMoney(rates.childAllowancePerChild * Math.max(input.children, 0));
  const marriageAllowance = input.married ? rates.marriageAllowance : 0;

  const hourly = hourlyRate(input.baseSalary);
  const overtimePay = roundMoney(hourly * rates.overtimeFactor * overtimeHours);
  const nightShiftPay = roundMoney(hourly * (rates.nightShiftRatePercent / 100) * nightShiftHours);

  const gross = roundMoney(
    input.baseSalary +
      seniorityPay +
      housingAllowance +
      groceryAllowance +
      childAllowance +
      marriageAllowance +
      overtimePay +
      nightShiftPay +
      otherBenefits,
  );

  // مبنای بیمه: حقوق + پایه سنوات + مسکن + بن + تأهل + اضافه‌کاری + شب‌کاری
  // (حق اولاد مشمول بیمه نیست)
  const insuranceBase = roundMoney(
    input.baseSalary +
      seniorityPay +
      housingAllowance +
      groceryAllowance +
      marriageAllowance +
      overtimePay +
      nightShiftPay +
      otherBenefits,
  );
  const insuranceEmployee = roundMoney((insuranceBase * rates.insuranceRatePercent) / 100);

  // درآمد مشمول مالیات: ناخالص منهای بیمه‌ی سهم کارگر؛ حق اولاد از مالیات معاف است
  const taxableIncome = Math.max(0, gross - insuranceEmployee - childAllowance);
  const { tax, slices } = progressiveTax(taxableIncome, rates.taxBrackets);

  const netPay = roundMoney(gross - insuranceEmployee - tax - otherDeductions);

  return {
    baseSalary: input.baseSalary,
    seniorityPay,
    housingAllowance,
    groceryAllowance,
    childAllowance,
    marriageAllowance,
    overtimePay,
    nightShiftPay,
    otherBenefits,
    gross,
    insuranceBase,
    insuranceEmployee,
    taxableIncome,
    tax,
    taxSlices: slices,
    otherDeductions,
    netPay,
  };
}

// ————— عیدی و سنوات —————

export interface EidiInput {
  /** مزد روزانه‌ی فعلی کارگر */
  dailyWage: number;
  /** روزهای کارکرد در سال (حداکثر ۳۶۵) */
  daysWorkedInYear: number;
}

/**
 * عیدی سالانه = ۶۰ روز آخرین مزد، حداکثر ۹۰ روز حداقل مزد قانونی؛
 * برای کارکرد کمتر از یک سال به نسبت روزهای کارکرد.
 */
export function calculateEidi(input: EidiInput, rates: PayrollRates): number {
  const fullYearEidi = Math.min(60 * input.dailyWage, 90 * rates.minDailyWage);
  const ratio = Math.min(Math.max(input.daysWorkedInYear, 0), 365) / 365;
  return roundMoney(fullYearEidi * ratio);
}

/** سنوات (مزایای پایان کار) = به‌ازای هر سال سابقه، یک ماه آخرین حقوق (پایه + پایه سنوات) */
export function calculateSeverance(monthlyWage: number, yearsOfService: number): number {
  return roundMoney(monthlyWage * Math.max(yearsOfService, 0));
}

/** مبلغ عیدی پیش‌فرض بر اساس حقوق پایه‌ی ماهانه */
export function eidiFromMonthlySalary(
  baseSalary: number,
  seniorityPayMonthly: number,
  daysWorkedInYear: number,
  rates: PayrollRates,
): number {
  return calculateEidi(
    { dailyWage: (baseSalary + seniorityPayMonthly) / 30, daysWorkedInYear },
    rates,
  );
}
