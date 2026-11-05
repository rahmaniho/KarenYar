import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db/db';
import { clearTestData } from '@/tests/store-fixtures';
import { recordCustomerPayment } from './customer-payment.service';

describe('دریافت عمومی از مشتری', () => {
  beforeEach(clearTestData);

  it('پرداخت را با رویداد مالی ثبت می‌کند و درآمد دوباره نمی‌سازد', async () => {
    const customerId = (await db.customers.add({
      name: 'مشتری',
      createdAt: '2026-10-01',
    })) as number;
    const id = await recordCustomerPayment({
      customerId,
      amountToman: 250_000,
      paymentKey: 'cp-1',
    });
    expect(id).toBeGreaterThan(0);
    expect(await db.customerPayments.count()).toBe(1);
    expect(await db.financialEvents.count()).toBe(1);
    expect(await db.transactions.count()).toBe(0);
    const again = await recordCustomerPayment({
      customerId,
      amountToman: 250_000,
      paymentKey: 'cp-1',
    });
    expect(again).toBe(id);
    expect(await db.customerPayments.count()).toBe(1);
  });

  it('کلید تکراری با مبلغ متفاوت و مشتری نامعتبر رد می‌شوند', async () => {
    const customerId = (await db.customers.add({
      name: 'مشتری',
      createdAt: '2026-10-01',
    })) as number;
    await recordCustomerPayment({ customerId, amountToman: 100, paymentKey: 'cp-2' });
    await expect(
      recordCustomerPayment({ customerId, amountToman: 200, paymentKey: 'cp-2' }),
    ).rejects.toThrow('مشخصات دیگری');
    await expect(
      recordCustomerPayment({ customerId: 999, amountToman: 100, paymentKey: 'cp-3' }),
    ).rejects.toThrow('مشتری پیدا نشد');
    await expect(
      recordCustomerPayment({ customerId, amountToman: 0, paymentKey: 'cp-4' }),
    ).rejects.toThrow('بزرگ‌تر از صفر');
    expect(await db.customerPayments.count()).toBe(1);
  });
});
