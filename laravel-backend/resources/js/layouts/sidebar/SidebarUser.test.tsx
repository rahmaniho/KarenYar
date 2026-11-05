import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { version } from '../../../../package.json';
import { toFaDigits } from '@/core/currency/currency';
import { useAuthStore } from '@/store/auth-store';
import { SidebarUser } from './SidebarUser';

describe('SidebarUser release version', () => {
  it('displays the current package version instead of a stale hard-coded release', () => {
    render(
      <MemoryRouter>
        <SidebarUser collapsed={false} onExpand={() => {}} onNavigate={() => {}} />
      </MemoryRouter>,
    );
    expect(
      screen.getByText(`نسخه ${toFaDigits(version).replace(/\./g, '٫')} — آفلاین`),
    ).toBeInTheDocument();
  });
});

describe('SidebarUser logout', () => {
  it('calls logout when the logout menu item is clicked', () => {
    const logoutMock = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({ logout: logoutMock });

    render(
      <MemoryRouter>
        <SidebarUser collapsed={false} onExpand={() => {}} onNavigate={() => {}} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'حساب و تنظیمات' }));
    fireEvent.click(screen.getByText('خروج از حساب'));

    expect(logoutMock).toHaveBeenCalledTimes(1);
  });
});
