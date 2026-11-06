import { useRef, useState } from 'react';
import { DatabaseBackup, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { importBackupFile, summarizeImport } from '@/core/db/server-import';
import { useAuthStore } from '@/store/auth-store';

/**
 * انتقال دادهٔ نسخهٔ آفلاین به سرور.
 *
 * کاربر فایل پشتیبان JSON خود را از اپ آفلاین (تنظیمات ← پشتیبان‌گیری) می‌آورد و
 * اینجا بارگذاری می‌کند. درج ادغامی است: ردیف‌هایی که از قبل روی سرور هستند
 * دست‌نخورده می‌مانند و شناسه‌ها حفظ می‌شوند.
 */
export function ImportLocalBackupCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const storeName = useAuthStore((state) => state.user?.store?.name ?? null);

  async function handleFile(file: File | undefined): Promise<void> {
    if (!file) return;

    setBusy(true);
    setSummary(null);

    try {
      const result = await importBackupFile(file);
      const message = summarizeImport(result);
      setSummary(message);
      toast.success(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'انتقال داده با خطا مواجه شد.';
      toast.error(message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <DatabaseBackup className="h-5 w-5 text-primary" aria-hidden />
          انتقال دادهٔ دستگاه به سرور
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          اگر تا حالا با نسخهٔ آفلاین کار می‌کردید، از آن نسخه یک فایل پشتیبان بگیرید (تنظیمات ←
          پشتیبان‌گیری ← دریافت فایل) و اینجا بارگذاری کنید تا داده‌ها به حساب
          {storeName ? ` «${storeName}»` : ''} روی سرور منتقل شوند. ردیف‌هایی که از قبل روی سرور
          هستند دست‌نخورده می‌مانند؛ پس اجرای دوباره خطا یا دادهٔ تکراری نمی‌سازد.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="gap-2"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Upload className="h-4 w-4" aria-hidden />
            )}
            {busy ? 'در حال انتقال…' : 'انتخاب فایل پشتیبان'}
          </Button>
          <span className="text-xs text-muted-foreground">فایل JSON نسخهٔ آفلاین (کارو)</span>
        </div>

        {summary && (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
            {summary}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
