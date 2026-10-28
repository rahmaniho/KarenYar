/**
 * محاسبه‌ی هشدارهای برنامه (تابع خالص) — برای زنگوله‌ی هدر و داشبورد:
 * بدهیِ سررسیدگذشته، فروش نسیه‌ی معوق، موجودی کم و بودجه‌ی ردشده از سقف.
 */
import type {
  Budget,
  Customer,
  CustomerPayment,
  Debt,
  Invoice,
  Product,
  Transaction,
} from '@/core/db/db';
import { jalaliMonthKey } from '@/core/jalali/jalali';
import { budgetStatus, debtStatus } from '@/features/personal/personal-calc';
import { customerBalance } from '@/features/store/customers-calc';

export type AlertKind =
  'debt-overdue' | 'debt-soon' | 'credit-overdue' | 'low-stock' | 'budget-over';

export interface AppAlert {
  id: string;
  kind: AlertKind;
  severity: 'danger' | 'warning';
  title: string;
  description?: string;
  /** مسیر مقصد هنگام کلیک */
  to: string;
}

export interface AlertsInput {
  now?: Date;
  products: Product[];
  debts: Debt[];
  budgets: Budget[];
  transactions: Transaction[];
  invoices: Invoice[];
  customerPayments: CustomerPayment[];
  customers: Customer[];
  /** چند روز بعد از فروش نسیه، «معوق» محسوب شود */
  creditOverdueDays?: number;
}

function daysBetween(fromIso: string, now: Date): number {
  const from = new Date(fromIso);
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function computeAlerts(input: AlertsInput): AppAlert[] {
  const now = input.now ?? new Date();
  const alerts: AppAlert[] = [];

  // بدهی‌ها و وام‌ها
  for (const debt of input.debts) {
    const status = debtStatus(debt, now);
    if (status.isSettled) continue;
    if (status.isOverdue) {
      alerts.push({
        id: `debt-overdue-${debt.id}`,
        kind: 'debt-overdue',
        severity: 'danger',
        title: `بدهی سررسیدگذشته: ${debt.title}`,
        description: `${Math.abs(status.daysToDue).toLocaleString('fa-IR')} روز از سررسید گذشته است.`,
        to: '/personal/debts',
      });
    } else if (status.daysToDue <= 3) {
      alerts.push({
        id: `debt-soon-${debt.id}`,
        kind: 'debt-soon',
        severity: 'warning',
        title: `سررسید نزدیک: ${debt.title}`,
        description:
          status.daysToDue === 0
            ? 'سررسید امروز است.'
            : `فقط ${status.daysToDue.toLocaleString('fa-IR')} روز مانده است.`,
        to: '/personal/debts',
      });
    }
  }

  // فروش نسیه‌ی معوق مشتریان
  const overdueDays = input.creditOverdueDays ?? 7;
  for (const customer of input.customers) {
    if (customer.id === undefined) continue;
    const { balance } = customerBalance(customer.id, input.invoices, input.customerPayments);
    if (balance <= 0) continue;
    const creditInvoices = input.invoices
      .filter((inv) => inv.customerId === customer.id && inv.isCredit && inv.status !== 'voided')
      .sort((a, b) => a.date.localeCompare(b.date));
    const oldest = creditInvoices[0];
    if (!oldest) continue;
    const ageDays = daysBetween(oldest.date, now);
    if (ageDays >= overdueDays) {
      alerts.push({
        id: `credit-overdue-${customer.id}`,
        kind: 'credit-overdue',
        severity: 'danger',
        title: `نسیه‌ی معوق: ${customer.name}`,
        description: `${ageDays.toLocaleString('fa-IR')} روز از قدیمی‌ترین فاکتور نسیه گذشته و هنوز تسویه نشده است.`,
        to: '/store/customers',
      });
    }
  }

  // موجودی کم
  for (const product of input.products) {
    if (product.stock <= product.minStock) {
      alerts.push({
        id: `low-stock-${product.id}`,
        kind: 'low-stock',
        severity: product.stock <= 0 ? 'danger' : 'warning',
        title: `موجودی کم: ${product.name}`,
        description: `فقط ${product.stock.toLocaleString('fa-IR')} ${product.unit} مانده است.`,
        to: '/store/products',
      });
    }
  }

  // بودجه‌ها — فقط بودجه‌ی ماه جاری هشدار می‌دهد (بودجه‌ی ماه‌های قبل تاریخ گذشته است)
  const currentMonth = jalaliMonthKey(now);
  for (const budget of input.budgets) {
    if (budget.month !== currentMonth) continue;
    const status = budgetStatus(budget, input.transactions);
    if (status.isOver) {
      alerts.push({
        id: `budget-over-${budget.id}`,
        kind: 'budget-over',
        severity: 'danger',
        title: `بودجه‌ی «${budget.category}» از سقف رد شد`,
        description: `درصد مصرف: ${Math.round(status.percent).toLocaleString('fa-IR')}٪`,
        to: '/personal/budgets',
      });
    }
  }

  // خطرناک‌ها اول
  return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'danger' ? -1 : 1));
}
