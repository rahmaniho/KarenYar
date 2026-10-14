/**
 * وضعیت قفل برنامه — اگر برای برنامه PIN تنظیم شده باشد، در شروع قفل است.
 * مقدار اولیه مستقیم از localStorage خوانده می‌شود تا قبل از اولین رندر مشخص باشد.
 */
import { create } from 'zustand';

function hasPinConfigured(): boolean {
  try {
    const raw = localStorage.getItem('hesabyar-settings');
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { state?: { pinHash?: string | null } };
    return !!parsed.state?.pinHash;
  } catch {
    return false;
  }
}

interface LockState {
  locked: boolean;
  lock: () => void;
  unlock: () => void;
}

export const useLockStore = create<LockState>()((set) => ({
  locked: hasPinConfigured(),
  lock: () => set({ locked: true }),
  unlock: () => set({ locked: false }),
}));
