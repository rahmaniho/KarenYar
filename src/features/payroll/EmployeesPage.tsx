import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLiveQuery } from 'dexie-react-hooks';
import { Banknote, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { db, nowISO, type Employee } from '@/core/db/db';
import {
  formatMoney,
  formatNumber,
  fromDisplayAmount,
  toDisplayAmount,
} from '@/core/currency/currency';
import { useSettingsStore } from '@/store/settings-store';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AmountInput } from '@/components/AmountInput';
import { JalaliDateInput } from '@/components/JalaliDateInput';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { employeeSchema, type EmployeeFormValues } from './schemas';

/** مدیریت کارمندان دستمزد‌یار */
export function EmployeesPage() {
  const unit = useSettingsStore((s) => s.currencyUnit);
  const employees = useLiveQuery(
    () => db.employees.orderBy('name').toArray(),
    [],
    [] as Employee[],
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState<Employee | null>(null);

  return (
    <div>
      <PageHeader
        title="کارمندان"
        subtitle="مشخصات قراردادی کارمندان برای محاسبه‌ی حقوق، عیدی و سنوات"
        actions={
          <Button
            variant="neon"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus aria-hidden />
            کارمند جدید
          </Button>
        }
      />

      {employees.length === 0 ? (
        <EmptyState
          icon={Users}
          title="هنوز کارمندی ثبت نشده است"
          description="مشخصات اولین کارمند (حقوق پایه، تعداد فرزند، تأهل و سابقه) را ثبت کنید تا فیش حقوقی صادر کنید."
          action={
            <Button
              variant="neon"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus aria-hidden />
              ثبت اولین کارمند
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>نام</TableHead>
                <TableHead>سمت</TableHead>
                <TableHead>حقوق پایه</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead>سابقه</TableHead>
                <TableHead className="w-36">عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((emp) => (
                <TableRow key={emp.id}>
                  <TableCell>
                    <p className="font-semibold">{emp.name}</p>
                    {emp.nationalId && (
                      <p className="text-xs text-muted-foreground">کد ملی: {emp.nationalId}</p>
                    )}
                  </TableCell>
                  <TableCell>{emp.position ?? '—'}</TableCell>
                  <TableCell className="font-semibold">
                    {formatMoney(emp.baseSalary, unit)}
                  </TableCell>
                  <TableCell>
                    {emp.married ? 'متأهل' : 'مجرد'}
                    {emp.children > 0 && ` — ${formatNumber(emp.children)} فرزند`}
                  </TableCell>
                  <TableCell>{formatNumber(emp.seniorityYears)} سال</TableCell>
                  <TableCell>
                    <span className="flex gap-1">
                      <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                        <Link
                          to={`/payroll/calculate?employee=${emp.id}`}
                          aria-label={`محاسبه حقوق ${emp.name}`}
                        >
                          <Banknote className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`ویرایش ${emp.name}`}
                        onClick={() => {
                          setEditing(emp);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        aria-label={`حذف ${emp.name}`}
                        onClick={() => setDeleting(emp)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <EmployeeFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`حذف «${deleting?.name}»`}
        description="کارمند و همه‌ی فیش‌های حقوقی ذخیره‌شده‌ی او حذف می‌شود. ادامه می‌دهید؟"
        confirmLabel="حذف کارمند"
        destructive
        onConfirm={async () => {
          if (deleting?.id != null) {
            await db.transaction('rw', db.employees, db.payrolls, async () => {
              await db.payrolls.where('employeeId').equals(deleting.id!).delete();
              await db.employees.delete(deleting.id!);
            });
            toast.success('کارمند حذف شد.');
          }
        }}
      />
    </div>
  );
}

function EmployeeFormDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Employee | null;
}) {
  const unit = useSettingsStore((s) => s.currencyUnit);
  const rates = useSettingsStore((s) => s.payrollRates);
  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      name: '',
      nationalId: '',
      position: '',
      baseSalary: 0,
      children: 0,
      married: false,
      seniorityYears: 0,
      startDate: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.reset({
        name: editing.name,
        nationalId: editing.nationalId ?? '',
        position: editing.position ?? '',
        baseSalary: toDisplayAmount(editing.baseSalary, unit),
        children: editing.children,
        married: editing.married,
        seniorityYears: editing.seniorityYears,
        startDate: editing.startDate ?? '',
      });
    } else {
      form.reset({
        name: '',
        nationalId: '',
        position: '',
        baseSalary: toDisplayAmount(rates.minDailyWage * 30, unit),
        children: 0,
        married: false,
        seniorityYears: 0,
        startDate: '',
      });
    }
  }, [open, editing, form, unit, rates.minDailyWage]);

  const onSubmit = async (v: EmployeeFormValues) => {
    const payload = {
      name: v.name,
      nationalId: v.nationalId?.trim() ? v.nationalId.trim() : undefined,
      position: v.position?.trim() ? v.position.trim() : undefined,
      baseSalary: fromDisplayAmount(v.baseSalary, unit),
      children: v.children,
      married: v.married,
      seniorityYears: v.seniorityYears,
      startDate: v.startDate ? v.startDate : undefined,
    };
    if (editing?.id != null) {
      await db.employees.update(editing.id, payload);
      toast.success('مشخصات کارمند ویرایش شد.');
    } else {
      await db.employees.add({ ...payload, createdAt: nowISO() });
      toast.success('کارمند ثبت شد.');
    }
    onOpenChange(false);
  };

  const errors = form.formState.errors;
  const err = (field: keyof EmployeeFormValues) =>
    errors[field] ? (
      <p role="alert" className="text-xs text-destructive">
        {errors[field]?.message}
      </p>
    ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'ویرایش کارمند' : 'ثبت کارمند جدید'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="emp-name">نام و نام خانوادگی *</Label>
              <Input id="emp-name" placeholder="مثلاً علی رضایی" {...form.register('name')} />
              {err('name')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-nid">کد ملی (اختیاری)</Label>
              <Input
                id="emp-nid"
                dir="ltr"
                className="text-left"
                inputMode="numeric"
                placeholder="0012345678"
                {...form.register('nationalId')}
              />
              {err('nationalId')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-position">سمت (اختیاری)</Label>
              <Input id="emp-position" placeholder="مثلاً فروشنده" {...form.register('position')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-start">تاریخ شروع به کار</Label>
              <Controller
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <JalaliDateInput
                    id="emp-start"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="emp-salary">
                حقوق پایه‌ی ماهانه ({unit === 'toman' ? 'تومان' : 'ریال'}) *
              </Label>
              <Controller
                control={form.control}
                name="baseSalary"
                render={({ field }) => (
                  <AmountInput id="emp-salary" value={field.value} onChange={field.onChange} />
                )}
              />
              {err('baseSalary')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-years">سابقه‌ی کار (سال)</Label>
              <Input
                id="emp-years"
                inputMode="decimal"
                dir="ltr"
                className="text-left"
                {...form.register('seniorityYears', { valueAsNumber: true })}
              />
              {err('seniorityYears')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-children">تعداد فرزند</Label>
              <Input
                id="emp-children"
                inputMode="numeric"
                dir="ltr"
                className="text-left"
                {...form.register('children', { valueAsNumber: true })}
              />
              {err('children')}
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
              <Label htmlFor="emp-married">متأهل (حق تأهل)</Label>
              <Controller
                control={form.control}
                name="married"
                render={({ field }) => (
                  <Switch id="emp-married" checked={field.value} onCheckedChange={field.onChange} />
                )}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              انصراف
            </Button>
            <Button type="submit" variant="neon" disabled={form.formState.isSubmitting}>
              {editing ? 'ذخیره‌ی تغییرات' : 'ثبت کارمند'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
