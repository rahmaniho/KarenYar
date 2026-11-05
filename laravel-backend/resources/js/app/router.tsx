import { lazy, type ComponentType } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/layouts/AppLayout';
import { appBasename } from '@/lib/utils';

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
const NewInvoicePage = lazyPage(() => import('@/features/store/NewInvoicePage'), 'NewInvoicePage');
const IssuedInvoicesPage = lazyPage(
  () => import('@/features/store/IssuedInvoicesPage'),
  'IssuedInvoicesPage',
);
const InvoiceDashboardPage = lazyPage(
  () => import('@/features/store/InvoiceDashboardPage'),
  'InvoiceDashboardPage',
);
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

// زیرمسیر استقرار؛ در Laravel ریشه است. (BASE_URL به پوشه‌ی build اشاره می‌کند)
const basename = appBasename();

/**
 * پوسته‌ی مسیریابی کلاینت. از روتر اعلانی (BrowserRouter) استفاده می‌کنیم تا
 * نیازی به مرحله‌ی async «initialize» روتر داده‌ای نباشد و در بیلد تولید هم
 * صفحه‌ی اول بدون مکث رندر شود.
 */
export function AppRouter() {
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="store/pos" element={<PosPage />} />
          <Route path="store/inventory" element={<InventoryPage />} />
          <Route path="store/finance" element={<BusinessFinancePage />} />
          <Route path="store/products" element={<ProductsPage />} />
          <Route path="store/invoices" element={<Navigate to="/store/invoices/issued" replace />} />
          <Route path="store/invoices/dashboard" element={<InvoiceDashboardPage />} />
          <Route path="store/invoices/issued" element={<IssuedInvoicesPage />} />
          <Route path="store/invoices/new" element={<NewInvoicePage />} />
          <Route path="store/invoices/:id/edit" element={<NewInvoicePage />} />
          <Route path="store/invoices/:id" element={<InvoiceViewPage />} />
          <Route path="store/reports" element={<StoreReportsPage />} />
          <Route path="store/customers" element={<CustomersPage />} />
          <Route path="personal/transactions" element={<TransactionsPage />} />
          <Route path="personal/budgets" element={<BudgetsPage />} />
          <Route path="personal/debts" element={<DebtsPage />} />
          <Route path="payroll/employees" element={<EmployeesPage />} />
          <Route path="payroll/calculate" element={<PayrollCalculatePage />} />
          <Route path="payroll/settings" element={<PayrollSettingsPage />} />
          <Route path="calculator" element={<CalculatorPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="home" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
