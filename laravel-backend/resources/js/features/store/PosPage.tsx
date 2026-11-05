import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  Banknote,
  Check,
  CheckCircle2,
  CreditCard,
  HandCoins,
  History,
  LayoutGrid,
  ListRestart,
  Minus,
  Package,
  Pause,
  Plus,
  ReceiptText,
  ScanBarcode,
  Search,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  db,
  nowISO,
  type HeldSale,
  type PaymentMethod,
  type Product,
  type SaleDraft,
} from '@/core/db/db';
import {
  CURRENCY_LABELS,
  formatDecimal,
  formatMoney,
  fromDisplayAmount,
  toDisplayAmount,
  toFaDigits,
} from '@/core/currency/currency';
import { formatJalaliFull, formatJalaliNumeric } from '@/core/jalali/jalali';
import { usePosStore } from '@/store/pos-store';
import { useSettingsStore } from '@/store/settings-store';
import { cn } from '@/lib/utils';
import { AmountInput } from '@/components/AmountInput';
import { DecimalInput } from '@/components/DecimalInput';
import { BarcodeScannerDialog } from '@/components/BarcodeScannerDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { calculateInvoiceTotals, createInvoice, roundStock } from './invoice.service';
import { cashChange, normalizeSearch, PAYMENT_LABELS } from './payment';
import { todaySales } from './store-calc';

const paymentIcons = { cash: Banknote, card: CreditCard, transfer: Wallet, credit: HandCoins };
const productTones = [
  'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
  'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300',
];

/** پایانه‌ی فروش؛ سبد، فاکتور و دفتر مالی، همگی به داده‌های واقعی برنامه متصل‌اند. */
export function PosPage() {
  const unit = useSettingsStore((s) => s.currencyUnit);
  const shopName = useSettingsStore((s) => s.shopName);
  const defaultTax = useSettingsStore((s) => s.invoiceTaxPercent);
  const { draft, heldSaleId, patch, setItems, reset, resume } = usePosStore();
  const products = useLiveQuery(() => db.products.orderBy('name').toArray(), [], []);
  const customers = useLiveQuery(() => db.customers.orderBy('name').toArray(), [], []);
  const heldSales = useLiveQuery(
    () => db.heldSales.orderBy('createdAt').reverse().toArray(),
    [],
    [],
  );
  const invoices = useLiveQuery(() => db.invoices.toArray(), [], []);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualPrice, setManualPrice] = useState(0);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [tendered, setTendered] = useState(0);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [successId, setSuccessId] = useState<number | null>(null);
  const [deletingHeld, setDeletingHeld] = useState<HeldSale | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const successInvoice = useLiveQuery(
    () => (successId != null ? db.invoices.get(successId) : undefined),
    [successId],
  );

  useEffect(() => {
    if (!usePosStore.getState().draft.items.length && usePosStore.getState().heldSaleId == null)
      patch({ taxPercent: defaultTax });
  }, [defaultTax, patch]);

  const totals = useMemo(
    () =>
      calculateInvoiceTotals(
        draft.items,
        draft.discountType,
        draft.discountValue,
        draft.taxPercent,
      ),
    [draft.items, draft.discountType, draft.discountValue, draft.taxPercent],
  );
  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category))].sort(),
    [products],
  );
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          (category === 'all' || p.category === category) &&
          (!availableOnly || p.stock > 0) &&
          normalizeSearch(`${p.name} ${p.barcode ?? ''} ${p.category}`).includes(
            normalizeSearch(search),
          ),
      ),
    [products, category, availableOnly, search],
  );
  const inCart = useMemo(
    () =>
      new Map(
        draft.items
          .filter((item) => item.productId != null)
          .map((item) => [item.productId, item.qty]),
      ),
    [draft.items],
  );
  const hasInvalidLine = draft.items.some(
    (item) =>
      !Number.isFinite(item.qty) ||
      item.qty <= 0 ||
      (item.productId != null &&
        (!productById.has(item.productId) ||
          item.qty > (productById.get(item.productId)?.stock ?? 0))),
  );
  const discountInvalid =
    !Number.isFinite(draft.discountValue) ||
    draft.discountValue < 0 ||
    (draft.discountType === 'percent'
      ? draft.discountValue > 100
      : draft.discountValue > totals.subtotal);
  const saleInvalid =
    hasInvalidLine ||
    discountInvalid ||
    !Number.isFinite(draft.taxPercent) ||
    draft.taxPercent < 0 ||
    draft.taxPercent > 100;

  const addProduct = (product: Product) => {
    if (busy.current) return;
    const current = usePosStore.getState().draft.items;
    const existing = current.find((item) => item.productId === product.id);
    const remaining = roundStock(product.stock - (existing?.qty ?? 0));
    if (remaining <= 0) {
      toast.error(`موجودی «${product.name}» برای افزودن به سبد کافی نیست.`);
      return;
    }
    // برای کالای وزنی با موجودی کمتر از یک واحد هم بتوان فروش ثبت کرد.
    const added = Math.min(1, remaining);
    setItems(
      existing
        ? current.map((item) =>
            item.productId === product.id ? { ...item, qty: roundStock(item.qty + added) } : item,
          )
        : [
            ...current,
            {
              productId: product.id!,
              name: product.name,
              qty: added,
              unitPrice: product.sellPrice,
            },
          ],
    );
  };

  const scan = (code: string) => {
    const product = products.find(
      (p) => p.barcode && normalizeSearch(p.barcode) === normalizeSearch(code),
    );
    if (product) {
      addProduct(product);
      setSearch('');
      searchRef.current?.focus();
    } else {
      setSearch(code);
      toast.error('کالایی با این بارکد پیدا نشد.');
    }
  };

  const openCheckout = () => {
    if (!draft.items.length || saving) return;
    if (saleInvalid) {
      toast.error('تعداد، موجودی، تخفیف یا مالیات سبد را اصلاح کنید.');
      return;
    }
    setTendered(totals.total);
    setCheckoutOpen(true);
  };
  const checkoutRef = useRef(openCheckout);
  checkoutRef.current = openCheckout;
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return;
      if (event.key === 'F2') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if (event.key === 'F8') {
        event.preventDefault();
        checkoutRef.current();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const checkout = async () => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      const id = await createInvoice({
        ...draft,
        customerName: draft.customerName || undefined,
        paymentMethod,
        isCredit: paymentMethod === 'credit',
        cashTendered: paymentMethod === 'cash' ? tendered : undefined,
        source: 'pos',
        heldSaleId: heldSaleId ?? undefined,
      });
      reset(defaultTax);
      setCheckoutOpen(false);
      setSuccessId(id);
      setPaymentMethod('card');
      toast.success('فروش ثبت شد؛ موجودی کم و مبلغ به درآمد اضافه شد.');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'ثبت فروش ناموفق بود؛ سبد شما حفظ شده است.',
      );
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const park = async () => {
    if (!draft.items.length || busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      const current = usePosStore.getState();
      const row = {
        ...current.draft,
        label: current.draft.customerName || 'مشتری گذری',
        createdAt: nowISO(),
      };
      if (current.heldSaleId != null) await db.heldSales.put({ ...row, id: current.heldSaleId });
      else {
        const existing = await db.heldSales
          .filter((held) => held.checkoutKey === current.draft.checkoutKey)
          .first();
        if (existing) await db.heldSales.put({ ...row, id: existing.id });
        else await db.heldSales.add(row);
      }
      reset(defaultTax);
      toast.success('سبد نگه داشته شد؛ هیچ موجودی یا درآمدی تغییر نکرد.');
      searchRef.current?.focus();
    } catch {
      toast.error('ذخیرهٔ سبد معلق ناموفق بود؛ سبد فعلی حفظ شد.');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const resumeHeld = async (held: HeldSale) => {
    if (draft.items.length) {
      toast.error('ابتدا سبد فعلی را نگه دارید یا خالی کنید.');
      return;
    }
    const sold = await db.invoices.where('checkoutKey').equals(held.checkoutKey).first();
    if (sold) {
      await db.heldSales.delete(held.id!);
      toast.error('این سبد قبلاً به فروش تبدیل شده است.');
      return;
    }
    const restored: SaleDraft = {
      items: held.items,
      customerId: held.customerId,
      customerName: held.customerName,
      discountType: held.discountType,
      discountValue: held.discountValue,
      taxPercent: held.taxPercent,
      note: held.note,
      checkoutKey: held.checkoutKey,
    };
    resume(restored, held.id!);
    setHeldOpen(false);
    toast.success('سبد بازیابی شد؛ موجودی هنگام تسویه دوباره بررسی می‌شود.');
  };

  const customerSelect = (id: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        مشتری فروش
      </Label>
      <Select
        value={draft.customerId == null ? 'walk-in' : String(draft.customerId)}
        onValueChange={(value) => {
          const selected = customers.find((c) => String(c.id) === value);
          patch({ customerId: selected?.id ?? null, customerName: selected?.name ?? '' });
        }}
      >
        <SelectTrigger id={id} aria-label="مشتری فروش">
          <SelectValue placeholder="مشتری گذری" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="walk-in">مشتری گذری (بدون حساب)</SelectItem>
          {customers.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.name}
              {c.phone ? ` · ${c.phone}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="pos-page">
      <PageHeader
        title="صندوقدار"
        subtitle="فروش سریع، انبار یکپارچه و ثبت خودکار درآمد"
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/store/inventory">
                <Package aria-hidden />
                گردش انبار
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/store/finance">
                <Wallet aria-hidden />
                دفتر مالی
              </Link>
            </Button>
          </>
        }
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-navy-900 px-5 py-4 text-white shadow-card">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-neon-500/15 text-neon-400">
            <ShoppingBag className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-white/55">پایانه فروش · {formatJalaliFull(new Date())}</p>
            <h2 className="mt-1 text-lg font-extrabold">{shopName}</h2>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-end">
            <p className="text-xs text-white/60">فروش امروز</p>
            <p className="mt-1 font-extrabold text-neon-400">
              {formatMoney(todaySales(invoices), unit)}
            </p>
          </div>
          <span className="hidden h-9 w-px bg-white/15 sm:block" />
          <span className="hidden items-center gap-1.5 text-xs text-white/70 sm:flex">
            <ShieldCheck className="h-4 w-4 text-neon-400" />
            ذخیره روی همین دستگاه
          </span>
        </div>
      </div>

      {draft.items.length > 0 && (
        <div className="sticky top-16 z-20 mb-4 flex items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-card xl:hidden">
          <div className="min-w-0 text-xs">
            <span className="text-muted-foreground">
              {toFaDigits(draft.items.length)} قلم در سبد
            </span>
            <p className="mt-1 truncate font-bold">{formatMoney(totals.total, unit)}</p>
          </div>
          <Button
            size="sm"
            variant="neon"
            onClick={() =>
              document
                .getElementById('pos-cart')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
          >
            <ShoppingCart className="h-4 w-4" />
            مشاهده سبد و تسویه
          </Button>
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_410px]">
        <section aria-label="کاتالوگ فروش" className="min-w-0 space-y-4">
          <Card className="p-4">
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  ref={searchRef}
                  className="h-12 ps-10 pe-14"
                  placeholder="نام کالا یا بارکد را وارد کنید…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  disabled={saving}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      const exact = products.find(
                        (p) => p.barcode && normalizeSearch(p.barcode) === normalizeSearch(search),
                      );
                      if (exact) {
                        addProduct(exact);
                        setSearch('');
                      } else if (filtered.length === 1) {
                        addProduct(filtered[0]);
                        setSearch('');
                      }
                    }
                  }}
                  aria-label="جستجوی کالای صندوق"
                />
                <kbd className="absolute end-3 top-4 text-[10px] text-muted-foreground">F2</kbd>
              </div>
              <Button
                className="h-12 px-3"
                variant="outline"
                onClick={() => setScannerOpen(true)}
                disabled={saving}
                aria-label="اسکن بارکد صندوق"
              >
                <ScanBarcode className="h-5 w-5" />
                <span className="hidden sm:inline">اسکن</span>
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="me-1 text-xs text-muted-foreground">
                <LayoutGrid className="inline h-3.5 w-3.5" /> دسته‌ها
              </span>
              {['all', ...categories].map((item) => (
                <button
                  key={item}
                  onClick={() => setCategory(item)}
                  disabled={saving}
                  aria-pressed={category === item}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                    category === item
                      ? 'border-navy-900 bg-navy-900 text-white dark:border-neon-500 dark:bg-neon-500 dark:text-navy-900'
                      : 'bg-background text-muted-foreground hover:border-primary/30',
                  )}
                >
                  {item === 'all' ? 'همه کالاها' : item}
                </button>
              ))}
            </div>
          </Card>
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <p className="text-sm font-bold">
              کالاهای فروشگاه{' '}
              <span className="ms-1 text-xs font-normal text-muted-foreground">
                {formatDecimal(filtered.length)} کالا
              </span>
            </p>
            <button
              className="flex items-center gap-2 text-xs text-muted-foreground"
              onClick={() => setAvailableOnly((value) => !value)}
              aria-pressed={availableOnly}
            >
              <span
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded border',
                  availableOnly && 'border-success bg-success text-white',
                )}
              >
                {availableOnly && <Check className="h-3 w-3" />}
              </span>
              فقط کالاهای موجود
            </button>
          </div>
          {products.length === 0 ? (
            <Card className="border-dashed">
              <EmptyState
                icon={Package}
                title="ویترین فروش شما آمادهٔ چیدن است"
                description="کالا، قیمت فروش و موجودی اولیه را ثبت کنید. بعد از آن، فروش با یک کلیک از همین صندوق انجام می‌شود."
                action={
                  <Button asChild variant="neon">
                    <Link to="/store/products">
                      <Plus />
                      ثبت اولین کالا
                    </Link>
                  </Button>
                }
              />
            </Card>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Search}
              title="کالایی پیدا نشد"
              description="نام، بارکد یا فیلتر دسته‌بندی را تغییر دهید."
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
              {filtered.map((product) => {
                const quantity = inCart.get(product.id!) ?? 0;
                const unavailable = product.stock <= quantity;
                return (
                  <button
                    key={product.id}
                    disabled={saving || unavailable}
                    onClick={() => addProduct(product)}
                    aria-label={`افزودن ${product.name} به سبد`}
                    className={cn(
                      'group relative flex min-h-48 flex-col rounded-2xl border bg-card p-4 text-start shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55',
                      quantity > 0 && 'border-success/40 ring-1 ring-success/10',
                    )}
                  >
                    <div className="mb-3 flex w-full items-start justify-between gap-2">
                      <span
                        className={cn(
                          'flex h-11 w-11 items-center justify-center rounded-xl',
                          productTones[(product.id ?? 0) % productTones.length],
                        )}
                      >
                        <Package className="h-6 w-6" />
                      </span>
                      {quantity > 0 ? (
                        <Badge variant="success">{formatDecimal(quantity, 6)} در سبد</Badge>
                      ) : product.stock <= 0 ? (
                        <Badge variant="destructive">ناموجود</Badge>
                      ) : product.stock <= product.minStock ? (
                        <Badge variant="warning">کم‌موجود</Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          {product.category}
                        </span>
                      )}
                    </div>
                    <h3 className="line-clamp-2 text-sm font-bold leading-6">{product.name}</h3>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      موجودی {formatDecimal(product.stock, 6)} {product.unit}
                    </p>
                    <div className="mt-auto flex w-full items-end justify-between gap-1 pt-4">
                      <span className="text-sm font-extrabold">
                        {formatMoney(product.sellPrice, unit, { withUnit: false })}
                        <span className="ms-1 text-[10px] font-normal text-muted-foreground">
                          {CURRENCY_LABELS[unit]}
                        </span>
                      </span>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground transition group-hover:bg-neon-500 group-hover:text-navy-900">
                        <Plus className="h-4 w-4" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-[11px] text-muted-foreground">
            <span>F2: جستجوی کالا</span>
            <span>F8: تسویه و ثبت فروش</span>
            <span>بارکدخوان USB: اسکن و Enter</span>
          </div>
        </section>

        <Card
          id="pos-cart"
          className="scroll-mt-36 overflow-hidden xl:sticky xl:top-20"
          aria-label="سبد فروش"
        >
          <div className="flex items-center justify-between border-b bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              <h2 className="font-extrabold">سبد فروش</h2>
              <Badge variant="secondary">{formatDecimal(draft.items.length)} قلم</Badge>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground"
              disabled={!draft.items.length || saving}
              aria-label="خالی کردن سبد"
              onClick={() => setClearOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <fieldset disabled={saving} className="min-w-0">
            <div className="p-4">{customerSelect('pos-customer')}</div>
            <div
              className="max-h-[390px] overflow-y-auto border-y bg-muted/10 px-4"
              aria-live="polite"
            >
              {!draft.items.length ? (
                <div className="flex min-h-52 flex-col items-center justify-center text-center">
                  <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                    <ShoppingCart className="h-7 w-7 text-muted-foreground/70" />
                  </span>
                  <p className="text-sm font-semibold">سبد شما هنوز خالی است</p>
                  <p className="mt-2 text-xs leading-6 text-muted-foreground">
                    روی کالا بزنید یا بارکد آن را اسکن کنید.
                  </p>
                </div>
              ) : (
                <ul className="divide-y">
                  {draft.items.map((item, index) => {
                    const product =
                      item.productId != null ? productById.get(item.productId) : undefined;
                    const insufficient =
                      item.productId != null && (!product || item.qty > product.stock);
                    return (
                      <li key={`${item.productId ?? 'manual'}-${index}`} className="py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{item.name}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              هر {product?.unit ?? 'واحد'} {formatMoney(item.unitPrice, unit)}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 text-muted-foreground"
                            aria-label={`حذف ${item.name} از سبد`}
                            onClick={() => setItems(draft.items.filter((_, i) => i !== index))}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <div className="mt-2.5 flex items-center justify-between">
                          <div className="flex items-center rounded-lg border bg-card">
                            <button
                              className="p-2 hover:bg-muted disabled:opacity-40"
                              disabled={!!product && item.qty >= product.stock}
                              aria-label={`افزایش تعداد ${item.name}`}
                              onClick={() =>
                                setItems(
                                  draft.items.map((line, i) =>
                                    i === index
                                      ? {
                                          ...line,
                                          qty: roundStock(
                                            Math.min(line.qty + 1, product?.stock ?? Infinity),
                                          ),
                                        }
                                      : line,
                                  ),
                                )
                              }
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                            <DecimalInput
                              className="h-7 w-14 rounded-none border-0 px-0 text-center text-sm shadow-none focus-visible:ring-0"
                              inputMode="decimal"
                              value={item.qty}
                              onChange={(qty) => {
                                setItems(
                                  draft.items.map((line, i) =>
                                    i === index ? { ...line, qty } : line,
                                  ),
                                );
                              }}
                              aria-label={`تعداد ${item.name}`}
                            />
                            <button
                              className="p-2 hover:bg-muted disabled:opacity-40"
                              disabled={item.qty <= 1}
                              aria-label={`کاهش تعداد ${item.name}`}
                              onClick={() =>
                                setItems(
                                  draft.items.map((line, i) =>
                                    i === index ? { ...line, qty: roundStock(line.qty - 1) } : line,
                                  ),
                                )
                              }
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <span className="text-sm font-bold">
                            {formatMoney(Math.round(item.qty * item.unitPrice), unit, {
                              withUnit: false,
                            })}
                          </span>
                        </div>
                        {insufficient && (
                          <p className="mt-2 text-xs text-destructive" role="alert">
                            {product
                              ? `موجودی فعلی: ${formatDecimal(product.stock, 6)} ${product.unit}`
                              : 'این کالا از انبار حذف شده است.'}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="space-y-3 p-4">
              <Button
                className="w-full border-dashed text-xs"
                variant="outline"
                onClick={() => setManualOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                افزودن قلم دستی / خدمات
              </Button>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="pos-discount">
                    تخفیف
                  </Label>
                  <div className="flex gap-1">
                    <div className="min-w-0 flex-1">
                      {draft.discountType === 'amount' ? (
                        <AmountInput
                          id="pos-discount"
                          value={toDisplayAmount(draft.discountValue, unit)}
                          onChange={(value) =>
                            patch({ discountValue: fromDisplayAmount(value, unit) })
                          }
                        />
                      ) : (
                        <DecimalInput
                          id="pos-discount"
                          inputMode="decimal"
                          value={draft.discountValue}
                          placeholder="۰"
                          onChange={(discountValue) => patch({ discountValue })}
                        />
                      )}
                    </div>
                    <Select
                      value={draft.discountType}
                      onValueChange={(value) =>
                        patch({ discountType: value as 'amount' | 'percent', discountValue: 0 })
                      }
                    >
                      <SelectTrigger className="w-[74px] px-2" aria-label="نوع تخفیف صندوق">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">درصد</SelectItem>
                        <SelectItem value="amount">مبلغ</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="pos-tax">
                    مالیات (درصد)
                  </Label>
                  <DecimalInput
                    id="pos-tax"
                    inputMode="decimal"
                    value={draft.taxPercent}
                    placeholder="۰"
                    onChange={(taxPercent) => patch({ taxPercent })}
                  />
                </div>
              </div>
              <Input
                value={draft.note}
                onChange={(e) => patch({ note: e.target.value })}
                maxLength={300}
                placeholder="یادداشت فروش (اختیاری)"
                aria-label="یادداشت فروش"
                className="h-9 text-xs"
              />
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <dt>جمع اقلام</dt>
                  <dd>{formatMoney(totals.subtotal, unit)}</dd>
                </div>
                <div className="flex justify-between text-success">
                  <dt>تخفیف</dt>
                  <dd>− {formatMoney(totals.discountAmount, unit)}</dd>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <dt>مالیات</dt>
                  <dd>{formatMoney(totals.taxAmount, unit)}</dd>
                </div>
                <div className="flex items-center justify-between border-t pt-3">
                  <dt className="text-sm font-bold">قابل پرداخت</dt>
                  <dd className="text-xl font-extrabold tracking-tight">
                    {formatMoney(totals.total, unit, { withUnit: false })}
                    <span className="ms-1 text-xs font-medium text-muted-foreground">
                      {CURRENCY_LABELS[unit]}
                    </span>
                  </dd>
                </div>
              </dl>
              {saleInvalid && (
                <p className="text-xs text-destructive" role="alert">
                  موجودی، تعداد، تخفیف یا درصد مالیات نیاز به اصلاح دارد.
                </p>
              )}
              <Button
                variant="neon"
                className="h-12 w-full justify-between text-sm shadow-glow"
                disabled={!draft.items.length || saleInvalid || saving}
                onClick={openCheckout}
              >
                <span className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  تسویه و ثبت فروش
                </span>
                <span className="rounded bg-black/10 px-1.5 py-0.5 text-[10px]">F8</span>
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!draft.items.length || saving}
                  onClick={() => void park()}
                >
                  <Pause className="h-3.5 w-3.5" />
                  نگه‌داشتن سبد
                </Button>
                <Button variant="outline" size="sm" onClick={() => setHeldOpen(true)}>
                  <History className="h-3.5 w-3.5" />
                  سبدهای معلق{' '}
                  <span className="text-muted-foreground">({toFaDigits(heldSales.length)})</span>
                </Button>
              </div>
              <p className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />
                ثبت هم‌زمان فاکتور، موجودی و درآمد
              </p>
            </div>
          </fieldset>
        </Card>
      </div>

      <BarcodeScannerDialog open={scannerOpen} onOpenChange={setScannerOpen} onDetected={scan} />
      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="خالی کردن سبد فروش"
        description="پیش‌نویس این سبد پاک می‌شود؛ فروش یا موجودی ثبت‌شده تغییر نمی‌کند. اگر سبد معلق را بازیابی کرده‌اید، نسخهٔ معلق آن حفظ می‌شود."
        confirmLabel="خالی کردن سبد"
        destructive
        onConfirm={() => reset(defaultTax)}
      />
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>افزودن قلم دستی یا خدمات</DialogTitle>
            <DialogDescription>
              این قلم موجودی انبار ندارد و بهای تمام‌شدهٔ آن صفر در نظر گرفته می‌شود.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!manualName.trim() || !Number.isFinite(manualPrice) || manualPrice <= 0) {
                toast.error('نام و قیمت معتبر وارد کنید.');
                return;
              }
              setItems([
                ...draft.items,
                {
                  productId: null,
                  name: manualName.trim(),
                  qty: 1,
                  unitPrice: fromDisplayAmount(manualPrice, unit),
                },
              ]);
              setManualName('');
              setManualPrice(0);
              setManualOpen(false);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="manual-sale-name">شرح قلم</Label>
              <Input
                id="manual-sale-name"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                maxLength={150}
                placeholder="مثلاً نصب و راه‌اندازی"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="manual-sale-price">قیمت ({CURRENCY_LABELS[unit]})</Label>
              <AmountInput id="manual-sale-price" value={manualPrice} onChange={setManualPrice} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setManualOpen(false)}>
                انصراف
              </Button>
              <Button variant="neon" type="submit">
                افزودن به سبد
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={checkoutOpen} onOpenChange={(open) => !saving && setCheckoutOpen(open)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>تسویه و ثبت فروش</DialogTitle>
            <DialogDescription>
              روش دریافت را انتخاب کنید. موجودی و درآمد فقط پس از ثبت موفق تغییر می‌کنند.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl bg-muted/60 p-4 text-center">
            <p className="text-xs text-muted-foreground">
              مبلغ قابل پرداخت · {formatDecimal(draft.items.length)} قلم
            </p>
            <p className="mt-2 text-3xl font-extrabold">
              {formatMoney(totals.total, unit, { withUnit: false })}
              <span className="ms-2 text-sm font-medium">{CURRENCY_LABELS[unit]}</span>
            </p>
          </div>
          <fieldset disabled={saving} className="space-y-4">
            <div className="grid grid-cols-4 gap-2" role="group" aria-label="روش پرداخت">
              {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((method) => {
                const Icon = paymentIcons[method];
                return (
                  <button
                    key={method}
                    onClick={() => setPaymentMethod(method)}
                    aria-pressed={paymentMethod === method}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-xl border px-1 py-3 text-xs font-semibold transition',
                      paymentMethod === method
                        ? 'border-success bg-success/5 text-success ring-1 ring-success/30'
                        : 'hover:bg-muted',
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {PAYMENT_LABELS[method]}
                  </button>
                );
              })}
            </div>
            {paymentMethod === 'cash' && (
              <div className="space-y-3 rounded-xl border p-3">
                <div className="space-y-2">
                  <Label htmlFor="cash-tendered">وجه نقد دریافتی ({CURRENCY_LABELS[unit]})</Label>
                  <AmountInput
                    id="cash-tendered"
                    value={toDisplayAmount(tendered, unit)}
                    onChange={(value) => setTendered(fromDisplayAmount(value, unit))}
                  />
                </div>
                <Button variant="outline" size="sm" onClick={() => setTendered(totals.total)}>
                  دریافت مبلغ دقیق
                </Button>
                <div className="flex justify-between border-t pt-2 text-sm">
                  <span>باقی پول مشتری</span>
                  <b className="text-success">
                    {formatMoney(cashChange(totals.total, tendered), unit)}
                  </b>
                </div>
                {tendered < totals.total && (
                  <p className="text-xs text-destructive" role="alert">
                    وجه دریافتی کمتر از مبلغ فروش است.
                  </p>
                )}
              </div>
            )}
            {paymentMethod === 'credit' && (
              <div className="space-y-3 rounded-xl border border-warning/30 bg-warning/5 p-3">
                {customerSelect('pay-customer')}
                <p className="text-xs leading-6 text-muted-foreground">
                  فروش به درآمد اضافه می‌شود، اما مبلغ آن تا زمان دریافت، بدهی مشتری است. دریافت
                  بعدی دوباره درآمد ثبت نمی‌کند.
                </p>
                {draft.customerId == null && (
                  <p className="text-xs text-destructive" role="alert">
                    برای نسیه یک مشتری انتخاب کنید.{' '}
                    <Link className="underline" to="/store/customers">
                      ثبت مشتری جدید
                    </Link>
                  </p>
                )}
              </div>
            )}
            {(paymentMethod === 'card' || paymentMethod === 'transfer') && (
              <p className="rounded-xl bg-muted/50 p-3 text-xs leading-6 text-muted-foreground">
                پس از دریافت واقعی وجه، فروش را تأیید کنید. این گزینه فقط روش دریافت را ثبت می‌کند و
                به بانک یا دستگاه کارت‌خوان فرمان نمی‌فرستد.
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setCheckoutOpen(false)} disabled={saving}>
                بازگشت به سبد
              </Button>
              <Button
                variant="neon"
                onClick={() => void checkout()}
                disabled={
                  saving ||
                  saleInvalid ||
                  !draft.items.length ||
                  (paymentMethod === 'cash' && tendered < totals.total) ||
                  (paymentMethod === 'credit' && draft.customerId == null)
                }
              >
                <ShieldCheck />
                {saving ? 'در حال ثبت…' : 'تأیید و ثبت نهایی فروش'}
              </Button>
            </DialogFooter>
          </fieldset>
        </DialogContent>
      </Dialog>

      <Dialog
        open={successId != null}
        onOpenChange={(open) => {
          if (!open) {
            setSuccessId(null);
            searchRef.current?.focus();
          }
        }}
      >
        <DialogContent className="max-w-md text-center">
          <DialogHeader>
            <span className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
              <CheckCircle2 className="h-9 w-9" />
            </span>
            <DialogTitle className="text-center">فروش با موفقیت ثبت شد</DialogTitle>
            <DialogDescription className="text-center">
              موجودی انبار و دفتر درآمد به‌روز شدند.
            </DialogDescription>
          </DialogHeader>
          {successInvoice && (
            <div className="space-y-2 rounded-xl bg-muted/50 p-4 text-sm">
              <p>
                فاکتور شماره <b>{toFaDigits(successInvoice.number)}</b>
              </p>
              <p className="text-2xl font-extrabold">{formatMoney(successInvoice.total, unit)}</p>
              <p className="text-xs text-muted-foreground">
                {PAYMENT_LABELS[successInvoice.paymentMethod ?? 'cash']}
              </p>
              {(successInvoice.changeAmount ?? 0) > 0 && (
                <p className="border-t pt-2 text-success">
                  باقی پول: {formatMoney(successInvoice.changeAmount!, unit)}
                </p>
              )}
            </div>
          )}
          <Button
            variant="neon"
            onClick={() => {
              setSuccessId(null);
              searchRef.current?.focus();
            }}
          >
            <ListRestart />
            شروع فروش بعدی
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/store/invoices/${successId}`}>
              <ReceiptText />
              مشاهده و چاپ رسید
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={heldOpen} onOpenChange={setHeldOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>سبدهای معلق</DialogTitle>
            <DialogDescription>
              سبد معلق موجودی را رزرو نمی‌کند. هنگام ثبت نهایی، موجودی دوباره بررسی خواهد شد.
            </DialogDescription>
          </DialogHeader>
          {!heldSales.length ? (
            <EmptyState
              icon={Pause}
              title="سبد معلقی ندارید"
              description="با «نگه‌داشتن سبد» می‌توانید فروش مشتری دیگری را شروع کنید."
            />
          ) : (
            <ul className="max-h-96 space-y-3 overflow-y-auto">
              {heldSales.map((held) => (
                <li key={held.id} className="flex items-center gap-3 rounded-xl border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{held.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatJalaliNumeric(new Date(held.createdAt))} ·{' '}
                      {formatDecimal(held.items.length)} قلم
                    </p>
                    <p className="mt-2 text-sm font-semibold">
                      {formatMoney(
                        calculateInvoiceTotals(
                          held.items,
                          held.discountType,
                          held.discountValue,
                          held.taxPercent,
                        ).total,
                        unit,
                      )}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void resumeHeld(held)}
                    disabled={saving}
                  >
                    بازیابی
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`حذف سبد معلق ${held.label}`}
                    onClick={() => setDeletingHeld(held)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={deletingHeld != null}
        onOpenChange={(open) => !open && setDeletingHeld(null)}
        title="حذف سبد معلق"
        description="فقط این پیش‌نویس پاک می‌شود و موجودی و درآمد تغییری نمی‌کند."
        confirmLabel="حذف پیش‌نویس"
        destructive
        onConfirm={async () => {
          if (deletingHeld?.id != null) await db.heldSales.delete(deletingHeld.id);
        }}
      />
    </div>
  );
}
