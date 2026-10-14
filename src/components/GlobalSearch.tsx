import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Banknote, Contact, Package, Receipt, Search, Wallet } from 'lucide-react';
import {
  db,
  type Customer,
  type Employee,
  type Invoice,
  type Product,
  type Transaction,
} from '@/core/db/db';
import { formatMoney, toFaDigits } from '@/core/currency/currency';
import { useSettingsStore } from '@/store/settings-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface SearchResult {
  key: string;
  group: string;
  icon: typeof Package;
  title: string;
  subtitle?: string;
  to: string;
}

const MAX_PER_GROUP = 5;

/** جستجوی سراسری برنامه — میانبر Ctrl+K روی کالاها، مشتریان، فاکتورها، کارمندان و تراکنش‌ها */
export function GlobalSearch() {
  const navigate = useNavigate();
  const unit = useSettingsStore((s) => s.currencyUnit);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const products = useLiveQuery(() => db.products.toArray(), [], [] as Product[]);
  const customers = useLiveQuery(() => db.customers.toArray(), [], [] as Customer[]);
  const invoices = useLiveQuery(() => db.invoices.toArray(), [], [] as Invoice[]);
  const employees = useLiveQuery(() => db.employees.toArray(), [], [] as Employee[]);
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], [] as Transaction[]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim();
    if (!q) return [];
    const out: SearchResult[] = [];

    for (const p of products) {
      if (`${p.name} ${p.barcode ?? ''} ${p.category}`.includes(q)) {
        out.push({
          key: `p-${p.id}`,
          group: 'کالاها',
          icon: Package,
          title: p.name,
          subtitle: `موجودی: ${toFaDigits(String(p.stock))} — ${formatMoney(p.sellPrice, unit)}`,
          to: `/store/products?q=${encodeURIComponent(p.barcode ?? p.name)}`,
        });
      }
      if (out.filter((r) => r.group === 'کالاها').length >= MAX_PER_GROUP) break;
    }

    let invoiceCount = 0;
    for (const inv of invoices) {
      if (String(inv.number).includes(q) || (inv.customerName ?? '').includes(q)) {
        out.push({
          key: `i-${inv.id}`,
          group: 'فاکتورها',
          icon: Receipt,
          title: `فاکتور شماره ${toFaDigits(String(inv.number))}`,
          subtitle: `${inv.customerName ?? 'مشتری نقدی'} — ${formatMoney(inv.total, unit)}`,
          to: `/store/invoices/${inv.id}`,
        });
        if (++invoiceCount >= MAX_PER_GROUP) break;
      }
    }

    let customerCount = 0;
    for (const c of customers) {
      if (`${c.name} ${c.phone ?? ''}`.includes(q)) {
        out.push({
          key: `c-${c.id}`,
          group: 'مشتریان',
          icon: Contact,
          title: c.name,
          subtitle: c.phone,
          to: '/store/customers',
        });
        if (++customerCount >= MAX_PER_GROUP) break;
      }
    }

    let employeeCount = 0;
    for (const e of employees) {
      if (`${e.name} ${e.position ?? ''}`.includes(q)) {
        out.push({
          key: `e-${e.id}`,
          group: 'کارمندان',
          icon: Banknote,
          title: e.name,
          subtitle: e.position,
          to: `/payroll/calculate?employee=${e.id}`,
        });
        if (++employeeCount >= MAX_PER_GROUP) break;
      }
    }

    let txCount = 0;
    for (const t of transactions) {
      if (`${t.category} ${t.description ?? ''}`.includes(q)) {
        out.push({
          key: `t-${t.id}`,
          group: 'تراکنش‌ها',
          icon: Wallet,
          title: t.category,
          subtitle: `${t.type === 'income' ? 'درآمد' : 'هزینه'} — ${formatMoney(t.amount, unit)}`,
          to: '/personal/transactions',
        });
        if (++txCount >= MAX_PER_GROUP) break;
      }
    }

    return out;
  }, [query, products, customers, invoices, employees, transactions, unit]);

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  const groups = useMemo(() => {
    const map = new Map<string, SearchResult[]>();
    for (const r of results) map.set(r.group, [...(map.get(r.group) ?? []), r]);
    return [...map.entries()];
  }, [results]);

  return (
    <>
      <Button
        variant="outline"
        className="hidden h-10 w-52 justify-between text-muted-foreground md:inline-flex"
        onClick={() => setOpen(true)}
        aria-label="جستجوی سراسری (Ctrl+K)"
      >
        <span className="flex items-center gap-2">
          <Search className="h-4 w-4" aria-hidden />
          جستجو در برنامه…
        </span>
        <kbd className="rounded border bg-muted px-1.5 text-[10px] font-semibold" dir="ltr">
          Ctrl+K
        </kbd>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setOpen(true)}
        aria-label="جستجوی سراسری"
      >
        <Search className="h-5 w-5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-primary dark:text-neon-400" aria-hidden />
              جستجوی سراسری
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              autoFocus
              placeholder="نام کالا، بارکد، مشتری، شماره فاکتور، کارمند…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && results[0]) go(results[0].to);
              }}
              aria-label="عبارت جستجو"
            />
            <div className="max-h-[50dvh] overflow-y-auto">
              {query.trim() === '' ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  شروع به تایپ کنید — در همه‌ی بخش‌های برنامه جستجو می‌شود.
                </p>
              ) : results.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  موردی برای «{query}» پیدا نشد.
                </p>
              ) : (
                groups.map(([group, items]) => (
                  <div key={group} className="mb-2">
                    <p className="px-2 py-1 text-[11px] font-bold text-muted-foreground">{group}</p>
                    <ul>
                      {items.map((r) => (
                        <li key={r.key}>
                          <button
                            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-start transition hover:bg-secondary"
                            onClick={() => go(r.to)}
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-600 dark:bg-navy-800 dark:text-navy-100">
                              <r.icon className="h-5 w-5" aria-hidden />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold">
                                {r.title}
                              </span>
                              {r.subtitle && (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {r.subtitle}
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
