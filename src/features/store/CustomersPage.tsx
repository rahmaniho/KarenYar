import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLiveQuery } from 'dexie-react-hooks';
import { Contact, HandCoins, Pencil, Plus, ScrollText, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { db, nowISO, type Customer, type CustomerPayment, type Invoice } from '@/core/db/db';
import {
  formatMoney,
  formatNumber,
  fromDisplayAmount,
  toDisplayAmount,
  toFaDigits,
} from '@/core/currency/currency';
import { formatJalaliNumeric } from '@/core/jalali/jalali';
import { useSettingsStore } from '@/store/settings-store';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { StatCard } from '@/components/StatCard';
import { AmountInput } from '@/components/AmountInput';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { customerBalance, customerStatement, totalReceivables } from './customers-calc';
import { customerSchema, type CustomerFormValues } from './schemas';

/** دفتر مشتریان — حساب مشتریان، فروش نسیه، پرداخت‌ها و صورت‌حساب */
export function CustomersPage() {
  const unit = useSettingsStore((s) => s.currencyUnit);
  const customers = useLiveQuery(
    () => db.customers.orderBy('name').toArray(),
    [],
    [] as Customer[],
  );
  const invoices = useLiveQuery(() => db.invoices.toArray(), [], [] as Invoice[]);
  const payments = useLiveQuery(() => db.customerPayments.toArray(), [], [] as CustomerPayment[]);

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [statementOf, setStatementOf] = useState<Customer | null>(null);

  const receivables = useMemo(() => totalReceivables(invoices, payments), [invoices, payments]);
  const debtorsCount = useMemo(
    () => customers.filter((c) => customerBalance(c.id!, invoices, payments).balance > 0).length,
    [customers, invoices, payments],
  );

  const filtered = useMemo(
    () => customers.filter((c) => !search || `${c.name} ${c.phone ?? ''}`.includes(search)),
    [customers, search],
  );

  return (
    <div>
      <PageHeader
        title="دفتر مشتریان"
        subtitle="حساب مشتریان، فروش نسیه و ثبت پرداخت‌ها با صورت‌حساب کامل"
        actions={
          <Button
            variant="neon"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus aria-hidden />
            مشتری جدید
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          title="کل مطالبات از مشتریان"
          value={formatMoney(receivables, unit)}
          icon={HandCoins}
          tone="warning"
        />
        <StatCard
          title="مشتریان بدهکار"
          value={`${formatNumber(debtorsCount)} نفر`}
          icon={Contact}
          tone="navy"
        />
        <StatCard
          title="کل مشتریان"
          value={`${formatNumber(customers.length)} نفر`}
          icon={Contact}
          tone="navy"
        />
      </div>

      <Card className="mb-5 p-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            className="ps-9"
            placeholder="جستجوی نام یا شماره تماس…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="جستجوی مشتری"
          />
        </div>
      </Card>

      {customers.length === 0 ? (
        <EmptyState
          icon={Contact}
          title="هنوز مشتری‌ای ثبت نشده است"
          description="مشتریان ثابت را ثبت کنید تا بتوانید فروش نسیه انجام دهید و حساب هر مشتری را جدا دنبال کنید."
          action={
            <Button
              variant="neon"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus aria-hidden />
              ثبت اولین مشتری
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="مشتری‌ای با این عبارت پیدا نشد" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((customer) => {
            const balance = customerBalance(customer.id!, invoices, payments);
            return (
              <Card key={customer.id}>
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{customer.name}</p>
                      <p className="text-xs text-muted-foreground" dir="ltr">
                        {customer.phone ?? '—'}
                      </p>
                    </div>
                    {balance.balance > 0 ? (
                      <Badge variant="warning">بدهکار</Badge>
                    ) : balance.balance < 0 ? (
                      <Badge variant="secondary">بستانکار</Badge>
                    ) : (
                      <Badge variant="success">تسویه</Badge>
                    )}
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[11px] text-muted-foreground">مانده حساب</p>
                      <p className="text-lg font-extrabold">
                        {formatMoney(Math.abs(balance.balance), unit)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatNumber(balance.creditInvoiceCount)} فاکتور نسیه — پرداخت‌شده:{' '}
                        {formatMoney(balance.paidTotal, unit)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1 border-t pt-2">
                    <Button size="sm" variant="default" onClick={() => setStatementOf(customer)}>
                      <ScrollText aria-hidden />
                      صورت‌حساب و پرداخت
                    </Button>
                    <span className="ms-auto flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`ویرایش ${customer.name}`}
                        onClick={() => {
                          setEditing(customer);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        aria-label={`حذف ${customer.name}`}
                        onClick={() => setDeleting(customer)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CustomerFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />

      {statementOf && (
        <StatementDialog
          customer={statementOf}
          onOpenChange={(open) => !open && setStatementOf(null)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`حذف مشتری «${deleting?.name}»`}
        description="فقط مشتری بدون سابقهٔ فاکتور یا پرداخت قابل حذف است؛ سوابق مالی مشتریان حفظ می‌شوند. ادامه می‌دهید؟"
        confirmLabel="حذف مشتری"
        destructive
        onConfirm={async () => {
          if (deleting?.id != null) {
            await db.transaction('rw', db.customers, db.customerPayments, db.invoices, async () => {
              if (
                (await db.invoices.where('customerId').equals(deleting.id!).count()) ||
                (await db.customerPayments.where('customerId').equals(deleting.id!).count())
              )
                throw new Error('مشتری سابقهٔ مالی دارد و قابل حذف نیست.');
              await db.customers.delete(deleting.id!);
            });
            toast.success('مشتری حذف شد.');
          }
        }}
      />
    </div>
  );
}

function CustomerFormDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Customer | null;
}) {
  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: { name: '', phone: '', address: '', notes: '' },
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      editing
        ? {
            name: editing.name,
            phone: editing.phone ?? '',
            address: editing.address ?? '',
            notes: editing.notes ?? '',
          }
        : { name: '', phone: '', address: '', notes: '' },
    );
  }, [open, editing, form]);

  const onSubmit = async (v: CustomerFormValues) => {
    const payload = {
      name: v.name,
      phone: v.phone?.trim() ? v.phone.trim() : undefined,
      address: v.address?.trim() ? v.address.trim() : undefined,
      notes: v.notes?.trim() ? v.notes.trim() : undefined,
    };
    if (editing?.id != null) {
      await db.customers.update(editing.id, payload);
      toast.success('مشتری ویرایش شد.');
    } else {
      await db.customers.add({ ...payload, createdAt: nowISO() });
      toast.success('مشتری ثبت شد.');
    }
    onOpenChange(false);
  };

  const errors = form.formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'ویرایش مشتری' : 'ثبت مشتری جدید'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cu-name">نام مشتری *</Label>
              <Input id="cu-name" placeholder="مثلاً آقای محمدی" {...form.register('name')} />
              {errors.name && (
                <p role="alert" className="text-xs text-destructive">
                  {errors.name.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cu-phone">شماره تماس</Label>
              <Input
                id="cu-phone"
                dir="ltr"
                className="text-left"
                placeholder="0912..."
                {...form.register('phone')}
              />
              {errors.phone && (
                <p role="alert" className="text-xs text-destructive">
                  {errors.phone.message}
                </p>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cu-address">نشانی</Label>
            <Input id="cu-address" {...form.register('address')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cu-notes">یادداشت</Label>
            <Textarea id="cu-notes" rows={2} {...form.register('notes')} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              انصراف
            </Button>
            <Button type="submit" variant="neon" disabled={form.formState.isSubmitting}>
              {editing ? 'ذخیره‌ی تغییرات' : 'ثبت مشتری'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StatementDialog({
  customer,
  onOpenChange,
}: {
  customer: Customer;
  onOpenChange: (open: boolean) => void;
}) {
  const unit = useSettingsStore((s) => s.currencyUnit);
  const invoices = useLiveQuery(() => db.invoices.toArray(), [], [] as Invoice[]);
  const payments = useLiveQuery(() => db.customerPayments.toArray(), [], [] as CustomerPayment[]);
  const [payAmount, setPayAmount] = useState(0);
  const [payNote, setPayNote] = useState('');
  const [paying, setPaying] = useState(false);

  const statement = useMemo(
    () => customerStatement(customer.id!, invoices, payments),
    [customer.id, invoices, payments],
  );
  const balance = statement.length ? statement[statement.length - 1].runningBalance : 0;

  const addPayment = async () => {
    if (paying) return;
    const amount = fromDisplayAmount(payAmount, unit);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      toast.error('مبلغ پرداخت را وارد کنید.');
      return;
    }
    setPaying(true);
    try {
      await db.customerPayments.add({
        customerId: customer.id!,
        amount,
        date: nowISO(),
        note: payNote.trim() ? payNote.trim() : undefined,
        createdAt: nowISO(),
      });
      setPayAmount(0);
      setPayNote('');
      toast.success('پرداخت ثبت شد؛ مبلغ فروش قبلاً در درآمد ثبت شده و دوباره اضافه نمی‌شود.');
    } catch {
      toast.error('ثبت پرداخت ناموفق بود.');
    } finally {
      setPaying(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>صورت‌حساب {customer.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl bg-muted/60 px-4 py-3">
            <span className="text-sm text-muted-foreground">مانده‌ی فعلی حساب</span>
            <span className="text-xl font-extrabold">
              {formatMoney(Math.abs(balance), unit)}{' '}
              <span className="text-xs font-medium text-muted-foreground">
                {balance > 0 ? '(بدهکار)' : balance < 0 ? '(بستانکار)' : '(تسویه)'}
              </span>
            </span>
          </div>

          {statement.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              هنوز فاکتور نسیه یا پرداختی برای این مشتری ثبت نشده است.
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>تاریخ</TableHead>
                    <TableHead>شرح</TableHead>
                    <TableHead>بدهکار</TableHead>
                    <TableHead>بستانکار</TableHead>
                    <TableHead>مانده</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statement.map((row) => (
                    <TableRow key={`${row.kind}-${row.id}`}>
                      <TableCell className="whitespace-nowrap">
                        {formatJalaliNumeric(new Date(row.date))}
                      </TableCell>
                      <TableCell>
                        {row.kind === 'invoice' ? (
                          `فاکتور نسیه شماره ${toFaDigits(String(row.number))}`
                        ) : (
                          <>پرداخت مشتری{row.note ? ` — ${row.note}` : ''}</>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.kind === 'invoice'
                          ? formatMoney(row.amount, unit, { withUnit: false })
                          : '—'}
                      </TableCell>
                      <TableCell className="text-success">
                        {row.kind === 'payment'
                          ? formatMoney(row.amount, unit, { withUnit: false })
                          : '—'}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {formatMoney(row.runningBalance, unit, { withUnit: false })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="rounded-xl border border-dashed p-3">
            <p className="mb-2 text-sm font-bold">ثبت پرداخت مشتری</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-40 flex-1 space-y-1">
                <Label className="text-xs">مبلغ ({unit === 'toman' ? 'تومان' : 'ریال'})</Label>
                <AmountInput
                  value={payAmount}
                  onChange={setPayAmount}
                  aria-label="مبلغ پرداخت مشتری"
                />
              </div>
              <div className="min-w-40 flex-1 space-y-1">
                <Label className="text-xs">توضیح (اختیاری)</Label>
                <Input
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  placeholder="مثلاً کارت‌به‌کارت"
                />
              </div>
              <Button variant="neon" disabled={paying} onClick={() => void addPayment()}>
                <HandCoins aria-hidden />
                ثبت پرداخت
              </Button>
              {balance > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setPayAmount(toDisplayAmount(balance, unit))}
                >
                  کل مانده
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
