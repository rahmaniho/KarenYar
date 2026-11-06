import { useMemo, useState } from 'react';
import { ArrowLeftRight, Ruler } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UNIT_CATEGORIES, convertUnits } from '@/core/calc/units';
import { formatDecimal } from '@/core/currency/currency';

/** تبدیل واحد (طول، وزن، سطح، حجم، دما) */
export function UnitConverter() {
  const [categoryId, setCategoryId] = useState('length');
  const category = UNIT_CATEGORIES.find((c) => c.id === categoryId) ?? UNIT_CATEGORIES[0];
  const [from, setFrom] = useState('m');
  const [to, setTo] = useState('cm');
  const [value, setValue] = useState('1');

  const result = useMemo(() => {
    const num = Number(value);
    if (!Number.isFinite(num) || value.trim() === '') return null;
    try {
      return convertUnits(num, categoryId, from, to);
    } catch {
      return null;
    }
  }, [value, categoryId, from, to]);

  const changeCategory = (id: string) => {
    const next = UNIT_CATEGORIES.find((c) => c.id === id) ?? UNIT_CATEGORIES[0];
    setCategoryId(id);
    setFrom(next.units[0].id);
    setTo(next.units[1]?.id ?? next.units[0].id);
  };

  const fromLabel = category.units.find((u) => u.id === from)?.label;
  const toLabel = category.units.find((u) => u.id === to)?.label;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Ruler className="h-5 w-5 text-primary dark:text-neon-400" aria-hidden />
          تبدیل واحد
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="دسته‌ی واحد">
          {UNIT_CATEGORIES.map((c) => (
            <Button
              key={c.id}
              size="sm"
              variant={c.id === categoryId ? 'default' : 'outline'}
              onClick={() => changeCategory(c.id)}
              aria-pressed={c.id === categoryId}
            >
              {c.label}
            </Button>
          ))}
        </div>

        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="unit-value">مقدار ({fromLabel})</Label>
            <Input
              id="unit-value"
              inputMode="decimal"
              dir="ltr"
              className="text-left text-lg font-bold"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger aria-label="واحد مبدأ">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {category.units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            size="icon"
            className="mx-auto rotate-90 sm:rotate-0"
            aria-label="جابه‌جایی واحدها"
            onClick={() => {
              setFrom(to);
              setTo(from);
            }}
          >
            <ArrowLeftRight className="h-5 w-5" />
          </Button>

          <div className="space-y-1.5">
            <Label>نتیجه ({toLabel})</Label>
            <div
              className="flex h-12 items-center rounded-lg bg-muted/70 px-3 text-lg font-extrabold text-primary dark:text-neon-400"
              dir="ltr"
              aria-live="polite"
            >
              {result === null ? '—' : formatDecimal(result, 6)}
            </div>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger aria-label="واحد مقصد">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {category.units.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
