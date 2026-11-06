import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { appBasename } from '@/lib/utils';
import { AdminShell } from './AdminShell';
import { DashboardPage } from './DashboardPage';
import { StoresPage } from './StoresPage';
import { SubscribersPage } from './SubscribersPage';
import { OrdersPage } from './OrdersPage';
import { PlansPage } from './PlansPage';
import { CouponsPage } from './CouponsPage';
import { AuditPage } from './AuditPage';
import { ManagersPage } from './ManagersPage';

/**
 * پنل مدیریت کارو — برنامهٔ مستقل با مسیرهای اختصاصی.
 *
 * مسیرها زیر `/admin` هستند تا بتوان مستقیم به هر بخش لینک داد
 * (`/admin/subscribers?license=12`). کاربر مدیر در ریشه هم به داشبورد می‌رسد.
 */
export function AdminApp() {
  return (
    <BrowserRouter basename={appBasename()}>
      <Routes>
        <Route path="/admin" element={<AdminShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="stores" element={<StoresPage />} />
          <Route path="subscribers" element={<SubscribersPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="plans" element={<PlansPage />} />
          <Route path="coupons" element={<CouponsPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="managers" element={<ManagersPage />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
