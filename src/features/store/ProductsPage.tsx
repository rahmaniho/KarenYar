import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Package, Pencil, Plus, ScanBarcode, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { db, nowISO, type Product } from '@/core/db/db';
import { FREE_LIMITS } from '@/core/license/license-core';
import { landedCost, profitFromPrices } from '@/core/calc/finance';
import {
  formatMoney,
  formatDecimal,
  fromDisplayAmount,
  toDisplayAmount,
  toFaDigits,
} from '@/core/currency/currency';
import { useLicenseStore } from '@/store/license-store';
import { useSettingsStore } from '@/store/settings-store';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { FeatureGate } from '@/components/FeatureGate';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AmountInput } from '@/components/AmountInput';
import { BarcodeScannerDialog } from '@/components/BarcodeScannerDialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DEFAULT_PRODUCT_CATEGORIES, PRODUCT_UNITS, mergeCategories } from '../personal/categories';
import { productSchema, type ProductFormValues } from './schemas';
import { cn } from '@/lib/utils';
import { saveProduct, deleteProduct } from './inventory.service';

function stockBadge(product: Product) {
  if (product.stock <= 0) return <Badge variant="destructive">ناموجود</Badge>;
  if (product.stock <= product.minStock) return <Badge variant="warning">کم‌موجود</Badge>;
  return <Badge variant="success">موجود</Badge>;
}

/** مدیریت کالاها — CRUD + جستجو + هشدار موجودی + محاسبه‌ی قیمت تمام‌شده و سود */
export function ProductsPage() {
  const unit = useSettingsStore((s) => s.currencyUnit);
  const can = useLicenseStore((s) => s.can);
  const products = useLiveQuery(() => db.products.orderBy('name').toArray(), [], [] as Product[]);

  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');

  // عبارت آمده از جستجوی سراسری (Ctrl+K)
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) setSearch(q);
  }, [searchParams]);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [lowOnly, setLowOnly] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  const categories = useMemo(
    () =>
      mergeCategories(
        DEFAULT_PRODUCT_CATEGORIES,
        products.map((p) => p.category),
      ),
    [products],
  );

  const filtered = useMemo(
    () =>
      products.filter((p) => {
        if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
        if (lowOnly && p.stock > p.minStock) return false;
        if (search && !`${p.name} ${p.barcode ?? ''} ${p.category}`.includes(search)) return false;
        return true;
      }),
    [products, search, categoryFilter, lowOnly],
  );

  const atFreeLimit = !can('unlimited-products') && products.length >= FREE_LIMITS.products;

  const openCreate = () => {
    if (atFreeLimit) {
      toast.error(
        `در نسخه‌ی رایگان فقط ${toFaDigits(FREE_LIMITS.products)} کالا قابل ثبت است. برای کالای نامحدود نسخه‌ی حرفه‌ای را فعال کنید.`,
      );
      return;
    }
    setEditing(null);
    setDialogOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="کالاها"
        subtitle="مدیریت کالاها، قیمت تمام‌شده، سود و هشدار کمبود موجودی"
        actions={
          <Button variant="neon" onClick={openCreate}>
            <Plus aria-hidden />
            کالای جدید
          </Button>
        }
      />

      {atFreeLimit && <FeatureGate feature="unlimited-products" compact className="mb-4" />}

      <Card className="mb-5 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-44 flex-1">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              className="ps-9"
              placeholder="جستجو: نام، بارکد یا دسته…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="جستجوی کالا"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => setScannerOpen(true)}
            aria-label="اسکن بارکد کالا"
          >
            <ScanBarcode aria-hidden />
            اسکن بارکد
          </Button>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-44" aria-label="فیلتر دسته‌بندی">
              <SelectValue placeholder="همه‌ی دسته‌ها" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه‌ی دسته‌ها</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={lowOnly ? 'default' : 'outline'}
            onClick={() => setLowOnly((v) => !v)}
            aria-pressed={lowOnly}
          >
            <AlertTriangle aria-hidden />
            فقط کم‌موجودها
          </Button>
        </div>
      </Card>

      {products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="هنوز کالایی ثبت نشده است"
          description="اولین کالای فروشگاه را با قیمت خرید، فروش و موجودی ثبت کنید تا بتوانید فاکتور صادر کنید."
          action={
            <Button variant="neon" onClick={openCreate}>
              <Plus aria-hidden />
              ثبت اولین کالا
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="کالایی با این فیلتر پیدا نشد"
          description="عبارت جستجو یا فیلترها را تغییر دهید."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>کالا</TableHead>
                  <TableHead>دسته</TableHead>
                  <TableHead>تمام‌شده</TableHead>
                  <TableHead>قیمت فروش</TableHead>
                  <TableHead>سود واحد</TableHead>
                  <TableHead>موجودی</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead className="w-24">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const profit = profitFromPrices(p.sellPrice, p.costPrice);
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <p className="font-semibold">{p.name}</p>
                        {p.barcode && (
                          <p className="text-xs text-muted-foreground">بارکد: {p.barcode}</p>
                        )}
                      </TableCell>
                      <TableCell>{p.category}</TableCell>
                      <TableCell>{formatMoney(p.costPrice, unit)}</TableCell>
                      <TableCell className="font-semibold">
                        {formatMoney(p.sellPrice, unit)}
                      </TableCell>
                      <TableCell
                        className={profit.grossProfit >= 0 ? 'text-success' : 'text-destructive'}
                      >
                        {formatMoney(profit.grossProfit, unit, { withUnit: false })}
                        <span className="text-xs">
                          {' '}
                          ({toFaDigits(profit.marginPercent.toFixed(1))}٪)
                        </span>
                      </TableCell>
                      <TableCell>
                        {formatDecimal(p.stock, 6)} {p.unit}
                      </TableCell>
                      <TableCell>{stockBadge(p)}</TableCell>
                      <TableCell>
                        <span className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={`ویرایش ${p.name}`}
                            onClick={() => {
                              setEditing(p);
                              setDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            aria-label={`حذف ${p.name}`}
                            onClick={() => setDeleting(p)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <ul className="divide-y md:hidden">
            {filtered.map((p) => (
              <li key={p.id} className="space-y-1 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{p.name}</p>
                  {stockBadge(p)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {p.category} — موجودی: {formatDecimal(p.stock, 6)} {p.unit}
                </p>
                <div className="flex items-center justify-between text-sm">
                  <span>
                    فروش: <b>{formatMoney(p.sellPrice, unit)}</b>
                  </span>
                  <span className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`ویرایش ${p.name}`}
                      onClick={() => {
                        setEditing(p);
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      aria-label={`حذف ${p.name}`}
                      onClick={() => setDeleting(p)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <BarcodeScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={(code) => {
          setSearch(code);
          const found = products.find((p) => p.barcode === code);
          if (found) toast.success(`کالا یافت شد: «${found.name}»`);
          else toast.error('کالایی با این بارکد ثبت نشده است.');
        }}
      />

      <ProductFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        categories={categories}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`حذف «${deleting?.name}»`}
        description="کالا از فهرست حذف می‌شود؛ فاکتورهای قبلی نام و قیمت این کالا را نزد خود نگه می‌دارند. ادامه می‌دهید؟"
        confirmLabel="حذف کالا"
        destructive
        onConfirm={async () => {
          if (deleting?.id != null) {
            await deleteProduct(deleting.id);
            toast.success('کالا حذف شد.');
          }
        }}
      />
    </div>
  );
}

function ProductFormDialog({
  open,
  onOpenChange,
  editing,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Product | null;
  categories: string[];
}) {
  const unit = useSettingsStore((s) => s.currencyUnit);
  const defaultMinStock = useSettingsStore((s) => s.defaultMinStock);
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: '',
      barcode: '',
      category: 'عمومی',
      buyPrice: 0,
      buyTaxPercent: 0,
      shippingPerUnit: 0,
      overheadPerUnit: 0,
      sellPrice: 0,
      stock: 0,
      unit: 'عدد',
      minStock: 5,
    },
  });

  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.reset({
        name: editing.name,
        barcode: editing.barcode ?? '',
        category: editing.category,
        buyPrice: toDisplayAmount(editing.buyPrice, unit),
        buyTaxPercent: editing.buyTaxPercent ?? 0,
        shippingPerUnit: toDisplayAmount(editing.shippingPerUnit ?? 0, unit),
        overheadPerUnit: toDisplayAmount(editing.overheadPerUnit ?? 0, unit),
        sellPrice: toDisplayAmount(editing.sellPrice, unit),
        stock: editing.stock,
        unit: editing.unit,
        minStock: editing.minStock,
      });
    } else {
      form.reset({
        name: '',
        barcode: '',
        category: 'عمومی',
        buyPrice: 0,
        buyTaxPercent: 0,
        shippingPerUnit: 0,
        overheadPerUnit: 0,
        sellPrice: 0,
        stock: 0,
        unit: 'عدد',
        minStock: defaultMinStock,
      });
    }
  }, [open, editing, form, unit, defaultMinStock]);

  const values = form.watch();
  // پیش‌نمایش زنده‌ی تمام‌شده و سود بر اساس واحد نمایشی (تبدیل خطی است)
  const previewCost = landedCost({
    buyPrice: values.buyPrice || 0,
    taxPercent: values.buyTaxPercent || 0,
    shippingPerUnit: values.shippingPerUnit || 0,
    overheadPerUnit: values.overheadPerUnit || 0,
  });
  const previewProfit = profitFromPrices(values.sellPrice || 0, previewCost);

  const onSubmit = async (v: ProductFormValues) => {
    // بارکد باید یکتا باشد؛ وگرنه اسکنر همیشه اولین کالای هم‌بارکد را پیدا می‌کند
    const barcode = v.barcode?.trim() ? v.barcode.trim() : undefined;
    if (barcode) {
      const duplicate = await db.products.where('barcode').equals(barcode).first();
      if (duplicate && duplicate.id !== editing?.id) {
        form.setError('barcode', {
          type: 'manual',
          message: `این بارکد قبلاً برای کالای «${duplicate.name}» ثبت شده است`,
        });
        return;
      }
    }
    const costPrice = landedCost({
      buyPrice: fromDisplayAmount(v.buyPrice, unit),
      taxPercent: v.buyTaxPercent,
      shippingPerUnit: fromDisplayAmount(v.shippingPerUnit, unit),
      overheadPerUnit: fromDisplayAmount(v.overheadPerUnit, unit),
    });
    const payload = {
      name: v.name,
      barcode: v.barcode?.trim() ? v.barcode.trim() : undefined,
      category: v.category,
      buyPrice: fromDisplayAmount(v.buyPrice, unit),
      buyTaxPercent: v.buyTaxPercent,
      shippingPerUnit: fromDisplayAmount(v.shippingPerUnit, unit),
      overheadPerUnit: fromDisplayAmount(v.overheadPerUnit, unit),
      costPrice,
      sellPrice: fromDisplayAmount(v.sellPrice, unit),
      stock: v.stock,
      unit: v.unit,
      minStock: v.minStock,
      updatedAt: nowISO(),
    };
    try {
      if (editing?.id != null) {
        await saveProduct(payload, editing.id, editing.stock);
        toast.success('کالا ویرایش شد.');
      } else {
        await saveProduct(payload);
        toast.success('کالا ثبت شد.');
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ذخیرهٔ کالا ناموفق بود.');
    }
  };

  const errors = form.formState.errors;
  const moneyLabel = unit === 'toman' ? 'تومان' : 'ریال';
  const err = (field: keyof ProductFormValues) =>
    errors[field] ? (
      <p role="alert" className="text-xs text-destructive">
        {errors[field]?.message}
      </p>
    ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'ویرایش کالا' : 'ثبت کالای جدید'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-name">نام کالا *</Label>
              <Input
                id="p-name"
                placeholder="مثلاً روغن خوراکی ۱ لیتری"
                {...form.register('name')}
              />
              {err('name')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-barcode">بارکد (اختیاری)</Label>
              <Input
                id="p-barcode"
                dir="ltr"
                className="text-left"
                placeholder="6260..."
                {...form.register('barcode')}
              />
              {err('barcode')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-category">دسته‌بندی *</Label>
              <Input id="p-category" list="p-categories" {...form.register('category')} />
              <datalist id="p-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              {err('category')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-unit">واحد *</Label>
              <Controller
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="p-unit" aria-label="واحد کالا">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRODUCT_UNITS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {u}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <fieldset className="space-y-3 rounded-xl border p-4">
            <legend className="px-1 text-sm font-bold">قیمت تمام‌شده</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="p-buy">قیمت خرید ({moneyLabel}) *</Label>
                <Controller
                  control={form.control}
                  name="buyPrice"
                  render={({ field }) => (
                    <AmountInput id="p-buy" value={field.value} onChange={field.onChange} />
                  )}
                />
                {err('buyPrice')}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-tax">مالیات خرید (٪)</Label>
                <Input
                  id="p-tax"
                  inputMode="decimal"
                  dir="ltr"
                  className="text-left"
                  {...form.register('buyTaxPercent', { valueAsNumber: true })}
                />
                {err('buyTaxPercent')}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-ship">حمل هر واحد ({moneyLabel})</Label>
                <Controller
                  control={form.control}
                  name="shippingPerUnit"
                  render={({ field }) => (
                    <AmountInput id="p-ship" value={field.value} onChange={field.onChange} />
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-over">سربار هر واحد ({moneyLabel})</Label>
                <Controller
                  control={form.control}
                  name="overheadPerUnit"
                  render={({ field }) => (
                    <AmountInput id="p-over" value={field.value} onChange={field.onChange} />
                  )}
                />
              </div>
            </div>
            <p className="rounded-lg bg-muted/70 px-3 py-2 text-sm">
              قیمت تمام‌شده‌ی هر واحد:{' '}
              <b className="text-primary dark:text-neon-400">
                {formatMoney(fromDisplayAmount(previewCost, unit), unit)}
              </b>
            </p>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-sell">قیمت فروش ({moneyLabel}) *</Label>
              <Controller
                control={form.control}
                name="sellPrice"
                render={({ field }) => (
                  <AmountInput id="p-sell" value={field.value} onChange={field.onChange} />
                )}
              />
              {err('sellPrice')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-stock">موجودی فعلی *</Label>
              <Input
                id="p-stock"
                inputMode="decimal"
                dir="ltr"
                className="text-left"
                {...form.register('stock', { valueAsNumber: true })}
              />
              {err('stock')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-min">حد هشدار موجودی</Label>
              <Input
                id="p-min"
                inputMode="decimal"
                dir="ltr"
                className="text-left"
                {...form.register('minStock', { valueAsNumber: true })}
              />
              {err('minStock')}
            </div>
          </div>

          <p
            className={cn(
              'rounded-lg px-3 py-2 text-sm',
              previewProfit.grossProfit >= 0
                ? 'bg-success/10 text-success'
                : 'bg-destructive/10 text-destructive',
            )}
            aria-live="polite"
          >
            سود هر واحد:{' '}
            <b>{formatMoney(fromDisplayAmount(previewProfit.grossProfit, unit), unit)}</b> — حاشیه
            سود: {toFaDigits(previewProfit.marginPercent.toFixed(1))}٪
          </p>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              انصراف
            </Button>
            <Button type="submit" variant="neon" disabled={form.formState.isSubmitting}>
              {editing ? 'ذخیره‌ی تغییرات' : 'ثبت کالا'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
