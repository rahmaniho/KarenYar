import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Banknote, FileDown, Printer, Save, Users } from 'lucide-react';
import { toast } from 'sonner';
import { db, nowISO, type Employee, type PayrollRecord } from '@/core/db/db';
import { calculatePayroll, type PayrollInput } from '@/core/calc/payroll';
import { formatMoney, formatNumber, fromDisplayAmount, toFaDigits } from '@/core/currency/currency';
import { addJalaliMonths, currentJalaliMonthKey, jalaliMonthLabel } from '@/core/jalali/jalali';
import { exportElementToPdf } from '@/core/utils/pdf';
import { useLicenseStore } from '@/store/license-store';
import { useSettingsStore } from '@/store/settings-store';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { FeatureGate } from '@/components/FeatureGate';
import { AmountInput } from '@/components/AmountInput';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** محاسبه‌ی حقوق ماهانه + صدور و ذخیره‌ی فیش حقوقی */
export function PayrollCalculatePage() {
  const unit = useSettingsStore((s) => s.currencyUnit);
  const rates = useSettingsStore((s) => s.payrollRates);
  const shopName = useSettingsStore((s) => s.shopName);
  const can = useLicenseStore((s) => s.can);
  const [params] = useSearchParams();
  const payslipRef = useRef<HTMLDivElement>(null);

  const employees = useLiveQuery(
    () => db.employees.orderBy('name').toArray(),
    [],
    [] as Employee[],
  );
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [month, setMonth] = useState(currentJalaliMonthKey());
  const [workedDays, setWorkedDays] = useState(30);
  const [overtimeHours, setOvertimeHours] = useState(0);
  const [nightHours, setNightHours] = useState(0);
  const [otherBenefits, setOtherBenefits] = useState(0);
  const [otherDeductions, setOtherDeductions] = useState(0);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    const fromQuery = Number(params.get('employee'));
    if (Number.isFinite(fromQuery) && fromQuery > 0) setEmployeeId(fromQuery);
  }, [params]);

  useEffect(() => {
    if (employeeId === null && employees.length > 0) setEmployeeId(employees[0].id!);
  }, [employees, employeeId]);

  const employee = useMemo(
    () => employees.find((e) => e.id === employeeId) ?? null,
    [employees, employeeId],
  );

  const monthOptions = useMemo(() => {
    const options: string[] = [];
    for (let i = 0; i < 12; i++) options.push(addJalaliMonths(currentJalaliMonthKey(), -i));
    return options;
  }, []);

  const input: PayrollInput | null = useMemo(() => {
    if (!employee) return null;
    return {
      baseSalary: employee.baseSalary,
      children: employee.children,
      married: employee.married,
      seniorityYears: employee.seniorityYears,
      workedDays,
      overtimeHours,
      nightShiftHours: nightHours,
      otherBenefits: fromDisplayAmount(otherBenefits, unit),
      otherDeductions: fromDisplayAmount(otherDeductions, unit),
    };
  }, [employee, workedDays, overtimeHours, nightHours, otherBenefits, otherDeductions, unit]);

  const result = useMemo(() => (input ? calculatePayroll(input, rates) : null), [input, rates]);

  const savedRecord = useLiveQuery(async () => {
    if (!employeeId) return undefined;
    const rows = await db.payrolls.where('employeeId').equals(employeeId).toArray();
    return rows.find((r) => r.month === month);
  }, [employeeId, month]) as PayrollRecord | undefined;

  const savePayslip = async () => {
    if (!employee || !input || !result) return;
    const payload = {
      employeeId: employee.id!,
      month,
      input,
      result,
      netPay: result.netPay,
    };
    if (savedRecord?.id != null) {
      await db.payrolls.update(savedRecord.id, payload);
      toast.success('فیش حقوقی این ماه به‌روزرسانی شد.');
    } else {
      await db.payrolls.add({ ...payload, createdAt: nowISO() });
      toast.success('فیش حقوقی ذخیره شد.');
    }
  };

  const downloadPdf = async () => {
    if (!payslipRef.current || !employee) return;
    setPdfLoading(true);
    try {
      await exportElementToPdf(payslipRef.current, `payslip-${employee.name}-${month}.pdf`);
      toast.success('فایل PDF فیش حقوقی ساخته شد.');
    } catch {
      toast.error('ساخت PDF با خطا مواجه شد؛ از چاپ استفاده کنید.');
    } finally {
      setPdfLoading(false);
    }
  };

  if (employees.length === 0) {
    return (
      <div>
        <PageHeader title="محاسبه حقوق و فیش" subtitle="ابتدا باید کارمند تعریف شود" />
        <EmptyState
          icon={Users}
          title="هنوز کارمندی ثبت نشده است"
          description="برای محاسبه‌ی حقوق، اول مشخصات کارمند را در بخش کارمندان ثبت کنید."
          action={
            <Button asChild variant="neon">
              <Link to="/payroll/employees">
                <Users aria-hidden />
                رفتن به کارمندان
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const benefitRows: [string, number][] = result
    ? [
        ['حقوق پایه', result.baseSalary],
        ['پایه سنوات', result.seniorityPay],
        ['حق مسکن', result.housingAllowance],
        ['بن خواربار', result.groceryAllowance],
        ['حق اولاد', result.childAllowance],
        ['حق تأهل', result.marriageAllowance],
        ['اضافه‌کاری', result.overtimePay],
        ['شب‌کاری', result.nightShiftPay],
        ['سایر مزایا', result.otherBenefits],
      ]
    : [];

  return (
    <div>
      <PageHeader
        title="محاسبه حقوق و فیش"
        subtitle="محاسبه بر اساس قانون کار و نرخ‌های قابل ویرایش در «تنظیمات دستمزد»"
      />

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        {/* ورودی‌ها */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Banknote className="h-5 w-5 text-primary dark:text-neon-400" aria-hidden />
              اطلاعات ماه
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pr-employee">کارمند</Label>
              <Select
                value={employeeId != null ? String(employeeId) : ''}
                onValueChange={(v) => setEmployeeId(Number(v))}
              >
                <SelectTrigger id="pr-employee" aria-label="انتخاب کارمند">
                  <SelectValue placeholder="انتخاب کنید" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.name}
                      {e.position ? ` — ${e.position}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pr-month">ماه</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger id="pr-month" aria-label="انتخاب ماه حقوق">
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
              {savedRecord && <Badge variant="secondary">فیش این ماه قبلاً ذخیره شده است</Badge>}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="pr-days" className="text-xs">
                  روز کارکرد
                </Label>
                <Input
                  id="pr-days"
                  inputMode="numeric"
                  dir="ltr"
                  className="text-left"
                  value={workedDays}
                  onChange={(e) =>
                    setWorkedDays(Math.min(31, Math.max(0, Number(e.target.value) || 0)))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pr-ot" className="text-xs">
                  اضافه‌کاری (ساعت)
                </Label>
                <Input
                  id="pr-ot"
                  inputMode="decimal"
                  dir="ltr"
                  className="text-left"
                  value={overtimeHours || ''}
                  onChange={(e) => setOvertimeHours(Number(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pr-night" className="text-xs">
                  شب‌کاری (ساعت)
                </Label>
                <Input
                  id="pr-night"
                  inputMode="decimal"
                  dir="ltr"
                  className="text-left"
                  value={nightHours || ''}
                  onChange={(e) => setNightHours(Number(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pr-benefits">
                سایر مزایا ({unit === 'toman' ? 'تومان' : 'ریال'})
              </Label>
              <AmountInput id="pr-benefits" value={otherBenefits} onChange={setOtherBenefits} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pr-deductions">
                سایر کسورات ({unit === 'toman' ? 'تومان' : 'ریال'})
              </Label>
              <AmountInput
                id="pr-deductions"
                value={otherDeductions}
                onChange={setOtherDeductions}
              />
            </div>

            {result && (
              <div className="rounded-xl bg-navy-900 p-4 text-white">
                <p className="text-xs text-white/60">خالص پرداختی</p>
                <p className="mt-1 text-2xl font-extrabold text-neon-400">
                  {formatMoney(result.netPay, unit)}
                </p>
                <p className="mt-1 text-xs text-white/60">
                  ناخالص: {formatMoney(result.gross, unit)} — بیمه:{' '}
                  {formatMoney(result.insuranceEmployee, unit)} — مالیات:{' '}
                  {formatMoney(result.tax, unit)}
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="neon" onClick={() => void savePayslip()} disabled={!result}>
                <Save aria-hidden />
                {savedRecord ? 'به‌روزرسانی فیش' : 'ذخیره‌ی فیش'}
              </Button>
              <Button variant="outline" onClick={() => window.print()} disabled={!result}>
                <Printer aria-hidden />
                چاپ فیش
              </Button>
              <Button
                variant="outline"
                onClick={() => void downloadPdf()}
                disabled={!result || pdfLoading || !can('pdf-export')}
              >
                <FileDown aria-hidden />
                {pdfLoading ? 'در حال ساخت…' : 'PDF فیش'}
              </Button>
            </div>
            {!can('pdf-export') && <FeatureGate feature="pdf-export" compact />}
          </CardContent>
        </Card>

        {/* فیش حقوقی قابل چاپ */}
        {employee && result && (
          <div
            ref={payslipRef}
            className="print-area h-fit rounded-2xl border bg-white p-6 text-navy-900 shadow-card sm:p-8"
          >
            <div className="flex items-start justify-between border-b-2 border-navy-900 pb-4">
              <div>
                <p className="text-xl font-extrabold">{shopName}</p>
                <p className="mt-1 text-sm text-navy-600">فیش حقوقی {jalaliMonthLabel(month)}</p>
              </div>
              <div className="text-left text-sm">
                <p>
                  کارمند: <b>{employee.name}</b>
                </p>
                {employee.position && <p className="text-navy-600">سمت: {employee.position}</p>}
                {employee.nationalId && (
                  <p className="text-navy-600">کد ملی: {employee.nationalId}</p>
                )}
              </div>
            </div>

            <div className="mt-5 grid gap-6 sm:grid-cols-2">
              <div>
                <h3 className="mb-2 border-b pb-1 font-bold">مزایا و دریافتی‌ها</h3>
                <dl className="space-y-1.5 text-sm">
                  {benefitRows
                    .filter(([, v]) => v !== 0)
                    .map(([label, value]) => (
                      <div key={label} className="flex justify-between">
                        <dt className="text-navy-600">{label}</dt>
                        <dd>{formatMoney(value, unit)}</dd>
                      </div>
                    ))}
                  <div className="flex justify-between border-t pt-2 font-bold">
                    <dt>جمع ناخالص</dt>
                    <dd>{formatMoney(result.gross, unit)}</dd>
                  </div>
                </dl>
              </div>
              <div>
                <h3 className="mb-2 border-b pb-1 font-bold">کسورات</h3>
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-navy-600">
                      بیمه‌ی سهم کارگر ({toFaDigits(String(rates.insuranceRatePercent))}٪)
                    </dt>
                    <dd>{formatMoney(result.insuranceEmployee, unit)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-navy-600">مالیات حقوق</dt>
                    <dd>{formatMoney(result.tax, unit)}</dd>
                  </div>
                  {result.otherDeductions > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-navy-600">سایر کسورات</dt>
                      <dd>{formatMoney(result.otherDeductions, unit)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-2 font-bold">
                    <dt>جمع کسورات</dt>
                    <dd>
                      {formatMoney(
                        result.insuranceEmployee + result.tax + result.otherDeductions,
                        unit,
                      )}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between rounded-xl bg-navy-900 px-5 py-4 text-white">
              <span className="font-bold">خالص قابل پرداخت</span>
              <span className="text-2xl font-extrabold text-neon-400">
                {formatMoney(result.netPay, unit)}
              </span>
            </div>

            <div className="mt-6 flex items-end justify-between text-xs text-navy-500">
              <p>
                روزهای کارکرد: {formatNumber(workedDays)} روز
                {overtimeHours > 0 && ` — اضافه‌کاری: ${toFaDigits(String(overtimeHours))} ساعت`}
                <br />
                این فیش بر اساس قانون کار و نرخ‌های جاری سیستم صادر شده است.
              </p>
              <p className="text-center">
                امضای کارمند
                <br />
                <span className="mt-8 block border-t border-navy-300 pt-1">{employee.name}</span>
              </p>
            </div>

            <p className="mt-6 flex items-center justify-center gap-1.5 border-t pt-3 text-center text-[11px] text-navy-400">
              صادرشده با دستمزد‌یار کارن سافت — {shopName}
              <img
                src="/images/karensoft/mark.png"
                alt=""
                width={256}
                height={256}
                className="h-4 w-4 object-contain"
              />
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
