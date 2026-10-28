import { lazy, type ComponentType } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '@/layouts/AppLayout';

/**
 * همه‌ی صفحه‌ها به‌صورت تنبل (Lazy) بارگذاری می‌شوند تا باندل اولیه سبک بماند
 * و فقط کد همان بخش هنگام ورود دانلود/اجرا شود (مهم برای Lighthouse و موبایل).
 */
function lazyPage(loader: () => Promise<Record<string, ComponentType>>, exportName: string) {
  return lazy(async () => ({ default: (await loader())[exportName] }));
}

const DashboardPage = lazyPage(() => import('@/pages/DashboardPage'), 'DashboardPage');
const SettingsPage = lazyPage(() => import('@/pages/SettingsPage'), 'SettingsPage');
const NotFoundPage = lazyPage(() => import('@/pages/NotFoundPage'), 'NotFoundPage');
const PosPage = lazyPage(() => import('@/features/store/PosPage'), 'PosPage');
const InventoryPage = lazyPage(() => import('@/features/store/InventoryPage'), 'InventoryPage');
const BusinessFinancePage = lazyPage(
  () => import('@/features/store/BusinessFinancePage'),
  'BusinessFinancePage',
);
const ProductsPage = lazyPage(() => import('@/features/store/ProductsPage'), 'ProductsPage');
const InvoicesPage = lazyPage(() => import('@/features/store/InvoicesPage'), 'InvoicesPage');
const NewInvoicePage = lazyPage(() => import('@/features/store/NewInvoicePage'), 'NewInvoicePage');
const InvoiceViewPage = lazyPage(
  () => import('@/features/store/InvoiceViewPage'),
  'InvoiceViewPage',
);
const StoreReportsPage = lazyPage(
  () => import('@/features/store/StoreReportsPage'),
  'StoreReportsPage',
);
const CustomersPage = lazyPage(() => import('@/features/store/CustomersPage'), 'CustomersPage');
const TransactionsPage = lazyPage(
  () => import('@/features/personal/TransactionsPage'),
  'TransactionsPage',
);
const BudgetsPage = lazyPage(() => import('@/features/personal/BudgetsPage'), 'BudgetsPage');
const DebtsPage = lazyPage(() => import('@/features/personal/DebtsPage'), 'DebtsPage');
const EmployeesPage = lazyPage(() => import('@/features/payroll/EmployeesPage'), 'EmployeesPage');
const PayrollCalculatePage = lazyPage(
  () => import('@/features/payroll/PayrollCalculatePage'),
  'PayrollCalculatePage',
);
const PayrollSettingsPage = lazyPage(
  () => import('@/features/payroll/PayrollSettingsPage'),
  'PayrollSettingsPage',
);
const CalculatorPage = lazyPage(
  () => import('@/features/calculator/CalculatorPage'),
  'CalculatorPage',
);

// زیرمسیر استقرار (مثلاً /KarenYar/ در GitHub Pages)؛ در ریشه همان '/' است.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

export const router = createBrowserRouter(
  [
    {
      element: <AppLayout />,
      children: [
        { index: true, element: <DashboardPage /> },
        { path: 'store/pos', element: <PosPage /> },
        { path: 'store/inventory', element: <InventoryPage /> },
        { path: 'store/finance', element: <BusinessFinancePage /> },
        { path: 'store/products', element: <ProductsPage /> },
        { path: 'store/invoices', element: <InvoicesPage /> },
        { path: 'store/invoices/new', element: <NewInvoicePage /> },
        { path: 'store/invoices/:id', element: <InvoiceViewPage /> },
        { path: 'store/reports', element: <StoreReportsPage /> },
        { path: 'store/customers', element: <CustomersPage /> },
        { path: 'personal/transactions', element: <TransactionsPage /> },
        { path: 'personal/budgets', element: <BudgetsPage /> },
        { path: 'personal/debts', element: <DebtsPage /> },
        { path: 'payroll/employees', element: <EmployeesPage /> },
        { path: 'payroll/calculate', element: <PayrollCalculatePage /> },
        { path: 'payroll/settings', element: <PayrollSettingsPage /> },
        { path: 'calculator', element: <CalculatorPage /> },
        { path: 'settings', element: <SettingsPage /> },
        { path: 'home', element: <Navigate to="/" replace /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  { basename },
);
