/**
 * لایه‌ی داده — Dexie (IndexedDB) آفلاین‌فرست
 * همه‌ی مبالغ به تومان ذخیره می‌شوند (رجوع به core/currency).
 */
import Dexie, { type EntityTable } from 'dexie';
import type { PayrollInput, PayrollResult } from '../calc/payroll';

export interface Product {
  id?: number;
  name: string;
  barcode?: string;
  category: string;
  /** قیمت خرید هر واحد */
  buyPrice: number;
  /** قیمت تمام‌شده‌ی محاسبه‌شده (خرید + مالیات + حمل + سربار) */
  costPrice: number;
  sellPrice: number;
  stock: number;
  unit: string;
  /** حد هشدار موجودی */
  minStock: number;
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id?: number;
  /** شماره‌ی فاکتور (ترتیبی) */
  number: number;
  date: string; // ISO میلادی
  customerName?: string;
  subtotal: number;
  discountType: 'percent' | 'amount';
  discountValue: number;
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  total: number;
  createdAt: string;
}

export interface InvoiceItem {
  id?: number;
  invoiceId: number;
  productId: number | null;
  name: string;
  qty: number;
  unitPrice: number;
  /** قیمت تمام‌شده‌ی واحد هنگام فروش (برای محاسبه‌ی سود) */
  unitCost: number;
  total: number;
}

export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id?: number;
  date: string; // ISO میلادی
  type: TransactionType;
  category: string;
  amount: number;
  description?: string;
  createdAt: string;
}

export interface Budget {
  id?: number;
  /** کلید ماه شمسی مثل 1404-07 */
  month: string;
  category: string;
  limit: number;
}

export type DebtKind = 'debt' | 'installment';

export interface Debt {
  id?: number;
  title: string;
  kind: DebtKind;
  /** مبلغ کل بدهی/وام */
  amount: number;
  /** مبلغ پرداخت‌شده تاکنون (برای بدهی ساده) */
  paidAmount: number;
  /** تعداد کل اقساط (برای قسطی) */
  installmentsCount?: number;
  /** مبلغ هر قسط (برای قسطی) */
  installmentAmount?: number;
  /** تعداد اقساط پرداخت‌شده */
  paidInstallments?: number;
  dueDate: string; // ISO میلادی — سررسید بعدی
  description?: string;
  createdAt: string;
}

export interface Employee {
  id?: number;
  name: string;
  nationalId?: string;
  position?: string;
  baseSalary: number;
  children: number;
  married: boolean;
  seniorityYears: number;
  startDate?: string;
  createdAt: string;
}

export interface PayrollRecord {
  id?: number;
  employeeId: number;
  /** کلید ماه شمسی */
  month: string;
  input: PayrollInput;
  result: PayrollResult;
  netPay: number;
  createdAt: string;
}

export interface KeyValueRow {
  key: string;
  value: unknown;
}

export class HesabyarDB extends Dexie {
  products!: EntityTable<Product, 'id'>;
  invoices!: EntityTable<Invoice, 'id'>;
  invoiceItems!: EntityTable<InvoiceItem, 'id'>;
  transactions!: EntityTable<Transaction, 'id'>;
  budgets!: EntityTable<Budget, 'id'>;
  debts!: EntityTable<Debt, 'id'>;
  employees!: EntityTable<Employee, 'id'>;
  payrolls!: EntityTable<PayrollRecord, 'id'>;
  settings!: EntityTable<KeyValueRow, 'key'>;
  license!: EntityTable<KeyValueRow, 'key'>;

  constructor() {
    super('karenyar-hesabyar');
    // نسخه‌ی ۱ — اسکیمای اولیه. نسخه‌های بعدی با upgrade امن اضافه می‌شوند.
    this.version(1).stores({
      products: '++id, name, barcode, category, stock',
      invoices: '++id, date, number, total',
      invoiceItems: '++id, invoiceId, productId',
      transactions: '++id, date, type, category, amount',
      budgets: '++id, month, category',
      debts: '++id, dueDate',
      employees: '++id, name',
      payrolls: '++id, employeeId, month',
      settings: 'key',
      license: 'key',
    });
  }
}

export const db = new HesabyarDB();

export const nowISO = () => new Date().toISOString();
