import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PaymentMethod } from '@/core/db/db';
import type { NewInvoiceItemInput } from '@/features/store/invoice.service';
import { useSettingsStore } from './settings-store';

export interface InvoiceEditorForm {
  checkoutKey: string;
  customerId: number | null;
  customerName: string;
  paymentMethod: PaymentMethod;
  date: string;
  dueDate: string;
  items: NewInvoiceItemInput[];
  discountType: 'percent' | 'amount';
  discountValue: number;
  taxPercent: number;
  shippingAmount: number;
  otherAmount: number;
  note: string;
  terms: string;
  internalNote: string;
}

export function emptyInvoiceEditor(taxPercent = 0): InvoiceEditorForm {
  return {
    checkoutKey: crypto.randomUUID(),
    customerId: null,
    customerName: '',
    paymentMethod: 'card',
    date: new Date().toISOString(),
    dueDate: '',
    items: [],
    discountType: 'percent',
    discountValue: 0,
    taxPercent,
    shippingAmount: 0,
    otherAmount: 0,
    note: '',
    terms: '',
    internalNote: '',
  };
}

interface InvoiceEditorState {
  draft: InvoiceEditorForm;
  replace: (draft: InvoiceEditorForm) => void;
  reset: (taxPercent?: number) => void;
}

/** بازیابی خودکار فرم جدید روی همین دستگاه؛ پیش‌نویس حسابداری فقط با ذخیره در DB ساخته می‌شود. */
export const useInvoiceEditorStore = create<InvoiceEditorState>()(
  persist(
    (set) => ({
      draft: emptyInvoiceEditor(useSettingsStore.getState().invoiceTaxPercent),
      replace: (draft) => set({ draft }),
      reset: (taxPercent = 0) => set({ draft: emptyInvoiceEditor(taxPercent) }),
    }),
    { name: 'hesabyar-invoice-editor', version: 1 },
  ),
);
