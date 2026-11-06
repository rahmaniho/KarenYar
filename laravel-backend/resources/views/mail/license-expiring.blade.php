<!DOCTYPE html>
<html lang="fa" dir="rtl">
    <body style="margin:0;padding:24px;background:#0b1220;font-family:Tahoma,'Segoe UI',sans-serif;color:#e8eefc;">
        <div style="max-width:560px;margin:0 auto;background:#111c33;border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:28px;">
            <h1 style="margin:0 0 12px;font-size:20px;color:#f5d489;">کارو نرم افزار حسابداری</h1>

            <p style="margin:0 0 12px;line-height:2;font-size:14px;">
                سلام {{ $store->owner_name ?: $store->name }} عزیز،
            </p>

            @if ($daysLeft > 0)
                <p style="margin:0 0 12px;line-height:2;font-size:14px;">
                    اعتبار لایسنس فروشگاه «{{ $store->name }}» تا
                    <b>{{ \App\Support\Jalali::long($license->expires_at) }}</b>
                    یعنی <b>{{ \App\Support\Jalali::digits($daysLeft) }} روز دیگر</b> ادامه دارد.
                    با تمدید به‌موقع، دسترسی به گزارش‌ها و صدور فاکتور بدون وقفه ادامه پیدا می‌کند.
                </p>
            @elseif ($daysLeft === 0)
                <p style="margin:0 0 12px;line-height:2;font-size:14px;">
                    امروز آخرین روز اعتبار لایسنس فروشگاه «{{ $store->name }}» است.
                    با تمدید امروز، فردا هم بدون وقفه فاکتور می‌زنید.
                </p>
            @else
                <p style="margin:0 0 12px;line-height:2;font-size:14px;">
                    اعتبار لایسنس فروشگاه «{{ $store->name }}» در تاریخ
                    <b>{{ \App\Support\Jalali::long($license->expires_at) }}</b>
                    به پایان رسید. داده‌های شما کاملاً محفوظ است و با تمدید، همه‌چیز مثل قبل ادامه می‌یابد.
                </p>
            @endif

            <p style="margin:20px 0;">
                <a href="{{ $renewUrl }}"
                   style="display:inline-block;background:#f5d489;color:#0b1220;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:12px;">
                    تمدید اشتراک
                </a>
            </p>

            <p style="margin:16px 0 0;line-height:2;font-size:12px;color:#9fb0d0;">
                بستهٔ فعلی: {{ $license->tier === 'proplus' ? 'کامل (Pro+)' : 'حرفه‌ای' }} —
                تاریخ انقضا: {{ \App\Support\Jalali::numeric($license->expires_at) }}
            </p>

            <p style="margin:16px 0 0;line-height:2;font-size:12px;color:#9fb0d0;">
                اگر تمدید را انجام داده‌اید و این پیام را می‌بینید، نیازی به کار دیگری نیست؛
                وضعیت اشتراک در بخش «تنظیمات ← لایسنس و اشتراک» به‌روز می‌شود.
            </p>
        </div>
    </body>
</html>
