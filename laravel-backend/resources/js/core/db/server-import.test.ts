import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  response: {} as unknown,
}));

const serverDbMock = vi.hoisted(() => ({
  reset: vi.fn(),
  ensureLoaded: vi.fn(async () => undefined),
}));

vi.mock('@/core/api/client', () => ({
  ApiError: class ApiError extends Error {},
  apiFetch: vi.fn(async () => state.response),
}));

vi.mock('@/core/db/db', () => ({ serverDb: serverDbMock }));

import { apiFetch } from '@/core/api/client';
import { importBackupFile, summarizeImport } from './server-import';

/** جدول‌هایی که validateBackup حاضر بودنشان را الزامی می‌داند. */
const REQUIRED_TABLES = [
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

function backupFile(tables: Record<string, unknown[]>): Blob {
  const complete: Record<string, unknown[]> = { ...tables };
  for (const name of REQUIRED_TABLES) {
    complete[name] ??= [];
  }

  return new Blob([
    JSON.stringify({
      format: 'karenyar-hesabyar-backup',
      version: 3,
      exportedAt: '2026-01-01T00:00:00.000Z',
      tables: complete,
    }),
  ]);
}

describe('مهاجرت پشتیبان محلی به سرور', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.response = { ok: true, total: 0, imported: {} };
  });

  it('فایل پشتیبان را به API می‌فرستد و داده را بازخوانی می‌کند', async () => {
    state.response = { ok: true, total: 3, imported: { products: 2, customers: 1 } };

    const result = await importBackupFile(
      backupFile({
        products: [
          { id: 1, name: 'کالا' },
          { id: 2, name: 'کالای دوم' },
        ],
        customers: [{ id: 3, name: 'مشتری' }],
      }),
    );

    expect(result.total).toBe(3);
    expect(result.imported.products).toBe(2);

    const call = (apiFetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(call[0]).toBe('/api/sync/import');
    const body = JSON.parse(String((call[1] as RequestInit).body));
    expect(body.tables.products).toHaveLength(2);

    // بعد از مهاجرت، حافظه و rev پاک و داده از سرور بازخوانی می‌شود.
    expect(serverDbMock.reset).toHaveBeenCalled();
    expect(serverDbMock.ensureLoaded).toHaveBeenCalled();
  });

  it('فایل غیر JSON را با پیام فارسی رد می‌کند', async () => {
    await expect(importBackupFile(new Blob(['not-json']))).rejects.toThrow(
      'فایل پشتیبان JSON معتبر نیست.',
    );
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('فایل با ساختار نامعتبر را رد می‌کند و چیزی نمی‌فرستد', async () => {
    await expect(
      importBackupFile(new Blob([JSON.stringify({ hello: 'world' })])),
    ).rejects.toThrow();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('خلاصهٔ فارسی نتیجه را می‌سازد', () => {
    expect(summarizeImport({ total: 0, imported: { products: 0 } })).toContain('چیز تازه‌ای');
    expect(summarizeImport({ total: 3, imported: { products: 2, customers: 1 } })).toContain(
      'کالا: 2',
    );
  });
});
