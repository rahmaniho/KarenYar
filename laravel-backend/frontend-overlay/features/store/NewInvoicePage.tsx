import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from '@/core/db/use-live-query';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  FileCheck2,
  Plus,
  ReceiptText,
  Save,
  ScanBarcode,
  Search,
  Trash2,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { db, type Customer, type Invoice, type InvoiceItem, type Product } from '@/core/db/db';
import { CURRENCY_LABELS, formatDecimal, formatMoney, toFaDigits } from '@/core/currency/currency';
import { useSettingsStore } from '@/store/settings-store';
import {
  emptyInvoiceEditor,
  useInvoiceEditorStore,
  type InvoiceEditorForm,
} from '@/store/invoice-editor-store';
import { PageHeader } from '@/components/PageHeader';
import { DecimalInput } from '@/components/DecimalInput';
import { JalaliDateInput } from '@/components/JalaliDateInput';
import { BarcodeScannerDialog } from '@/components/BarcodeScannerDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { calculateInvoice } from './invoice-calc';
import { issueInvoice, saveInvoiceDraft, type NewInvoiceInput } from './invoice.service';
import { normalizeSearch, PAYMENT_LABELS } from './payment';
import { InvoiceMoneyInput } from './InvoiceMoneyInput';

function fromInvoice(invoice: Invoice, items: InvoiceItem[]): InvoiceEditorForm {
  return {
    checkoutKey: invoice.checkoutKey ?? crypto.randomUUID(),
    customerId: invoice.customerId ?? null,
    customerName: invoice.customerName ?? '',
    paymentMethod: invoice.paymentMethod ?? (invoice.isCredit ? 'credit' : 'cash'),
    date: invoice.date,
    dueDate: invoice.dueDate ?? '',
    items: items.map((item) => ({
      productId: item.productId,
      name: item.name,
      qty: item.qty,
      unitPrice: item.unitPrice,
      unit: item.unit,
      discountType: item.discountType ?? 'percent',
      discountValue: item.discountValue ?? 0,
    })),
    discountType: invoice.discountType,
    discountValue: invoice.discountValue,
    taxPercent: invoice.taxPercent,
    shippingAmount: invoice.shippingAmount ?? 0,
    otherAmount: invoice.otherAmount ?? 0,
    note: invoice.note ?? '',
    terms: invoice.terms ?? '',
    internalNote: invoice.internalNote ?? '',
  };
}

/** فرم رسمی فروش؛ مبلغ‌ها در state داخلی تومان‌اند و تغییر واحد فقط نمایش را عوض می‌کند. */
export function NewInvoicePage() {
  const { id } = useParams();
  const editingId = id != null ? Number(id) : undefined;
  const editing = editingId != null && Number.isSafeInteger(editingId) && editingId > 0;
  const navigate = useNavigate();
  const unit = useSettingsStore((s) => s.currencyUnit);
  const defaultTax = useSettingsStore((s) => s.invoiceTaxPercent);
  const shopName = useSettingsStore((s) => s.shopName);
  const recovered = useInvoiceEditorStore((s) => s.draft);
  const replaceRecovery = useInvoiceEditorStore((s) => s.replace);
  const resetRecovery = useInvoiceEditorStore((s) => s.reset);
  const [form, setForm] = useState<InvoiceEditorForm>(() =>
    editing ? emptyInvoiceEditor(defaultTax) : recovered,
  );
  const [revision, setRevision] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [dateValid, setDateValid] = useState(true);
  const [dueValid, setDueValid] = useState(true);
  const [invalidMoney, setInvalidMoney] = useState<Set<string>>(new Set());
  const moneyValidity = (key: string) => ({
    onValidityChange: (valid: boolean) =>
      setInvalidMoney((previous) => {
        const next = new Set(previous);
        if (valid) next.delete(key);
        else next.add(key);
        return next;
      }),
  });
  const loadedKey = useRef<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualPrice, setManualPrice] = useState(0);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);

  const products = useLiveQuery(() => db.products.orderBy('name').toArray(), [], [] as Product[]);
  const customers = useLiveQuery(
    () => db.customers.orderBy('name').toArray(),
    [],
    [] as Customer[],
  );
  const existing = useLiveQuery(
    async () => {
      if (!editing) return null;
      const invoice = await db.invoices.get(editingId!);
      if (!invoice) return null;
      const items = await db.invoiceItems.where('invoiceId').equals(invoice.id!).toArray();
      return { invoice, items };
    },
    [editingId],
    undefined,
  );

  useEffect(() => {
    loadedKey.current = null;
    if (!editing) {
      setForm(useInvoiceEditorStore.getState().draft);
      setDirty(false);
    }
  }, [editingId, editing]); // بازیابی فرم جدید فقط هنگام ورود به مسیر
  useEffect(() => {
    if (!editing || !existing || loadedKey.current === String(editingId)) return;
    loadedKey.current = String(editingId);
    setForm(fromInvoice(existing.invoice, existing.items));
    setRevision(existing.invoice.revision ?? 1);
    setDirty(false);
  }, [editing, editingId, existing]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const update = (patch: Partial<InvoiceEditorForm>) => {
    setForm((previous) => {
      const next = { ...previous, ...patch };
      if (!editing) replaceRecovery(next);
      return next;
    });
    setDirty(true);
  };
  const selectedCustomer = customers.find((c) => c.id === form.customerId) ?? null;
  const productById = useMemo(() => new Map(products.map((p) => [p.id!, p])), [products]);
  const usedStock = useMemo(() => {
    const map = new Map<number, number>();
    for (const line of form.items)
      if (line.productId != null)
        map.set(line.productId, (map.get(line.productId) ?? 0) + line.qty);
    return map;
  }, [form.items]);
  const searchResults = useMemo(() => {
    const query = normalizeSearch(productSearch);
    return products
      .filter(
        (p) =>
          !query || normalizeSearch(`${p.name} ${p.barcode ?? ''} ${p.category}`).includes(query),
      )
      .slice(0, 8);
  }, [products, productSearch]);
  const preview = useMemo(() => {
    try {
      return { totals: calculateInvoice(form), error: null as string | null };
    } catch (error) {
      return { totals: null, error: error instanceof Error ? error.message : 'محاسبه معتبر نیست.' };
    }
  }, [form]);
  const stockError = form.items.some(
    (line) =>
      line.productId != null &&
      (usedStock.get(line.productId) ?? 0) > (productById.get(line.productId)?.stock ?? 0),
  );
  const creditError = form.paymentMethod === 'credit' && form.customerId == null;
  const canIssue =
    !!preview.totals &&
    form.items.length > 0 &&
    !stockError &&
    !creditError &&
    dateValid &&
    dueValid &&
    invalidMoney.size === 0 &&
    !saving;

  const addProduct = (product: Product) => {
    if (form.items.length >= 500) {
      toast.error('حداکثر ۵۰۰ ردیف مجاز است.');
      return;
    }
    const currentQty = usedStock.get(product.id!) ?? 0;
    if (currentQty + 1 > product.stock) {
      toast.error(`موجودی «${product.name}» کافی نیست.`);
      return;
    }
    const existingLine = form.items.find((line) => line.productId === product.id);
    update({
      items: existingLine
        ? form.items.map((line) =>
            line.productId === product.id ? { ...line, qty: line.qty + 1 } : line,
          )
        : [
            ...form.items,
            {
              productId: product.id!,
              name: product.name,
              qty: 1,
              unitPrice: product.sellPrice,
              unit: product.unit,
              discountType: 'percent',
              discountValue: 0,
            },
          ],
    });
    setProductSearch('');
  };
  const addManual = () => {
    if (!manualName.trim()) {
      toast.error('نام قلم دستی را وارد کنید.');
      return;
    }
    if (form.items.length >= 500) {
      toast.error('حداکثر ۵۰۰ ردیف مجاز است.');
      return;
    }
    update({
      items: [
        ...form.items,
        {
          productId: null,
          name: manualName.trim(),
          qty: 1,
          unitPrice: manualPrice,
          discountType: 'percent',
          discountValue: 0,
        },
      ],
    });
    setManualName('');
    setManualPrice(0);
  };
  const updateLine = (index: number, patch: Partial<InvoiceEditorForm['items'][number]>) =>
    update({ items: form.items.map((line, i) => (i === index ? { ...line, ...patch } : line)) });
  const moveLine = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= form.items.length) return;
    const items = [...form.items];
    [items[index], items[target]] = [items[target], items[index]];
    update({ items });
  };
  const input = (): NewInvoiceInput => ({
    ...form,
    customerName: selectedCustomer?.name ?? form.customerName,
    customerId: form.customerId,
    isCredit: form.paymentMethod === 'credit',
    dueDate: form.dueDate || undefined,
    source: 'invoice',
    checkoutKey: form.checkoutKey,
  });
  const persistDraft = async (): Promise<{ id: number; revision: number }> => {
    const savedId = await saveInvoiceDraft(
      input(),
      editing ? editingId : undefined,
      editing ? revision : undefined,
    );
    const nextRevision = editing ? revision + 1 : 1;
    setRevision(nextRevision);
    setDirty(false);
    if (!editing) resetRecovery(defaultTax);
    return { id: savedId, revision: nextRevision };
  };
  const saveDraft = async () => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      const saved = await persistDraft();
      toast.success('پیش‌نویس ذخیره شد؛ هنوز موجودی یا درآمدی تغییر نکرده است.');
      navigate(`/store/invoices/${saved.id}/edit`, { replace: editing });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ذخیره پیش‌نویس ناموفق بود.');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  const issue = async () => {
    if (busy.current || !canIssue) return;
    busy.current = true;
    setSaving(true);
    let saved: { id: number; revision: number } | null = null;
    try {
      saved = await persistDraft();
      // صدور از پیش‌نویس ذخیره‌شده: اثر انبار و درآمد یک‌بار و در یک تراکنش ثبت می‌شود.
      const invoiceId = await issueInvoice(saved.id, saved.revision);
      resetRecovery(defaultTax);
      toast.success('فاکتور صادر شد؛ موجودی و دفتر فروش به‌روز شدند.');
      navigate(`/store/invoices/${invoiceId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'صدور فاکتور ناموفق بود.');
      if (saved) navigate(`/store/invoices/${saved.id}/edit`, { replace: true });
    } finally {
      busy.current = false;
      setSaving(false);
      setConfirmOpen(false);
    }
  };

  if (editing && existing === undefined)
    return (
      <p role="status" className="p-6 text-sm text-muted-foreground">
        در حال بارگذاری پیش‌نویس…
      </p>
    );
  if (editing && (!existing || existing.invoice.status !== 'draft'))
    return (
      <div className="space-y-3 p-6">
        <p className="font-bold">این سند پیش‌نویس قابل ویرایش نیست.</p>
        <Button asChild variant="outline">
          <Link to={`/store/invoices/${editingId}`}>مشاهده سند</Link>
        </Button>
      </div>
    );
  const money = (value: number) => formatMoney(value, unit);
  const totals = preview.totals;

  return (
    <div className="pb-24 lg:pb-0">
      <PageHeader
        title={
          editing
            ? `ویرایش پیش‌نویس ${toFaDigits(existing?.invoice.number ?? '')}`
            : 'صدور فاکتور فروش'
        }
        subtitle={`فروشگاه: ${shopName} — پیش‌نویس اثر مالی ندارد؛ موجودی هنگام صدور کنترل می‌شود.`}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={editing ? 'warning' : 'secondary'}>
              {editing ? 'پیش‌نویس' : 'فرم جدید'}
            </Badge>
            <Button asChild variant="outline">
              <Link to="/store/invoices/issued">بازگشت به فهرست</Link>
            </Button>
          </div>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-5 w-5 text-primary" aria-hidden />
                مشخصات سند و طرف حساب
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="inv-customer-select">مشتری</Label>
                <Select
                  value={form.customerId == null ? 'walk-in' : String(form.customerId)}
                  onValueChange={(value) => {
                    const customer = customers.find((c) => String(c.id) === value);
                    update({
                      customerId: customer?.id ?? null,
                      customerName: customer?.name ?? '',
                    });
                  }}
                >
                  <SelectTrigger id="inv-customer-select" aria-label="انتخاب مشتری">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="walk-in">مشتری گذری (بدون حساب)</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                        {c.phone ? ` — ${c.phone}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {creditError && (
                  <p role="alert" className="text-xs text-destructive">
                    برای فروش نسیه، مشتری ثبت‌شده انتخاب کنید.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-method">روش تسویه</Label>
                <Select
                  value={form.paymentMethod}
                  onValueChange={(value) => {
                    const method = value as InvoiceEditorForm['paymentMethod'];
                    update({
                      paymentMethod: method,
                      dueDate:
                        method === 'credit' && !form.dueDate
                          ? new Date(new Date(form.date).getTime() + 30 * 86_400_000).toISOString()
                          : form.dueDate,
                    });
                  }}
                >
                  <SelectTrigger id="inv-method" aria-label="روش تسویه">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!selectedCustomer && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="inv-customer">نام خریدار (اختیاری)</Label>
                  <Input
                    id="inv-customer"
                    value={form.customerName}
                    maxLength={200}
                    onChange={(e) => update({ customerName: e.target.value })}
                  />
                </div>
              )}
              {selectedCustomer && (
                <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground sm:col-span-2">
                  {selectedCustomer.phone || 'تلفن ثبت نشده'} ·{' '}
                  {selectedCustomer.address || 'نشانی ثبت نشده'}
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="inv-date">تاریخ صدور</Label>
                <JalaliDateInput
                  id="inv-date"
                  value={form.date}
                  onChange={(date) => update({ date })}
                  onValidityChange={setDateValid}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-due">
                  سررسید {form.paymentMethod !== 'credit' && '(اختیاری)'}
                </Label>
                <JalaliDateInput
                  id="inv-due"
                  value={form.dueDate}
                  onChange={(dueDate) => update({ dueDate })}
                  allowEmpty
                  onValidityChange={setDueValid}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Search className="h-5 w-5 text-primary" aria-hidden />
                افزودن کالا و خدمات
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  className="min-w-0 flex-1"
                  placeholder="نام کالا، دسته یا بارکد…"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  aria-label="جستجوی کالا برای فاکتور"
                />
                <Button
                  variant="outline"
                  onClick={() => setScannerOpen(true)}
                  aria-label="اسکن بارکد با دوربین"
                >
                  <ScanBarcode aria-hidden />
                  اسکن
                </Button>
              </div>
              <ul className="max-h-64 divide-y overflow-y-auto rounded-xl border">
                {searchResults.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-3 py-3 text-start transition hover:bg-secondary disabled:opacity-50"
                      onClick={() => addProduct(p)}
                      disabled={p.stock <= 0}
                      aria-label={`افزودن ${p.name} به فاکتور`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{p.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          موجودی: {formatDecimal(p.stock, 6)} {p.unit}
                        </span>
                      </span>
                      <span className="whitespace-nowrap text-sm font-bold">
                        {money(p.sellPrice)}
                      </span>
                      <Plus className="h-4 w-4 text-primary" aria-hidden />
                    </button>
                  </li>
                ))}
                {!searchResults.length && (
                  <li className="px-3 py-4 text-sm text-muted-foreground">
                    کالایی پیدا نشد؛ می‌توانید قلم دستی اضافه کنید.
                  </li>
                )}
              </ul>
              <div className="rounded-xl border border-dashed p-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">
                  قلم دستی / خدمات (بدون اثر انباری)
                </p>
                <div className="grid gap-2 sm:grid-cols-[1fr_150px_auto]">
                  <Input
                    placeholder="نام قلم"
                    value={manualName}
                    maxLength={200}
                    onChange={(e) => setManualName(e.target.value)}
                    aria-label="نام قلم دستی"
                  />
                  <InvoiceMoneyInput
                    value={manualPrice}
                    onChange={setManualPrice}
                    label="قیمت قلم دستی"
                    {...moneyValidity('manual')}
                  />
                  <Button
                    variant="outline"
                    onClick={addManual}
                    disabled={invalidMoney.has('manual')}
                  >
                    <Plus aria-hidden />
                    افزودن
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ReceiptText className="h-5 w-5 text-primary" aria-hidden />
                اقلام فاکتور ({toFaDigits(form.items.length)})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!form.items.length ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  هنوز قلمی اضافه نشده است.
                </p>
              ) : (
                <ul className="space-y-3">
                  {form.items.map((line, index) => {
                    const overStock =
                      line.productId != null &&
                      (usedStock.get(line.productId) ?? 0) >
                        (productById.get(line.productId)?.stock ?? 0);
                    const gross = preview.totals?.lines[index]?.grossTotal ?? 0;
                    return (
                      <li key={index} className="rounded-xl border p-3">
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="break-words font-semibold">{line.name}</p>
                            {line.unit && (
                              <p className="text-xs text-muted-foreground">واحد: {line.unit}</p>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9"
                              disabled={index === 0}
                              onClick={() => moveLine(index, -1)}
                              aria-label={`انتقال ${line.name} به بالا`}
                            >
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9"
                              disabled={index === form.items.length - 1}
                              onClick={() => moveLine(index, 1)}
                              aria-label={`انتقال ${line.name} به پایین`}
                            >
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 text-destructive"
                              onClick={() =>
                                update({ items: form.items.filter((_, i) => i !== index) })
                              }
                              aria-label={`حذف ${line.name} از فاکتور`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                          <div className="space-y-1">
                            <Label htmlFor={`qty-${index}`} className="text-xs">
                              تعداد
                            </Label>
                            <DecimalInput
                              id={`qty-${index}`}
                              value={line.qty}
                              onChange={(qty) => updateLine(index, { qty })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">قیمت واحد ({CURRENCY_LABELS[unit]})</Label>
                            <InvoiceMoneyInput
                              value={line.unitPrice}
                              onChange={(unitPrice) => updateLine(index, { unitPrice })}
                              label={`قیمت واحد ${line.name}`}
                              {...moneyValidity(`price-${index}`)}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">نوع تخفیف ردیف</Label>
                            <Select
                              value={line.discountType ?? 'percent'}
                              onValueChange={(value) =>
                                updateLine(index, {
                                  discountType: value as 'percent' | 'amount',
                                  discountValue: 0,
                                })
                              }
                            >
                              <SelectTrigger aria-label={`نوع تخفیف ${line.name}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="percent">درصدی</SelectItem>
                                <SelectItem value="amount">مبلغی</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">
                              تخفیف ردیف{' '}
                              {line.discountType === 'amount'
                                ? `(${CURRENCY_LABELS[unit]})`
                                : '(٪)'}
                            </Label>
                            {line.discountType === 'amount' ? (
                              <InvoiceMoneyInput
                                value={line.discountValue ?? 0}
                                onChange={(discountValue) => updateLine(index, { discountValue })}
                                label={`مبلغ تخفیف ${line.name}`}
                                {...moneyValidity(`line-discount-${index}`)}
                              />
                            ) : (
                              <DecimalInput
                                value={line.discountValue ?? 0}
                                onChange={(discountValue) => updateLine(index, { discountValue })}
                                aria-label={`درصد تخفیف ${line.name}`}
                              />
                            )}
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          جمع پیش از تخفیف: {money(gross)}
                        </p>
                        {overStock && (
                          <p
                            className="mt-2 flex items-center gap-1 text-xs text-destructive"
                            role="alert"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                            مجموع این کالا از موجودی انبار بیشتر است.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">توضیحات و شرایط</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="inv-note">یادداشت فاکتور</Label>
                <Textarea
                  id="inv-note"
                  rows={3}
                  maxLength={2000}
                  value={form.note}
                  onChange={(e) => update({ note: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-terms">شرایط پرداخت</Label>
                <Textarea
                  id="inv-terms"
                  rows={3}
                  maxLength={1000}
                  value={form.terms}
                  onChange={(e) => update({ terms: e.target.value })}
                  placeholder="در چاپ و PDF نمایش داده می‌شود."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-internal">یادداشت داخلی</Label>
                <Textarea
                  id="inv-internal"
                  rows={3}
                  maxLength={2000}
                  value={form.internalNote}
                  onChange={(e) => update({ internalNote: e.target.value })}
                  placeholder="فقط داخل برنامه؛ در چاپ مشتری نمی‌آید."
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit xl:sticky xl:top-20">
          <CardHeader>
            <CardTitle className="text-base">خلاصه و ثبت</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="inv-disc-type">تخفیف کل</Label>
                <Select
                  value={form.discountType}
                  onValueChange={(value) =>
                    update({ discountType: value as 'percent' | 'amount', discountValue: 0 })
                  }
                >
                  <SelectTrigger id="inv-disc-type" aria-label="نوع تخفیف">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">درصدی</SelectItem>
                    <SelectItem value="amount">مبلغی</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-disc-value">
                  {form.discountType === 'percent' ? 'درصد' : CURRENCY_LABELS[unit]}
                </Label>
                {form.discountType === 'percent' ? (
                  <DecimalInput
                    id="inv-disc-value"
                    value={form.discountValue}
                    onChange={(discountValue) => update({ discountValue })}
                  />
                ) : (
                  <InvoiceMoneyInput
                    id="inv-disc-value"
                    value={form.discountValue}
                    onChange={(discountValue) => update({ discountValue })}
                    label="مبلغ تخفیف کل"
                    {...moneyValidity('discount')}
                  />
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-tax">مالیات بر ارزش افزوده (٪)</Label>
              <DecimalInput
                id="inv-tax"
                value={form.taxPercent}
                onChange={(taxPercent) => update({ taxPercent })}
              />
              <p className="text-[11px] text-muted-foreground">
                نرخ از تنظیمات شما می‌آید؛ پس از تخفیف محاسبه می‌شود.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>حمل ({CURRENCY_LABELS[unit]})</Label>
                <InvoiceMoneyInput
                  value={form.shippingAmount}
                  onChange={(shippingAmount) => update({ shippingAmount })}
                  label="هزینه حمل"
                  {...moneyValidity('shipping')}
                />
              </div>
              <div className="space-y-1.5">
                <Label>سایر هزینه‌ها</Label>
                <InvoiceMoneyInput
                  value={form.otherAmount}
                  onChange={(otherAmount) => update({ otherAmount })}
                  label="سایر هزینه‌ها"
                  {...moneyValidity('other')}
                />
              </div>
            </div>
            <dl className="space-y-2 rounded-xl bg-muted/60 p-4 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">جمع اقلام</dt>
                <dd>{totals ? money(totals.grossSubtotal) : '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">تخفیف ردیف‌ها</dt>
                <dd className="text-destructive">
                  {totals ? `− ${money(totals.lineDiscountAmount)}` : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">تخفیف کل</dt>
                <dd className="text-destructive">
                  {totals ? `− ${money(totals.discountAmount)}` : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">مالیات</dt>
                <dd>{totals ? money(totals.taxAmount) : '—'}</dd>
              </div>
              <div className="flex justify-between gap-2 border-t pt-2 text-base">
                <dt className="font-bold">قابل پرداخت</dt>
                <dd className="font-extrabold text-primary dark:text-neon-400">
                  {totals ? money(totals.total) : '—'}
                </dd>
              </div>
            </dl>
            {preview.error && (
              <p role="alert" className="text-xs text-destructive">
                {preview.error}
              </p>
            )}
            {stockError && (
              <p role="alert" className="text-xs text-destructive">
                موجودی کالاها را پیش از صدور اصلاح کنید.
              </p>
            )}
            <div className="grid gap-2">
              <Button
                variant="neon"
                size="lg"
                disabled={!canIssue}
                onClick={() => setConfirmOpen(true)}
              >
                <FileCheck2 aria-hidden />
                {saving ? 'در حال ثبت…' : 'صدور فاکتور'}
              </Button>
              <Button
                variant="outline"
                disabled={saving || !!preview.error || invalidMoney.size > 0}
                onClick={() => void saveDraft()}
              >
                <Save aria-hidden />
                ذخیره پیش‌نویس
              </Button>
            </div>
            <p className="text-[11px] leading-5 text-muted-foreground">
              {editing
                ? dirty
                  ? 'تغییرات ذخیره‌نشده دارید.'
                  : 'پیش‌نویس در پایگاه‌داده ذخیره شده است.'
                : 'تغییرات فرم به‌صورت خودکار روی همین دستگاه بازیابی می‌شود؛ برای پیش‌نویس حسابداری دکمهٔ ذخیره را بزنید.'}
            </p>
          </CardContent>
        </Card>
      </div>
      <BarcodeScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={(code) => {
          const product = products.find((p) => p.barcode === code);
          if (product) addProduct(product);
          else {
            setProductSearch(code);
            toast.error('کالایی با این بارکد پیدا نشد.');
          }
        }}
      />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="صدور نهایی فاکتور"
        description={
          totals
            ? `مبلغ ${money(totals.total)} با روش ${PAYMENT_LABELS[form.paymentMethod]} ثبت می‌شود. موجودی کالاها کم و سند در دفتر فروش ثبت خواهد شد.`
            : ''
        }
        confirmLabel="تأیید و صدور"
        onConfirm={issue}
      />
    </div>
  );
}
