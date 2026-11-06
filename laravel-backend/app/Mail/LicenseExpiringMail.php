<?php

namespace App\Mail;

use App\Models\License;
use App\Models\Store;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * ایمیل یادآوری تمدید لایسنس.
 *
 * متن بر اساس روزهای باقی‌مانده انتخاب می‌شود: هشدار ۳۰ روز، هشدار ۷ روز و
 * اطلاع انقضا. لینک تمدید به بخش اشتراک همان برنامه می‌رود.
 */
class LicenseExpiringMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public Store $store,
        public License $license,
        public int $daysLeft,
        public string $renewUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: match (true) {
                $this->daysLeft > 0 => "لایسنس کارو تا {$this->daysLeft} روز دیگر تمدید شود",
                $this->daysLeft === 0 => 'امروز آخرین روز اعتبار لایسنس کارو است',
                default => 'اعتبار لایسنس کارو به پایان رسید',
            },
        );
    }

    public function content(): Content
    {
        return new Content(view: 'mail.license-expiring');
    }
}
