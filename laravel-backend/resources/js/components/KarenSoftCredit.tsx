import { assetUrl, cn } from '@/lib/utils';

/**
 * اعتبار «طراحی و توسعه توسط کارن سافت» در نوار پایینی فوتر
 * - از artwork اصلی لوگوی کارن‌سافت استفاده می‌کند (هرگز متن تایپ‌شده نیست تا فونت و رنگ برند دقیق بماند)
 * - انیمیشن هم دور نشان (حلقه‌ی نور چرخان + شناور ملایم) و هم روی متن (شیمر گرادیانی + برق روی وردمارک) اجرا می‌شود
 * - لینک به karen-soft.ir در تب تازه باز می‌شود
 */
export function KarenSoftCredit({ className }: { className?: string }) {
  return (
    <a
      href="https://www.karen-soft.ir"
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/5',
        className,
      )}
      aria-label="طراحی و توسعه توسط کارن سافت — وب‌سایت کارن سافت"
      title="کارن سافت — karen-soft.ir"
    >
      {/* نشان اصلی با حلقه‌ی نور چرخان */}
      <span className="ks-mark-ring" aria-hidden>
        <img
          src={assetUrl('images/karensoft/mark.png')}
          alt=""
          width={256}
          height={256}
          className="ks-mark-img"
        />
      </span>
      <span className="flex min-w-0 flex-col items-start gap-1.5">
        <span className="ks-credit-label">طراحی و توسعه توسط</span>
        {/* وردمارک اصلی روی چیپ روشن تا رنگ‌های دقیق برند روی فوتر تیره خوانا بماند */}
        <span className="ks-wordmark-chip">
          <img
            src={assetUrl('images/karensoft/wordmark-fa.png')}
            alt="کارن سافت"
            width={383}
            height={96}
            className="h-[18px] w-auto"
          />
        </span>
      </span>
    </a>
  );
}
