/**
 * مهاجرت دادهٔ نسخهٔ آفلاین به سرور.
 *
 * کاربری که تا حالا با اپ PWA/اندروید کار می‌کرده، یک فایل پشتیبان JSON دارد.
 * این ماژول همان فایل را می‌خواند و با `POST /api/sync/import` به سرور منتقل
 * می‌کند. درج در سرور «ادغامی» است: ردیف‌هایی که از قبل روی سرور هستند دست‌نخورده
 * می‌مانند و شناسه‌ها حفظ می‌شوند تا ارجاع بین جدول‌ها (مثلاً اقلام فاکتور) درست بماند.
 */
import { apiFetch } from '@/core/api/client';
import { serverDb } from './db';
import { validateBackup } from './backup';

export interface ImportResult {
  total: number;
  imported: Record<string, number>;
}

interface ImportResponse {
  ok?: boolean;
  total?: number;
  imported?: Record<string, number>;
}

/** خواندن متن فایل؛ در مرورگرهای قدیمی که Blob.text ندارند از FileReader استفاده می‌شود. */
async function readText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('خواندن فایل پشتیبان ممکن نشد.'));
    reader.readAsText(file);
  });
}

/** خواندن فایل پشتیبان و ارسال آن به سرور؛ بعد از موفقیت داده از سرور بازخوانی می‌شود. */
export async function importBackupFile(file: File | Blob): Promise<ImportResult> {
  const text = await readText(file);

  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('فایل پشتیبان JSON معتبر نیست.');
  }

  const backup = validateBackup(parsed);

  const response = await apiFetch<ImportResponse>('/api/sync/import', {
    method: 'POST',
    body: JSON.stringify({ tables: backup.tables }),
  });

  // داده‌ی سرور عوض شد؛ pull کامل تازه انجام می‌شود.
  serverDb?.reset();
  await serverDb?.ensureLoaded();

  return {
    total: response.total ?? 0,
    imported: response.imported ?? {},
  };
}

/** خلاصهٔ خوانا از نتیجهٔ مهاجرت (برای نمایش در UI). */
export function summarizeImport(result: ImportResult): string {
  const labels: Record<string, string> = {
    products: 'کالا',
    invoices: 'فاکتور',
    invoiceItems: 'قلم فاکتور',
    transactions: 'تراکنش',
    budgets: 'بودجه',
    debts: 'بدهی',
    employees: 'کارمند',
    payrolls: 'فیش حقوقی',
    customers: 'مشتری',
    customerPayments: 'پرداخت مشتری',
    financialEvents: 'رویداد مالی',
    stockMovements: 'گردش انبار',
    heldSales: 'فروش نگه‌داشته',
    settings: 'تنظیم',
    calculatorHistory: 'تاریخچهٔ ماشین‌حساب',
  };

  const parts = Object.entries(result.imported)
    .filter(([, count]) => count > 0)
    .map(([table, count]) => `${labels[table] ?? table}: ${count}`);

  if (result.total === 0) {
    return 'چیز تازه‌ای برای انتقال نبود؛ همهٔ ردیف‌ها از قبل روی سرور بودند.';
  }

  return `مجموعاً ${result.total} ردیف منتقل شد — ${parts.join('، ')}`;
}
