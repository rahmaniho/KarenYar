import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  dashboard: vi.fn(),
  audit: vi.fn(),
  auditActions: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('./admin-api', () => ({ adminApi: api }));

import { AdminShell } from './AdminShell';
import { AuditPage } from './AuditPage';
import { DashboardPage } from './DashboardPage';

const events = [
  {
    id: 5,
    action: 'order_voided',
    userName: 'مدیر کل',
    storeName: 'فروشگاه نمونه',
    subjectType: 'order',
    subjectKey: '21',
    meta: { reason: 'پرداخت تکراری', amount: 1_440_000 },
    ip: '10.0.0.5',
    createdAt: '2026-11-05T12:00:00+03:30',
  },
];

function renderAudit() {
  return render(
    <MemoryRouter initialEntries={['/admin/audit']}>
      <Routes>
        <Route path="/admin" element={<AdminShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="audit" element={<AuditPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AuditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.dashboard.mockResolvedValue(null);
    api.audit.mockResolvedValue({ events, meta: { page: 1, per_page: 25, total: 1, last_page: 1 } });
    api.auditActions.mockResolvedValue({ actions: [{ action: 'order_voided', total: 1 }] });
  });

  it('برچسب فارسی رویداد و نام کاربر را نشان می‌دهد', async () => {
    renderAudit();

    expect(await screen.findByText('ابطال پرداخت')).toBeInTheDocument();
    expect(screen.getByText('مدیر کل')).toBeInTheDocument();
    expect(screen.getAllByText(/فروشگاه نمونه/).length).toBeGreaterThan(0);
  });

  it('جزئیات رویداد (دلیل و IP) با باز کردن ردیف دیده می‌شود', async () => {
    renderAudit();
    await screen.findByText('ابطال پرداخت');

    fireEvent.click(screen.getByRole('button', { name: /ابطال پرداخت/ }));

    expect(await screen.findByText(/10\.0\.0\.5/)).toBeInTheDocument();
    expect(screen.getByText(/پرداخت تکراری/)).toBeInTheDocument();
  });

  it('فیلتر نوع رویداد در API اعمال می‌شود', async () => {
    renderAudit();
    await screen.findByText('ابطال پرداخت');

    await waitFor(() => expect(api.auditActions).toHaveBeenCalled());
    expect(api.audit).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 25 }));
  });
});
