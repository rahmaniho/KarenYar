import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, CheckCircle2, Pencil, PiggyBank, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { db, type Budget, type Transaction } from '@/core/db/db';
import { formatMoney, fromDisplayAmount, toDisplayAmount } from '@/core/currency/currency';
import { addJalaliMonths, currentJalaliMonthKey, jalaliMonthLabel } from '@/core/jalali/jalali';
import { useSettingsStore } from '@/store/settings-store';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { AmountInput } from '@/components/AmountInput';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
import { DEFAULT_EXPENSE_CATEGORIES, mergeCategories } from './categories';
import { budgetStatus } from './personal-calc';
import { budgetSchema, type BudgetFormValues } from './schemas';
import { cn } from '@/lib/utils';

/** بودجه‌بندی ماهانه‌ی شمسی با هشدار نزدیک‌شدن/عبور از سقف */
export function BudgetsPage() {
  const unit = useSettingsStore((s) => s.currencyUnit);
  const [month, setMonth] = useState(currentJalaliMonthKey());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Budget | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const budgets = useLiveQuery(
    () => db.budgets.where('month').equals(month).toArray(),
    [month],
    [] as Budget[],
  );
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], [] as Transaction[]);
  const allBudgets = useLiveQuery(() => db.budgets.toArray(), [], [] as Budget[]);

  const statuses = useMemo(
    () => budgets.map((b) => budgetStatus(b, transactions)).sort((a, b) => b.percent - a.percent),
    [budgets, transactions],
  );

  const monthOptions = useMemo(() => {
    const set = new Set<string>([currentJalaliMonthKey()]);
    for (let i = 1; i <= 6; i++) set.add(addJalaliMonths(currentJalaliMonthKey(), -i));
    for (let i = 1; i <= 3; i++) set.add(addJalaliMonths(currentJalaliMonthKey(), i));
    for (const b of allBudgets) set.add(b.month);
    return [...set].sort().reverse();
  }, [allBudgets]);

  const categoriesInUse = useMemo(
    () =>
      mergeCategories(
        DEFAULT_EXPENSE_CATEGORIES,
        transactions.filter((t) => t.type === 'expense').map((t) => t.category),
      ),
    [transactions],
  );

  return (
    <div>
      <PageHeader
        title="بودجه‌بندی ماهانه"
        subtitle="برای هر دسته سقف هزینه تعیین کنید؛ نزدیک سقف یا عبور از آن به شما هشدار داده می‌شود."
        actions={
          <Button
            variant="neon"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus aria-hidden />
            بودجه‌ی جدید
          </Button>
        }
      />

      <div className="mb-5 flex items-center gap-3">
        <Label htmlFor="budget-month" className="shrink-0">
          ماه:
        </Label>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger id="budget-month" className="w-48" aria-label="انتخاب ماه بودجه">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((key) => (
              <SelectItem key={key} value={key}>
                {jalaliMonthLabel(key)}
                {key === currentJalaliMonthKey() ? ' (جاری)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {statuses.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          title={`برای ${jalaliMonthLabel(month)} بودجه‌ای تعریف نشده است`}
          description="مثلاً برای «خوراک و رستوران» سقف ماهانه بگذارید تا هزینه‌ها از کنترل خارج نشوند."
          action={
            <Button
              variant="neon"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus aria-hidden />
              تعریف بودجه
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {statuses.map((status) => (
            <Card key={status.budget.id} className={cn(status.isOver && 'border-destructive/60')}>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{status.budget.category}</p>
                    <p className="text-xs text-muted-foreground">
                      سقف: {formatMoney(status.budget.limit, unit)}
                    </p>
                  </div>
                  {status.isOver ? (
                    <Badge variant="destructive">
                      <AlertTriangle className="h-3 w-3" aria-hidden /> عبور از سقف
                    </Badge>
                  ) : status.isNearLimit ? (
                    <Badge variant="warning">
                      <AlertTriangle className="h-3 w-3" aria-hidden /> نزدیک سقف
                    </Badge>
                  ) : (
                    <Badge variant="success">
                      <CheckCircle2 className="h-3 w-3" aria-hidden /> در محدوده
                    </Badge>
                  )}
                </div>

                <Progress
                  value={status.percent}
                  indicatorClassName={
                    status.isOver
                      ? 'bg-destructive'
                      : status.isNearLimit
                        ? 'bg-warning'
                        : 'bg-neon-600'
                  }
                  aria-label={`میزان مصرف بودجه‌ی ${status.budget.category}`}
                />

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    خرج‌شده:{' '}
                    <span className="font-semibold text-foreground">
                      {formatMoney(status.spent, unit)}
                    </span>
                  </span>
                  <span
                    className={
                      status.isOver ? 'font-bold text-destructive' : 'text-muted-foreground'
                    }
                  >
                    {status.isOver
                      ? `${formatMoney(-status.remaining, unit)} اضافه`
                      : `مانده: ${formatMoney(status.remaining, unit)}`}
                  </span>
                </div>

                <div className="flex justify-end gap-1 border-t pt-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={`ویرایش بودجه‌ی ${status.budget.category}`}
                    onClick={() => {
                      setEditing(status.budget);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    aria-label={`حذف بودجه‌ی ${status.budget.category}`}
                    onClick={() => setDeletingId(status.budget.id!)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <BudgetFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        defaultMonth={month}
        monthOptions={monthOptions}
        categories={categoriesInUse}
      />

      <ConfirmDialog
        open={deletingId !== null}
        onOpenChange={(open) => !open && setDeletingId(null)}
        title="حذف بودجه"
        description="این بودجه حذف می‌شود (تراکنش‌هایش باقی می‌مانند). ادامه می‌دهید؟"
        confirmLabel="حذف"
        destructive
        onConfirm={async () => {
          if (deletingId != null) {
            await db.budgets.delete(deletingId);
            toast.success('بودجه حذف شد.');
          }
        }}
      />
    </div>
  );
}

function BudgetFormDialog({
  open,
  onOpenChange,
  editing,
  defaultMonth,
  monthOptions,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Budget | null;
  defaultMonth: string;
  monthOptions: string[];
  categories: string[];
}) {
  const unit = useSettingsStore((s) => s.currencyUnit);
  const form = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetSchema),
    defaultValues: { month: defaultMonth, category: '', limit: 0 },
  });

  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.reset({
        month: editing.month,
        category: editing.category,
        limit: toDisplayAmount(editing.limit, unit),
      });
    } else {
      form.reset({ month: defaultMonth, category: '', limit: 0 });
    }
  }, [open, editing, defaultMonth, form, unit]);

  const onSubmit = async (values: BudgetFormValues) => {
    const payload = {
      month: values.month,
      category: values.category,
      limit: fromDisplayAmount(values.limit, unit),
    };
    if (editing?.id != null) {
      await db.budgets.update(editing.id, payload);
      toast.success('بودجه ویرایش شد.');
    } else {
      // جلوگیری از بودجه‌ی تکراری برای یک دسته در یک ماه
      const duplicate = await db.budgets
        .where('month')
        .equals(values.month)
        .filter((b) => b.category === values.category)
        .first();
      if (duplicate) {
        form.setError('category', { message: 'برای این دسته در این ماه بودجه تعریف شده است.' });
        return;
      }
      await db.budgets.add(payload);
      toast.success('بودجه تعریف شد.');
    }
    onOpenChange(false);
  };

  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'ویرایش بودجه' : 'تعریف بودجه‌ی جدید'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="bd-month">ماه</Label>
            <Controller
              control={form.control}
              name="month"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="bd-month" aria-label="ماه بودجه">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((key) => (
                      <SelectItem key={key} value={key}>
                        {jalaliMonthLabel(key)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.month && (
              <p role="alert" className="text-xs text-destructive">
                {errors.month.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bd-category">دسته‌بندی هزینه</Label>
            <Controller
              control={form.control}
              name="category"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="bd-category" aria-label="دسته‌بندی بودجه">
                    <SelectValue placeholder="انتخاب کنید" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.category && (
              <p role="alert" className="text-xs text-destructive">
                {errors.category.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bd-limit">
              سقف هزینه‌ی ماهانه ({unit === 'toman' ? 'تومان' : 'ریال'})
            </Label>
            <Controller
              control={form.control}
              name="limit"
              render={({ field }) => (
                <AmountInput id="bd-limit" value={field.value} onChange={field.onChange} />
              )}
            />
            {errors.limit && (
              <p role="alert" className="text-xs text-destructive">
                {errors.limit.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              انصراف
            </Button>
            <Button type="submit" variant="neon" disabled={form.formState.isSubmitting}>
              {editing ? 'ذخیره‌ی تغییرات' : 'تعریف بودجه'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
