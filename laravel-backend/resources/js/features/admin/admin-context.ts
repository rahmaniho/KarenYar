import { useOutletContext } from 'react-router-dom';
import type { DashboardData } from './admin-types';

export interface AdminOutletContext {
  dashboard: DashboardData | null;
  dashboardLoading: boolean;
  reloadDashboard: (silent?: boolean) => Promise<void>;
}

export function useAdminContext(): AdminOutletContext {
  return useOutletContext<AdminOutletContext>();
}
