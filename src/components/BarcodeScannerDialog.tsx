import { useEffect, useRef, useState } from 'react';
import { Camera, Keyboard, ScanBarcode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// API تشخیص بارکد هنوز در تایپ‌های استاندارد TS نیست — حداقل تایپ لازم
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats: string[] }) => BarcodeDetectorLike;
  }
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (code: string) => void;
}

/**
 * اسکن بارکد با دوربین (BarcodeDetector) — در مرورگرهای بدون پشتیبانی،
 * ورود دستی بارکد نمایش داده می‌شود تا قابلیت همیشه قابل استفاده باشد.
 */
export function BarcodeScannerDialog({ open, onOpenChange, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'unsupported' | 'denied'>(
    'starting',
  );
  const [manual, setManual] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus('starting');
    setManual('');

    const stop = () => {
      if (timerRef.current != null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    const start = async () => {
      if (!window.BarcodeDetector || !navigator.mediaDevices?.getUserMedia) {
        setStatus('unsupported');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const detector = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'],
        });
        setStatus('scanning');
        timerRef.current = window.setInterval(async () => {
          if (cancelled || !videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const value = codes[0]?.rawValue?.trim();
            if (value) {
              stop();
              onDetected(value);
              onOpenChange(false);
            }
          } catch {
            // فریم نامناسب — ادامه‌ی اسکن
          }
        }, 350);
      } catch {
        if (!cancelled) setStatus('denied');
      }
    };

    void start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [open, onDetected, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanBarcode className="h-5 w-5 text-primary dark:text-neon-400" aria-hidden />
            اسکن بارکد کالا
          </DialogTitle>
          <DialogDescription>
            بارکد را جلوی دوربین بگیرید؛ یا اگر دوربین در دسترس نیست، کد را دستی وارد کنید.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-xl bg-navy-950" dir="ltr">
            <video
              ref={videoRef}
              className="aspect-[4/3] w-full object-cover"
              playsInline
              muted
              aria-label="تصویر دوربین برای اسکن بارکد"
            />
            {status === 'scanning' && (
              <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 animate-pulse rounded bg-neon-500 shadow-glow" />
            )}
            {status !== 'scanning' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-navy-950/85 p-4 text-center text-sm text-white/80">
                <Camera className="h-8 w-8 text-white/50" aria-hidden />
                {status === 'starting' && 'در حال آماده‌سازی دوربین…'}
                {status === 'unsupported' &&
                  'مرورگر شما اسکن خودکار بارکد را پشتیبانی نمی‌کند؛ از ورود دستی پایین استفاده کنید.'}
                {status === 'denied' &&
                  'دسترسی به دوربین داده نشد؛ از ورود دستی پایین استفاده کنید.'}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="barcode-manual" className="flex items-center gap-1.5">
              <Keyboard className="h-4 w-4" aria-hidden />
              ورود دستی بارکد / یا استفاده از بارکدخوان USB
            </Label>
            <div className="flex gap-2">
              <Input
                id="barcode-manual"
                dir="ltr"
                className="text-left"
                placeholder="6260..."
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && manual.trim()) {
                    onDetected(manual.trim());
                    onOpenChange(false);
                  }
                }}
              />
              <Button
                variant="neon"
                disabled={!manual.trim()}
                onClick={() => {
                  onDetected(manual.trim());
                  onOpenChange(false);
                }}
              >
                یافتن کالا
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
