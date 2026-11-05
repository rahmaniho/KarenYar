import { useMemo, useState } from 'react';
import { HandCoins, Landmark } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { AmountInput } from '@/components/AmountInput';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  amortizationSchedule,
  compoundInterest,
  loanInstallment,
  simpleInterest,
} from '@/core/calc/finance';
import { formatMoney, formatNumber } from '@/core/currency/currency';
import { useSettingsStore } from '@/store/settings-store';

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
          value={value || ''}
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

/** وام و اقساط + سود مرکب/ساده */
export function LoanTools() {
  const unit = useSettingsStore((s) => s.currencyUnit);
  const [principal, setPrincipal] = useState(100_000_000);
  const [rate, setRate] = useState(23);
  const [months, setMonths] = useState(24);
  const [showSchedule, setShowSchedule] = useState(false);

  const [cPrincipal, setCPrincipal] = useState(50_000_000);
  const [cRate, setCRate] = useState(20);
  const [cYears, setCYears] = useState(3);
  const [frequency, setFrequency] = useState('1');

  const loan = useMemo(() => loanInstallment(principal, rate, months), [principal, rate, months]);
  const schedule = useMemo(
    () => (showSchedule ? amortizationSchedule(principal, rate, months) : []),
    [showSchedule, principal, rate, months],
  );
  const compound = useMemo(
    () => compoundInterest(cPrincipal, cRate, cYears, Number(frequency)),
    [cPrincipal, cRate, cYears, frequency],
  );
  const simple = useMemo(
    () => simpleInterest(cPrincipal, cRate, cYears),
    [cPrincipal, cRate, cYears],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-5 w-5 text-primary dark:text-neon-400" aria-hidden />
            محاسبه وام و اقساط
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="loan-principal">مبلغ وام</Label>
              <AmountInput id="loan-principal" value={principal} onChange={setPrincipal} />
            </div>
            <NumberField
              id="loan-rate"
              label="نرخ سود سالانه"
              value={rate}
              onChange={setRate}
              suffix="٪"
            />
            <NumberField
              id="loan-months"
              label="تعداد اقساط (ماه)"
              value={months}
              onChange={setMonths}
            />
          </div>
          <dl className="rounded-xl bg-muted/60 p-4">
            <div className="flex items-center justify-between border-b py-2 text-sm">
              <dt className="text-muted-foreground">مبلغ هر قسط</dt>
              <dd className="text-lg font-extrabold text-primary dark:text-neon-400">
                {formatMoney(loan.monthlyPayment, unit)}
              </dd>
            </div>
            <div className="flex items-center justify-between border-b py-2 text-sm">
              <dt className="text-muted-foreground">جمع بازپرداخت</dt>
              <dd className="font-semibold">{formatMoney(loan.totalPayment, unit)}</dd>
            </div>
            <div className="flex items-center justify-between py-2 text-sm">
              <dt className="text-muted-foreground">سود کل وام</dt>
              <dd className="font-semibold text-destructive">
                {formatMoney(loan.totalInterest, unit)}
              </dd>
            </div>
          </dl>
          <button
            className="text-sm font-semibold text-primary underline-offset-4 hover:underline dark:text-neon-400"
            onClick={() => setShowSchedule((v) => !v)}
            aria-expanded={showSchedule}
          >
            {showSchedule ? 'بستن جدول اقساط' : 'نمایش جدول اقساط ماه‌به‌ماه'}
          </button>
          {showSchedule && (
            <div className="max-h-80 overflow-y-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ماه</TableHead>
                    <TableHead>قسط</TableHead>
                    <TableHead>اصل</TableHead>
                    <TableHead>سود</TableHead>
                    <TableHead>مانده</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedule.map((row) => (
                    <TableRow key={row.month}>
                      <TableCell>{formatNumber(row.month)}</TableCell>
                      <TableCell>{formatMoney(row.payment, unit, { withUnit: false })}</TableCell>
                      <TableCell>
                        {formatMoney(row.principalPart, unit, { withUnit: false })}
                      </TableCell>
                      <TableCell>
                        {formatMoney(row.interestPart, unit, { withUnit: false })}
                      </TableCell>
                      <TableCell>
                        {formatMoney(row.remainingBalance, unit, { withUnit: false })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <HandCoins className="h-5 w-5 text-primary dark:text-neon-400" aria-hidden />
            سود مرکب و ساده (سرمایه‌گذاری)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cmp-principal">اصل سرمایه</Label>
              <AmountInput id="cmp-principal" value={cPrincipal} onChange={setCPrincipal} />
            </div>
            <NumberField
              id="cmp-rate"
              label="نرخ سالانه"
              value={cRate}
              onChange={setCRate}
              suffix="٪"
            />
            <NumberField id="cmp-years" label="مدت (سال)" value={cYears} onChange={setCYears} />
            <div className="space-y-1.5">
              <Label htmlFor="cmp-freq">دوره‌ی ترکیب</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger id="cmp-freq" aria-label="دوره‌ی ترکیب سود">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">سالانه</SelectItem>
                  <SelectItem value="2">شش‌ماهه</SelectItem>
                  <SelectItem value="4">سه‌ماهه</SelectItem>
                  <SelectItem value="12">ماهانه</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <dl className="rounded-xl bg-muted/60 p-4">
            <div className="flex items-center justify-between border-b py-2 text-sm">
              <dt className="text-muted-foreground">مبلغ نهایی (سود مرکب)</dt>
              <dd className="text-lg font-extrabold text-primary dark:text-neon-400">
                {formatMoney(compound.finalAmount, unit)}
              </dd>
            </div>
            <div className="flex items-center justify-between border-b py-2 text-sm">
              <dt className="text-muted-foreground">سود مرکب</dt>
              <dd className="font-semibold text-success">
                {formatMoney(compound.totalInterest, unit)}
              </dd>
            </div>
            <div className="flex items-center justify-between py-2 text-sm">
              <dt className="text-muted-foreground">سود ساده (برای مقایسه)</dt>
              <dd className="font-semibold">{formatMoney(simple.totalInterest, unit)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
