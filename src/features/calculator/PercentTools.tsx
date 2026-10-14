import { useState } from 'react';
import { Percent } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { AmountInput } from '@/components/AmountInput';
import { Input } from '@/components/ui/input';
import { applyDiscount, percentOf } from '@/core/calc/finance';
import { formatDecimal, formatMoney } from '@/core/currency/currency';
import { useSettingsStore } from '@/store/settings-store';

function ResultRow({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          bold ? 'text-base font-extrabold text-primary dark:text-neon-400' : 'font-semibold'
        }
      >
        {value}
      </span>
    </div>
  );
}

/** ابزارهای درصدی: درصد از عدد، تغییر درصدی، قیمت بعد از تخفیف */
export function PercentTools() {
  const unit = useSettingsStore((s) => s.currencyUnit);
  const [base, setBase] = useState(0);
  const [pct, setPct] = useState(0);
  const [oldValue, setOldValue] = useState(0);
  const [newValue, setNewValue] = useState(0);
  const [price, setPrice] = useState(0);
  const [discountPct, setDiscountPct] = useState(0);

  const changePct = oldValue !== 0 ? ((newValue - oldValue) / Math.abs(oldValue)) * 100 : 0;
  const discount = applyDiscount(price, 'percent', discountPct);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Percent className="h-5 w-5 text-primary dark:text-neon-400" aria-hidden />
            چند درصد از یک عدد
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pct-base">عدد</Label>
            <AmountInput id="pct-base" value={base} onChange={setBase} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pct-value">درصد</Label>
            <Input
              id="pct-value"
              inputMode="decimal"
              dir="ltr"
              className="text-left"
              value={pct || ''}
              onChange={(e) => setPct(Number(e.target.value) || 0)}
              placeholder="٪"
            />
          </div>
          <ResultRow
            label="نتیجه"
            value={formatMoney(Math.round(percentOf(base, pct)), unit)}
            bold
          />
          <ResultRow
            label="عدد + درصد"
            value={formatMoney(Math.round(base + percentOf(base, pct)), unit)}
          />
          <ResultRow
            label="عدد − درصد"
            value={formatMoney(Math.round(base - percentOf(base, pct)), unit)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">تغییر درصدی</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="chg-old">مقدار قبلی</Label>
            <AmountInput id="chg-old" value={oldValue} onChange={setOldValue} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="chg-new">مقدار جدید</Label>
            <AmountInput id="chg-new" value={newValue} onChange={setNewValue} />
          </div>
          <ResultRow
            label="درصد تغییر"
            value={`${changePct >= 0 ? '+' : ''}${formatDecimal(changePct)}٪`}
            bold
          />
          <ResultRow label="اختلاف" value={formatMoney(newValue - oldValue, unit)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">قیمت بعد از تخفیف</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="dsc-price">قیمت اصلی</Label>
            <AmountInput id="dsc-price" value={price} onChange={setPrice} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dsc-pct">درصد تخفیف</Label>
            <Input
              id="dsc-pct"
              inputMode="decimal"
              dir="ltr"
              className="text-left"
              value={discountPct || ''}
              onChange={(e) => setDiscountPct(Number(e.target.value) || 0)}
              placeholder="٪"
            />
          </div>
          <ResultRow label="مبلغ تخفیف" value={formatMoney(discount.discountAmount, unit)} />
          <ResultRow label="قیمت نهایی" value={formatMoney(discount.finalPrice, unit)} bold />
        </CardContent>
      </Card>
    </div>
  );
}
