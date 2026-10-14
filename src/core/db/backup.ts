/**
 * پشتیبان‌گیری و بازیابی کامل داده‌ها به‌صورت فایل JSON
 * جدول لایسنس عمداً در خروجی قرار نمی‌گیرد تا کلید فعال‌سازی قابل اشتراک‌گذاری نباشد.
 */
import { db } from './db';

export const BACKUP_FORMAT = 'karenyar-hesabyar-backup';
export const BACKUP_VERSION = 1;

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
    settings: unknown[];
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
  'settings',
] as const;

export async function exportBackup(): Promise<BackupData> {
  const tables = {} as BackupData['tables'];
  for (const name of TABLE_NAMES) {
    tables[name] = await db.table(name).toArray();
  }
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
  if (typeof candidate.version !== 'number' || candidate.version > BACKUP_VERSION) {
    throw new Error('نسخه‌ی فایل پشتیبان با این نسخه از برنامه سازگار نیست.');
  }
  if (typeof candidate.tables !== 'object' || candidate.tables === null) {
    throw new Error('ساختار فایل پشتیبان ناقص است.');
  }
  for (const name of TABLE_NAMES) {
    if (!Array.isArray(candidate.tables[name])) {
      throw new Error(`جدول «${name}» در فایل پشتیبان یافت نشد.`);
    }
  }
  return candidate as BackupData;
}

/** بازیابی: همه‌ی داده‌های فعلی با محتوای فایل جایگزین می‌شود (تراکنشی و اتمیک). */
export async function importBackup(data: BackupData): Promise<void> {
  const valid = validateBackup(data);
  await db.transaction('rw', [...TABLE_NAMES.map((n) => db.table(n))], async () => {
    for (const name of TABLE_NAMES) {
      const table = db.table(name);
      await table.clear();
      const rows = valid.tables[name];
      if (rows.length > 0) await table.bulkAdd(rows);
    }
  });
}

/** دانلود JSON در مرورگر */
export function downloadBackupFile(backup: BackupData): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `hesabyar-backup-${date}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
