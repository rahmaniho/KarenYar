import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/core/api/client', () => ({
  ApiError: class ApiError extends Error {},
  apiFetch: vi.fn(async (path: string) => {
    if (path === '/api/sync/pull') {
      return { data: {} };
    }
    return { ok: true };
  }),
}));

import { apiFetch } from '@/core/api/client';
import { ServerDB } from './server-db';

interface PushBody {
  ops: unknown[];
}

function pushBodies(): PushBody[] {
  const mock = apiFetch as unknown as { mock: { calls: unknown[][] } };
  return mock.mock.calls
    .filter((call) => call[0] === '/api/sync/push')
    .map((call) => JSON.parse(String((call[1] as RequestInit | undefined)?.body ?? '{}')));
}

describe('لایه‌ی داده‌ی سروری (ServerDB)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('افزودن رکورد، یک op می‌فرستد و شناسه برمی‌گرداند', async () => {
    const db = new ServerDB();
    const id = await db.products.add({ name: 'کالا' });

    expect(typeof id).toBe('number');
    expect(pushBodies()).toHaveLength(1);
    expect(pushBodies()[0].ops).toHaveLength(1);
    expect((await db.products.get(id))?.name).toBe('کالا');
  });

  it('تراکنش چندجدولی variadic را در یک push دسته می‌کند', async () => {
    const db = new ServerDB();
    const result = await db.transaction('rw', db.products, db.stockMovements, async () => {
      await db.products.add({ id: 1, name: 'کالا' });
      await db.stockMovements.add({ productId: 1, type: 'sale' });
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(pushBodies()).toHaveLength(1);
    expect(pushBodies()[0].ops).toHaveLength(2);
  });

  it('تراکنش آرایه‌ای هم کار می‌کند', async () => {
    const db = new ServerDB();
    await db.transaction('rw', [db.customers, db.invoices], async () => {
      await db.customers.add({ id: 5, name: 'مشتری' });
      await db.invoices.add({ id: 9, number: 1 });
    });

    expect(pushBodies()).toHaveLength(1);
    expect(pushBodies()[0].ops).toHaveLength(2);
  });

  it('where/orderBy/reverse روی حافظه کار می‌کند', async () => {
    const db = new ServerDB();
    await db.products.add({ id: 1, name: 'ب', barcode: 'X' });
    await db.products.add({ id: 2, name: 'الف', barcode: 'Y' });

    expect((await db.products.where('barcode').equals('X').first())?.name).toBe('ب');
    expect((await db.products.orderBy('name').toArray()).map((row) => row.name)).toEqual([
      'الف',
      'ب',
    ]);
    expect((await db.products.orderBy('name').reverse().toArray())[0].name).toBe('ب');
    expect(await db.products.where('barcode').equals('X').count()).toBe(1);
  });

  it('در خطای تراکنش، حافظه برمی‌گردد و چیزی به سرور نمی‌رود', async () => {
    const db = new ServerDB();

    await expect(
      db.transaction('rw', db.products, async () => {
        await db.products.add({ id: 1, name: 'کالا' });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await db.products.count()).toBe(0);
    expect(pushBodies()).toHaveLength(0);
  });
});
