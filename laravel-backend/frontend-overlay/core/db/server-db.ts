/**
 * لایه‌ی داده‌ی سروری — جایگزین Dexie/IndexedDB.
 *
 * همه‌ی داده‌ی فروشگاه هنگام ورود با یک درخواست pull از سرور خوانده و در
 * حافظه نگه داشته می‌شود؛ خواندن‌ها از حافظه انجام می‌شوند و نوشتن‌ها به‌صورت
 * دسته‌ای (و داخل `transaction` به‌صورت اتمیک) به سرور push می‌شوند.
 *
 * این کلاس همان زیرمجموعه‌ی API دیتابیس قبلی (Dexie) را پیاده می‌کند تا
 * صفحات و سرویس‌های موجود بدون تغییر کار کنند.
 */
import { apiFetch } from '@/core/api/client';

export type ServerRow = Record<string, unknown>;

interface Op {
  table: string;
  op: 'insert' | 'update' | 'delete';
  id?: number;
  data?: ServerRow;
}

/** جدول‌هایی که کلید اصلی‌شان به‌جای id، فیلد key است. */
const KEYED_TABLES = new Set(['settings']);

export const SYNC_TABLES = [
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
  'financialEvents',
  'stockMovements',
  'heldSales',
  'settings',
  'calculatorHistory',
] as const;

export type SyncTableName = (typeof SYNC_TABLES)[number];

/** شناسه‌ی یکتا و ایمن در محدوده‌ی عدد صحیح جاوااسکریپت. */
let idCounter = 0;
const usedIds = new Set<number>();
function generateId(): number {
  let id = 0;
  do {
    idCounter += 1;
    id = Math.floor(Math.random() * 2 ** 52) + idCounter;
  } while (usedIds.has(id));
  usedIds.add(id);
  return id;
}

function clone<T>(row: T): T {
  return { ...(row as Record<string, unknown>) } as T;
}

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const as = String(a);
  const bs = String(b);
  return as < bs ? -1 : as > bs ? 1 : 0;
}

class ServerCollection<T extends ServerRow> {
  private predicates: ((row: T) => boolean)[] = [];
  private equalsPair: { index: string; value: unknown } | null = null;
  private descending = false;
  private offsetCount = 0;
  private limitCount: number | null = null;
  private sortIndex: string | null = null;

  constructor(
    private readonly table: ServerTable<T>,
    order?: { index: string },
  ) {
    if (order) {
      this.sortIndex = order.index;
    }
  }

  equals(value: unknown): this {
    this.equalsPair = { index: this.sortIndex ?? '', value };
    return this;
  }

  anyOf(values: unknown[]): this {
    const index = this.sortIndex;
    if (index) {
      this.predicates.push((row) => values.includes(row[index]));
    }
    return this;
  }

  filter(predicate: (row: T) => boolean): this {
    this.predicates.push(predicate);
    return this;
  }

  reverse(): this {
    this.descending = !this.descending;
    return this;
  }

  offset(count: number): this {
    this.offsetCount = count;
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  async sortBy(index: string): Promise<T[]> {
    this.sortIndex = index;
    return this.toArray();
  }

  private resolveRaw(): T[] {
    let rows = this.table.rawRows();

    if (this.equalsPair) {
      const { index, value } = this.equalsPair;
      rows = rows.filter((row) => row[index] === value);
    }

    for (const predicate of this.predicates) {
      rows = rows.filter(predicate);
    }

    if (this.sortIndex) {
      const index = this.sortIndex;
      rows = [...rows].sort((a, b) => compareValues(a[index], b[index]));
    }

    if (this.descending) {
      rows = [...rows].reverse();
    }

    if (this.offsetCount) {
      rows = rows.slice(this.offsetCount);
    }

    if (this.limitCount != null) {
      rows = rows.slice(0, this.limitCount);
    }

    return rows;
  }

  async toArray(): Promise<T[]> {
    await this.table.database.ensureLoaded();
    return this.resolveRaw().map(clone);
  }

  async first(): Promise<T | undefined> {
    await this.table.database.ensureLoaded();
    const row = this.resolveRaw()[0];
    return row ? clone(row) : undefined;
  }

  async last(): Promise<T | undefined> {
    await this.table.database.ensureLoaded();
    const rows = this.resolveRaw();
    const row = rows[rows.length - 1];
    return row ? clone(row) : undefined;
  }

  async count(): Promise<number> {
    await this.table.database.ensureLoaded();
    return this.resolveRaw().length;
  }

  async delete(): Promise<number> {
    await this.table.database.ensureLoaded();
    const rows = this.resolveRaw();
    for (const row of rows) {
      await this.table.removeRaw(row);
    }
    return rows.length;
  }

  async modify(changes: Partial<T> | ((row: T) => Partial<T> | void)): Promise<number> {
    await this.table.database.ensureLoaded();
    const rows = this.resolveRaw();
    for (const row of rows) {
      const patch = typeof changes === 'function' ? changes(row) : changes;
      if (patch) {
        await this.table.updateRaw(row, patch as ServerRow);
      }
    }
    return rows.length;
  }
}

export class ServerTable<T extends ServerRow = ServerRow> {
  constructor(
    public readonly database: ServerDB,
    public readonly name: string,
  ) {}

  private keyed(): boolean {
    return KEYED_TABLES.has(this.name);
  }

  private keyOf(row: T): unknown {
    return this.keyed() ? row.key : row.id;
  }

  rawRows(): T[] {
    return this.database.rowsOf(this.name) as T[];
  }

  async get(idOrKey: unknown): Promise<T | undefined> {
    await this.database.ensureLoaded();
    const row = this.rawRows().find((candidate) => this.keyOf(candidate) === idOrKey);
    return row ? clone(row) : undefined;
  }

  async toArray(): Promise<T[]> {
    await this.database.ensureLoaded();
    return this.rawRows().map(clone);
  }

  async count(): Promise<number> {
    await this.database.ensureLoaded();
    return this.rawRows().length;
  }

  async add(data: T): Promise<number> {
    await this.database.ensureLoaded();
    const row: ServerRow = { ...(data as ServerRow) };
    if (row.id == null) {
      row.id = generateId();
    }
    this.rawRows().push(row as T);
    await this.database.enqueue({
      table: this.name,
      op: 'insert',
      id: row.id as number,
      data: row,
    });
    return row.id as number;
  }

  async put(data: T): Promise<number> {
    await this.database.ensureLoaded();
    const key = this.keyed() ? (data as ServerRow).key : (data as ServerRow).id;
    const existing = this.rawRows().find((row) => this.keyOf(row) === key);
    if (existing) {
      await this.updateRaw(existing, data as ServerRow);
      return existing.id as number;
    }
    return this.add(data);
  }

  async bulkAdd(rows: T[]): Promise<number[]> {
    return this.database.runBatch(async () => {
      const ids: number[] = [];
      for (const row of rows) {
        ids.push(await this.add(row));
      }
      return ids;
    });
  }

  async bulkPut(rows: T[]): Promise<number[]> {
    return this.database.runBatch(async () => {
      const ids: number[] = [];
      for (const row of rows) {
        ids.push(await this.put(row));
      }
      return ids;
    });
  }

  async update(idOrKey: unknown, changes: ServerRow): Promise<number> {
    await this.database.ensureLoaded();
    const row = this.rawRows().find((candidate) => this.keyOf(candidate) === idOrKey);
    if (!row) {
      return 0;
    }
    await this.updateRaw(row, changes);
    return 1;
  }

  /** به‌روزرسانی از روی ردیف موجود؛ برای استفاده‌ی داخلی کالکشن‌ها. */
  async updateRaw(row: T, changes: ServerRow): Promise<void> {
    Object.assign(row, changes);
    await this.database.enqueue({
      table: this.name,
      op: 'update',
      id: row.id as number,
      data: changes,
    });
  }

  async delete(idOrKey: unknown): Promise<void> {
    await this.database.ensureLoaded();
    const row = this.rawRows().find((candidate) => this.keyOf(candidate) === idOrKey);
    if (row) {
      await this.removeRaw(row);
    }
  }

  async removeRaw(row: T): Promise<void> {
    const rows = this.rawRows();
    const index = rows.indexOf(row);
    if (index >= 0) {
      rows.splice(index, 1);
    }
    await this.database.enqueue({ table: this.name, op: 'delete', id: row.id as number });
  }

  async clear(): Promise<void> {
    await this.database.runBatch(async () => {
      for (const row of [...this.rawRows()]) {
        await this.removeRaw(row);
      }
    });
  }

  where(index: string): ServerCollection<T> {
    return new ServerCollection<T>(this, { index });
  }

  orderBy(index: string): ServerCollection<T> {
    return new ServerCollection<T>(this, { index });
  }

  filter(predicate: (row: T) => boolean): ServerCollection<T> {
    return new ServerCollection<T>(this).filter(predicate);
  }
}

export class ServerDB {
  public readonly mode = 'server';

  private data: Record<string, ServerRow[]> = {};

  private buffer: Op[] | null = null;

  private listeners = new Set<() => void>();

  private loadPromise: Promise<void> | null = null;

  public readonly tables: Record<string, ServerTable>;

  public readonly tableList: ServerTable[];

  constructor() {
    const tables: Record<string, ServerTable> = {};
    for (const name of SYNC_TABLES) {
      tables[name] = new ServerTable(this, name);
    }
    this.tables = tables;
    this.tableList = SYNC_TABLES.map((name) => tables[name]);
  }

  /** سازگاری با الگوی Dexie: db.<table> */
  get products(): ServerTable {
    return this.tables.products;
  }

  get invoices(): ServerTable {
    return this.tables.invoices;
  }

  get invoiceItems(): ServerTable {
    return this.tables.invoiceItems;
  }

  get transactions(): ServerTable {
    return this.tables.transactions;
  }

  get budgets(): ServerTable {
    return this.tables.budgets;
  }

  get debts(): ServerTable {
    return this.tables.debts;
  }

  get employees(): ServerTable {
    return this.tables.employees;
  }

  get payrolls(): ServerTable {
    return this.tables.payrolls;
  }

  get customers(): ServerTable {
    return this.tables.customers;
  }

  get customerPayments(): ServerTable {
    return this.tables.customerPayments;
  }

  get financialEvents(): ServerTable {
    return this.tables.financialEvents;
  }

  get stockMovements(): ServerTable {
    return this.tables.stockMovements;
  }

  get heldSales(): ServerTable {
    return this.tables.heldSales;
  }

  get settings(): ServerTable {
    return this.tables.settings;
  }

  get calculatorHistory(): ServerTable {
    return this.tables.calculatorHistory;
  }

  rowsOf(name: string): ServerRow[] {
    return (this.data[name] ??= []);
  }

  table(name: string): ServerTable {
    return this.tables[name] ?? new ServerTable(this, name);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  /** پاک‌کردن حافظه؛ دفعه‌ی بعد دوباره از سرور خوانده می‌شود (مثلاً پس از ورود/خروج). */
  reset(): void {
    this.loadPromise = null;
    this.data = {};
    this.notify();
  }

  async ensureLoaded(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = this.load();
    }
    try {
      await this.loadPromise;
    } catch (error) {
      this.loadPromise = null;
      throw error;
    }
  }

  private async load(): Promise<void> {
    const response = await apiFetch<{ data: Record<string, ServerRow[]> }>('/api/sync/pull');
    const data: Record<string, ServerRow[]> = {};
    for (const name of SYNC_TABLES) {
      data[name] = response.data?.[name] ?? [];
    }
    this.data = data;
    this.notify();
  }

  /** اجرای یک دسته‌ی نوشتن اتمیک (اگر از قبل داخل تراکنش باشیم، همان بافر استفاده می‌شود). */
  async runBatch<T>(fn: () => Promise<T>): Promise<T> {
    if (this.buffer !== null) {
      return fn();
    }
    await this.ensureLoaded();
    this.buffer = [];
    try {
      const result = await fn();
      const ops = this.buffer;
      this.buffer = null;
      if (ops.length) {
        await this.flush(ops);
      }
      this.notify();
      return result;
    } catch (error) {
      this.buffer = null;
      throw error;
    }
  }

  async enqueue(op: Op): Promise<void> {
    if (this.buffer !== null) {
      this.buffer.push(op);
      return;
    }
    await this.flush([op]);
    this.notify();
  }

  private async flush(ops: Op[]): Promise<void> {
    try {
      await apiFetch('/api/sync/push', {
        method: 'POST',
        body: JSON.stringify({ ops }),
      });
    } catch (error) {
      // حافظه ممکن است با سرور ناهمگام شده باشد؛ بار بعد از سرور خوانده می‌شود.
      this.loadPromise = null;
      this.notify();
      throw error;
    }
  }

  /**
   * تراکنش سازگار با Dexie. تغییرات در حافظه اعمال می‌شوند و پشت یک push
   * اتمیک به سرور فرستاده می‌شوند؛ در خطا، حافظه به حالت قبل برمی‌گردد.
   *
   * امضای فراخوانی مثل Dexie متغیر است: هم `transaction(mode, table, fn)` و هم
   * `transaction(mode, table1, table2, fn)` و هم `transaction(mode, [tables], fn)`.
   */
  async transaction<T>(_mode: string, ...args: unknown[]): Promise<T> {
    const scope = args.pop() as (() => Promise<T>) | undefined;

    if (typeof scope !== 'function') {
      throw new Error('تراکنش بدون تابع اجرا فراخوانی شده است.');
    }

    const tableArgs = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
    const tables = (tableArgs as ServerTable[]).filter(
      (table): table is ServerTable => !!table && typeof (table as ServerTable).name === 'string',
    );

    await this.ensureLoaded();
    const names = tables.map((table) => table.name);
    const snapshots: Array<[string, ServerRow[]]> = names.map((name) => [
      name,
      this.rowsOf(name).slice(),
    ]);
    const previousBuffer = this.buffer;
    this.buffer = [];

    try {
      const result = await scope();
      const ops = this.buffer;
      this.buffer = previousBuffer;
      if (ops.length) {
        await this.flush(ops);
      }
      this.notify();
      return result;
    } catch (error) {
      this.buffer = previousBuffer;
      for (const [name, rows] of snapshots) {
        this.data[name] = rows;
      }
      this.notify();
      throw error;
    }
  }

  /** پاک‌کردن کامل داده‌ی همین فروشگاه (جایگزین db.delete() در نسخه‌ی قبلی). */
  async delete(): Promise<void> {
    await this.ensureLoaded();
    await apiFetch('/api/sync/wipe', { method: 'POST' });
    for (const name of SYNC_TABLES) {
      this.data[name] = [];
    }
    this.notify();
  }
}
