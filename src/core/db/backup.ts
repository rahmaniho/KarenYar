/**
 * پشتیبان‌گیری و بازیابی کامل داده‌ها به‌صورت فایل JSON
 * جدول لایسنس عمداً در خروجی قرار نمی‌گیرد تا کلید فعال‌سازی قابل اشتراک‌گذاری نباشد.
 */
import { db } from './db';
import { saveBlob } from '../utils/file-save';

export const BACKUP_FORMAT = 'karenyar-hesabyar-backup';
export const BACKUP_VERSION = 2;

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
] as const;

/** جدول‌هایی که در نسخه‌های قدیمی فایل پشتیبان نبودند و نبودنشان خطا نیست */
const OPTIONAL_TABLES: ReadonlySet<string> = new Set([
  'customers',
  'customerPayments',
  'stockMovements',
  'heldSales',
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
      if (candidate.version === 1 && OPTIONAL_TABLES.has(name) && !(name in tables)) {
        tables[name] = [];
        continue;
      }
      throw new Error(`جدول «${name}» در فایل پشتیبان یافت نشد یا معتبر نیست.`);
    }
  }
  return { ...candidate, tables } as BackupData;
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
