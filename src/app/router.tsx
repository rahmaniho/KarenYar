import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '@/layouts/AppLayout';
import { DashboardPage } from '@/pages/DashboardPage';
import { ProductsPage } from '@/features/store/ProductsPage';
import { InvoicesPage } from '@/features/store/InvoicesPage';
import { NewInvoicePage } from '@/features/store/NewInvoicePage';
import { InvoiceViewPage } from '@/features/store/InvoiceViewPage';
import { StoreReportsPage } from '@/features/store/StoreReportsPage';
import { TransactionsPage } from '@/features/personal/TransactionsPage';
import { BudgetsPage } from '@/features/personal/BudgetsPage';
import { DebtsPage } from '@/features/personal/DebtsPage';
import { EmployeesPage } from '@/features/payroll/EmployeesPage';
import { PayrollCalculatePage } from '@/features/payroll/PayrollCalculatePage';
import { PayrollSettingsPage } from '@/features/payroll/PayrollSettingsPage';
import { CalculatorPage } from '@/features/calculator/CalculatorPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'store/products', element: <ProductsPage /> },
      { path: 'store/invoices', element: <InvoicesPage /> },
      { path: 'store/invoices/new', element: <NewInvoicePage /> },
      { path: 'store/invoices/:id', element: <InvoiceViewPage /> },
      { path: 'store/reports', element: <StoreReportsPage /> },
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
]);
