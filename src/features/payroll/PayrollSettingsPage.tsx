import { useMemo, useState } from 'react';
import { Gift, PiggyBank, RotateCcw, Save, SlidersHorizontal, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  DEFAULT_PAYROLL_RATES,
  calculateSeverance,
  eidiFromMonthlySalary,
  type PayrollRates,
} from '@/core/calc/payroll';
import {
  formatMoney,
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
import { payrollRatesSchema } from './schemas';

interface MoneyFieldProps {
  id: string;
  label: string;
  /** مقدار به تومان داخلی */
  value: number;
  onChange: (toman: number) => void;
  unit: 'toman' | 'rial';
}

function MoneyField({ id, label, value, onChange, unit }: MoneyFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <AmountInput
        id={id}
        value={toDisplayAmount(value, unit)}
        onChange={(display) => onChange(fromDisplayAmount(display, unit))}
      />
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  suffix,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          dir="ltr"
          className="text-left"
          value={value === 0 ? '' : value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
        />
        {suffix && (
          <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

/** تنظیمات نرخ‌های قانون کار + محاسبه‌ی سریع عیدی و سنوات */
export function PayrollSettingsPage() {
  const unit = useSettingsStore((s) => s.currencyUnit);
  const storedRates = useSettingsStore((s) => s.payrollRates);
  const setPayrollRates = useSettingsStore((s) => s.setPayrollRates);
  const [rates, setRates] = useState<PayrollRates>(storedRates);

  // ابزار عیدی و سنوات
  const [eidiSalary, setEidiSalary] = useState(15_000_000);
  const [eidiSeniority, setEidiSeniority] = useState(0);
  const [eidiDays, setEidiDays] = useState(365);
  const [sevSalary, setSevSalary] = useState(15_000_000);
  const [sevYears, setSevYears] = useState(5);

  const eidi = useMemo(
    () => eidiFromMonthlySalary(eidiSalary, eidiSeniority, eidiDays, rates),
    [eidiSalary, eidiSeniority, eidiDays, rates],
  );
  const severance = useMemo(() => calculateSeverance(sevSalary, sevYears), [sevSalary, sevYears]);

  const patch = (partial: Partial<PayrollRates>) => setRates((prev) => ({ ...prev, ...partial }));

  const save = () => {
    const parsed = payrollRatesSchema.safeParse(rates);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'مقادیر تنظیمات معتبر نیستند.');
      return;
    }
    // مرتب‌سازی پله‌ها بر اساس سقف و اطمینان از بازبودن آخرین پله در صورت نیاز
    const brackets = [...parsed.data.taxBrackets].sort(
      (a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity),
    );
    setPayrollRates({ ...parsed.data, taxBrackets: brackets });
    setRates({ ...parsed.data, taxBrackets: brackets });
    toast.success('نرخ‌های دستمزد ذخیره شد و از این پس در محاسبات اعمال می‌شود.');
  };

  const reset = () => {
    setRates(DEFAULT_PAYROLL_RATES);
    setPayrollRates(DEFAULT_PAYROLL_RATES);
    toast.success('نرخ‌ها به مقادیر پیش‌فرض قانون کار ۱۴۰۴ برگشت.');
  };

  return (
    <div>
      <PageHeader
        title="تنظیمات دستمزد"
        subtitle="نرخ‌های قانونی قابل ویرایش‌اند؛ با ابلاغ مصوبات جدید همین‌جا به‌روز کنید. پیش‌فرض‌ها مربوط به سال ۱۴۰۴ است."
        actions={
          <>
            <Button variant="outline" onClick={reset}>
              <RotateCcw aria-hidden />
              بازنشانی پیش‌فرض ۱۴۰۴
            </Button>
            <Button variant="neon" onClick={save}>
              <Save aria-hidden />
              ذخیره‌ی نرخ‌ها
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <SlidersHorizontal className="h-5 w-5 text-primary dark:text-neon-400" aria-hidden />
              مزایا و نرخ‌های پایه (مبالغ به {unit === 'toman' ? 'تومان' : 'ریال'})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <MoneyField
                id="r-minwage"
                label="حداقل مزد روزانه"
                value={rates.minDailyWage}
                unit={unit}
                onChange={(v) => patch({ minDailyWage: v })}
              />
              <MoneyField
                id="r-seniority"
                label="پایه سنوات روزانه"
                value={rates.seniorityDailyBase}
                unit={unit}
                onChange={(v) => patch({ seniorityDailyBase: v })}
              />
              <MoneyField
                id="r-housing"
                label="حق مسکن ماهانه"
                value={rates.housingAllowance}
                unit={unit}
                onChange={(v) => patch({ housingAllowance: v })}
              />
              <MoneyField
                id="r-grocery"
                label="بن خواربار ماهانه"
                value={rates.groceryAllowance}
                unit={unit}
                onChange={(v) => patch({ groceryAllowance: v })}
              />
              <MoneyField
                id="r-child"
                label="حق اولاد هر فرزند"
                value={rates.childAllowancePerChild}
                unit={unit}
                onChange={(v) => patch({ childAllowancePerChild: v })}
              />
              <MoneyField
                id="r-marriage"
                label="حق تأهل ماهانه"
                value={rates.marriageAllowance}
                unit={unit}
                onChange={(v) => patch({ marriageAllowance: v })}
              />
              <NumberField
                id="r-insurance"
                label="بیمه‌ی سهم کارگر"
                value={rates.insuranceRatePercent}
                suffix="٪"
                onChange={(v) => patch({ insuranceRatePercent: v })}
              />
              <NumberField
                id="r-ot"
                label="ضریب اضافه‌کاری"
                value={rates.overtimeFactor}
                onChange={(v) => patch({ overtimeFactor: v })}
              />
              <NumberField
                id="r-night"
                label="فوق‌العاده شب‌کاری"
                value={rates.nightShiftRatePercent}
                suffix="٪"
                onChange={(v) => patch({ nightShiftRatePercent: v })}
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">پله‌های مالیات حقوق (ماهانه)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs leading-6 text-muted-foreground">
                سقف هر پله به {unit === 'toman' ? 'تومان' : 'ریال'}؛ آخرین پله «نامحدود» است و مازاد
                بر پله‌ی قبل را پوشش می‌دهد. ردیف اول معمولاً معافیت (نرخ صفر) است.
              </p>
              {rates.taxBrackets.map((bracket, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">سقف پله {toFaDigits(String(i + 1))}</Label>
                    {bracket.upTo === null ? (
                      <p className="flex h-10 items-center rounded-lg bg-muted px-3 text-sm text-muted-foreground">
                        نامحدود
                      </p>
                    ) : (
                      <AmountInput
                        aria-label={`سقف پله ${i + 1}`}
                        value={toDisplayAmount(bracket.upTo, unit)}
                        onChange={(display) =>
                          patch({
                            taxBrackets: rates.taxBrackets.map((b, j) =>
                              j === i ? { ...b, upTo: fromDisplayAmount(display, unit) } : b,
                            ),
                          })
                        }
                      />
                    )}
                  </div>
                  <div className="w-24 space-y-1">
                    <Label className="text-xs">نرخ (٪)</Label>
                    <Input
                      inputMode="decimal"
                      dir="ltr"
                      className="text-left"
                      aria-label={`نرخ پله ${i + 1}`}
                      value={bracket.ratePercent === 0 ? '' : bracket.ratePercent}
                      placeholder="۰"
                      onChange={(e) =>
                        patch({
                          taxBrackets: rates.taxBrackets.map((b, j) =>
                            j === i ? { ...b, ratePercent: Number(e.target.value) || 0 } : b,
                          ),
                        })
                      }
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    aria-label={`حذف پله ${i + 1}`}
                    disabled={rates.taxBrackets.length <= 1}
                    onClick={() =>
                      patch({ taxBrackets: rates.taxBrackets.filter((_, j) => j !== i) })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const lastFinite = [...rates.taxBrackets].reverse().find((b) => b.upTo !== null);
                  const base = lastFinite?.upTo ?? 10_000_000;
                  patch({
                    taxBrackets: [
                      ...rates.taxBrackets.filter((b) => b.upTo !== null),
                      { upTo: base + 10_000_000, ratePercent: 10 },
                      { upTo: null, ratePercent: 30 },
                    ],
                  });
                }}
              >
                <Plus aria-hidden />
                افزودن پله
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Gift className="h-5 w-5 text-primary dark:text-neon-400" aria-hidden />
                محاسبه‌ی سریع عیدی
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <MoneyField
                  id="eidi-salary"
                  label="حقوق پایه ماهانه"
                  value={eidiSalary}
                  unit={unit}
                  onChange={setEidiSalary}
                />
                <MoneyField
                  id="eidi-seniority"
                  label="پایه سنوات ماهانه"
                  value={eidiSeniority}
                  unit={unit}
                  onChange={setEidiSeniority}
                />
                <NumberField
                  id="eidi-days"
                  label="روزهای کارکرد در سال"
                  value={eidiDays}
                  onChange={setEidiDays}
                />
              </div>
              <p className="rounded-lg bg-muted/70 px-3 py-2 text-sm">
                عیدی سالانه:{' '}
                <b className="text-primary dark:text-neon-400">{formatMoney(eidi, unit)}</b>
                <span className="block text-xs text-muted-foreground">
                  (۶۰ روز مزد، با سقف ۹۰ روز حداقل مزد قانونی، به نسبت روزهای کارکرد)
                </span>
              </p>

              <div className="border-t pt-3">
                <p className="mb-3 flex items-center gap-2 font-bold">
                  <PiggyBank className="h-4 w-4 text-primary dark:text-neon-400" aria-hidden />
                  محاسبه‌ی سنوات پایان کار
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <MoneyField
                    id="sev-salary"
                    label="آخرین حقوق ماهانه"
                    value={sevSalary}
                    unit={unit}
                    onChange={setSevSalary}
                  />
                  <NumberField
                    id="sev-years"
                    label="سابقه (سال)"
                    value={sevYears}
                    onChange={setSevYears}
                  />
                </div>
                <p className="mt-3 rounded-lg bg-muted/70 px-3 py-2 text-sm">
                  مزایای پایان کار:{' '}
                  <b className="text-primary dark:text-neon-400">{formatMoney(severance, unit)}</b>
                  <span className="block text-xs text-muted-foreground">
                    (به‌ازای هر سال سابقه، یک ماه آخرین حقوق)
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
