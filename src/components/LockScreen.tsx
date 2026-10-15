import { useState } from 'react';
import { assetUrl } from '@/lib/utils';
import { motion } from 'framer-motion';
import { LockKeyhole } from 'lucide-react';
import { db } from '@/core/db/db';
import { verifyPin } from '@/core/utils/pin';
import { useLockStore } from '@/store/lock-store';
import { useSettingsStore } from '@/store/settings-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from 'sonner';

/** صفحه‌ی قفل برنامه — وقتی PIN تنظیم شده باشد، پیش از ورود نمایش داده می‌شود. */
export function LockScreen() {
  const pinHash = useSettingsStore((s) => s.pinHash);
  const unlock = useLockStore((s) => s.unlock);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [checking, setChecking] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);

  const submit = async () => {
    if (!pinHash) {
      unlock();
      return;
    }
    setChecking(true);
    try {
      const ok = await verifyPin(pin, pinHash);
      if (ok) {
        setError(null);
        unlock();
        toast.success('خوش آمدید!');
      } else {
        setAttempts((a) => a + 1);
        setError('پین اشتباه است. دوباره تلاش کنید.');
        setPin('');
      }
    } catch {
      setError('خطا در بررسی پین رخ داد.');
    } finally {
      setChecking(false);
    }
  };

  const wipeEverything = async () => {
    await db.delete();
    localStorage.removeItem('hesabyar-settings');
    localStorage.removeItem('hesabyar-calc-history');
    window.location.reload();
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-navy-900 p-4" dir="rtl">
      <motion.div
        key={attempts}
        initial={attempts > 0 ? { x: 0 } : false}
        animate={attempts > 0 ? { x: [0, -12, 12, -8, 8, 0] } : undefined}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm rounded-3xl bg-card p-6 shadow-soft sm:p-8"
      >
        <div className="mb-5 flex flex-col items-center text-center">
          <img
            src={assetUrl('images/karensoft/KarenYar.png')}
            alt="لوگوی حساب‌یار"
            width={512}
            height={512}
            className="mb-3 h-16 w-16 rounded-2xl object-cover shadow-glow ring-1 ring-black/10"
          />
          <h1 className="text-xl font-extrabold">حساب‌یار قفل است</h1>
          <p className="mt-1 text-sm text-muted-foreground">برای ورود، پین خود را وارد کنید.</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="lock-pin" className="flex items-center gap-1.5">
              <LockKeyhole className="h-4 w-4" aria-hidden />
              پین ورود
            </Label>
            <Input
              id="lock-pin"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              dir="ltr"
              className="text-center text-2xl tracking-[0.5em]"
              maxLength={12}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/[^\d]/g, ''));
                setError(null);
              }}
              aria-invalid={!!error}
              aria-describedby={error ? 'lock-error' : undefined}
            />
            {error && (
              <p id="lock-error" role="alert" className="text-center text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
          <Button
            type="submit"
            variant="neon"
            size="lg"
            className="w-full"
            disabled={checking || pin.length < 4}
          >
            {checking ? 'در حال بررسی…' : 'باز کردن قفل'}
          </Button>
        </form>

        <button
          className="mt-5 w-full text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => setWipeOpen(true)}
        >
          پین را فراموش کرده‌ام — شروع دوباره و پاک‌کردن همه‌ی داده‌ها
        </button>
      </motion.div>

      <ConfirmDialog
        open={wipeOpen}
        onOpenChange={setWipeOpen}
        title="پاک‌کردن همه‌چیز و شروع دوباره"
        description="بدون پین راهی برای ورود نیست. با این کار همه‌ی داده‌های برنامه (کالا، فاکتور، تراکنش، کارمند و…) برای همیشه پاک و برنامه مثل روز اول می‌شود. مطمئن هستید؟"
        confirmLabel="بله، همه را پاک کن"
        destructive
        onConfirm={wipeEverything}
      />
    </div>
  );
}
