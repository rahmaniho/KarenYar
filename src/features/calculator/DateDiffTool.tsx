import { useMemo, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { JalaliDateInput } from '@/components/JalaliDateInput';
import { diffJalali, formatJalaliFull } from '@/core/jalali/jalali';
import { formatNumber } from '@/core/currency/currency';

/** تاریخ‌شمار — تفاضل دو تاریخ شمسی */
export function DateDiffTool() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString();
  });
  const [to, setTo] = useState(() => new Date().toISOString());

  const diff = useMemo(() => {
    const a = new Date(from);
    const b = new Date(to);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
    return b >= a ? diffJalali(a, b) : diffJalali(b, a);
  }, [from, to]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarRange className="h-5 w-5 text-primary dark:text-neon-400" aria-hidden />
          تاریخ‌شمار (تفاضل دو تاریخ شمسی)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="dd-from">از تاریخ</Label>
            <JalaliDateInput id="dd-from" value={from} onChange={setFrom} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dd-to">تا تاریخ</Label>
            <JalaliDateInput id="dd-to" value={to} onChange={setTo} />
          </div>
        </div>

        {diff && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-live="polite">
            {[
              { label: 'سال', value: diff.years },
              { label: 'ماه', value: diff.months },
              { label: 'روز', value: diff.days },
              { label: 'مجموع روزها', value: diff.totalDays },
            ].map((item) => (
              <div key={item.label} className="rounded-xl bg-muted/60 p-4 text-center">
                <p className="text-2xl font-extrabold text-primary dark:text-neon-400">
                  {formatNumber(item.value)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          از {formatJalaliFull(new Date(from))} تا {formatJalaliFull(new Date(to))}
        </p>
      </CardContent>
    </Card>
  );
}
