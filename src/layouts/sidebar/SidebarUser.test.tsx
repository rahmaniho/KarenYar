import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { version } from '../../../package.json';
import { toFaDigits } from '@/core/currency/currency';
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
