import { useMemo, useState, type FormEvent } from 'react';
import { Pencil, Plus, Tags, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Product } from '@/core/db/db';
import { toFaDigits } from '@/core/currency/currency';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CategoryDot, ColorPalette } from './CategoryBadge';
import {
  CATEGORY_COLORS,
  DEFAULT_CATEGORY_NAME,
  MAX_CATEGORY_NAME_LENGTH,
  categoryColor,
  normalizeCategoryName,
  sameCategory,
  type ProductCategory,
} from './product-categories';

interface ProductCategoriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ProductCategory[];
  products: Product[];
  add: (name: string, color: string) => Promise<void>;
  update: (id: string, name: string, color: string) => Promise<void>;
  remove: (id: string, fallback: string) => Promise<void>;
}

/** مدیریت دستهبندیهای انبار: ساخت با هر نام، تغییر نام، رنگ دلخواه و حذف امن */
export function ProductCategoriesDialog({
  open,
  onOpenChange,
  categories,
  products,
  add,
  update,
  remove,
}: ProductCategoriesDialogProps) {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(CATEGORY_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<string>(CATEGORY_COLORS[0]);
  const [deleting, setDeleting] = useState<ProductCategory | null>(null);
  const [busy, setBusy] = useState(false);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const category of categories) {
      map.set(
        category.id,
        products.filter((product) => sameCategory(product.category, category.name)).length,
      );
    }
    return map;
  }, [categories, products]);

  const fallbackFor = (category: ProductCategory): string =>
    categories.find((c) => c.id !== category.id)?.name ??
    (sameCategory(category.name, DEFAULT_CATEGORY_NAME) ? 'سایر' : DEFAULT_CATEGORY_NAME);

  const run = async (action: () => Promise<void>, successMessage: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      toast.success(successMessage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'انجام عملیات ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = (event: FormEvent) => {
    event.preventDefault();
    const name = normalizeCategoryName(newName);
    if (!name) {
      toast.error('نام دستهبندی را وارد کنید.');
      return;
    }
    void run(async () => {
      await add(name, newColor);
      setNewName('');
      setNewColor(categoryColor(categories.length + 1));
    }, 'دستهبندی اضافه شد.');
  };

  const handleUpdate = () => {
    if (!editingId) return;
    const id = editingId;
    void run(async () => {
      await update(id, editName, editColor);
      setEditingId(null);
    }, 'دستهبندی بهروز شد.');
  };

  const handleRemove = () => {
    if (!deleting) return;
    const category = deleting;
    void run(async () => {
      await remove(category.id, fallbackFor(category));
      setDeleting(null);
    }, 'دستهبندی حذف شد.');
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tags className="h-5 w-5" aria-hidden />
            مدیریت دستهبندیهای کالا
          </DialogTitle>
          <DialogDescription>
            هر نام دلخواهی میتوانید بسازید. تغییر نام یا رنگ، روی کالاهای همان دسته در انبار هم
            اعمال میشود.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleAdd} className="space-y-2 rounded-xl border bg-muted/30 p-3">
          <Label htmlFor="new-category-name">دسته‌ی جدید</Label>
          <div className="flex gap-2">
            <Input
              id="new-category-name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              maxLength={MAX_CATEGORY_NAME_LENGTH}
              placeholder="مثلاً قطعات یدکی، محصولات فصلی یا My Category"
              aria-label="نام دسته‌ی جدید"
            />
            <Button type="submit" variant="neon" disabled={busy}>
              <Plus aria-hidden />
              افزودن
            </Button>
          </div>
          <ColorPalette value={newColor} onChange={setNewColor} />
        </form>

        {deleting && (
          <div className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <p>
              دسته‌ی «<b>{deleting.name}</b>» حذف شود؟
              {(counts.get(deleting.id) ?? 0) > 0 && (
                <>
                  {' '}
                  {toFaDigits(String(counts.get(deleting.id)))} کالای آن به دسته‌ی «
                  <b>{fallbackFor(deleting)}</b>» منتقل میشوند.
                </>
              )}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" disabled={busy} onClick={handleRemove}>
                حذف دسته
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDeleting(null)}>
                انصراف
              </Button>
            </div>
          </div>
        )}

        <div className="max-h-[46dvh] space-y-1.5 overflow-y-auto">
          {categories.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              هنوز دستهای تعریف نشده؛ نام دلخواه خود را بالا بنویسید.
            </p>
          ) : (
            categories.map((category) =>
              editingId === category.id ? (
                <div key={category.id} className="space-y-2 rounded-xl border bg-muted/30 p-3">
                  <Input
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    maxLength={MAX_CATEGORY_NAME_LENGTH}
                    aria-label="نام تازه‌ی دستهبندی"
                    autoFocus
                  />
                  <ColorPalette value={editColor} onChange={setEditColor} />
                  <div className="flex gap-2">
                    <Button size="sm" variant="neon" disabled={busy} onClick={handleUpdate}>
                      ذخیره
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setEditingId(null)}
                    >
                      <X aria-hidden />
                      انصراف
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  key={category.id}
                  className="flex items-center gap-2 rounded-xl border px-3 py-2"
                >
                  <CategoryDot color={category.color} className="h-3 w-3" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {category.name}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {toFaDigits(String(counts.get(category.id) ?? 0))} کالا
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    disabled={busy}
                    aria-label={`ویرایش ${category.name}`}
                    onClick={() => {
                      setDeleting(null);
                      setEditingId(category.id);
                      setEditName(category.name);
                      setEditColor(category.color);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    disabled={busy}
                    aria-label={`حذف ${category.name}`}
                    onClick={() => {
                      setEditingId(null);
                      setDeleting(category);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ),
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
