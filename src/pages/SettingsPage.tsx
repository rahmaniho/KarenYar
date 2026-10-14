import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  BadgeCheck,
  Crown,
  DatabaseBackup,
  Download,
  Info,
  Moon,
  MonitorSmartphone,
  Palette,
  Store,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/core/db/db';
import { downloadBackupFile, exportBackup, importBackup, validateBackup } from '@/core/db/backup';
import {
  FEATURE_LABELS,
  FREE_LIMITS,
  LicenseError,
  TIER_LABELS,
  type Feature,
  type LicenseTier,
} from '@/core/license/license-core';
import { formatJalaliLong } from '@/core/jalali/jalali';
import { toFaDigits } from '@/core/currency/currency';
import { useLicenseStore } from '@/store/license-store';
import { useSettingsStore, type ThemeMode } from '@/store/settings-store';
import { useInstallPrompt } from '@/hooks/use-install-prompt';
import { PageHeader } from '@/components/PageHeader';
import { FeatureGate } from '@/components/FeatureGate';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const PURCHASE_URL = import.meta.env.VITE_PURCHASE_URL ?? 'https://karensoft.ir/buy/hesabyar';
const SUPPORT_PHONE = import.meta.env.VITE_SUPPORT_PHONE ?? '';

const ALL_FEATURES = Object.keys(FEATURE_LABELS) as Feature[];

function SectionTitle({ icon: Icon, children }: { icon: typeof Palette; children: string }) {
  return (
    <CardTitle className="flex items-center gap-2 text-base">
      <Icon className="h-5 w-5 text-primary dark:text-neon-400" aria-hidden />
      {children}
    </CardTitle>
  );
}

/** تنظیمات برنامه، لایسنس، پشتیبان‌گیری و نصب */
export function SettingsPage() {
  const location = useLocation();
  const settings = useSettingsStore();
  const licenseInfo = useLicenseStore((s) => s.info);
  const activate = useLicenseStore((s) => s.activate);
  const deactivate = useLicenseStore((s) => s.deactivate);
  const can = useLicenseStore((s) => s.can);
  const { canInstall, isInstalled, promptInstall } = useInstallPrompt();

  const [licenseKey, setLicenseKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // اسکرول به بخش لایسنس وقتی از لینک‌های ارتقا می‌آییم
  useEffect(() => {
    if (location.hash === '#license') {
      document.getElementById('license')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.hash]);

  const handleActivate = async () => {
    if (!licenseKey.trim()) {
      toast.error('کلید لایسنس را وارد کنید.');
      return;
    }
    setActivating(true);
    try {
      const info = await activate(licenseKey);
      if (info.isExpired) {
        toast.error('این لایسنس منقضی شده است. برای تمدید با فروشنده تماس بگیرید.');
      } else {
        toast.success(
          `نسخه‌ی ${TIER_LABELS[info.tier]} برای «${info.holderName ?? ''}» فعال شد. خوش آمدید!`,
        );
      }
      setLicenseKey('');
    } catch (error) {
      toast.error(
        error instanceof LicenseError ? error.message : 'فعال‌سازی ناموفق بود. دوباره تلاش کنید.',
      );
    } finally {
      setActivating(false);
    }
  };

  const handleExport = async () => {
    try {
      const backup = await exportBackup();
      downloadBackupFile(backup);
      toast.success('فایل پشتیبان دانلود شد. آن را در جای امنی نگه دارید.');
    } catch {
      toast.error('ساخت فایل پشتیبان با خطا مواجه شد.');
    }
  };

  const handleImportFile = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const valid = validateBackup(parsed);
      await importBackup(valid);
      toast.success('داده‌ها با موفقیت بازیابی شد.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'بازیابی فایل ناموفق بود.');
    } finally {
      setImporting(false);
    }
  };

  const wipeAll = async () => {
    await db.transaction(
      'rw',
      [
        db.products,
        db.invoices,
        db.invoiceItems,
        db.transactions,
        db.budgets,
        db.debts,
        db.employees,
        db.payrolls,
        db.settings,
      ],
      async () => {
        await Promise.all([
          db.products.clear(),
          db.invoices.clear(),
          db.invoiceItems.clear(),
          db.transactions.clear(),
          db.budgets.clear(),
          db.debts.clear(),
          db.employees.clear(),
          db.payrolls.clear(),
          db.settings.clear(),
        ]);
      },
    );
    toast.success('همه‌ی داده‌ها پاک شد. برنامه مثل روز اول شد.');
  };

  const themeOptions: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'روشن', icon: Sun },
    { value: 'dark', label: 'تاریک', icon: Moon },
    { value: 'system', label: 'سیستم', icon: MonitorSmartphone },
  ];

  return (
    <div>
      <PageHeader title="تنظیمات" subtitle="ظاهر، فروشگاه، لایسنس، پشتیبان‌گیری و نصب برنامه" />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ظاهر و واحد پول */}
        <Card>
          <CardHeader>
            <SectionTitle icon={Palette}>ظاهر و واحد پول</SectionTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>حالت نمایش</Label>
              <div className="grid grid-cols-3 gap-2" role="group" aria-label="حالت نمایش">
                {themeOptions.map((option) => (
                  <Button
                    key={option.value}
                    variant={settings.theme === option.value ? 'default' : 'outline'}
                    onClick={() => settings.setTheme(option.value)}
                    aria-pressed={settings.theme === option.value}
                  >
                    <option.icon aria-hidden />
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="set-unit">واحد پول نمایشی</Label>
              <Select
                value={settings.currencyUnit}
                onValueChange={(v) => settings.setCurrencyUnit(v as 'toman' | 'rial')}
              >
                <SelectTrigger id="set-unit" aria-label="واحد پول">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="toman">تومان</SelectItem>
                  <SelectItem value="rial">ریال</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                مبالغ همیشه داخلی به تومان ذخیره می‌شوند؛ این گزینه فقط نمایش را تغییر می‌دهد.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* فروشگاه */}
        <Card>
          <CardHeader>
            <SectionTitle icon={Store}>مشخصات فروشگاه / کارفرما</SectionTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="set-shop">نام فروشگاه یا مجموعه</Label>
              <Input
                id="set-shop"
                value={settings.shopName}
                onChange={(e) => settings.updateShop({ shopName: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="set-phone">تلفن</Label>
                <Input
                  id="set-phone"
                  value={settings.shopPhone}
                  onChange={(e) => settings.updateShop({ shopPhone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="set-tax">مالیات پیش‌فرض فاکتور (٪)</Label>
                <Input
                  id="set-tax"
                  inputMode="decimal"
                  dir="ltr"
                  className="text-left"
                  value={settings.invoiceTaxPercent || ''}
                  onChange={(e) => settings.setInvoiceTaxPercent(Number(e.target.value) || 0)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="set-address">نشانی</Label>
              <Input
                id="set-address"
                value={settings.shopAddress}
                onChange={(e) => settings.updateShop({ shopAddress: e.target.value })}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              این مشخصات روی فاکتور فروش و فیش حقوقی چاپ می‌شود.
            </p>
          </CardContent>
        </Card>

        {/* نصب */}
        <Card>
          <CardHeader>
            <SectionTitle icon={Download}>نصب اپلیکیشن (PWA)</SectionTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isInstalled ? (
              <p className="flex items-center gap-2 text-sm">
                <BadgeCheck className="h-5 w-5 text-success" aria-hidden />
                حساب‌یار روی این دستگاه نصب شده است.
              </p>
            ) : canInstall ? (
              <>
                <p className="text-sm leading-7 text-muted-foreground">
                  حساب‌یار را مثل یک اپ واقعی روی گوشی یا دسکتاپ نصب کنید تا بدون مرورگر و کاملاً
                  آفلاین در دسترس باشد.
                </p>
                <Button variant="neon" onClick={promptInstall}>
                  <Download aria-hidden />
                  نصب حساب‌یار
                </Button>
              </>
            ) : (
              <p className="text-sm leading-7 text-muted-foreground">
                در آیفون: دکمه‌ی اشتراک‌گذاری (Share) و سپس «Add to Home Screen». در اندروید و
                دسکتاپ: از منوی مرورگر گزینه‌ی «نصب برنامه / Install» را بزنید. اگر از قبل نصب
                کرده‌اید، همین حالا هم در حالت نصب‌شده هستید.
              </p>
            )}
          </CardContent>
        </Card>

        {/* پشتیبان‌گیری */}
        <Card>
          <CardHeader>
            <SectionTitle icon={DatabaseBackup}>پشتیبان‌گیری و بازیابی</SectionTitle>
          </CardHeader>
          <CardContent>
            <FeatureGate feature="backup">
              <div className="space-y-3">
                <p className="text-sm leading-7 text-muted-foreground">
                  از همه‌ی داده‌ها (کالا، فاکتور، تراکنش، بودجه، بدهی و کارمند) یک فایل JSON بگیرید
                  و هر وقت لازم شد برگردانید. فایل پشتیبان شامل کلید لایسنس نیست.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="default" onClick={() => void handleExport()}>
                    <Download aria-hidden />
                    دریافت فایل پشتیبان
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => fileRef.current?.click()}
                    disabled={importing}
                  >
                    <Upload aria-hidden />
                    {importing ? 'در حال بازیابی…' : 'بازیابی از فایل'}
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    aria-label="انتخاب فایل پشتیبان"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleImportFile(file);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>
            </FeatureGate>
          </CardContent>
        </Card>
      </div>

      {/* لایسنس */}
      <Card id="license" className="mt-4 scroll-mt-20 border-navy-200 dark:border-navy-700">
        <CardHeader>
          <SectionTitle icon={Crown}>لایسنس و فعال‌سازی</SectionTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-muted/60 p-4">
            <Badge variant={licenseInfo.tier === 'free' ? 'secondary' : 'neon'} className="text-sm">
              نسخه‌ی فعلی: {TIER_LABELS[licenseInfo.tier]}
            </Badge>
            {licenseInfo.holderName && (
              <span className="text-sm">
                دارنده: <b>{licenseInfo.holderName}</b>
              </span>
            )}
            {licenseInfo.expiresAt ? (
              <span className="text-sm text-muted-foreground">
                اعتبار تا {formatJalaliLong(new Date(licenseInfo.expiresAt))}
              </span>
            ) : licenseInfo.tier !== 'free' ? (
              <span className="text-sm text-muted-foreground">مادام‌العمر (بدون انقضا)</span>
            ) : null}
            {licenseInfo.tier === 'free' && (
              <span className="text-sm text-muted-foreground">
                محدودیت نسخه‌ی رایگان: {toFaDigits(FREE_LIMITS.products)} کالا و{' '}
                {toFaDigits(FREE_LIMITS.transactions)} تراکنش — بدون خروجی PDF و پشتیبان‌گیری
              </span>
            )}
            {licenseInfo.tier !== 'free' && (
              <Button
                variant="outline"
                size="sm"
                className="ms-auto"
                onClick={() => setDeactivateOpen(true)}
              >
                غیرفعال‌کردن روی این دستگاه
              </Button>
            )}
          </div>

          {licenseInfo.tier === 'free' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="license-key">کلید لایسنس</Label>
                <Textarea
                  id="license-key"
                  dir="ltr"
                  className="text-left font-mono text-xs"
                  rows={3}
                  placeholder="KS1.xxxxxxxx.xxxxxxxx"
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value)}
                  aria-describedby="license-help"
                />
                <p id="license-help" className="text-xs text-muted-foreground">
                  کلید را دقیقاً همان‌طور که دریافت کرده‌اید وارد کنید؛ فعال‌سازی کاملاً آفلاین
                  انجام می‌شود.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="neon" onClick={() => void handleActivate()} disabled={activating}>
                  <BadgeCheck aria-hidden />
                  {activating ? 'در حال بررسی…' : 'فعال‌سازی'}
                </Button>
                <Button asChild variant="outline">
                  <a href={PURCHASE_URL} target="_blank" rel="noreferrer">
                    <Crown aria-hidden />
                    خرید نسخه‌ی حرفه‌ای
                  </a>
                </Button>
                {SUPPORT_PHONE && (
                  <span className="self-center text-sm text-muted-foreground">
                    پشتیبانی فروش: <b dir="ltr">{SUPPORT_PHONE}</b>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* جدول مقایسه‌ی سطوح */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="px-2 py-2 text-start font-semibold">قابلیت</th>
                  {(['free', 'pro', 'proplus'] as LicenseTier[]).map((tier) => (
                    <th
                      key={tier}
                      className={cn(
                        'px-2 py-2 text-center font-semibold',
                        licenseInfo.tier === tier && 'text-primary dark:text-neon-400',
                      )}
                    >
                      {TIER_LABELS[tier]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="px-2 py-2">ماشین‌حساب حرفه‌ای و تبدیل‌ها</td>
                  <td className="px-2 py-2 text-center">✓</td>
                  <td className="px-2 py-2 text-center">✓</td>
                  <td className="px-2 py-2 text-center">✓</td>
                </tr>
                <tr className="border-b">
                  <td className="px-2 py-2">تعداد کالا</td>
                  <td className="px-2 py-2 text-center">{toFaDigits(FREE_LIMITS.products)} کالا</td>
                  <td className="px-2 py-2 text-center">نامحدود</td>
                  <td className="px-2 py-2 text-center">نامحدود</td>
                </tr>
                <tr className="border-b">
                  <td className="px-2 py-2">تعداد تراکنش شخصی</td>
                  <td className="px-2 py-2 text-center">
                    {toFaDigits(FREE_LIMITS.transactions)} تراکنش
                  </td>
                  <td className="px-2 py-2 text-center">نامحدود</td>
                  <td className="px-2 py-2 text-center">نامحدود</td>
                </tr>
                {ALL_FEATURES.filter(
                  (f) => f !== 'unlimited-products' && f !== 'unlimited-transactions',
                ).map((feature) => (
                  <tr key={feature} className="border-b">
                    <td className="px-2 py-2">{FEATURE_LABELS[feature]}</td>
                    <td className="px-2 py-2 text-center text-muted-foreground">—</td>
                    <td className="px-2 py-2 text-center">✓</td>
                    <td className="px-2 py-2 text-center">✓</td>
                  </tr>
                ))}
                <tr>
                  <td className="px-2 py-2">همگام‌سازی آنلاین و چندکاربره</td>
                  <td className="px-2 py-2 text-center text-muted-foreground">—</td>
                  <td className="px-2 py-2 text-center text-muted-foreground">—</td>
                  <td className="px-2 py-2 text-center">به‌زودی ✓</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* منطقه‌ی خطر + درباره */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <Trash2 className="h-5 w-5" aria-hidden />
              پاک‌کردن همه‌ی داده‌ها
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm leading-7 text-muted-foreground">
              همه‌ی کالاها، فاکتورها، تراکنش‌ها، بودجه‌ها، بدهی‌ها و کارمندان پاک می‌شوند. (لایسنس
              فعال باقی می‌ماند.) این کار برگشت‌پذیر نیست؛ اول پشتیبان بگیرید.
            </p>
            <Button
              variant="destructive"
              onClick={() => setWipeOpen(true)}
              disabled={!can('backup')}
            >
              <Trash2 aria-hidden />
              پاک‌کردن همه‌ی داده‌ها
            </Button>
            {!can('backup') && (
              <p className="text-xs text-muted-foreground">
                برای امنیت داده‌ها، این گزینه پس از فعال‌سازی نسخه‌ی حرفه‌ای (که پشتیبان‌گیری دارد)
                در دسترس است.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionTitle icon={Info}>درباره‌ی حساب‌یار کارن سافت</SectionTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-7 text-muted-foreground">
            <p>
              <b className="text-foreground">حساب‌یار کارن سافت</b> — نسخه‌ی ۱٫۰٫۰
            </p>
            <p>
              اپلیکیشن مالی فارسی و کاملاً آفلاین برای فروشگاه‌های کوچک، کارمندان و حسابداران:
              فروشگاه، امور مالی شخصی، حقوق و دستمزد طبق قانون کار و ماشین‌حساب حرفه‌ای؛ بدون نیاز
              به اینترنت و بدون ارسال هیچ داده‌ای به بیرون.
            </p>
            <p>
              ساخته‌شده با React و TypeScript — داده‌ها فقط روی دستگاه شما (IndexedDB) ذخیره
              می‌شوند.
            </p>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title="غیرفعال‌کردن لایسنس"
        description="لایسنس از این دستگاه حذف و برنامه به نسخه‌ی رایگان برمی‌گردد. داده‌های شما پاک نمی‌شود. ادامه می‌دهید؟"
        confirmLabel="غیرفعال‌کردن"
        destructive
        onConfirm={async () => {
          await deactivate();
          toast.success('لایسنس غیرفعال شد.');
        }}
      />
      <ConfirmDialog
        open={wipeOpen}
        onOpenChange={setWipeOpen}
        title="پاک‌کردن همه‌ی داده‌ها"
        description="همه‌ی داده‌های فروشگاه و مالی پاک می‌شود و قابل برگشت نیست. مطمئن هستید؟"
        confirmLabel="بله، همه را پاک کن"
        destructive
        onConfirm={wipeAll}
      />
    </div>
  );
}
