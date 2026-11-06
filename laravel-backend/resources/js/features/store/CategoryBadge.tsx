import { cn } from '@/lib/utils';
import { CATEGORY_COLORS } from './product-categories';

/** نقطهی رنگ دسته — در فیلترها، جدولها و دکمهها */
export function CategoryDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full', className)}
      style={{ backgroundColor: color, boxShadow: `0 0 0 2px ${color}26` }}
    />
  );
}

/** برچسب دستهبندی کالا */
export function CategoryTag({
  name,
  color,
  className,
}: {
  name: string;
  color: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-medium',
        className,
      )}
      style={{ borderColor: `${color}59`, backgroundColor: `${color}1a` }}
    >
      <CategoryDot color={color} className="h-2 w-2" />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** انتخابگر رنگ دلخواه برای شخصیسازی دسته */
export function ColorPalette({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div role="group" aria-label="رنگ دستهبندی" className="flex flex-wrap gap-1.5">
      {CATEGORY_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          aria-label={`انتخاب رنگ ${color}`}
          aria-pressed={value === color}
          className={cn(
            'h-6 w-6 rounded-full border-2 transition hover:scale-110',
            value === color ? 'scale-110 border-foreground' : 'border-transparent',
          )}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}
