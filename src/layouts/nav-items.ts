import {
  Banknote,
  Calculator,
  Contact,
  CreditCard,
  LayoutDashboard,
  Package,
  PiggyBank,
  Receipt,
  Settings,
  SlidersHorizontal,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'اصلی',
    items: [{ to: '/', label: 'داشبورد', icon: LayoutDashboard, end: true }],
  },
  {
    title: 'حساب‌یار فروشگاهی',
    items: [
      { to: '/store/products', label: 'کالاها', icon: Package },
      { to: '/store/invoices', label: 'فاکتورها', icon: Receipt },
      { to: '/store/customers', label: 'مشتریان و نسیه', icon: Contact },
      { to: '/store/reports', label: 'گزارش فروش', icon: TrendingUp },
    ],
  },
  {
    title: 'حساب‌یار شخصی',
    items: [
      { to: '/personal/transactions', label: 'تراکنش‌ها', icon: Wallet },
      { to: '/personal/budgets', label: 'بودجه‌بندی', icon: PiggyBank },
      { to: '/personal/debts', label: 'بدهی و اقساط', icon: CreditCard },
    ],
  },
  {
    title: 'دستمزد‌یار',
    items: [
      { to: '/payroll/employees', label: 'کارمندان', icon: Users },
      { to: '/payroll/calculate', label: 'محاسبه حقوق و فیش', icon: Banknote },
      { to: '/payroll/settings', label: 'تنظیمات دستمزد', icon: SlidersHorizontal },
    ],
  },
  {
    title: 'ابزارها',
    items: [
      { to: '/calculator', label: 'ماشین‌حساب حرفه‌ای', icon: Calculator },
      { to: '/settings', label: 'تنظیمات', icon: Settings },
    ],
  },
];

/** ناوبری پایینی موبایل — مهم‌ترین بخش‌ها */
export const MOBILE_NAV: NavItem[] = [
  { to: '/', label: 'داشبورد', icon: LayoutDashboard, end: true },
  { to: '/store/products', label: 'کالاها', icon: Package },
  { to: '/personal/transactions', label: 'تراکنش‌ها', icon: Wallet },
  { to: '/calculator', label: 'ماشین‌حساب', icon: Calculator },
  { to: '/settings', label: 'تنظیمات', icon: Settings },
];
