/** لایهٔ دسترسی دادهٔ پنل مدیریت — همهٔ درخواست‌ها از همین‌جا می‌گذرند. */
import { apiFetch } from '@/core/api/client';
import type {
  AdminCoupon,
  AdminOrder,
  AdminPlan,
  AdminStore,
  AuditEvent,
  DashboardData,
  ManagerAccount,
  PageMeta,
  Subscriber,
  SubscriberDetail,
} from './admin-types';

export interface ListResponse {
  meta: PageMeta;
}

const query = (params: Record<string, string | number | boolean | null | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const adminApi = {
  dashboard: () => apiFetch<DashboardData>('/api/manager/dashboard'),

  stores: (params: { q?: string; status?: string; page?: number; limit?: number; plan_code?: string }) =>
    apiFetch<{ stores: AdminStore[]; meta: PageMeta; totals: { active: number; archived: number; active_licenses: number } }>(
      `/api/manager/stores${query(params)}`,
    ),

  createStore: (payload: Record<string, unknown>) =>
    apiFetch<{ store: AdminStore }>('/api/manager/stores', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateStore: (id: number, payload: Record<string, unknown>) =>
    apiFetch<{ store: AdminStore }>(`/api/manager/stores/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  archiveStore: (id: number, reason?: string) =>
    apiFetch<{ archived: boolean }>(`/api/manager/stores/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ mode: 'archive', reason }),
    }),

  restoreStore: (id: number) =>
    apiFetch<{ store: AdminStore }>(`/api/manager/stores/${id}/restore`, { method: 'POST' }),

  purgeStore: (id: number, confirmName: string, reason?: string) =>
    apiFetch<{ purged: boolean }>(`/api/manager/stores/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ mode: 'purge', confirm_name: confirmName, reason }),
    }),

  orders: (params: { status?: string; q?: string; page?: number; limit?: number }) =>
    apiFetch<{
      orders: AdminOrder[];
      meta: PageMeta;
      totals: { pending: number; pending_amount: number; paid_this_month: number; revenue_this_month: number };
    }>(`/api/manager/orders${query(params)}`),

  approveOrder: (id: number, reference: string, note?: string) =>
    apiFetch<{ order: AdminOrder }>(`/api/manager/orders/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ reference, note }),
    }),

  rejectOrder: (id: number, reason: string) =>
    apiFetch<{ order: AdminOrder }>(`/api/manager/orders/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  voidOrder: (id: number, reason: string) =>
    apiFetch<{ order: AdminOrder }>(`/api/manager/orders/${id}/void`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  subscribers: (params: { q?: string; status?: string; plan_code?: string; page?: number; limit?: number }) =>
    apiFetch<{
      subscribers: Subscriber[];
      meta: PageMeta;
      stats: Record<string, number>;
    }>(`/api/manager/subscribers${query(params)}`),

  subscriber: (licenseId: number) => apiFetch<SubscriberDetail>(`/api/manager/subscribers/${licenseId}`),

  extendSubscriber: (licenseId: number, payload: { months: number; seats?: number | null; plan_code?: string | null; reason: string }) =>
    apiFetch<{ subscriber: Subscriber }>(`/api/manager/subscribers/${licenseId}/extend`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  setSubscriberStatus: (licenseId: number, status: 'active' | 'suspended' | 'canceled', reason: string) =>
    apiFetch<{ subscriber: Subscriber }>(`/api/manager/subscribers/${licenseId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, reason }),
    }),

  setSubscriberSeats: (licenseId: number, seats: number, reason: string) =>
    apiFetch<{ subscriber: Subscriber }>(`/api/manager/subscribers/${licenseId}/seats`, {
      method: 'POST',
      body: JSON.stringify({ seats, reason }),
    }),

  grantTrial: (storeId: number, days: number, seats: number) =>
    apiFetch<{ license: unknown }>('/api/manager/subscription/trial', {
      method: 'POST',
      body: JSON.stringify({ store_id: storeId, days, seats }),
    }),

  plans: () => apiFetch<{ plans: AdminPlan[] }>('/api/manager/plans'),

  savePlan: (payload: Record<string, unknown>, code?: string) =>
    code
      ? apiFetch<{ plan: AdminPlan }>(`/api/manager/plans/${code}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
      : apiFetch<{ plan: AdminPlan }>('/api/manager/plans', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),

  togglePlan: (code: string, isActive: boolean) =>
    apiFetch<{ plan: AdminPlan }>(`/api/manager/plans/${code}/toggle`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: isActive }),
    }),

  planPrices: (code: string) =>
    apiFetch<{ history: { base_monthly: number; extra_user_monthly: number; note: string | null; changed_at: string | null }[] }>(
      `/api/manager/plans/${code}/prices`,
    ),

  coupons: () => apiFetch<{ coupons: AdminCoupon[] }>('/api/manager/coupons'),

  saveCoupon: (payload: Record<string, unknown>, id?: number) =>
    id
      ? apiFetch<{ coupon: AdminCoupon }>(`/api/manager/coupons/${id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
      : apiFetch<{ coupon: AdminCoupon }>('/api/manager/coupons', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),

  deleteCoupon: (id: number) => apiFetch<{ ok: boolean }>(`/api/manager/coupons/${id}`, { method: 'DELETE' }),

  audit: (params: { action?: string; q?: string; store_id?: number; page?: number; limit?: number }) =>
    apiFetch<{ events: AuditEvent[]; meta: PageMeta }>(`/api/manager/audit${query(params)}`),

  auditActions: () => apiFetch<{ actions: { action: string; total: number }[] }>('/api/manager/audit/actions'),

  managers: () => apiFetch<{ managers: ManagerAccount[] }>('/api/manager/managers'),

  createManager: (payload: Record<string, unknown>) =>
    apiFetch<{ manager: ManagerAccount }>('/api/manager/managers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateManager: (id: number, payload: Record<string, unknown>) =>
    apiFetch<{ manager: ManagerAccount }>(`/api/manager/managers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deactivateManager: (id: number) =>
    apiFetch<{ manager: ManagerAccount }>(`/api/manager/managers/${id}`, { method: 'DELETE' }),
};
