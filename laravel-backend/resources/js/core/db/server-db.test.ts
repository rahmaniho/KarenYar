import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  pulls: [] as unknown[],
  push: {} as unknown,
}));

vi.mock('@/core/api/client', () => ({
  ApiError: class ApiError extends Error {},
  apiFetch: vi.fn(async (path: string) => {
    if (path.startsWith('/api/sync/pull')) {
      return state.pulls.shift() ?? { storeId: 1, rev: 0, full: true, data: {} };
    }
    if (path === '/api/sync/push') {
      return state.push;
    }
    return { ok: true };
  }),
}));

import { apiFetch } from '@/core/api/client';
import { ServerDB } from './server-db';

interface PushBody {
  ops: {
    table: string;
    op: string;
    id?: number;
    key?: string;
    baseRevForTest?: number;
    baseRev?: number;
  }[];
}

function pushBodies(): PushBody[] {
  const mock = apiFetch as unknown as { mock: { calls: unknown[][] } };
  return mock.mock.calls
    .filter((call) => call[0] === '/api/sync/push')
    .map((call) => JSON.parse(String((call[1] as RequestInit | undefined)?.body ?? '{}')));
}

function pullPaths(): string[] {
  const mock = apiFetch as unknown as { mock: { calls: unknown[][] } };
  return mock.mock.calls
    .map((call) => String(call[0]))
    .filter((path) => path.startsWith('/api/sync/pull'));
}

describe('لایه‌ی داده‌ی سروری (ServerDB)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    state.pulls = [];
    state.push = { ok: true, storeId: 1, rev: 1, applied: [], conflicts: [] };
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

  it('بار دوم فقط تغییرات (since) را می‌خواند', async () => {
    state.pulls = [
      {
        storeId: 1,
        rev: 5,
        full: true,
        data: { products: [{ id: 1, name: 'الف', rev: 5 }] },
      },
    ];

    const first = new ServerDB();
    expect(await first.products.count()).toBe(1);
    expect(pullPaths()).toEqual(['/api/sync/pull']);
    expect(first.lastRev).toBe(5);

    // ردیف تازه + یک ردیف حذف‌شده (سنگ‌قبر) در pull افزایشی
    state.pulls = [
      {
        storeId: 1,
        rev: 8,
        full: false,
        data: {
          products: [
            { id: 1, name: 'الف', rev: 8, __deleted: true },
            { id: 2, name: 'ب', rev: 7 },
          ],
        },
      },
    ];

    const second = new ServerDB();
    const rows = await second.products.toArray();

    expect(pullPaths()).toEqual(['/api/sync/pull', '/api/sync/pull?since=5']);
    expect(rows.map((row) => row.name)).toEqual(['ب']);
    expect(second.lastRev).toBe(8);
  });

  it('اگر فروشگاه عوض شود، pull کامل انجام می‌شود', async () => {
    state.pulls = [
      { storeId: 1, rev: 3, full: true, data: { products: [{ id: 1, name: 'الف' }] } },
    ];
    await new ServerDB().products.count();

    state.pulls = [
      { storeId: 2, rev: 1, full: false, data: { products: [{ id: 9, name: 'فروشگاه دو' }] } },
      { storeId: 2, rev: 1, full: true, data: { products: [{ id: 9, name: 'فروشگاه دو' }] } },
    ];

    const other = new ServerDB();
    await other.products.count();

    expect(pullPaths().at(-1)).toBe('/api/sync/pull');
    expect((await other.products.toArray()).map((row) => row.id)).toEqual([9]);
  });

  it('push مقدار baseRev ردیف خوانده‌شده را می‌فرستد', async () => {
    state.pulls = [
      { storeId: 1, rev: 4, full: true, data: { products: [{ id: 1, name: 'الف', rev: 4 }] } },
    ];

    const db = new ServerDB();
    await db.products.update(1, { name: 'ب' });

    expect(pushBodies()[0].ops[0]).toMatchObject({
      table: 'products',
      op: 'update',
      id: 1,
      baseRev: 4,
    });
  });

  it('در تعارض، نسخه‌ی سرور جایگزین می‌شود و شمارنده بالا می‌رود', async () => {
    state.pulls = [
      { storeId: 1, rev: 4, full: true, data: { products: [{ id: 1, name: 'الف', rev: 4 }] } },
    ];
    state.push = {
      ok: true,
      storeId: 1,
      rev: 9,
      applied: [],
      conflicts: [{ table: 'products', key: 1, server: { id: 1, name: 'نسخهٔ سرور', rev: 9 } }],
    };

    const db = new ServerDB();
    await db.products.update(1, { name: 'نسخهٔ من' });

    expect(db.conflictCount).toBe(1);
    expect((await db.products.get(1))?.name).toBe('نسخهٔ سرور');
  });

  it('reset حافظه و rev ذخیره‌شده را پاک می‌کند', async () => {
    state.pulls = [
      { storeId: 1, rev: 6, full: true, data: { products: [{ id: 1, name: 'الف' }] } },
    ];
    const db = new ServerDB();
    await db.products.count();
    db.reset();

    state.pulls = [{ storeId: 1, rev: 1, full: true, data: { products: [] } }];
    await db.products.count();

    expect(pullPaths().at(-1)).toBe('/api/sync/pull');
  });
});
