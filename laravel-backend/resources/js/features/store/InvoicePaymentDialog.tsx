import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BadgeCheck, RotateCcw, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { db, type CustomerPayment, type Invoice } from '@/core/db/db';
import { CURRENCY_LABELS, formatMoney, toFaDigits } from '@/core/currency/currency';
import { formatJalaliNumeric } from '@/core/jalali/jalali';
import { useSettingsStore } from '@/store/settings-store';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { JalaliDateInput } from '@/components/JalaliDateInput';
import { invoiceDueDate, invoicePaymentState, PAYMENT_STATUS_LABELS } from './invoice-domain';
import {
  deleteInvoicePayment,
  recordInvoicePayment,
  refundInvoicePayment,
} from './invoice-payment.service';
import { PAYMENT_LABELS } from './payment';
import { InvoiceMoneyInput } from './InvoiceMoneyInput';
import { useAttemptKey } from './use-attempt-key';

const METHODS = ['cash', 'card', 'transfer'] as const;
type Method = (typeof METHODS)[number];

/** ثبت دریافت کامل/جزئی؛ کلید برای همان محتوای درخواست در تلاش مجدد ثابت می‌ماند. */
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
  const [method, setMethod] = useState<Method>('cash');
  const [note, setNote] = useState('');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString());
  const [saving, setSaving] = useState(false);
  const [amountValid, setAmountValid] = useState(true);
  const [dateValid, setDateValid] = useState(true);
  const busy = useRef(false);
  const attemptKey = useAttemptKey();
  useEffect(() => {
    setAmount(null);
    setMethod('cash');
    setNote('');
    setReference('');
    setDate(new Date().toISOString());
    setAmountValid(true);
    setDateValid(true);
  }, [invoice?.id]);
  const state = useMemo(
    () => (invoice ? invoicePaymentState(invoice, payments) : null),
    [invoice, payments],
  );
  if (!invoice || !state) return null;
  const value = amount ?? state.remaining;
  const invalid =
    value <= 0 || value > state.remaining || state.remaining <= 0 || !amountValid || !dateValid;
  const submit = async () => {
    if (busy.current || invalid) return;
    busy.current = true;
    setSaving(true);
    try {
      const payload = { invoiceId: invoice.id!, amount: value, method, note, reference, date };
      await recordInvoicePayment({ ...payload, idempotencyKey: attemptKey(payload) });
      toast.success('پرداخت ثبت شد؛ مانده فاکتور و حساب مشتری به‌روز شد.');
      setAmount(null);
      setNote('');
      setReference('');
      onPaid?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ثبت پرداخت ناموفق بود.');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !saving && onOpenChange(open)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" aria-hidden />
            ثبت پرداخت فاکتور {toFaDigits(invoice.number)}
          </DialogTitle>
          <DialogDescription>
            {invoice.customerName ?? 'مشتری'} — وضعیت فعلی: {PAYMENT_STATUS_LABELS[state.status]}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/60 p-3 text-center text-xs">
          <div>
            <p className="text-muted-foreground">مبلغ فاکتور</p>
            <p className="mt-1 font-bold">{formatMoney(state.total, unit)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">پرداخت خالص</p>
            <p className="mt-1 font-bold text-emerald-700 dark:text-emerald-400">
              {formatMoney(state.paid, unit)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">مانده</p>
            <p className="mt-1 font-bold text-destructive">{formatMoney(state.remaining, unit)}</p>
          </div>
        </div>
        {state.remaining <= 0 ? (
          <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <BadgeCheck className="h-4 w-4" aria-hidden />
            این فاکتور مانده قابل پرداخت ندارد.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">مبلغ پرداخت ({CURRENCY_LABELS[unit]})</Label>
              <InvoiceMoneyInput
                id="pay-amount"
                value={value}
                onChange={setAmount}
                label="مبلغ پرداخت"
                disabled={saving}
                onValidityChange={setAmountValid}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() => setAmount(state.remaining)}
                >
                  تسویه کامل
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() => setAmount(Math.floor(state.remaining / 2))}
                >
                  نصف مانده
                </Button>
              </div>
              {value > state.remaining && (
                <p role="alert" className="text-xs text-destructive">
                  مبلغ از مانده بیشتر است.
                </p>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pay-method">روش پرداخت</Label>
                <Select
                  value={method}
                  onValueChange={(v) => setMethod(v as Method)}
                  disabled={saving}
                >
                  <SelectTrigger id="pay-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {PAYMENT_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pay-reference">شماره پیگیری</Label>
                <Input
                  id="pay-reference"
                  value={reference}
                  maxLength={100}
                  disabled={saving}
                  onChange={(e) => setReference(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-date">تاریخ پرداخت</Label>
              <JalaliDateInput
                id="pay-date"
                value={date}
                onChange={setDate}
                disabled={saving}
                onValidityChange={setDateValid}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-note">توضیح</Label>
              <Textarea
                id="pay-note"
                value={note}
                maxLength={200}
                disabled={saving}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              سررسید: {formatJalaliNumeric(invoiceDueDate(invoice))} — پرداخت‌های قبلی:{' '}
              {toFaDigits(payments.filter((p) => p.kind !== 'refund').length)}
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button variant="neon" disabled={saving || invalid} onClick={() => void submit()}>
            {saving ? 'در حال ثبت…' : 'ثبت پرداخت'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InvoiceRefundDialog({
  invoice,
  onOpenChange,
}: {
  invoice: Invoice | null;
  onOpenChange: (open: boolean) => void;
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
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState<Method>('cash');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString());
  const [saving, setSaving] = useState(false);
  const [amountValid, setAmountValid] = useState(true);
  const [dateValid, setDateValid] = useState(true);
  const busy = useRef(false);
  const attemptKey = useAttemptKey();
  useEffect(() => {
    setAmount(null);
    setReason('');
    setReference('');
    setDate(new Date().toISOString());
    setAmountValid(true);
    setDateValid(true);
  }, [invoice?.id]);
  const state = useMemo(
    () => (invoice ? invoicePaymentState(invoice, payments) : null),
    [invoice, payments],
  );
  if (!invoice || !state) return null;
  const refundable = state.received - state.refunded;
  const value = amount ?? refundable;
  const invalid =
    value <= 0 || value > refundable || reason.trim().length < 3 || !amountValid || !dateValid;
  const submit = async () => {
    if (busy.current || invalid) return;
    busy.current = true;
    setSaving(true);
    try {
      const payload = {
        invoiceId: invoice.id!,
        amount: value,
        reason: reason.trim(),
        method,
        reference,
        date,
      };
      await refundInvoicePayment({ ...payload, idempotencyKey: attemptKey(payload) });
      toast.success('برگشت وجه ثبت شد؛ سوابق دریافت و پرداخت حفظ شدند.');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'برگشت وجه ناموفق بود.');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !saving && onOpenChange(open)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>برگشت وجه فاکتور {toFaDigits(invoice.number)}</DialogTitle>
          <DialogDescription>
            این عملیات فقط وجه دریافتی را برمی‌گرداند؛ موجودی کالا تغییر نمی‌کند. حداکثر:{' '}
            {formatMoney(refundable, unit)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>مبلغ برگشت ({CURRENCY_LABELS[unit]})</Label>
            <InvoiceMoneyInput
              value={value}
              onChange={setAmount}
              label="مبلغ برگشت وجه"
              disabled={saving}
              onValidityChange={setAmountValid}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="refund-reason">دلیل برگشت *</Label>
            <Textarea
              id="refund-reason"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              disabled={saving}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>روش برگشت</Label>
              <Select
                value={method}
                onValueChange={(v) => setMethod(v as Method)}
                disabled={saving}
              >
                <SelectTrigger aria-label="روش برگشت وجه">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {PAYMENT_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="refund-reference">شماره پیگیری</Label>
              <Input
                id="refund-reference"
                value={reference}
                maxLength={100}
                onChange={(e) => setReference(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>تاریخ برگشت</Label>
            <JalaliDateInput
              value={date}
              onChange={setDate}
              disabled={saving}
              onValidityChange={setDateValid}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button variant="destructive" disabled={saving || invalid} onClick={() => void submit()}>
            {saving ? 'در حال ثبت…' : 'ثبت برگشت وجه'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** تاریخچهٔ دریافت‌ها و اصلاح‌ها؛ هیچ پرداختی از رابط کاربری حذف فیزیکی نمی‌شود. */
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
  const [reversing, setReversing] = useState<CustomerPayment | null>(null);
  const [reason, setReason] = useState('');
  const [refunding, setRefunding] = useState(false);
  const state = invoicePaymentState(invoice, payments);
  const refundable = state.received - state.refunded;
  const canRefund =
    invoice.status !== 'draft' &&
    refundable > 0 &&
    (invoice.status === 'voided' || invoice.isCredit);
  const sorted = [...payments].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || (b.id ?? 0) - (a.id ?? 0),
  );
  return (
    <div className="no-print mt-4 rounded-2xl border bg-card p-4" id="payment-history">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold">
          <Wallet className="h-4 w-4 text-primary" aria-hidden />
          دریافت‌ها و برگشت وجه ({toFaDigits(payments.length)})
        </p>
        {canRefund && (
          <Button size="sm" variant="outline" onClick={() => setRefunding(true)}>
            <RotateCcw aria-hidden />
            برگشت وجه
          </Button>
        )}
      </div>
      {!payments.length && (
        <p className="py-3 text-sm text-muted-foreground">
          هنوز دریافت یا برگشت وجهی برای این سند ثبت نشده است.
        </p>
      )}
      <ul className="divide-y text-sm">
        {sorted.map((payment) => {
          const refund = payment.kind === 'refund';
          const reversed = payments.some((p) => p.reversalOf === payment.id);
          return (
            <li key={payment.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {refund ? 'برگشت وجه' : 'دریافت'} — {formatJalaliNumeric(new Date(payment.date))}
                </p>
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {payment.method ? PAYMENT_LABELS[payment.method] : 'روش ثبت نشده'}
                  {payment.reference ? ` · پیگیری ${payment.reference}` : ''}
                  {payment.note ? ` · ${payment.note}` : ''}
                  {payment.reversalReason ? ` · دلیل: ${payment.reversalReason}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`whitespace-nowrap font-bold ${refund ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'}`}
                >
                  {refund ? '−' : '+'}
                  {formatMoney(payment.amount, unit)}
                </span>
                {!refund && !reversed && invoice.status !== 'voided' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setReversing(payment);
                      setReason('');
                    }}
                  >
                    اصلاح
                  </Button>
                )}
                {reversed && <span className="text-xs text-muted-foreground">اصلاح‌شده</span>}
              </div>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={!!reversing}
        onOpenChange={(open) => !open && setReversing(null)}
        title="اصلاح پرداخت با سند معکوس"
        description="رکورد اصلی حذف نمی‌شود؛ یک برگشت معکوس با دلیل ثبت می‌شود."
        confirmLabel="ثبت اصلاح"
        destructive
        onConfirm={async () => {
          if (!reversing) return;
          if (reason.trim().length < 3) throw new Error('دلیل اصلاح را با حداقل ۳ نویسه بنویسید.');
          await deleteInvoicePayment(reversing.id!, reason);
          toast.success('سند اصلاحی ثبت شد.');
          setReversing(null);
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="reverse-reason">دلیل اصلاح *</Label>
          <Textarea
            id="reverse-reason"
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
          />
        </div>
      </ConfirmDialog>
      <InvoiceRefundDialog invoice={refunding ? invoice : null} onOpenChange={setRefunding} />
    </div>
  );
}
