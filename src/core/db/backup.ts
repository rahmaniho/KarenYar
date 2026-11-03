/**
 * پشتیبان‌گیری و بازیابی کامل داده‌ها به‌صورت فایل JSON
 * جدول لایسنس عمداً در خروجی قرار نمی‌گیرد تا کلید فعال‌سازی قابل اشتراک‌گذاری نباشد.
 */
import { db } from './db';
import { saveBlob } from '../utils/file-save';

export const BACKUP_FORMAT = 'karenyar-hesabyar-backup';
export const BACKUP_VERSION = 3;

export interface BackupData {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  tables: {
    products: unknown[];
    invoices: unknown[];
    invoiceItems: unknown[];
    transactions: unknown[];
    budgets: unknown[];
    debts: unknown[];
    employees: unknown[];
    payrolls: unknown[];
    customers: unknown[];
    customerPayments: unknown[];
    settings: unknown[];
    stockMovements: unknown[];
    heldSales: unknown[];
    financialEvents: unknown[];
  };
}

const TABLE_NAMES = [
  'products',
  'invoices',
  'invoiceItems',
  'transactions',
  'budgets',
  'debts',
  'employees',
  'payrolls',
  'customers',
  'customerPayments',
  'settings',
  'stockMovements',
  'heldSales',
  'financialEvents',
] as const;

/** جدول‌هایی که در نسخه‌های قدیمی فایل پشتیبان نبودند و نبودنشان خطا نیست */
const OPTIONAL_TABLES: ReadonlySet<string> = new Set([
  'customers',
  'customerPayments',
  'stockMovements',
  'heldSales',
  'financialEvents',
]);

export async function exportBackup(): Promise<BackupData> {
  const tables = {} as BackupData['tables'];
  await db.transaction(
    'r',
    TABLE_NAMES.map((name) => db.table(name)),
    async () => {
      for (const name of TABLE_NAMES) tables[name] = await db.table(name).toArray();
    },
  );
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables,
  };
}

/** اعتبارسنجی ساختار فایل پشتیبان — در صورت نامعتبر بودن پیام فارسی پرتاب می‌شود. */
export function validateBackup(data: unknown): BackupData {
  if (typeof data !== 'object' || data === null) {
    throw new Error('فایل پشتیبان معتبر نیست.');
  }
  const candidate = data as Partial<BackupData>;
  if (candidate.format !== BACKUP_FORMAT) {
    throw new Error('این فایل، پشتیبان حساب‌یار کارن سافت نیست.');
  }
  if (
    typeof candidate.version !== 'number' ||
    !Number.isInteger(candidate.version) ||
    candidate.version < 1 ||
    candidate.version > BACKUP_VERSION
  ) {
    throw new Error('نسخه‌ی فایل پشتیبان با این نسخه از برنامه سازگار نیست.');
  }
  if (typeof candidate.tables !== 'object' || candidate.tables === null) {
    throw new Error('ساختار فایل پشتیبان ناقص است.');
  }
  // ورودی اعتبارسنجی را تغییر نمی‌دهیم؛ نبودن جدول تنها در فایل قدیمی مجاز است،
  // نه اینکه یک جدول خراب یا ناقص نسخهٔ جدید بی‌صدا با آرایهٔ خالی جایگزین شود.
  const tables = { ...candidate.tables };
  for (const name of TABLE_NAMES) {
    if (!Array.isArray(tables[name])) {
      if (candidate.version < BACKUP_VERSION && OPTIONAL_TABLES.has(name) && !(name in tables)) {
        tables[name] = [];
        continue;
      }
      throw new Error(`جدول «${name}» در فایل پشتیبان یافت نشد یا معتبر نیست.`);
    }
  }
  const result = { ...candidate, tables } as BackupData;
  validateBackupRelations(result);
  return result;
}

/** ارجاع‌ها و کلیدهای یکتا پیش از clear بررسی می‌شوند؛ فایل ناسالم دادهٔ فعلی را پاک نمی‌کند. */
function validateBackupRelations(data: BackupData): void {
  const ids = new Map<string, Set<number>>();
  for (const name of TABLE_NAMES) {
    if (name === 'settings') continue;
    const seen = new Set<number>();
    for (const row of data.tables[name]) {
      if (typeof row !== 'object' || row === null)
        throw new Error(`رکورد جدول «${name}» معتبر نیست.`);
      const id = (row as { id?: unknown }).id;
      if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || seen.has(id))
        throw new Error(`شناسهٔ رکورد در جدول «${name}» نامعتبر یا تکراری است.`);
      seen.add(id);
    }
    ids.set(name, seen);
  }
  const invoices = data.tables.invoices as Array<{
    id: number;
    status?: string;
    checkoutKey?: string;
    total: number;
  }>;
  const keys = new Set<string>();
  for (const invoice of invoices) {
    if (!Number.isSafeInteger(invoice.total) || invoice.total < 0)
      throw new Error('مبلغ فاکتور در پشتیبان معتبر نیست.');
    if (invoice.status !== undefined && !['draft', 'completed', 'voided'].includes(invoice.status))
      throw new Error('وضعیت فاکتور در پشتیبان معتبر نیست.');
    if (invoice.checkoutKey) {
      if (keys.has(invoice.checkoutKey)) throw new Error('کلید سبد در پشتیبان تکراری است.');
      keys.add(invoice.checkoutKey);
    }
  }
  for (const item of data.tables.invoiceItems as Array<{ invoiceId: number }>)
    if (!ids.get('invoices')!.has(item.invoiceId))
      throw new Error('قلم فاکتور به سند ناموجود ارجاع دارد.');
  const paymentKeys = new Set<string>();
  const paymentIds = ids.get('customerPayments')!;
  for (const payment of data.tables.customerPayments as Array<{
    id: number;
    invoiceId?: number | null;
    customerId: number;
    amount: number;
    paymentKey?: string;
    kind?: string;
    reversalOf?: number;
  }>) {
    if (!Number.isSafeInteger(payment.amount) || payment.amount <= 0)
      throw new Error('مبلغ پرداخت در پشتیبان معتبر نیست.');
    if (!ids.get('customers')!.has(payment.customerId))
      throw new Error('پرداخت به مشتری ناموجود ارجاع دارد.');
    if (payment.invoiceId != null && !ids.get('invoices')!.has(payment.invoiceId))
      throw new Error('پرداخت به فاکتور ناموجود ارجاع دارد.');
    if (payment.kind !== undefined && !['payment', 'refund'].includes(payment.kind))
      throw new Error('نوع پرداخت در پشتیبان معتبر نیست.');
    if (payment.reversalOf != null && !paymentIds.has(payment.reversalOf))
      throw new Error('سند معکوس به پرداخت ناموجود ارجاع دارد.');
    if (payment.paymentKey) {
      if (paymentKeys.has(payment.paymentKey))
        throw new Error('کلید پرداخت در پشتیبان تکراری است.');
      paymentKeys.add(payment.paymentKey);
    }
  }
  const saleInvoices = new Set<number>();
  for (const transaction of data.tables.transactions as Array<{
    source?: string;
    invoiceId?: number;
    amount: number;
  }>) {
    if (!Number.isSafeInteger(transaction.amount) || transaction.amount < 0)
      throw new Error('مبلغ تراکنش در پشتیبان معتبر نیست.');
    if (transaction.invoiceId != null && !ids.get('invoices')!.has(transaction.invoiceId))
      throw new Error('تراکنش به فاکتور ناموجود ارجاع دارد.');
    if (transaction.source === 'sale') {
      if (transaction.invoiceId == null || saleInvoices.has(transaction.invoiceId))
        throw new Error('ثبت درآمد فروش تکراری یا بدون فاکتور است.');
      saleInvoices.add(transaction.invoiceId);
    }
  }
  for (const event of data.tables.financialEvents as Array<{
    invoiceId?: number;
    customerId?: number;
    paymentId?: number;
    action: string;
  }>) {
    if (
      event.invoiceId != null &&
      !ids.get('invoices')!.has(event.invoiceId) &&
      event.action !== 'draft_discarded'
    )
      throw new Error('رویداد مالی به سند ناموجود ارجاع دارد.');
    if (event.customerId != null && !ids.get('customers')!.has(event.customerId))
      throw new Error('رویداد مالی به مشتری ناموجود اشاره می‌کند.');
    if (event.paymentId != null && !paymentIds.has(event.paymentId))
      throw new Error('رویداد به پرداخت ناموجود ارجاع دارد.');
  }
}

/** بازیابی: همه‌ی داده‌های فعلی با محتوای فایل جایگزین می‌شود (تراکنشی و اتمیک). */
export async function importBackup(data: BackupData): Promise<void> {
  const valid = validateBackup(data);
  const needsOpeningStock = valid.version === 1 && valid.tables.stockMovements.length === 0;
  await db.transaction('rw', [...TABLE_NAMES.map((n) => db.table(n))], async () => {
    for (const name of TABLE_NAMES) {
      const table = db.table(name);
      await table.clear();
      const rows = valid.tables[name];
      if (rows.length > 0) await table.bulkAdd(rows);
    }
    if (needsOpeningStock) {
      const products = await db.products.toArray();
      const createdAt = new Date().toISOString();
      const opening = products
        .filter((product) => product.stock > 0)
        .map((product) => ({
          productId: product.id!,
          productName: product.name,
          type: 'opening' as const,
          quantity: product.stock,
          stockBefore: 0,
          stockAfter: product.stock,
          note: 'موجودی مبنا از پشتیبان قدیمی؛ بدون تغییر موجودی واقعی',
          createdAt,
        }));
      if (opening.length) await db.stockMovements.bulkAdd(opening);
      // درآمد فروش‌های قدیمی را اضافه نمی‌کنیم؛ ممکن است قبلاً دستی ثبت شده باشد.
    }
  });
}

/** ذخیره‌ی فایل JSON پشتیبان — وب: دانلود مرورگر، اپ بومی: اشتراک‌گذاری سیستمی */
export async function downloadBackupFile(backup: BackupData): Promise<void> {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const date = new Date().toISOString().slice(0, 10);
  await saveBlob(`hesabyar-backup-${date}.json`, blob);
}
