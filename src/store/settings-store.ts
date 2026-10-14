/**
 * تنظیمات برنامه — در localStorage ذخیره می‌شود (مستقل از دیتابیس اصلی)
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CurrencyUnit } from '@/core/currency/currency';
import { DEFAULT_PAYROLL_RATES, type PayrollRates } from '@/core/calc/payroll';
import { DEFAULT_CURRENCY_RATES, type CurrencyRate } from '@/core/calc/units';

export type ThemeMode = 'light' | 'dark' | 'system';

interface SettingsState {
  theme: ThemeMode;
  currencyUnit: CurrencyUnit;
  shopName: string;
  shopPhone: string;
  shopAddress: string;
  /** نرخ پیش‌فرض مالیات بر ارزش افزوده در فاکتور (درصد) */
  invoiceTaxPercent: number;
  /** آستانه‌ی پیش‌فرض هشدار موجودی */
  defaultMinStock: number;
  payrollRates: PayrollRates;
  currencyRates: CurrencyRate[];
  /** هش SHA-256 پین قفل برنامه — null یعنی قفل غیرفعال */
  pinHash: string | null;
  setTheme: (theme: ThemeMode) => void;
  setCurrencyUnit: (unit: CurrencyUnit) => void;
  updateShop: (
    patch: Partial<Pick<SettingsState, 'shopName' | 'shopPhone' | 'shopAddress'>>,
  ) => void;
  setInvoiceTaxPercent: (value: number) => void;
  setDefaultMinStock: (value: number) => void;
  setPayrollRates: (rates: PayrollRates) => void;
  setCurrencyRates: (rates: CurrencyRate[]) => void;
  setPinHash: (pinHash: string | null) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      currencyUnit: 'toman',
      shopName: 'فروشگاه من',
      shopPhone: '',
      shopAddress: '',
      invoiceTaxPercent: 10,
      defaultMinStock: 5,
      payrollRates: DEFAULT_PAYROLL_RATES,
      currencyRates: DEFAULT_CURRENCY_RATES,
      pinHash: null,
      setTheme: (theme) => set({ theme }),
      setCurrencyUnit: (currencyUnit) => set({ currencyUnit }),
      updateShop: (patch) => set(patch),
      setInvoiceTaxPercent: (invoiceTaxPercent) => set({ invoiceTaxPercent }),
      setDefaultMinStock: (defaultMinStock) => set({ defaultMinStock }),
      setPayrollRates: (payrollRates) => set({ payrollRates }),
      setCurrencyRates: (currencyRates) => set({ currencyRates }),
      setPinHash: (pinHash) => set({ pinHash }),
    }),
    { name: 'hesabyar-settings', version: 1 },
  ),
);

/** اعمال تم روی ریشه‌ی سند */
export function applyTheme(theme: ThemeMode): void {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  const isDark = theme === 'dark' || (theme === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', isDark);
}
