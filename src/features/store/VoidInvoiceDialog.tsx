import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { Invoice } from '@/core/db/db';
import { toFaDigits } from '@/core/currency/currency';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { voidInvoice } from './invoice.service';

export function VoidInvoiceDialog({
  invoice,
  onOpenChange,
  onVoided,
}: {
  invoice: Invoice | null;
  onOpenChange: (open: boolean) => void;
  onVoided?: () => void;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    setReason('');
  }, [invoice?.id]);
  return (
    <ConfirmDialog
      open={invoice !== null}
      onOpenChange={onOpenChange}
      title={`ابطال فاکتور ${invoice ? toFaDigits(invoice.number) : ''}`}
      description="موجودی به انبار برمی‌گردد، درآمد خودکار این فروش حذف می‌شود و سند با وضعیت باطل‌شده در سوابق می‌ماند. بازپرداخت بانکی خودکار انجام نمی‌شود؛ وجه دریافتی را خودتان برگردانید. دریافت‌های قبلی نسیه به بستانکاری مشتری تبدیل می‌شوند."
      confirmLabel="تأیید ابطال و برگشت موجودی"
      destructive
      onConfirm={async () => {
        if (invoice?.id != null) {
          await voidInvoice(invoice.id, reason);
          toast.success('فاکتور باطل شد؛ موجودی و درآمد اصلاح شدند.');
          onVoided?.();
        }
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="void-reason">دلیل ابطال *</Label>
        <Textarea
          id="void-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="مثلاً انصراف مشتری و برگشت کامل کالا"
          maxLength={300}
        />
      </div>
    </ConfirmDialog>
  );
}
