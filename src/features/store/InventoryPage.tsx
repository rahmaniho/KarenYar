import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  Download,
  History,
  Package,
  Plus,
  Search,
  Warehouse,
} from 'lucide-react';
import { toast } from 'sonner';
import { db, type StockMovementType } from '@/core/db/db';
import { formatDecimal, formatMoney, parseAmountInput } from '@/core/currency/currency';
import { formatJalaliNumeric } from '@/core/jalali/jalali';
import { downloadCsv } from '@/core/utils/csv';
import { useSettingsStore } from '@/store/settings-store';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { changeStock, MOVEMENT_LABELS } from './inventory.service';
import { normalizeSearch } from './payment';

export function InventoryPage() {
  const unit = useSettingsStore((s) => s.currencyUnit);
  const products = useLiveQuery(() => db.products.orderBy('name').toArray(), [], []);
  const movements = useLiveQuery(
    () => db.stockMovements.orderBy('createdAt').reverse().toArray(),
    [],
    [],
  );
  const [tab, setTab] = useState<'stock' | 'movements'>('stock');
  const [search, setSearch] = useState('');
  const [productFilter, setProductFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [lowOnly, setLowOnly] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [productId, setProductId] = useState('');
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const selectedProduct = products.find((p) => String(p.id) === productId);
  const filteredProducts = useMemo(
    () =>
      products.filter(
        (p) =>
          (!lowOnly || p.stock <= p.minStock) &&
          normalizeSearch(`${p.name} ${p.barcode ?? ''} ${p.category}`).includes(
            normalizeSearch(search),
          ),
      ),
    [products, lowOnly, search],
  );
  const filteredMovements = useMemo(
    () =>
      movements.filter(
        (m) =>
          (productFilter === 'all' || String(m.productId) === productFilter) &&
          (typeFilter === 'all' || m.type === typeFilter) &&
          normalizeSearch(`${m.productName} ${m.note ?? ''}`).includes(normalizeSearch(search)),
      ),
    [movements, productFilter, typeFilter, search],
  );
  const valuation = products.reduce((sum, p) => sum + p.stock * p.costPrice, 0);
  const lowCount = products.filter((p) => p.stock <= p.minStock).length;

  const openMovement = (id?: number) => {
    setProductId(id != null ? String(id) : '');
    setDirection('in');
    setQuantity('');
    setNote('');
    setDialogOpen(true);
  };
  const exportCsv = async () => {
    try {
      const rows: (string | number)[][] =
        tab === 'stock'
          ? [
              [
                'کالا',
                'دسته',
                'بارکد',
                'موجودی',
                'واحد',
                'حد هشدار',
                'بهای تمام‌شده واحد (تومان)',
                'ارزش موجودی (تومان)',
              ],
              ...filteredProducts.map((p) => [
                p.name,
                p.category,
                p.barcode ?? '',
                p.stock,
                p.unit,
                p.minStock,
                p.costPrice,
                Math.round(p.stock * p.costPrice),
              ]),
            ]
          : [
              ['تاریخ', 'کالا', 'نوع', 'مقدار تغییر', 'موجودی قبل', 'موجودی بعد', 'شرح'],
              ...filteredMovements.map((m) => [
                formatJalaliNumeric(new Date(m.createdAt)),
                m.productName,
                MOVEMENT_LABELS[m.type],
                m.quantity,
                m.stockBefore,
                m.stockAfter,
                m.note ?? '',
              ]),
            ];
      await downloadCsv(`karenyar-${tab === 'stock' ? 'inventory' : 'stock-movements'}.csv`, rows);
      toast.success('خروجی انبار آماده شد.');
    } catch {
      toast.error('ساخت خروجی ناموفق بود.');
    }
  };

  return (
    <div>
      <PageHeader
        title="انبار و گردش کالا"
        subtitle="ردیابی ورود، فروش، اصلاح و برگشت کالا با موجودی قبل و بعد از هر عملیات"
        actions={
          <>
            <Button variant="outline" onClick={() => void exportCsv()}>
              <Download />
              خروجی CSV
            </Button>
            <Button variant="neon" onClick={() => openMovement()} disabled={!products.length}>
              <Plus />
              ورود / اصلاح موجودی
            </Button>
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          title="کالاهای ثبت‌شده"
          value={`${formatDecimal(products.length)} کالا`}
          icon={Boxes}
          tone="navy"
        />
        <StatCard
          title="ارزش موجودی (تمام‌شده)"
          value={formatMoney(valuation, unit)}
          icon={Warehouse}
          tone="neon"
        />
        <StatCard
          title="کم‌موجود و ناموجود"
          value={`${formatDecimal(lowCount)} کالا`}
          icon={AlertTriangle}
          tone="warning"
        />
        <StatCard
          title="عملیات ثبت‌شدهٔ انبار"
          value={formatDecimal(movements.length)}
          icon={History}
          tone="navy"
        />
      </div>
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex rounded-lg bg-muted p-1" role="group" aria-label="نمای انبار">
            {(
              [
                { value: 'stock', label: 'موجودی کالاها' },
                { value: 'movements', label: 'گردش انبار' },
              ] as const
            ).map((item) => (
              <button
                key={item.value}
                onClick={() => {
                  setTab(item.value);
                  setSearch('');
                }}
                aria-pressed={tab === item.value}
                className={cn(
                  'rounded-md px-3 py-2 text-sm font-semibold',
                  tab === item.value ? 'bg-card shadow-sm' : 'text-muted-foreground',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="relative min-w-40 flex-1">
            <Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="ps-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجوی کالا یا شرح عملیات…"
              aria-label="جستجوی انبار"
            />
          </div>
          {tab === 'stock' ? (
            <Button
              variant={lowOnly ? 'default' : 'outline'}
              onClick={() => setLowOnly((value) => !value)}
              aria-pressed={lowOnly}
            >
              <AlertTriangle />
              فقط کم‌موجودها
            </Button>
          ) : (
            <>
              <Select value={productFilter} onValueChange={setProductFilter}>
                <SelectTrigger className="w-44" aria-label="کالای گردش انبار">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همهٔ کالاها</SelectItem>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-40" aria-label="نوع گردش انبار">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همهٔ عملیات</SelectItem>
                  {(Object.entries(MOVEMENT_LABELS) as [StockMovementType, string][]).map(
                    ([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </>
          )}
        </div>
      </Card>
      {tab === 'stock' ? (
        filteredProducts.length === 0 ? (
          <EmptyState
            icon={Package}
            title="کالایی برای نمایش نیست"
            description="کالاهای فروشگاه را ثبت کنید یا فیلتر موجودی را تغییر دهید."
            action={
              <Button asChild variant="outline">
                <Link to="/store/products">مدیریت کالاها</Link>
              </Button>
            }
          />
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>کالا</TableHead>
                  <TableHead>موجودی</TableHead>
                  <TableHead>حد هشدار</TableHead>
                  <TableHead>ارزش موجودی</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <p className="font-bold">{product.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {product.category}
                        {product.barcode ? ` · ${product.barcode}` : ''}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-bold">
                      {formatDecimal(product.stock, 6)} {product.unit}
                    </TableCell>
                    <TableCell>{formatDecimal(product.minStock, 6)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatMoney(product.stock * product.costPrice, unit)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          product.stock <= 0
                            ? 'destructive'
                            : product.stock <= product.minStock
                              ? 'warning'
                              : 'success'
                        }
                      >
                        {product.stock <= 0
                          ? 'ناموجود'
                          : product.stock <= product.minStock
                            ? 'کم‌موجود'
                            : 'موجود'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openMovement(product.id)}
                        >
                          <ArrowDownToLine className="h-3.5 w-3.5" />
                          ورود
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setProductFilter(String(product.id));
                            setTab('movements');
                            setSearch('');
                          }}
                        >
                          گردش
                        </Button>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )
      ) : filteredMovements.length === 0 ? (
        <EmptyState
          icon={History}
          title="گردشی برای این فیلتر وجود ندارد"
          description="با ثبت فروش یا تغییر موجودی، جزئیات ورود و خروج کالا اینجا ثبت می‌شود."
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>تاریخ</TableHead>
                <TableHead>کالا</TableHead>
                <TableHead>عملیات</TableHead>
                <TableHead>تغییر موجودی</TableHead>
                <TableHead>قبل ← بعد</TableHead>
                <TableHead>شرح / سند</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMovements.slice(0, 500).map((movement) => (
                <TableRow key={movement.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {formatJalaliNumeric(new Date(movement.createdAt))}
                    <span className="mt-1 block text-muted-foreground">
                      {new Date(movement.createdAt).toLocaleTimeString('fa-IR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </TableCell>
                  <TableCell className="font-semibold">{movement.productName}</TableCell>
                  <TableCell>
                    <Badge variant={movement.quantity > 0 ? 'success' : 'secondary'}>
                      {MOVEMENT_LABELS[movement.type]}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className={cn(
                      'whitespace-nowrap font-bold',
                      movement.quantity > 0 ? 'text-success' : 'text-destructive',
                    )}
                  >
                    {movement.quantity > 0 ? '+' : '−'}{' '}
                    {formatDecimal(Math.abs(movement.quantity), 6)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {formatDecimal(movement.stockBefore, 6)} ←{' '}
                    {formatDecimal(movement.stockAfter, 6)}
                  </TableCell>
                  <TableCell>
                    <p className="max-w-56 truncate text-xs text-muted-foreground">
                      {movement.note ?? '—'}
                    </p>
                    {movement.invoiceId != null && (
                      <Link
                        className="mt-1 inline-block text-xs font-semibold text-primary underline"
                        to={`/store/invoices/${movement.invoiceId}`}
                      >
                        مشاهده فاکتور
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filteredMovements.length > 500 && (
            <p className="p-4 text-xs text-muted-foreground">
              ۵۰۰ گردش آخر نمایش داده می‌شود؛ خروجی CSV شامل همهٔ موارد فیلترشده است.
            </p>
          )}
        </Card>
      )}
      <Dialog open={dialogOpen} onOpenChange={(open) => !saving && setDialogOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ورود یا اصلاح موجودی</DialogTitle>
            <DialogDescription>
              هر تغییر با دلیل و موجودی قبل و بعد ذخیره می‌شود. این عملیات فقط موجودی را تغییر
              می‌دهد؛ هزینهٔ خرید را جداگانه در دفتر مالی ثبت کنید.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (saving) return;
              const amount = parseAmountInput(quantity);
              if (!productId || amount == null || amount <= 0) {
                toast.error('کالا و مقدار معتبر وارد کنید.');
                return;
              }
              setSaving(true);
              try {
                await changeStock(
                  Number(productId),
                  direction === 'in' ? amount : -amount,
                  direction === 'in' ? 'restock' : 'adjustment',
                  note,
                );
                setDialogOpen(false);
                toast.success('موجودی و گردش انبار ثبت شدند.');
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'ثبت موجودی ناموفق بود.');
              } finally {
                setSaving(false);
              }
            }}
          >
            <fieldset className="space-y-4" disabled={saving}>
              <div className="space-y-2">
                <Label htmlFor="movement-product">کالا</Label>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger id="movement-product">
                    <SelectValue placeholder="یک کالا انتخاب کنید" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedProduct && (
                  <p className="text-xs text-muted-foreground">
                    موجودی فعلی: {formatDecimal(selectedProduct.stock, 6)} {selectedProduct.unit}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="جهت تغییر موجودی">
                <Button
                  variant={direction === 'in' ? 'default' : 'outline'}
                  aria-pressed={direction === 'in'}
                  onClick={() => setDirection('in')}
                >
                  <ArrowDownToLine />
                  ورود به انبار
                </Button>
                <Button
                  variant={direction === 'out' ? 'destructive' : 'outline'}
                  aria-pressed={direction === 'out'}
                  onClick={() => setDirection('out')}
                >
                  <ArrowUpFromLine />
                  اصلاح کاهشی
                </Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="movement-qty">مقدار ({selectedProduct?.unit ?? 'واحد'})</Label>
                <Input
                  id="movement-qty"
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="مثلاً ۱۰"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="movement-note">دلیل / شرح *</Label>
                <Textarea
                  id="movement-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={300}
                  placeholder="مثلاً ورود محموله جدید، اصلاح شمارش یا ضایعات"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                  انصراف
                </Button>
                <Button variant="neon" type="submit" disabled={saving}>
                  {saving ? 'در حال ثبت…' : 'ثبت تغییر موجودی'}
                </Button>
              </DialogFooter>
            </fieldset>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
