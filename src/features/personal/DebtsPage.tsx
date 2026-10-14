import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  HandCoins,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { db, nowISO, type Debt } from '@/core/db/db';
import {
  formatMoney,
  formatNumber,
  fromDisplayAmount,
  toDisplayAmount,
} from '@/core/currency/currency';
import { addJalaliMonthsToDate, formatJalaliNumeric } from '@/core/jalali/jalali';
import { useSettingsStore } from '@/store/settings-store';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { AmountInput } from '@/components/AmountInput';
import { JalaliDateInput } from '@/components/JalaliDateInput';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { debtStatus } from './personal-calc';
import { debtSchema, type DebtFormValues } from './schemas';
import { cn } from '@/lib/utils';

/** مدیریت بدهی‌ها و اقساط با یادآور سررسید */
export function DebtsPage() {
  const unit = useSettingsStore((s) => s.currencyUnit);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Debt | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [payingDebt, setPayingDebt] = useState<Debt | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);

  const debts = useLiveQuery(() => db.debts.orderBy('dueDate').toArray(), [], [] as Debt[]);
  const statuses = useMemo(
    () =>
      debts
        .map((d) => debtStatus(d))
        .sort((a, b) => Number(a.isSettled) - Number(b.isSettled) || a.daysToDue - b.daysToDue),
    [debts],
  );

  const payInstallment = async (debt: Debt) => {
    const paidInstallments = (debt.paidInstallments ?? 0) + 1;
    const settled = paidInstallments >= (debt.installmentsCount ?? 0);
    await db.debts.update(debt.id!, {
      paidInstallments,
      dueDate: settled
        ? debt.dueDate
        : addJalaliMonthsToDate(new Date(debt.dueDate), 1).toISOString(),
    });
    toast.success(
      settled ? 'آخرین قسط پرداخت و بدهی تسویه شد.' : 'قسط پرداخت شد و سررسید بعدی ثبت شد.',
    );
  };

  const paySimple = async () => {
    if (!payingDebt || paymentAmount <= 0) return;
    const remaining = payingDebt.amount - payingDebt.paidAmount;
    const pay = Math.min(paymentAmount, remaining);
    await db.debts.update(payingDebt.id!, { paidAmount: payingDebt.paidAmount + pay });
    toast.success('پرداخت ثبت شد.');
    setPayingDebt(null);
    setPaymentAmount(0);
  };

  return (
    <div>
      <PageHeader
        title="بدهی و اقساط"
        subtitle="بدهی‌ها و وام‌های قسطی را با سررسید شمسی دنبال کنید تا هیچ قسطی از دست نرود."
        actions={
          <Button
            variant="neon"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus aria-hidden />
            بدهی جدید
          </Button>
        }
      />

      {statuses.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="بدهی یا قسط فعالی ندارید"
          description="وام، خرید قسطی یا بدهی به اشخاص را اینجا ثبت کنید تا سررسیدها را به‌موقع ببینید."
          action={
            <Button
              variant="neon"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus aria-hidden />
              ثبت اولین بدهی
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {statuses.map((status) => {
            const debt = status.debt;
            return (
              <Card key={debt.id} className={cn(status.isOverdue && 'border-destructive/60')}>
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-bold">{debt.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {debt.kind === 'installment'
                          ? `قسطی — ${formatNumber(debt.paidInstallments ?? 0)} از ${formatNumber(debt.installmentsCount ?? 0)} قسط`
                          : 'بدهی ساده'}
                      </p>
                    </div>
                    {status.isSettled ? (
                      <Badge variant="success">
                        <CheckCircle2 className="h-3 w-3" aria-hidden /> تسویه‌شده
                      </Badge>
                    ) : status.isOverdue ? (
                      <Badge variant="destructive">
                        <AlertTriangle className="h-3 w-3" aria-hidden /> گذشته از سررسید
                      </Badge>
                    ) : status.daysToDue <= 7 ? (
                      <Badge variant="warning">
                        <CalendarClock className="h-3 w-3" aria-hidden />{' '}
                        {formatNumber(status.daysToDue)} روز مانده
                      </Badge>
                    ) : (
                      <Badge variant="secondary">{formatNumber(status.daysToDue)} روز مانده</Badge>
                    )}
                  </div>

                  <Progress
                    value={status.percent}
                    indicatorClassName={status.isSettled ? 'bg-success' : 'bg-primary'}
                    aria-label={`پیشرفت پرداخت ${debt.title}`}
                  />

                  <dl className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">مبلغ کل</dt>
                      <dd className="font-semibold">{formatMoney(debt.amount, unit)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">پرداخت‌شده</dt>
                      <dd className="font-semibold text-success">
                        {formatMoney(status.paid, unit)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">مانده</dt>
                      <dd className="font-extrabold">{formatMoney(status.remaining, unit)}</dd>
                    </div>
                    {!status.isSettled && (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">سررسید بعدی</dt>
                        <dd className="font-semibold">
                          {formatJalaliNumeric(new Date(debt.dueDate))}
                        </dd>
                      </div>
                    )}
                    {debt.kind === 'installment' && !status.isSettled && (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">مبلغ هر قسط</dt>
                        <dd className="font-semibold">
                          {formatMoney(debt.installmentAmount ?? 0, unit)}
                        </dd>
                      </div>
                    )}
                  </dl>

                  <div className="flex items-center gap-1 border-t pt-2">
                    {!status.isSettled &&
                      (debt.kind === 'installment' ? (
                        <Button size="sm" variant="neon" onClick={() => void payInstallment(debt)}>
                          <HandCoins aria-hidden />
                          پرداخت قسط
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="neon"
                          onClick={() => {
                            setPayingDebt(debt);
                            setPaymentAmount(
                              status.remaining > 0 ? toDisplayAmount(status.remaining, unit) : 0,
                            );
                          }}
                        >
                          <HandCoins aria-hidden />
                          ثبت پرداخت
                        </Button>
                      ))}
                    <span className="ms-auto flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`ویرایش ${debt.title}`}
                        onClick={() => {
                          setEditing(debt);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        aria-label={`حذف ${debt.title}`}
                        onClick={() => setDeletingId(debt.id!)}
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

      <DebtFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />

      {/* دیالوگ ثبت پرداخت بدهی ساده */}
      <Dialog open={payingDebt !== null} onOpenChange={(open) => !open && setPayingDebt(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ثبت پرداخت — {payingDebt?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">
                مبلغ پرداختی ({unit === 'toman' ? 'تومان' : 'ریال'})
              </Label>
              <AmountInput
                id="pay-amount"
                value={paymentAmount}
                onChange={setPaymentAmount}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPayingDebt(null)}>
                انصراف
              </Button>
              <Button variant="neon" onClick={() => void paySimple()} disabled={paymentAmount <= 0}>
                ثبت پرداخت
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deletingId !== null}
        onOpenChange={(open) => !open && setDeletingId(null)}
        title="حذف بدهی"
        description="این بدهی و سوابق پرداختش حذف می‌شود. ادامه می‌دهید؟"
        confirmLabel="حذف"
        destructive
        onConfirm={async () => {
          if (deletingId != null) {
            await db.debts.delete(deletingId);
            toast.success('بدهی حذف شد.');
          }
        }}
      />
    </div>
  );
}

function DebtFormDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Debt | null;
}) {
  const unit = useSettingsStore((s) => s.currencyUnit);
  const form = useForm<DebtFormValues>({
    resolver: zodResolver(debtSchema),
    defaultValues: {
      title: '',
      kind: 'installment',
      amount: 0,
      dueDate: new Date().toISOString(),
      description: '',
    },
  });
  const kind = form.watch('kind');
  const amount = form.watch('amount');
  const count = form.watch('installmentsCount');

  // پیشنهاد خودکار مبلغ قسط از تقسیم مبلغ کل بر تعداد اقساط
  useEffect(() => {
    if (kind === 'installment' && amount > 0 && count && count > 0) {
      form.setValue('installmentAmount', Math.round(amount / count));
    }
  }, [kind, amount, count, form]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.reset({
        title: editing.title,
        kind: editing.kind,
        amount: toDisplayAmount(editing.amount, unit),
        dueDate: editing.dueDate,
        installmentsCount: editing.installmentsCount,
        installmentAmount: editing.installmentAmount
          ? toDisplayAmount(editing.installmentAmount, unit)
          : undefined,
        description: editing.description ?? '',
      });
    } else {
      form.reset({
        title: '',
        kind: 'installment',
        amount: 0,
        dueDate: new Date().toISOString(),
        installmentsCount: undefined,
        installmentAmount: undefined,
        description: '',
      });
    }
  }, [open, editing, form, unit]);

  const onSubmit = async (values: DebtFormValues) => {
    const base: Omit<Debt, 'id' | 'createdAt'> = {
      title: values.title,
      kind: values.kind,
      amount: fromDisplayAmount(values.amount, unit),
      paidAmount: editing?.paidAmount ?? 0,
      dueDate: values.dueDate,
      description: values.description?.trim() ? values.description.trim() : undefined,
      installmentsCount: values.kind === 'installment' ? values.installmentsCount : undefined,
      installmentAmount:
        values.kind === 'installment' && values.installmentAmount
          ? fromDisplayAmount(values.installmentAmount, unit)
          : undefined,
      paidInstallments: editing?.paidInstallments ?? 0,
    };
    if (editing?.id != null) {
      await db.debts.update(editing.id, base);
      toast.success('بدهی ویرایش شد.');
    } else {
      await db.debts.add({ ...base, createdAt: nowISO() });
      toast.success('بدهی ثبت شد.');
    }
    onOpenChange(false);
  };

  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'ویرایش بدهی' : 'ثبت بدهی جدید'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="debt-title">عنوان</Label>
            <Input id="debt-title" placeholder="مثلاً وام خرید خودرو" {...form.register('title')} />
            {errors.title && (
              <p role="alert" className="text-xs text-destructive">
                {errors.title.message}
              </p>
            )}
          </div>

          <Controller
            control={form.control}
            name="kind"
            render={({ field }) => (
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="نوع بدهی">
                <Button
                  variant={field.value === 'installment' ? 'default' : 'outline'}
                  onClick={() => field.onChange('installment')}
                  aria-pressed={field.value === 'installment'}
                >
                  قسطی
                </Button>
                <Button
                  variant={field.value === 'debt' ? 'default' : 'outline'}
                  onClick={() => field.onChange('debt')}
                  aria-pressed={field.value === 'debt'}
                >
                  بدهی ساده
                </Button>
              </div>
            )}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="debt-amount">مبلغ کل ({unit === 'toman' ? 'تومان' : 'ریال'})</Label>
              <Controller
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <AmountInput id="debt-amount" value={field.value} onChange={field.onChange} />
                )}
              />
              {errors.amount && (
                <p role="alert" className="text-xs text-destructive">
                  {errors.amount.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="debt-due">
                {kind === 'installment' ? 'تاریخ اولین قسط' : 'تاریخ سررسید'}
              </Label>
              <Controller
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <JalaliDateInput id="debt-due" value={field.value} onChange={field.onChange} />
                )}
              />
            </div>
          </div>

          {kind === 'installment' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="debt-count">تعداد اقساط</Label>
                <Input
                  id="debt-count"
                  inputMode="numeric"
                  dir="ltr"
                  className="text-left"
                  {...form.register('installmentsCount', { valueAsNumber: true })}
                />
                {errors.installmentsCount && (
                  <p role="alert" className="text-xs text-destructive">
                    {errors.installmentsCount.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="debt-each">
                  مبلغ هر قسط ({unit === 'toman' ? 'تومان' : 'ریال'})
                </Label>
                <Controller
                  control={form.control}
                  name="installmentAmount"
                  render={({ field }) => (
                    <AmountInput
                      id="debt-each"
                      value={field.value ?? 0}
                      onChange={field.onChange}
                    />
                  )}
                />
                {errors.installmentAmount && (
                  <p role="alert" className="text-xs text-destructive">
                    {errors.installmentAmount.message}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="debt-desc">توضیحات (اختیاری)</Label>
            <Textarea id="debt-desc" rows={2} {...form.register('description')} />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              انصراف
            </Button>
            <Button type="submit" variant="neon" disabled={form.formState.isSubmitting}>
              {editing ? 'ذخیره‌ی تغییرات' : 'ثبت بدهی'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
