import { useMemo, useState } from 'react';
import { ArrowLeftRight, Coins } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { AmountInput } from '@/components/AmountInput';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { convertCurrency, CURRENCY_RATES_UPDATED_AT } from '@/core/calc/units';
import { formatDecimal, formatNumber } from '@/core/currency/currency';
import { useSettingsStore } from '@/store/settings-store';

/** تبدیل ارز با نرخ‌های دستی قابل ویرایش (ذخیره در تنظیمات) */
export function CurrencyConverter() {
  const rates = useSettingsStore((s) => s.currencyRates);
  const setCurrencyRates = useSettingsStore((s) => s.setCurrencyRates);
  const [from, setFrom] = useState('USD');
  const [to, setTo] = useState('IRR-TMN');
  const [amount, setAmount] = useState(100);

  const result = useMemo(() => {
    try {
      return convertCurrency(amount, from, to, rates);
    } catch {
      return null;
    }
  }, [amount, from, to, rates]);

  const updateRate = (code: string, rateToToman: number) => {
    setCurrencyRates(rates.map((r) => (r.code === code ? { ...r, rateToToman } : r)));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="h-5 w-5 text-primary dark:text-neon-400" aria-hidden />
            تبدیل ارز
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="cur-amount">مبلغ</Label>
              <AmountInput id="cur-amount" value={amount} onChange={setAmount} />
              <Select value={from} onValueChange={setFrom}>
                <SelectTrigger aria-label="ارز مبدأ">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {rates.map((r) => (
                    <SelectItem key={r.code} value={r.code}>
                      {r.label} ({r.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="mx-auto rotate-90 sm:rotate-0"
              aria-label="جابه‌جایی ارزها"
              onClick={() => {
                setFrom(to);
                setTo(from);
              }}
            >
              <ArrowLeftRight className="h-5 w-5" />
            </Button>
            <div className="space-y-1.5">
              <Label>نتیجه</Label>
              <div
                className="flex h-12 items-center rounded-lg bg-muted/70 px-3 text-lg font-extrabold text-primary dark:text-neon-400"
                aria-live="polite"
              >
                {result === null ? '—' : formatDecimal(result, 2)}
              </div>
              <Select value={to} onValueChange={setTo}>
                <SelectTrigger aria-label="ارز مقصد">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {rates.map((r) => (
                    <SelectItem key={r.code} value={r.code}>
                      {r.label} ({r.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs leading-6 text-muted-foreground">
            آخرین به‌روزرسانی نرخ‌های پیش‌فرض:{' '}
            <b className="text-foreground">{CURRENCY_RATES_UPDATED_AT}</b> (بازار آزاد). برنامه
            آفلاین است و نرخ لحظه‌ای از اینترنت خوانده نمی‌شود؛ نرخ‌ها با هر انتشار تازه‌ی برنامه
            به‌روز می‌شوند و هر وقت خواستید می‌توانید دستی در جدول کناری اصلاحشان کنید. نرخ طلا و
            نقره برای «هر گرم» و سکه برای «هر قطعه» است.
          </p>
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">نرخ برابری ارزها (به تومان)</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {rates.map((rate) => (
              <li key={rate.code} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-sm">
                  {rate.label}
                  <span className="block text-[11px] text-muted-foreground" dir="ltr">
                    1 {rate.code} = {formatNumber(rate.rateToToman)} تومان
                  </span>
                </span>
                <AmountInput
                  aria-label={`نرخ ${rate.label} به تومان`}
                  value={rate.rateToToman}
                  onChange={(v) => updateRate(rate.code, v)}
                />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
