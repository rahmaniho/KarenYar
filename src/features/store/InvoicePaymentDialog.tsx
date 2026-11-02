import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BadgeCheck, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import type { Invoice } from '@/core/db/db';
import { db, type CustomerPayment } from '@/core/db/db';
import { formatMoney, fromDisplayAmount, toFaDigits } from '@/core/currency/currency';
import { formatJalaliNumeric } from '@/core/jalali/jalali';
import { useSettingsStore } from '@/store/settings-store';
import { AmountInput } from '@/components/AmountInput';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { invoicePaymentState, PAYMENT_STATUS_LABELS } from './invoice-domain';
import { recordInvoicePayment } from './invoice-payment.service';

const METHODS = [
  { value: 'cash', label: 'نقدی' },
  { value: 'card', label: 'کارت‌خوان' },
  { value: 'transfer', label: 'انتقال بانکی' },
] as const;

/**
 * ثبت پرداخت (کامل یا جزئی) برای فاکتور نسیه.
 * مبلغ پیش‌فرض برابر مانده است؛ ثبت دوباره با کلید یکتا مسدود می‌شود.
 */
export function InvoicePaymentDialog({
  invoice,
  onOpenChange,
  onPaid,
}: {
  invoice: Invoice | null;
  onOpenChange: (open: boolean) => void;
  onPaid?: () => void;
}) {
  const unit = useSettingsStore((s) => s.currencyUnit);
  const payments = useLiveQuery(
    () =>
      invoice?.id != null
        ? db.customerPayments.where('invoiceId').equals(invoice.id).toArray()
        : Promise.resolve([] as CustomerPayment[]),
    [invoice?.id],
    [] as CustomerPayment[],
  );
  const [amount, setAmount] = useState<number | null>(null);
  const [method, setMethod] = useState<'cash' | 'card' | 'transfer'>('cash');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const state = useMemo(
    () => (invoice ? invoicePaymentState(invoice, payments) : null),
    [invoice, payments],
  );
  // مبلغ پیش‌فرض: مانده‌ی فاکتور (به واحد نمایشی)
  const amountInUnit =
    amount ?? (state ? Math.round(state.remaining / (unit === 'rial' ? 10 : 1)) : 0);

  if (!invoice || !state) return null;

  const submit = async () => {
    if (saving) return;
    const toman = fromDisplayAmount(amountInUnit, unit);
    setSaving(true);
    try {
      await recordInvoicePayment({
        invoiceId: invoice.id!,
        amount: toman,
        method,
        note,
        idempotencyKey: `inv${invoice.id}-${Date.now()}`,
      });
      toast.success('پرداخت ثبت شد؛ مانده‌ی حساب مشتری به‌روز شد.');
      setAmount(null);
      setNote('');
      onPaid?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ثبت پرداخت ناموفق بود.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary dark:text-neon-400" aria-hidden />
            ثبت پرداخت فاکتور {toFaDigits(invoice.number)}
          </DialogTitle>
          <DialogDescription>
            {invoice.customerName ?? 'مشتری'} — مبلغ کل {formatMoney(state.total, unit)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/60 p-3 text-center text-xs">
          <div>
            <p className="text-muted-foreground">مبلغ فاکتور</p>
            <p className="mt-1 font-bold">{formatMoney(state.total, unit)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">پرداخت‌شده</p>
            <p className="mt-1 font-bold text-emerald-700 dark:text-emerald-400">
              {formatMoney(state.paid, unit)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">مانده</p>
            <p className="mt-1 font-bold text-destructive">{formatMoney(state.remaining, unit)}</p>
          </div>
        </div>

        {state.status === 'paid' ? (
          <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <BadgeCheck className="h-4 w-4" aria-hidden />
            این فاکتور تسویه شده است؛ پرداخت جدید لازم نیست.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">
                مبلغ پرداخت ({unit === 'toman' ? 'تومان' : 'ریال'})
              </Label>
              <AmountInput
                id="pay-amount"
                value={amountInUnit}
                onChange={setAmount}
                aria-label="مبلغ پرداخت"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setAmount(Math.round(state.remaining / (unit === 'rial' ? 10 : 1)))
                  }
                >
                  تسویه کامل
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setAmount(Math.round(state.remaining / 2 / (unit === 'rial' ? 10 : 1)))
                  }
                >
                  نصف مانده
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>روش پرداخت</Label>
              <div className="flex gap-1.5">
                {METHODS.map((item) => (
                  <Button
                    key={item.value}
                    type="button"
                    size="sm"
                    variant={method === item.value ? 'default' : 'outline'}
                    onClick={() => setMethod(item.value)}
                    aria-pressed={method === item.value}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pay-note">توضیح (اختیاری)</Label>
              <Textarea
                id="pay-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="مثلاً واریز به حساب بانک ملت — شماره پیگیری ۱۲۳۴"
                maxLength={200}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              پرداخت‌های قبلی: {toFaDigits(payments.length)} مورد — وضعیت فعلی:{' '}
              {PAYMENT_STATUS_LABELS[state.status]} — سررسید{' '}
              {formatJalaliNumeric(new Date(invoice.dueDate ?? invoice.date))}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button
            variant="neon"
            disabled={saving || state.status === 'paid' || amountInUnit <= 0}
            onClick={() => void submit()}
          >
            {saving ? 'در حال ثبت…' : 'ثبت پرداخت'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** فهرست پرداخت‌های فاکتور برای نمایش در صفحه‌ی مشاهده */
export function InvoicePaymentHistory({ invoice }: { invoice: Invoice }) {
  const unit = useSettingsStore((s) => s.currencyUnit);
  const payments = useLiveQuery(
    () =>
      invoice.id != null
        ? db.customerPayments.where('invoiceId').equals(invoice.id).toArray()
        : Promise.resolve([] as CustomerPayment[]),
    [invoice.id],
    [] as CustomerPayment[],
  );
  if (!payments.length) return null;
  return (
    <div className="no-print mt-4 rounded-2xl border bg-card p-4">
      <p className="mb-2 flex items-center gap-2 text-sm font-bold">
        <Wallet className="h-4 w-4 text-primary dark:text-neon-400" aria-hidden />
        پرداخت‌های ثبت‌شده ({toFaDigits(payments.length)})
      </p>
      <ul className="divide-y text-sm">
        {payments.map((payment) => (
          <li key={payment.id} className="flex items-center justify-between gap-3 py-2">
            <span className="text-muted-foreground">
              {formatJalaliNumeric(new Date(payment.date))}
              {payment.note ? ` — ${payment.note}` : ''}
            </span>
            <span className="whitespace-nowrap font-bold">{formatMoney(payment.amount, unit)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
