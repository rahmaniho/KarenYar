import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { db, type CustomerPayment, type Invoice } from '@/core/db/db';
import { formatMoney, toFaDigits } from '@/core/currency/currency';
import { useSettingsStore } from '@/store/settings-store';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { voidInvoice } from './invoice.service';
import { invoicePaymentState } from './invoice-domain';

export function VoidInvoiceDialog({
  invoice,
  onOpenChange,
  onVoided,
}: {
  invoice: Invoice | null;
  onOpenChange: (open: boolean) => void;
  onVoided?: () => void;
}) {
  const unit = useSettingsStore((s) => s.currencyUnit);
  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const payments = useLiveQuery(
    () =>
      invoice?.id != null
        ? db.customerPayments.where('invoiceId').equals(invoice.id).toArray()
        : Promise.resolve([] as CustomerPayment[]),
    [invoice?.id],
    [] as CustomerPayment[],
  );
  useEffect(() => {
    setReason('');
    setAcknowledged(false);
  }, [invoice?.id]);
  const state = invoice ? invoicePaymentState(invoice, payments) : null;
  const received = state ? state.received - state.refunded : 0;
  return (
    <ConfirmDialog
      open={invoice !== null}
      onOpenChange={onOpenChange}
      title={`ابطال فاکتور ${invoice ? toFaDigits(invoice.number) : ''}`}
      description="موجودی به انبار برمی‌گردد و ثبت درآمد این فروش اصلاح می‌شود؛ اصل سند باقی می‌ماند. ابطال به‌تنهایی وجهی به مشتری برنمی‌گرداند."
      confirmLabel="تأیید ابطال و برگشت موجودی"
      destructive
      onConfirm={async () => {
        if (invoice?.id == null) return;
        if (received > 0 && !acknowledged)
          throw new Error(
            'ابتدا تأیید کنید که دریافت قبلی باید در حساب مشتری بماند یا جداگانه برگشت بخورد.',
          );
        await voidInvoice(invoice.id, reason);
        toast.success('فاکتور باطل شد؛ موجودی و درآمد اصلاح شدند.');
        onVoided?.();
      }}
    >
      <div className="space-y-3">
        {received > 0 && (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-6 dark:border-amber-900 dark:bg-amber-950/30">
            <p className="font-bold">این سند {formatMoney(received, unit)} دریافت خالص دارد.</p>
            <p>
              پس از ابطال، دریافت‌ها پاک نمی‌شوند و بستانکاری مشتری باقی می‌ماند. برای عودت وجه، از
              «برگشت وجه» در تاریخچه سند استفاده کنید.
            </p>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              متوجه شدم که ابطال، پرداخت را برنمی‌گرداند.
            </label>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="void-reason">دلیل ابطال *</Label>
          <Textarea
            id="void-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="مثلاً انصراف مشتری و برگشت کامل کالا"
            maxLength={500}
          />
        </div>
      </div>
    </ConfirmDialog>
  );
}
