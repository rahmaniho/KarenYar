import type { Ref } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { CategoryDot } from './CategoryBadge';
import {
  colorForCategory,
  normalizeCategoryName,
  sameCategory,
  type ProductCategory,
} from './product-categories';

interface ProductCategoryFieldProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  inputRef?: Ref<HTMLInputElement>;
  categories: ProductCategory[];
  error?: string;
}

const QUICK_PICK_COUNT = 6;

/**
 * فیلد دستهبندی هنگام ورود کالا:
 * انتخاب سریع از دستههای تعریفشده **یا** تایپ هر نام دلخواه (بهصورت خودکار ثبت میشود).
 */
export function ProductCategoryField({
  value,
  onChange,
  onBlur,
  inputRef,
  categories,
  error,
}: ProductCategoryFieldProps) {
  const matchedColor = colorForCategory(categories, value);
  const typed = normalizeCategoryName(value);
  const isNew = typed.length > 0 && !categories.some((c) => sameCategory(c.name, typed));

  return (
    <div className="space-y-1.5">
      <Label htmlFor="p-category">دستهبندی *</Label>
      <div className="relative">
        <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2">
          <CategoryDot color={matchedColor} />
        </span>
        <Input
          id="p-category"
          list="p-categories"
          className="ps-9"
          placeholder="انتخاب یا نام دلخواه…"
          maxLength={60}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          ref={inputRef}
          aria-invalid={!!error}
          aria-describedby="p-category-hint"
        />
      </div>
      <datalist id="p-categories">
        {categories.map((category) => (
          <option key={category.id} value={category.name} />
        ))}
      </datalist>

      {categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {categories.slice(0, QUICK_PICK_COUNT).map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => onChange(category.name)}
              aria-pressed={sameCategory(value, category.name)}
              className={cn(
                'rounded-lg border px-2 py-1 text-xs transition hover:bg-secondary',
                sameCategory(value, category.name)
                  ? 'border-primary/50 bg-secondary font-semibold'
                  : 'border-border text-muted-foreground',
              )}
            >
              <span className="flex items-center gap-1.5">
                <CategoryDot color={category.color} className="h-2 w-2" />
                {category.name}
              </span>
            </button>
          ))}
          {categories.length > QUICK_PICK_COUNT && (
            <span className="text-xs text-muted-foreground">
              +{(categories.length - QUICK_PICK_COUNT).toLocaleString('fa-IR')} دسته‌ی دیگر
            </span>
          )}
        </div>
      )}

      <p id="p-category-hint" className="text-xs leading-5 text-muted-foreground">
        {isNew ? <>«{typed}» بهعنوان یک دسته‌ی تازه ذخیره میشود. </> : null}
        هر نام دلخواهی مجاز است؛ نام و رنگ دستهها از دکمه‌ی «دستهبندیها» قابل تغییر است.
      </p>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
