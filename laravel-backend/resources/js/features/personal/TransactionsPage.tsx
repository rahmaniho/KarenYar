import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Download,
  Pencil,
  Plus,
  Search,
  Trash2,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { db, type Transaction } from '@/core/db/db';
import { FREE_LIMITS } from '@/core/license/license-core';
import {
  formatMoney,
  fromDisplayAmount,
  toDisplayAmount,
  toFaDigits,
} from '@/core/currency/currency';
import { formatJalaliNumeric, jalaliMonthKey, jalaliMonthLabel } from '@/core/jalali/jalali';
import { downloadCsv } from '@/core/utils/csv';
import { useLicenseStore } from '@/store/license-store';
import { useSettingsStore } from '@/store/settings-store';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { StatCard } from '@/components/StatCard';
import { FeatureGate } from '@/components/FeatureGate';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AmountInput } from '@/components/AmountInput';
import { JalaliDateInput } from '@/components/JalaliDateInput';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  mergeCategories,
} from './categories';
import { categoryTotals, monthlySeries, sumTransactions } from './personal-calc';
import { transactionSchema, type TransactionFormValues } from './schemas';
import { cn } from '@/lib/utils';
import { saveManualTransaction, deleteManualTransaction } from './transaction.service';

const PIE_COLORS = [
  '#0B1B3A',
  '#17e76c',
  '#f59e0b',
  '#e11d48',
  '#3b82f6',
  '#8b5cf6',
  '#06b6d4',
  '#84cc16',
  '#f97316',
  '#64748b',
];

type TypeFilter = 'all' | 'income' | 'expense';

export function TransactionsPage({ businessOnly = false }: { businessOnly?: boolean }) {
  const unit = useSettingsStore((s) => s.currencyUnit);
  const can = useLicenseStore((s) => s.can);
  const [searchParams, setSearchParams] = useSearchParams();

  const allTransactions = useLiveQuery(
    () => db.transactions.orderBy('date').reverse().toArray(),
    [],
    [] as Transaction[],
  );

  const transactions = useMemo(
    () =>
      businessOnly
        ? allTransactions.filter((t) => t.source === 'sale' || t.source === 'business')
        : allTransactions,
    [allTransactions, businessOnly],
  );
  const [sourceFilter, setSourceFilter] = useState('all');

  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // میانبر PWA: ?new=1 فرم ثبت را باز می‌کند
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      openCreate();
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // فهرست ماه‌های شمسی موجود در داده‌ها
  const jalaliMonthOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of transactions) {
      set.add(jalaliMonthKey(new Date(t.date)));
    }
    return [...set].sort().reverse().slice(0, 24);
  }, [transactions]);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (sourceFilter !== 'all' && (t.source ?? 'manual') !== sourceFilter) return false;
      if (monthFilter !== 'all' && jalaliMonthKey(new Date(t.date)) !== monthFilter) return false;
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (search && !`${t.category} ${t.description ?? ''}`.includes(search)) return false;
      return true;
    });
  }, [transactions, monthFilter, typeFilter, sourceFilter, search]);

  const monthTotals = useMemo(() => sumTransactions(filtered), [filtered]);
  const series = useMemo(
    () =>
      monthlySeries(
        transactions.filter(
          (t) => sourceFilter === 'all' || (t.source ?? 'manual') === sourceFilter,
        ),
        6,
      ),
    [transactions, sourceFilter],
  );
  const expensePie = useMemo(() => categoryTotals(filtered, 'expense').slice(0, 8), [filtered]);

  const atFreeLimit =
    !can('unlimited-transactions') &&
    allTransactions.filter((t) => t.source !== 'sale').length >= FREE_LIMITS.transactions;

  function openCreate() {
    if (atFreeLimit) {
      toast.error(
        `در نسخه‌ی رایگان حداکثر ${toFaDigits(FREE_LIMITS.transactions)} تراکنش قابل ثبت است. برای ثبت نامحدود، نسخه‌ی حرفه‌ای را فعال کنید.`,
      );
      return;
    }
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(t: Transaction) {
    if (t.source === 'sale') {
      toast.error('درآمد فروش فقط از طریق فاکتور اصلاح می‌شود.');
      return;
    }
    setEditing(t);
    setDialogOpen(true);
  }

  const exportCsv = async (): Promise<void> => {
    const rows: (string | number)[][] = [
      ['تاریخ', 'نوع', 'دسته‌بندی', 'مبلغ (تومان)', 'توضیحات', 'منشأ'],
      ...filtered.map((t) => [
        formatJalaliNumeric(new Date(t.date)),
        t.type === 'income' ? 'درآمد' : 'هزینه',
        t.category,
        t.type === 'income' ? t.amount : -t.amount,
        t.description ?? '',
        t.source === 'sale' ? 'فروش خودکار' : t.source === 'business' ? 'کسب‌وکار' : 'دستی',
      ]),
    ];
    await downloadCsv('karenyar-transactions.csv', rows);
    toast.success('فایل CSV تراکنش‌ها آماده شد.');
  };

  return (
    <div>
      <PageHeader
        title={businessOnly ? 'دفتر مالی کسب‌وکار' : 'درآمد و هزینه‌ها'}
        subtitle={
          businessOnly
            ? 'درآمد فروش‌ها به‌صورت خودکار ثبت می‌شود؛ هزینه‌ها و درآمدهای جانبی را اینجا مدیریت کنید.'
            : 'همهٔ درآمدها، هزینه‌ها و فروش‌های ثبت‌شده در یک دفتر مالی با منشأ مشخص'
        }
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download aria-hidden />
              خروجی CSV
            </Button>
            <Button variant="neon" onClick={openCreate}>
              <Plus aria-hidden />
              تراکنش جدید
            </Button>
          </>
        }
      />

      {atFreeLimit && <FeatureGate feature="unlimited-transactions" compact className="mb-4" />}

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          title={monthFilter === 'all' ? 'کل درآمدها' : `درآمد ${jalaliMonthLabel(monthFilter)}`}
          value={formatMoney(monthTotals.income, unit)}
          icon={ArrowDownCircle}
          tone="success"
        />
        <StatCard
          title={monthFilter === 'all' ? 'کل هزینه‌ها' : `هزینه ${jalaliMonthLabel(monthFilter)}`}
          value={formatMoney(monthTotals.expense, unit)}
          icon={ArrowUpCircle}
          tone="danger"
        />
        <StatCard
          title="مانده"
          value={formatMoney(monthTotals.balance, unit)}
          icon={Wallet}
          tone={monthTotals.balance >= 0 ? 'navy' : 'danger'}
        />
      </div>

      <p className="mb-4 rounded-xl border border-success/20 bg-success/5 p-3 text-xs leading-6 text-muted-foreground">
        درآمد فروش جدید، شامل مبلغ فاکتور و مالیات، خودکار ثبت می‌شود و فقط از طریق ابطال فاکتور
        قابل اصلاح است. فروش نسیه درآمد محسوب می‌شود، نه وجه دریافت‌شده؛ وصول نسیه دوباره درآمد ثبت
        نمی‌کند. «مانده» تراز درآمد و هزینه است، نه موجودی واقعی نقد و بانک یا سود خالص پس از بهای
        تمام‌شده.
      </p>

      {/* فیلترها */}
      <Card className="mb-5 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-44 flex-1">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              className="ps-9"
              placeholder="جستجو در دسته و توضیحات…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="جستجوی تراکنش"
            />
          </div>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-40" aria-label="منشأ تراکنش">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همهٔ منشأها</SelectItem>
              <SelectItem value="sale">فروش خودکار</SelectItem>
              <SelectItem value="business">کسب‌وکار</SelectItem>
              {!businessOnly && <SelectItem value="manual">دستی / شخصی</SelectItem>}
            </SelectContent>
          </Select>
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="w-44" aria-label="فیلتر ماه">
              <SelectValue placeholder="همه‌ی ماه‌ها" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">همه‌ی ماه‌ها</SelectItem>
              {jalaliMonthOptions.map((key) => (
                <SelectItem key={key} value={key}>
                  {jalaliMonthLabel(key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div
            className="flex rounded-lg bg-muted p-0.5"
            role="group"
            aria-label="فیلتر نوع تراکنش"
          >
            {(
              [
                { value: 'all', label: 'همه' },
                { value: 'income', label: 'درآمد' },
                { value: 'expense', label: 'هزینه' },
              ] as { value: TypeFilter; label: string }[]
            ).map((item) => (
              <button
                key={item.value}
                onClick={() => setTypeFilter(item.value)}
                aria-pressed={typeFilter === item.value}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition',
                  typeFilter === item.value ? 'bg-card shadow-sm' : 'text-muted-foreground',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* لیست */}
      {transactions.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="هنوز تراکنشی ثبت نشده است"
          description="اولین درآمد یا هزینه‌ی خود را ثبت کنید تا نمودارها و گزارش‌های مالی شما شکل بگیرد."
          action={
            <Button variant="neon" onClick={openCreate}>
              <Plus aria-hidden />
              ثبت اولین تراکنش
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="موردی با این فیلتر پیدا نشد"
          description="فیلترها را تغییر دهید یا جستجو را پاک کنید."
        />
      ) : (
        <Card className="mb-5 overflow-hidden">
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>تاریخ</TableHead>
                  <TableHead>نوع</TableHead>
                  <TableHead>دسته‌بندی</TableHead>
                  <TableHead>توضیحات</TableHead>
                  <TableHead>مبلغ</TableHead>
                  <TableHead className="w-24">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => (
                  <TransactionRow
                    key={t.id}
                    t={t}
                    unit={unit}
                    onEdit={() => openEdit(t)}
                    onDelete={() => setDeletingId(t.id!)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="divide-y md:hidden">
            {filtered.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                    t.type === 'income'
                      ? 'bg-success/10 text-success'
                      : 'bg-destructive/10 text-destructive',
                  )}
                >
                  {t.type === 'income' ? (
                    <ArrowDownCircle className="h-5 w-5" />
                  ) : (
                    <ArrowUpCircle className="h-5 w-5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{t.category}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatJalaliNumeric(new Date(t.date))}
                    {t.description ? ` — ${t.description}` : ''}
                  </p>
                </div>
                <span
                  className={cn(
                    'text-sm font-extrabold',
                    t.type === 'income' ? 'text-success' : 'text-destructive',
                  )}
                >
                  {t.type === 'income' ? '+' : '−'}{' '}
                  {formatMoney(t.amount, unit, { withUnit: false })}
                </span>
                <RowActions
                  transaction={t}
                  onEdit={() => openEdit(t)}
                  onDelete={() => setDeletingId(t.id!)}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* نمودارها */}
      {transactions.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">درآمد و هزینه‌ی ۶ ماه اخیر</CardTitle>
            </CardHeader>
            <CardContent>
              <div dir="ltr" className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      interval={0}
                      angle={-20}
                      textAnchor="end"
                      height={48}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: number) =>
                        toFaDigits(String(Math.round(v / 1_000_000)) + ' م')
                      }
                      width={44}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        formatMoney(value, unit),
                        name === 'income' ? 'درآمد' : 'هزینه',
                      ]}
                    />
                    <Legend
                      formatter={(value: string) => (value === 'income' ? 'درآمد' : 'هزینه')}
                    />
                    <Bar dataKey="income" fill="#17e76c" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="expense" fill="#e11d48" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                سهم دسته‌های هزینه{' '}
                {monthFilter !== 'all' ? `در ${jalaliMonthLabel(monthFilter)}` : '(همه‌ی دوره‌ها)'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {expensePie.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  هزینه‌ای برای نمایش وجود ندارد.
                </p>
              ) : (
                <div dir="ltr" className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={expensePie}
                        dataKey="total"
                        nameKey="category"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={2}
                      >
                        {expensePie.map((entry, i) => (
                          <Cell key={entry.category} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatMoney(value, unit)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <TransactionFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        source={businessOnly ? 'business' : 'manual'}
        existingCategories={[
          ...mergeCategories(
            businessOnly
              ? [
                  'خرید کالا',
                  'اجاره و شارژ',
                  'حقوق کارکنان',
                  'قبوض و اینترنت',
                  'حمل و ارسال',
                  'بازاریابی',
                  'تعمیر و نگهداری',
                  'سایر هزینه‌های کسب‌وکار',
                ]
              : DEFAULT_EXPENSE_CATEGORIES,
            transactions.filter((t) => t.type === 'expense').map((t) => t.category),
          ),
        ]}
        incomeCategories={mergeCategories(
          businessOnly ? ['خدمات', 'درآمد جانبی', 'فروش دارایی'] : DEFAULT_INCOME_CATEGORIES,
          transactions.filter((t) => t.type === 'income').map((t) => t.category),
        )}
      />

      <ConfirmDialog
        open={deletingId !== null}
        onOpenChange={(open) => !open && setDeletingId(null)}
        title="حذف تراکنش"
        description="این تراکنش برای همیشه حذف می‌شود. ادامه می‌دهید؟"
        confirmLabel="حذف"
        destructive
        onConfirm={async () => {
          if (deletingId != null) {
            await deleteManualTransaction(deletingId);
            toast.success('تراکنش حذف شد.');
          }
        }}
      />
    </div>
  );
}

function RowActions({
  transaction,
  onEdit,
  onDelete,
}: {
  transaction: Transaction;
  onEdit: () => void;
  onDelete: () => void;
}) {
  if (transaction.source === 'sale')
    return (
      <Button variant="ghost" size="sm" asChild>
        <Link to={`/store/invoices/${transaction.invoiceId}`}>فاکتور ←</Link>
      </Button>
    );
  return (
    <span className="flex shrink-0 items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onEdit}
        aria-label="ویرایش تراکنش"
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:text-destructive"
        onClick={onDelete}
        aria-label="حذف تراکنش"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </span>
  );
}

function TransactionRow({
  t,
  unit,
  onEdit,
  onDelete,
}: {
  t: Transaction;
  unit: 'toman' | 'rial';
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">{formatJalaliNumeric(new Date(t.date))}</TableCell>
      <TableCell>
        <Badge variant={t.type === 'income' ? 'success' : 'destructive'}>
          {t.type === 'income' ? 'درآمد' : 'هزینه'}
        </Badge>
      </TableCell>
      <TableCell className="font-medium">
        {t.category}
        {t.source === 'sale' && (
          <span className="mt-1 block text-[10px] font-normal text-success">ثبت خودکار فروش</span>
        )}
        {t.source === 'business' && (
          <span className="mt-1 block text-[10px] font-normal text-muted-foreground">کسب‌وکار</span>
        )}
      </TableCell>
      <TableCell className="max-w-56 truncate text-muted-foreground">
        {t.description ?? '—'}
      </TableCell>
      <TableCell
        className={cn(
          'whitespace-nowrap font-bold',
          t.type === 'income' ? 'text-success' : 'text-destructive',
        )}
      >
        {t.type === 'income' ? '+' : '−'} {formatMoney(t.amount, unit)}
      </TableCell>
      <TableCell>
        <RowActions transaction={t} onEdit={onEdit} onDelete={onDelete} />
      </TableCell>
    </TableRow>
  );
}

function TransactionFormDialog({
  open,
  onOpenChange,
  editing,
  existingCategories,
  incomeCategories,
  source,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Transaction | null;
  existingCategories: string[];
  incomeCategories: string[];
  source: 'manual' | 'business';
}) {
  const unit = useSettingsStore((s) => s.currencyUnit);
  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      type: 'expense',
      category: '',
      amount: 0,
      date: new Date().toISOString(),
      description: '',
    },
  });
  const type = form.watch('type');
  const categories = type === 'income' ? incomeCategories : existingCategories;

  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.reset({
        type: editing.type,
        category: editing.category,
        amount: toDisplayAmount(editing.amount, unit),
        date: editing.date,
        description: editing.description ?? '',
      });
    } else {
      form.reset({
        type: 'expense',
        category: '',
        amount: 0,
        date: new Date().toISOString(),
        description: '',
      });
    }
  }, [open, editing, form, unit]);

  const onSubmit = async (values: TransactionFormValues) => {
    const payload = {
      type: values.type,
      category: values.category,
      amount: fromDisplayAmount(values.amount, unit),
      date: values.date,
      description: values.description?.trim() ? values.description.trim() : undefined,
    };
    try {
      await saveManualTransaction({ ...payload, source }, editing?.id);
      toast.success(
        editing
          ? 'تراکنش ویرایش شد.'
          : values.type === 'income'
            ? 'درآمد ثبت شد.'
            : 'هزینه ثبت شد.',
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ثبت تراکنش ناموفق بود.');
    }
  };

  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'ویرایش تراکنش' : 'ثبت تراکنش جدید'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Controller
            control={form.control}
            name="type"
            render={({ field }) => (
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="نوع تراکنش">
                <Button
                  variant={field.value === 'expense' ? 'destructive' : 'outline'}
                  onClick={() => field.onChange('expense')}
                  aria-pressed={field.value === 'expense'}
                >
                  <ArrowUpCircle aria-hidden /> هزینه
                </Button>
                <Button
                  variant={field.value === 'income' ? 'default' : 'outline'}
                  className={
                    field.value === 'income'
                      ? 'bg-success text-success-foreground hover:bg-success/90'
                      : ''
                  }
                  onClick={() => field.onChange('income')}
                  aria-pressed={field.value === 'income'}
                >
                  <ArrowDownCircle aria-hidden /> درآمد
                </Button>
              </div>
            )}
          />

          <div className="space-y-1.5">
            <Label htmlFor="tx-category">دسته‌بندی</Label>
            <Input
              id="tx-category"
              list="tx-categories"
              placeholder="مثلاً خوراک و رستوران"
              aria-invalid={!!errors.category}
              {...form.register('category')}
            />
            <datalist id="tx-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            {errors.category && (
              <p role="alert" className="text-xs text-destructive">
                {errors.category.message}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tx-amount">مبلغ ({unit === 'toman' ? 'تومان' : 'ریال'})</Label>
              <Controller
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <AmountInput
                    id="tx-amount"
                    value={field.value}
                    onChange={field.onChange}
                    autoFocus
                  />
                )}
              />
              {errors.amount && (
                <p role="alert" className="text-xs text-destructive">
                  {errors.amount.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tx-date">تاریخ</Label>
              <Controller
                control={form.control}
                name="date"
                render={({ field }) => (
                  <JalaliDateInput id="tx-date" value={field.value} onChange={field.onChange} />
                )}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tx-desc">توضیحات (اختیاری)</Label>
            <Textarea
              id="tx-desc"
              rows={2}
              placeholder="مثلاً خرید هفتگی"
              {...form.register('description')}
            />
            {errors.description && (
              <p role="alert" className="text-xs text-destructive">
                {errors.description.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              انصراف
            </Button>
            <Button type="submit" variant="neon" disabled={form.formState.isSubmitting}>
              {editing ? 'ذخیره‌ی تغییرات' : 'ثبت تراکنش'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
