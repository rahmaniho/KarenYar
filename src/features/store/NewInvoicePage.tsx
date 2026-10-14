import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, Plus, ReceiptText, Search, Trash2, User } from 'lucide-react';
import { toast } from 'sonner';
import { db, type Product } from '@/core/db/db';
import {
  formatMoney,
  formatNumber,
  fromDisplayAmount,
  toDisplayAmount,
  toFaDigits,
} from '@/core/currency/currency';
import { useSettingsStore } from '@/store/settings-store';
import { PageHeader } from '@/components/PageHeader';
import { AmountInput } from '@/components/AmountInput';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { calculateInvoiceTotals, createInvoice, type NewInvoiceItemInput } from './invoice.service';

interface Line extends NewInvoiceItemInput {
  stock?: number;
  unit?: string;
}

/** صدور فاکتور فروش جدید — انتخاب کالا، تخفیف، مالیات و کسر خودکار موجودی */
export function NewInvoicePage() {
  const navigate = useNavigate();
  const unit = useSettingsStore((s) => s.currencyUnit);
  const defaultTax = useSettingsStore((s) => s.invoiceTaxPercent);
  const shopName = useSettingsStore((s) => s.shopName);

  const products = useLiveQuery(() => db.products.orderBy('name').toArray(), [], [] as Product[]);

  const [customerName, setCustomerName] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualPrice, setManualPrice] = useState(0);
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
  const [discountValue, setDiscountValue] = useState(0);
  const [taxPercent, setTaxPercent] = useState(defaultTax);
  const [saving, setSaving] = useState(false);

  const searchResults = useMemo(() => {
    const query = productSearch.trim();
    if (!query) return products.slice(0, 8);
    return products
      .filter((p) => `${p.name} ${p.barcode ?? ''} ${p.category}`.includes(query))
      .slice(0, 8);
  }, [products, productSearch]);

  const addProductLine = (product: Product) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) => (l.productId === product.id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...prev,
        {
          productId: product.id!,
          name: product.name,
          qty: 1,
          unitPrice: toDisplayAmount(product.sellPrice, unit),
          stock: product.stock,
          unit: product.unit,
        },
      ];
    });
    setProductSearch('');
  };

  const addManualLine = () => {
    if (!manualName.trim()) {
      toast.error('نام قلم دستی را وارد کنید.');
      return;
    }
    if (manualPrice <= 0) {
      toast.error('قیمت قلم دستی باید بیشتر از صفر باشد.');
      return;
    }
    setLines((prev) => [
      ...prev,
      { productId: null, name: manualName.trim(), qty: 1, unitPrice: manualPrice },
    ]);
    setManualName('');
    setManualPrice(0);
  };

  const updateLine = (index: number, patch: Partial<Line>) => {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };
  const removeLine = (index: number) => setLines((prev) => prev.filter((_, i) => i !== index));

  // جمع‌ها با تبدیل مبلغ‌ها به تومان داخلی محاسبه می‌شوند
  const totals = useMemo(() => {
    const tomanItems = lines.map((l) => ({
      qty: l.qty,
      unitPrice: fromDisplayAmount(l.unitPrice, unit),
    }));
    const tomanDiscount =
      discountType === 'amount' ? fromDisplayAmount(discountValue, unit) : discountValue;
    return calculateInvoiceTotals(tomanItems, discountType, tomanDiscount, taxPercent);
  }, [lines, discountType, discountValue, taxPercent, unit]);

  const save = async () => {
    setSaving(true);
    try {
      const id = await createInvoice({
        customerName: customerName || undefined,
        items: lines.map((l) => ({
          productId: l.productId,
          name: l.name,
          qty: l.qty,
          unitPrice: fromDisplayAmount(l.unitPrice, unit),
        })),
        discountType,
        discountValue:
          discountType === 'amount' ? fromDisplayAmount(discountValue, unit) : discountValue,
        taxPercent,
      });
      toast.success('فاکتور با موفقیت صادر شد.');
      navigate(`/store/invoices/${id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'خطا در صدور فاکتور');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="صدور فاکتور فروش"
        subtitle={`فروشگاه: ${shopName} — موجودی کالاها پس از ثبت به‌صورت خودکار کم می‌شود.`}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-5 w-5 text-primary dark:text-neon-400" aria-hidden />
                مشخصات مشتری
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                <Label htmlFor="inv-customer">نام مشتری (اختیاری)</Label>
                <Input
                  id="inv-customer"
                  placeholder="مشتری نقدی"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Search className="h-5 w-5 text-primary dark:text-neon-400" aria-hidden />
                افزودن کالا از انبار
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  className="ps-9"
                  placeholder="نام کالا یا بارکد را جستجو کنید…"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  aria-label="جستجوی کالا برای فاکتور"
                />
              </div>
              {products.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  هنوز کالایی در انبار نیست؛ از بخش «کالاها» کالا ثبت کنید یا قلم دستی اضافه کنید.
                </p>
              ) : (
                <ul className="divide-y rounded-xl border">
                  {searchResults.map((p) => (
                    <li key={p.id}>
                      <button
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-start transition hover:bg-secondary disabled:opacity-50"
                        onClick={() => addProductLine(p)}
                        disabled={p.stock <= 0}
                        aria-label={`افزودن ${p.name} به فاکتور`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{p.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            موجودی: {formatNumber(p.stock)} {p.unit}
                            {p.stock <= 0 && ' — ناموجود'}
                          </span>
                        </span>
                        <span className="text-sm font-bold">{formatMoney(p.sellPrice, unit)}</span>
                        <Plus className="h-4 w-4 text-primary dark:text-neon-400" aria-hidden />
                      </button>
                    </li>
                  ))}
                  {searchResults.length === 0 && (
                    <li className="px-3 py-3 text-sm text-muted-foreground">
                      کالایی با این عبارت پیدا نشد.
                    </li>
                  )}
                </ul>
              )}

              <div className="rounded-xl border border-dashed p-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">
                  قلم دستی (کالای بدون انبار)
                </p>
                <div className="flex flex-wrap gap-2">
                  <Input
                    className="min-w-36 flex-1"
                    placeholder="نام قلم"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    aria-label="نام قلم دستی"
                  />
                  <AmountInput
                    value={manualPrice}
                    onChange={setManualPrice}
                    aria-label="قیمت قلم دستی"
                    className="w-36"
                  />
                  <Button variant="outline" onClick={addManualLine}>
                    <Plus aria-hidden /> افزودن
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ReceiptText className="h-5 w-5 text-primary dark:text-neon-400" aria-hidden />
                اقلام فاکتور ({toFaDigits(String(lines.length))})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lines.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  هنوز قلمی اضافه نشده است؛ از فهرست بالا کالا انتخاب کنید.
                </p>
              ) : (
                <ul className="space-y-3">
                  {lines.map((line, index) => {
                    const overStock = line.stock != null && line.qty > line.stock;
                    return (
                      <li key={index} className="rounded-xl border p-3">
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <p className="font-semibold">{line.name}</p>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            aria-label={`حذف ${line.name} از فاکتور`}
                            onClick={() => removeLine(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-3 items-end gap-2">
                          <div className="space-y-1">
                            <Label htmlFor={`qty-${index}`} className="text-xs">
                              تعداد
                            </Label>
                            <Input
                              id={`qty-${index}`}
                              inputMode="numeric"
                              dir="ltr"
                              className="text-left"
                              value={line.qty || ''}
                              onChange={(e) =>
                                updateLine(index, { qty: Math.max(0, Number(e.target.value) || 0) })
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">قیمت واحد</Label>
                            <AmountInput
                              value={line.unitPrice}
                              onChange={(v) => updateLine(index, { unitPrice: v })}
                              aria-label={`قیمت واحد ${line.name}`}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">جمع</Label>
                            <p className="flex h-10 items-center rounded-lg bg-muted/70 px-2 text-sm font-bold">
                              {formatMoney(
                                fromDisplayAmount(line.qty * line.unitPrice, unit),
                                unit,
                              )}
                            </p>
                          </div>
                        </div>
                        {overStock && (
                          <p
                            className="mt-2 flex items-center gap-1 text-xs text-destructive"
                            role="alert"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                            موجودی کافی نیست (موجودی: {formatNumber(line.stock!)} {line.unit})
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* خلاصه و ثبت */}
        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle className="text-base">خلاصه‌ی فاکتور</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="inv-disc-type">نوع تخفیف</Label>
                <Select
                  value={discountType}
                  onValueChange={(v) => setDiscountType(v as 'percent' | 'amount')}
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
                  {discountType === 'percent'
                    ? 'درصد تخفیف'
                    : `مبلغ تخفیف (${unit === 'toman' ? 'تومان' : 'ریال'})`}
                </Label>
                {discountType === 'percent' ? (
                  <Input
                    id="inv-disc-value"
                    inputMode="decimal"
                    dir="ltr"
                    className="text-left"
                    value={discountValue || ''}
                    onChange={(e) => setDiscountValue(Number(e.target.value) || 0)}
                  />
                ) : (
                  <AmountInput
                    id="inv-disc-value"
                    value={discountValue}
                    onChange={setDiscountValue}
                  />
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inv-tax">مالیات بر ارزش افزوده (٪)</Label>
              <Input
                id="inv-tax"
                inputMode="decimal"
                dir="ltr"
                className="text-left"
                value={taxPercent || ''}
                onChange={(e) => setTaxPercent(Number(e.target.value) || 0)}
              />
            </div>

            <dl className="space-y-2 rounded-xl bg-muted/60 p-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">جمع اقلام</dt>
                <dd>{formatMoney(totals.subtotal, unit)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">تخفیف</dt>
                <dd className="text-destructive">− {formatMoney(totals.discountAmount, unit)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  مالیات ({toFaDigits(String(taxPercent))}٪)
                </dt>
                <dd>{formatMoney(totals.taxAmount, unit)}</dd>
              </div>
              <div className="flex justify-between border-t pt-2 text-base">
                <dt className="font-bold">قابل پرداخت</dt>
                <dd className="font-extrabold text-primary dark:text-neon-400">
                  {formatMoney(totals.total, unit)}
                </dd>
              </div>
            </dl>

            <Button
              variant="neon"
              size="lg"
              className="w-full"
              disabled={lines.length === 0 || saving}
              onClick={() => void save()}
            >
              <ReceiptText aria-hidden />
              {saving ? 'در حال ثبت…' : 'ثبت فاکتور و کسر از انبار'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
