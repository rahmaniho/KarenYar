import { db, nowISO, type Product, type StockMovementType } from '@/core/db/db';
import { roundStock } from './invoice.service';

export const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  opening: 'موجودی اولیه',
  sale: 'فروش',
  void: 'برگشت ابطال',
  restock: 'ورود انبار',
  adjustment: 'اصلاح موجودی',
};

export async function changeStock(
  productId: number,
  quantity: number,
  type: 'restock' | 'adjustment',
  note: string,
): Promise<void> {
  if (!Number.isFinite(quantity) || roundStock(quantity) === 0 || Math.abs(quantity) > 1_000_000)
    throw new Error('مقدار تغییر موجودی معتبر نیست.');
  if (Math.abs(roundStock(quantity) - quantity) > 1e-10)
    throw new Error('مقدار موجودی حداکثر شش رقم اعشار می‌تواند داشته باشد.');
  if (type === 'restock' && quantity <= 0) throw new Error('مقدار ورود به انبار باید مثبت باشد.');
  if (note.trim().length < 3) throw new Error('شرح تغییر موجودی را با حداقل ۳ نویسه وارد کنید.');
  await db.transaction('rw', db.products, db.stockMovements, async () => {
    const product = await db.products.get(productId);
    if (!product) throw new Error('کالا پیدا نشد.');
    const stockAfter = roundStock(product.stock + quantity);
    if (stockAfter < 0) throw new Error('موجودی نمی‌تواند منفی شود؛ مقدار خروج بیش از موجودی است.');
    const now = nowISO();
    await db.products.update(productId, { stock: stockAfter, updatedAt: now });
    await db.stockMovements.add({
      productId,
      productName: product.name,
      type,
      quantity: roundStock(quantity),
      stockBefore: product.stock,
      stockAfter,
      note: note.trim(),
      createdAt: now,
    });
  });
}

/** تغییر موجودی از فرم کالا هم باید در دفتر انبار ثبت شود. */
export async function saveProduct(
  payload: Omit<Product, 'id' | 'createdAt'>,
  id?: number,
  expectedStock?: number,
): Promise<number> {
  for (const value of [payload.stock, payload.minStock]) {
    if (!Number.isFinite(value) || value < 0 || value > 1_000_000_000)
      throw new Error('موجودی کالا باید عدد معتبر و غیرمنفی باشد.');
    if (Math.abs(roundStock(value) - value) > 1e-10)
      throw new Error('مقدار موجودی حداکثر شش رقم اعشار می‌تواند داشته باشد.');
  }
  for (const value of [
    payload.sellPrice,
    payload.buyPrice,
    payload.costPrice,
    payload.shippingPerUnit,
    payload.overheadPerUnit,
  ]) {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new Error('قیمت و هزینهٔ کالا باید تومان صحیح، معتبر و غیرمنفی باشد.');
  }
  if (
    !Number.isFinite(payload.buyTaxPercent) ||
    payload.buyTaxPercent < 0 ||
    payload.buyTaxPercent > 100
  )
    throw new Error('مالیات خرید باید بین صفر و صد درصد باشد.');
  return db.transaction('rw', db.products, db.stockMovements, async () => {
    const existing = id != null ? await db.products.get(id) : undefined;
    if (id != null && !existing) throw new Error('کالا حذف شده است؛ فهرست را تازه کنید.');
    if (payload.barcode) {
      const duplicate = await db.products.where('barcode').equals(payload.barcode).first();
      if (duplicate && duplicate.id !== id)
        throw new Error(`این بارکد برای «${duplicate.name}» ثبت شده است.`);
    }
    let stock = roundStock(payload.stock);
    if (existing && expectedStock !== undefined) {
      if (payload.stock === expectedStock) stock = existing.stock;
      else if (existing.stock !== expectedStock)
        throw new Error('موجودی حین ویرایش تغییر کرده است؛ فرم کالا را دوباره باز کنید.');
    }
    const now = nowISO();
    const productId = (existing?.id ??
      (await db.products.add({ ...payload, stock, createdAt: now, updatedAt: now }))) as number;
    if (existing) await db.products.update(productId, { ...payload, stock, updatedAt: now });
    const before = existing?.stock ?? 0;
    if (stock !== before) {
      await db.stockMovements.add({
        productId,
        productName: payload.name,
        type: existing ? 'adjustment' : 'opening',
        quantity: roundStock(stock - before),
        stockBefore: before,
        stockAfter: stock,
        note: existing ? 'اصلاح از فرم کالا' : 'ثبت موجودی اولیه کالا',
        createdAt: now,
      });
    }
    return productId;
  });
}

export async function deleteProduct(productId: number): Promise<void> {
  await db.transaction('rw', db.products, db.invoiceItems, async () => {
    if (await db.invoiceItems.where('productId').equals(productId).count()) {
      throw new Error(
        'این کالا سابقهٔ فروش دارد و برای حفظ سوابق و امکان برگشت موجودی قابل حذف نیست.',
      );
    }
    await db.products.delete(productId);
  });
}
