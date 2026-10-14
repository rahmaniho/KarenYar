/**
 * محاسبات مالی خالص (Pure Functions) — بدون هیچ وابستگی به UI یا دیتابیس.
 * همه‌ی مبالغ به تومان هستند.
 */
import { roundMoney } from '../currency/currency';

// ————— درصد و تخفیف —————

export function percentOf(value: number, percent: number): number {
  return (value * percent) / 100;
}

export type DiscountType = 'percent' | 'amount';

export interface DiscountResult {
  discountAmount: number;
  finalPrice: number;
}

/** اعمال تخفیف درصدی یا مبلغی؛ قیمت نهایی هرگز منفی نمی‌شود. */
export function applyDiscount(price: number, type: DiscountType, value: number): DiscountResult {
  const raw = type === 'percent' ? percentOf(price, value) : value;
  const discountAmount = roundMoney(Math.min(Math.max(raw, 0), Math.max(price, 0)));
  return { discountAmount, finalPrice: roundMoney(price - discountAmount) };
}

// ————— مالیات بر ارزش افزوده —————

export function vatAmount(netPrice: number, vatPercent: number): number {
  return roundMoney(percentOf(netPrice, vatPercent));
}

export function priceWithVat(netPrice: number, vatPercent: number): number {
  return roundMoney(netPrice + vatAmount(netPrice, vatPercent));
}

/** استخراج مبلغ خالص از قیمت شامل مالیات */
export function netFromGross(grossPrice: number, vatPercent: number): number {
  if (vatPercent <= 0) return roundMoney(grossPrice);
  return roundMoney(grossPrice / (1 + vatPercent / 100));
}

// ————— قیمت تمام‌شده و سود فروشگاهی —————

export interface LandedCostInput {
  buyPrice: number;
  /** مالیات/عوارض خرید به درصد (مثلاً ارزش افزوده‌ی پرداختی روی خرید) */
  taxPercent?: number;
  /** حمل به‌ازای هر واحد */
  shippingPerUnit?: number;
  /** سربار به‌ازای هر واحد */
  overheadPerUnit?: number;
}

/** قیمت تمام‌شده‌ی هر واحد کالا = خرید + مالیات خرید + حمل + سربار */
export function landedCost(input: LandedCostInput): number {
  const { buyPrice, taxPercent = 0, shippingPerUnit = 0, overheadPerUnit = 0 } = input;
  return roundMoney(buyPrice + percentOf(buyPrice, taxPercent) + shippingPerUnit + overheadPerUnit);
}

export interface ProfitResult {
  grossProfit: number;
  /** حاشیه سود = سود ÷ قیمت فروش ×۱۰۰ */
  marginPercent: number;
  /** درصد سود روی تمام‌شده = سود ÷ تمام‌شده ×۱۰۰ */
  markupPercent: number;
}

export function profitFromPrices(sellPrice: number, unitCost: number): ProfitResult {
  const grossProfit = roundMoney(sellPrice - unitCost);
  return {
    grossProfit,
    marginPercent: sellPrice > 0 ? (grossProfit / sellPrice) * 100 : 0,
    markupPercent: unitCost > 0 ? (grossProfit / unitCost) * 100 : 0,
  };
}

/** قیمت فروش لازم برای رسیدن به حاشیه سود هدف (درصد) */
export function sellPriceForMargin(unitCost: number, marginPercent: number): number {
  if (marginPercent >= 100) return roundMoney(unitCost); // حاشیه‌ی ۱۰۰٪ ناممکن است
  return roundMoney(unitCost / (1 - marginPercent / 100));
}

/** سود خالص دوره = درآمد − بهای تمام‌شده‌ی کالای فروش‌رفته − هزینه‌ها */
export function netProfit(revenue: number, costOfGoods: number, expenses: number): number {
  return roundMoney(revenue - costOfGoods - expenses);
}

// ————— سود مرکب —————

export interface CompoundResult {
  finalAmount: number;
  totalInterest: number;
}

export function compoundInterest(
  principal: number,
  annualRatePercent: number,
  years: number,
  compoundsPerYear = 1,
): CompoundResult {
  const finalAmount = principal * Math.pow(1 + annualRatePercent / 100 / compoundsPerYear, compoundsPerYear * years);
  return { finalAmount: roundMoney(finalAmount), totalInterest: roundMoney(finalAmount - principal) };
}

/** سود ساده */
export function simpleInterest(principal: number, annualRatePercent: number, years: number): CompoundResult {
  const interest = (principal * annualRatePercent * years) / 100;
  return { finalAmount: roundMoney(principal + interest), totalInterest: roundMoney(interest) };
}

// ————— وام و اقساط —————

export interface LoanResult {
  monthlyPayment: number;
  totalPayment: number;
  totalInterest: number;
}

/** قسط ماهانه‌ی وام با نرخ سود سالانه (فرمول استاندارد EMI) */
export function loanInstallment(principal: number, annualRatePercent: number, months: number): LoanResult {
  if (months <= 0) return { monthlyPayment: 0, totalPayment: 0, totalInterest: 0 };
  if (principal <= 0) return { monthlyPayment: 0, totalPayment: 0, totalInterest: 0 };
  const monthlyRate = annualRatePercent / 100 / 12;
  if (monthlyRate === 0) {
    const monthlyPayment = roundMoney(principal / months);
    return { monthlyPayment, totalPayment: monthlyPayment * months, totalInterest: 0 };
  }
  const payment = (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
  const monthlyPayment = roundMoney(payment);
  const totalPayment = monthlyPayment * months;
  return { monthlyPayment, totalPayment, totalInterest: totalPayment - principal };
}

export interface AmortizationRow {
  month: number;
  payment: number;
  principalPart: number;
  interestPart: number;
  remainingBalance: number;
}

/** جدول استهلاک وام ماه‌به‌ماه */
export function amortizationSchedule(
  principal: number,
  annualRatePercent: number,
  months: number,
): AmortizationRow[] {
  const { monthlyPayment } = loanInstallment(principal, annualRatePercent, months);
  const monthlyRate = annualRatePercent / 100 / 12;
  const rows: AmortizationRow[] = [];
  let balance = principal;
  for (let month = 1; month <= months; month++) {
    const interestPart = roundMoney(balance * monthlyRate);
    let principalPart = monthlyPayment - interestPart;
    if (month === months || principalPart > balance) principalPart = balance; // تسویه‌ی دقیق قسط آخر
    const payment = principalPart + interestPart;
    balance = roundMoney(balance - principalPart);
    rows.push({ month, payment, principalPart, interestPart, remainingBalance: Math.max(balance, 0) });
    if (balance <= 0) break;
  }
  return rows;
}

// ————— مالیات پلکانی (عمومی؛ در دستمزد هم استفاده می‌شود) —————

export interface TaxBracket {
  /** سقف این پله (تومان) — null یعنی بی‌نهایت */
  upTo: number | null;
  ratePercent: number;
}

export interface TaxSlice {
  from: number;
  to: number | null;
  ratePercent: number;
  taxableAmount: number;
  tax: number;
}

export interface ProgressiveTaxResult {
  tax: number;
  slices: TaxSlice[];
  effectiveRatePercent: number;
}

/** محاسبه‌ی مالیات پلکانی تصاعدی روی درآمد */
export function progressiveTax(income: number, brackets: TaxBracket[]): ProgressiveTaxResult {
  const slices: TaxSlice[] = [];
  let tax = 0;
  let lower = 0;
  const sorted = [...brackets].sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
  for (const bracket of sorted) {
    const upper = bracket.upTo ?? Infinity;
    if (income <= lower) break;
    const taxableAmount = Math.min(income, upper) - lower;
    if (taxableAmount > 0) {
      const sliceTax = roundMoney((taxableAmount * bracket.ratePercent) / 100);
      tax += sliceTax;
      slices.push({
        from: lower,
        to: bracket.upTo,
        ratePercent: bracket.ratePercent,
        taxableAmount: roundMoney(taxableAmount),
        tax: sliceTax,
      });
    }
    lower = upper;
  }
  return {
    tax: roundMoney(tax),
    slices,
    effectiveRatePercent: income > 0 ? (tax / income) * 100 : 0,
  };
}
