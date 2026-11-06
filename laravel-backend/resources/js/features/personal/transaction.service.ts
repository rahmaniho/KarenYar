import { db, nowISO, type Transaction } from '@/core/db/db';

type ManualTransactionInput = Pick<
  Transaction,
  'type' | 'category' | 'amount' | 'date' | 'description'
> & { source?: 'manual' | 'business' };

/** سطر درآمد فروش متعلق به فاکتور است و نباید مستقل از آن تغییر کند. */
export async function saveManualTransaction(
  input: ManualTransactionInput,
  id?: number,
): Promise<void> {
  if (
    !Number.isSafeInteger(input.amount) ||
    input.amount <= 0 ||
    !input.category.trim() ||
    !Number.isFinite(new Date(input.date).getTime()) ||
    !['income', 'expense'].includes(input.type)
  ) {
    throw new Error('مبلغ، نوع، دسته‌بندی یا تاریخ تراکنش معتبر نیست.');
  }
  await db.transaction('rw', db.transactions, async () => {
    const existing = id != null ? await db.transactions.get(id) : undefined;
    if (id != null && !existing) throw new Error('تراکنش پیدا نشد.');
    if (existing?.source === 'sale')
      throw new Error('درآمد فروش فقط از طریق ابطال فاکتور قابل اصلاح است.');
    if (id != null)
      await db.transactions.update(id, {
        ...input,
        source: existing?.source ?? input.source ?? 'manual',
      });
    else
      await db.transactions.add({
        ...input,
        source: input.source ?? 'manual',
        createdAt: nowISO(),
      });
  });
}

export async function deleteManualTransaction(id: number): Promise<void> {
  await db.transaction('rw', db.transactions, async () => {
    const existing = await db.transactions.get(id);
    if (existing?.source === 'sale')
      throw new Error('درآمد خودکار فروش را از طریق فاکتور اصلاح کنید.');
    await db.transactions.delete(id);
  });
}
