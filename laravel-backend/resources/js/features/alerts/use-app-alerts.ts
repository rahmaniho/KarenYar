import { useMemo } from 'react';
import { useLiveQuery } from '@/core/db/use-live-query';
import {
  db,
  type Budget,
  type Customer,
  type CustomerPayment,
  type Debt,
  type Invoice,
  type Product,
  type Transaction,
} from '@/core/db/db';
import { computeAlerts, type AppAlert } from './alerts';

/**
 * تنها منبع هشدارهای واقعی برنامه (همان داده‌های Dexie که زنگوله‌ی هدر استفاده می‌کند).
 * هیچ اعلان ساختگی تولید نمی‌شود — خروجی مستقیم `computeAlerts` است.
 */
export function useAppAlerts(): AppAlert[] {
  const products = useLiveQuery(() => db.products.toArray(), [], [] as Product[]);
  const debts = useLiveQuery(() => db.debts.toArray(), [], [] as Debt[]);
  const budgets = useLiveQuery(() => db.budgets.toArray(), [], [] as Budget[]);
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], [] as Transaction[]);
  const invoices = useLiveQuery(() => db.invoices.toArray(), [], [] as Invoice[]);
  const customerPayments = useLiveQuery(
    () => db.customerPayments.toArray(),
    [],
    [] as CustomerPayment[],
  );
  const customers = useLiveQuery(() => db.customers.toArray(), [], [] as Customer[]);

  return useMemo(
    () =>
      computeAlerts({
        products,
        debts,
        budgets,
        transactions,
        invoices,
        customerPayments,
        customers,
      }),
    [products, debts, budgets, transactions, invoices, customerPayments, customers],
  );
}
