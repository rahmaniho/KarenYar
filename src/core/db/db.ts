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
  /** مالیات خرید (٪) — جزء قیمت تمام‌شده */
  buyTaxPercent: number;
  /** حمل هر واحد — جزء قیمت تمام‌شده */
  shippingPerUnit: number;
  /** سربار هر واحد — جزء قیمت تمام‌شده */
  overheadPerUnit: number;
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

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'credit';

export interface Invoice {
  id?: number;
  /** شماره‌ی فاکتور (ترتیبی) */
  number: number;
  date: string; // ISO میلادی
  customerName?: string;
  /** مشتری ثبت‌شده (دفتر مشتریان) — اختیاری */
  customerId?: number | null;
  /** فروش نسیه؟ (به مانده‌ی حساب مشتری اضافه می‌شود) */
  isCredit?: boolean;
  subtotal: number;
  discountType: 'percent' | 'amount';
  discountValue: number;
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  total: number;
  /** فاکتورهای قدیمی بدون status معتبر و فعال هستند. */
  status?: 'completed' | 'voided';
  source?: 'pos' | 'invoice';
  paymentMethod?: PaymentMethod;
  cashTendered?: number;
  changeAmount?: number;
  note?: string;
  /** شناسه‌ی ثابت هر سبد برای جلوگیری از ثبت دوباره‌ی یک فروش */
  checkoutKey?: string;
  checkoutSignature?: string;
  voidedAt?: string;
  voidReason?: string;
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
  /** فروش خودکار فقط از طریق فاکتور قابل اصلاح است. */
  source?: 'manual' | 'business' | 'sale';
  invoiceId?: number;
  createdAt: string;
}

export type StockMovementType = 'opening' | 'sale' | 'void' | 'restock' | 'adjustment';

export interface StockMovement {
  id?: number;
  productId: number;
  productName: string;
  invoiceId?: number;
  type: StockMovementType;
  /** مقدار علامت‌دار: ورود مثبت، خروج منفی */
  quantity: number;
  stockBefore: number;
  stockAfter: number;
  note?: string;
  createdAt: string;
}

export interface SaleDraftItem {
  productId: number | null;
  name: string;
  qty: number;
  /** همیشه تومان داخلی، مستقل از واحد نمایشی */
  unitPrice: number;
}

export interface SaleDraft {
  items: SaleDraftItem[];
  customerId: number | null;
  customerName: string;
  discountType: 'percent' | 'amount';
  discountValue: number;
  taxPercent: number;
  note: string;
  checkoutKey: string;
}

export interface HeldSale extends SaleDraft {
  id?: number;
  label: string;
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

export interface Customer {
  id?: number;
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  createdAt: string;
}

/** پرداخت مشتری بابت فروش‌های نسیه */
export interface CustomerPayment {
  id?: number;
  customerId: number;
  /** پرداخت مرتبط با فاکتور خاص (اختیاری) */
  invoiceId?: number | null;
  amount: number;
  date: string; // ISO میلادی
  note?: string;
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
  customers!: EntityTable<Customer, 'id'>;
  customerPayments!: EntityTable<CustomerPayment, 'id'>;
  settings!: EntityTable<KeyValueRow, 'key'>;
  license!: EntityTable<KeyValueRow, 'key'>;
  stockMovements!: EntityTable<StockMovement, 'id'>;
  heldSales!: EntityTable<HeldSale, 'id'>;

  constructor(name = 'karenyar-hesabyar') {
    super(name);
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
    // نسخه‌ی ۲ — دفتر مشتریان، فروش نسیه و پرداخت‌های مشتری (داده‌های قبلی دست‌نخورده می‌مانند)
    this.version(2).stores({
      invoices: '++id, date, number, total, customerId',
      customers: '++id, name, phone',
      customerPayments: '++id, customerId, invoiceId, date',
    });
    // نسخه‌ی ۳ — صندوق فروش، دفتر درآمد و گردش انبار؛ داده‌های نسخه‌های قبلی حفظ می‌شوند.
    this.version(3)
      .stores({
        invoices: '++id, date, number, total, customerId, status, &checkoutKey',
        transactions: '++id, date, type, category, amount, source, invoiceId, &[source+invoiceId]',
        stockMovements: '++id, productId, invoiceId, type, createdAt',
        heldSales: '++id, createdAt',
      })
      .upgrade(async (tx) => {
        const products = await tx.table<Product>('products').toArray();
        const createdAt = new Date().toISOString();
        const opening = products
          .filter((p) => p.stock > 0)
          .map((p) => ({
            productId: p.id!,
            productName: p.name,
            type: 'opening',
            quantity: p.stock,
            stockBefore: 0,
            stockAfter: p.stock,
            note: 'موجودی مبنا هنگام ارتقای برنامه؛ بدون تغییر موجودی واقعی',
            createdAt,
          }));
        if (opening.length) await tx.table('stockMovements').bulkAdd(opening);
        // درآمد فاکتورهای قدیمی را حدس نمی‌زنیم؛ ممکن است قبلاً دستی ثبت شده باشد.
      });
  }
}

export const db = new HesabyarDB();

export const nowISO = () => new Date().toISOString();
