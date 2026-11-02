import {
  Banknote,
  FileText,
  Calculator,
  Contact,
  CreditCard,
  LayoutDashboard,
  Package,
  PiggyBank,
  Receipt,
  Settings,
  ShoppingCart,
  Warehouse,
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
  /** واژه‌های هم‌معنا فقط برای جستجو — مسیر یا قابلیت جدیدی ایجاد نمی‌شود */
  keywords?: string[];
}

export interface NavGroup {
  id: string;
  title: string;
  items: NavItem[];
}

/**
 * فهرست واقعی منوها — دقیقاً همان مسیرها و ترتیب نسخه‌ی قبلی.
 * `id` فقط برای نگه‌داری وضعیت باز/بسته‌ی هر گروه اضافه شده است.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'main',
    title: 'اصلی',
    items: [
      { to: '/', label: 'داشبورد', icon: LayoutDashboard, end: true, keywords: ['خانه', 'home'] },
    ],
  },
  {
    id: 'store',
    title: 'حساب‌یار فروشگاهی',
    items: [
      {
        to: '/store/pos',
        label: 'صندوقدار',
        icon: ShoppingCart,
        keywords: ['فروش', 'صندوق', 'pos'],
      },
      {
        to: '/store/products',
        label: 'کالاها',
        icon: Package,
        keywords: ['محصولات', 'قیمت', 'کالا'],
      },
      {
        to: '/store/inventory',
        label: 'انبار و گردش کالا',
        icon: Warehouse,
        keywords: ['موجودی', 'انبار'],
      },
      {
        to: '/store/finance',
        label: 'دفتر مالی کسب‌وکار',
        icon: Banknote,
        keywords: ['درآمد', 'هزینه', 'مالی'],
      },
      {
        to: '/store/invoices',
        label: 'فاکتورها',
        icon: Receipt,
        keywords: ['صورتحساب', 'فاکتور جدید', 'صدور فاکتور'],
      },
      {
        to: '/store/invoices/dashboard',
        label: 'داشبورد فاکتور',
        icon: LayoutDashboard,
        keywords: ['گزارش فاکتور', 'وصول', 'مطالبات', 'سررسید'],
      },
      {
        to: '/store/invoices/issued',
        label: 'فاکتورهای صادرشده',
        icon: FileText,
        keywords: ['آرشیو فاکتور', 'جستجوی فاکتور', 'PDF فاکتور', 'factor'],
      },
      {
        to: '/store/customers',
        label: 'مشتریان و نسیه',
        icon: Contact,
        keywords: ['اشخاص', 'بدهکاران', 'مشتری'],
      },
      {
        to: '/store/reports',
        label: 'گزارش فروش',
        icon: TrendingUp,
        keywords: ['گزارشات', 'آمار'],
      },
    ],
  },
  {
    id: 'personal',
    title: 'مدیریت مالی',
    items: [
      {
        to: '/personal/transactions',
        label: 'درآمد و هزینه‌ها',
        icon: Wallet,
        keywords: ['تراکنش', 'درآمد', 'هزینه'],
      },
      {
        to: '/personal/budgets',
        label: 'بودجه‌بندی',
        icon: PiggyBank,
        keywords: ['بودجه', 'سقف هزینه'],
      },
      {
        to: '/personal/debts',
        label: 'بدهی و اقساط',
        icon: CreditCard,
        keywords: ['وام', 'سررسید', 'قسط'],
      },
    ],
  },
  {
    id: 'payroll',
    title: 'دستمزد‌یار',
    items: [
      { to: '/payroll/employees', label: 'کارمندان', icon: Users, keywords: ['پرسنل', 'حقوق'] },
      {
        to: '/payroll/calculate',
        label: 'محاسبه حقوق و فیش',
        icon: Banknote,
        keywords: ['فیش حقوقی', 'دستمزد'],
      },
      {
        to: '/payroll/settings',
        label: 'تنظیمات دستمزد',
        icon: SlidersHorizontal,
        keywords: ['نرخ', 'بیمه'],
      },
    ],
  },
  {
    id: 'tools',
    title: 'ابزارها',
    items: [
      {
        to: '/calculator',
        label: 'ماشین‌حساب حرفه‌ای',
        icon: Calculator,
        keywords: ['ماشین حساب', 'تبدیل واحد', 'ارز'],
      },
      {
        to: '/settings',
        label: 'تنظیمات',
        icon: Settings,
        keywords: ['لایسنس', 'پین', 'پشتیبان‌گیری', 'theme'],
      },
    ],
  },
];

/** ناوبری پایینی موبایل — مهم‌ترین بخش‌ها (بدون تغییر) */
export const MOBILE_NAV: NavItem[] = [
  { to: '/', label: 'داشبورد', icon: LayoutDashboard, end: true },
  { to: '/store/pos', label: 'صندوق', icon: ShoppingCart },
  { to: '/personal/transactions', label: 'درآمد و هزینه‌ها', icon: Wallet },
  { to: '/calculator', label: 'ماشین‌حساب', icon: Calculator },
  { to: '/settings', label: 'تنظیمات', icon: Settings },
];

export interface NavEntry extends NavItem {
  groupId: string;
  groupTitle: string;
}

/** ایندکس تخت از همه‌ی منوها برای جستجوی زنده — هیچ مسیری اضافه نشده است */
export const NAV_INDEX: NavEntry[] = NAV_GROUPS.flatMap((group) =>
  group.items.map((item) => ({
    ...item,
    groupId: group.id,
    groupTitle: group.title,
  })),
);

/** نرمال‌سازی فارسی برای جستجو: ی/ک عربی، نیم‌فاصله، اعراب، ارقام */
export function normalizeNavText(text: string): string {
  return text
    .replace(/[\u064b-\u0652\u0670\u0640]/g, '')
    .replace(/‌/g, '')
    .replace(/[\u064a\u0649]/g, 'ی')
    .replace(/\u0643/g, 'ک')
    .replace(/\u0629/g, 'ه')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .toLowerCase()
    .trim();
}

/**
 * جستجوی واقعی در نام صفحه، گروه، مسیر و واژه‌های هم‌معنا؛
 * مرتب‌شده بر اساس میزان تطابق (نتایج مزاحم و تکراری وجود ندارد).
 */
export function searchNavItems(query: string, limit = 8): NavEntry[] {
  const q = normalizeNavText(query);
  if (!q) return [];
  const scored: { entry: NavEntry; score: number }[] = [];
  for (const entry of NAV_INDEX) {
    const label = normalizeNavText(entry.label);
    const group = normalizeNavText(entry.groupTitle);
    const path = normalizeNavText(entry.to);
    const keywords = (entry.keywords ?? []).map(normalizeNavText);
    let score = 0;
    if (label === q) score = 100;
    else if (label.startsWith(q)) score = 80;
    else if (label.includes(q)) score = 65;
    else if (group.includes(q)) score = 40;
    else if (keywords.some((k) => k.includes(q))) score = 35;
    else if (path.includes(q)) score = 20;
    if (score > 0) scored.push({ entry, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || NAV_INDEX.indexOf(a.entry) - NAV_INDEX.indexOf(b.entry))
    .slice(0, limit)
    .map((s) => s.entry);
}
