import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SaleDraft, SaleDraftItem } from '@/core/db/db';

export function emptySale(taxPercent = 0): SaleDraft {
  return {
    items: [],
    customerId: null,
    customerName: '',
    discountType: 'percent',
    discountValue: 0,
    taxPercent,
    note: '',
    checkoutKey:
      globalThis.crypto?.randomUUID?.() ??
      `sale-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  };
}

interface PosState {
  draft: SaleDraft;
  heldSaleId: number | null;
  patch: (patch: Partial<Omit<SaleDraft, 'checkoutKey'>>) => void;
  setItems: (items: SaleDraftItem[]) => void;
  reset: (taxPercent?: number) => void;
  resume: (draft: SaleDraft, heldSaleId: number) => void;
}

/** مبلغ‌های سبد همیشه تومان‌اند؛ تغییر واحد نمایشی روی پیش‌نویس اثر نمی‌گذارد. */
export const usePosStore = create<PosState>()(
  persist(
    (set) => ({
      draft: emptySale(),
      heldSaleId: null,
      patch: (patch) => set((state) => ({ draft: { ...state.draft, ...patch } })),
      setItems: (items) => set((state) => ({ draft: { ...state.draft, items } })),
      reset: (taxPercent = 0) => set({ draft: emptySale(taxPercent), heldSaleId: null }),
      resume: (draft, heldSaleId) => set({ draft, heldSaleId }),
    }),
    { name: 'hesabyar-pos-draft', version: 1 },
  ),
);
