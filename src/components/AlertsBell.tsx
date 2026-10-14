import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Bell,
  BellRing,
  CalendarClock,
  Contact,
  PackageX,
  PiggyBank,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
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
import { toFaDigits } from '@/core/currency/currency';
import { computeAlerts, type AlertKind } from '@/features/alerts/alerts';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const KIND_ICONS: Record<AlertKind, typeof TriangleAlert> = {
  'debt-overdue': CalendarClock,
  'debt-soon': CalendarClock,
  'credit-overdue': Contact,
  'low-stock': PackageX,
  'budget-over': PiggyBank,
};

/** زنگوله‌ی هشدارهای هدر: بدهی معوق، نسیه‌ی معوق، موجودی کم و بودجه‌ی ردشده */
export function AlertsBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

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

  const alerts = useMemo(
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

  const dangerCount = alerts.filter((a) => a.severity === 'danger').length;

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={alerts.length ? `${toFaDigits(String(alerts.length))} هشدار` : 'هشدارها'}
        >
          {alerts.length ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
          {alerts.length > 0 && (
            <span
              className={cn(
                'absolute -top-0.5 -end-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white',
                dangerCount > 0 ? 'bg-destructive' : 'bg-warning text-warning-foreground',
              )}
            >
              {toFaDigits(String(alerts.length))}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            هشدارها
            <span className="ms-2 text-xs font-normal text-muted-foreground">
              {alerts.length
                ? `${toFaDigits(String(alerts.length))} مورد نیازمند توجه است.`
                : 'همه‌چیز مرتب است.'}
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[55dvh] overflow-y-auto">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <ShieldCheck className="h-10 w-10 text-success-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">
                هشداری ندارید؛ بدهی معوق، موجودی کم یا بودجه‌ی ردشده‌ای نیست.
              </p>
            </div>
          ) : (
            <ul className="space-y-1">
              {alerts.map((alert) => {
                const Icon = KIND_ICONS[alert.kind];
                return (
                  <li key={alert.id}>
                    <button
                      className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-start transition hover:bg-secondary"
                      onClick={() => go(alert.to)}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                          alert.severity === 'danger'
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-warning/15 text-warning-foreground',
                        )}
                      >
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{alert.title}</span>
                        {alert.description && (
                          <span className="block text-xs text-muted-foreground">
                            {alert.description}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
