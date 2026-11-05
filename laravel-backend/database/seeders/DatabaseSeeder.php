<?php

namespace Database\Seeders;

use App\Models\Analysis;
use App\Models\Invoice;
use App\Models\News;
use App\Models\Price;
use App\Models\Setting;
use App\Models\User;
use App\Support\InvoiceCalculator;
use App\Support\InvoiceNumber;
use App\Support\Products;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // ---------- Settings ----------
        Setting::put('contact_phone', '09123456789');
        Setting::put('verify_phone', '09123456789');
        Setting::put('auto_update', '1');
        Setting::put('last_refresh_at', now()->toDateTimeString());

        // ---------- Prices for every product ----------
        $samplePrices = [
            Products::DOLLAR => ['buy' => 640000, 'sell' => 648000],
            Products::SEKE_TAMAM => ['buy' => 57850000, 'sell' => 58450000],
            Products::SEKE_EMAMI => ['buy' => 57100000, 'sell' => 57700000],
            Products::NIM_SEKE => ['buy' => 31200000, 'sell' => 31600000],
            Products::ROB_SEKE => ['buy' => 17850000, 'sell' => 18150000],
            Products::GOLD18 => ['buy' => 3520000, 'sell' => 3620000],
        ];

        foreach (Products::keys() as $product) {
            Price::updateOrCreate(
                ['product' => $product],
                [
                    'buy_price' => $samplePrices[$product]['buy'],
                    'sell_price' => $samplePrices[$product]['sell'],
                ],
            );
        }

        // ---------- Admin account ----------
        $admin = User::updateOrCreate(
            ['phone' => '09120000000'],
            [
                'name' => 'مدیر فروشگاه',
                'password' => 'admin123', // hashed by the model cast
                'role' => 'admin',
                'status' => 'approved',
                'verification_code' => null,
            ],
        );

        // ---------- Sample customer with a few invoices ----------
        /*$customer = User::updateOrCreate(
            ['phone' => '09121111111'],
            [
                'name' => 'مشتری نمونه',
                'password' => 'customer123',
                'role' => 'user',
                'status' => 'approved',
                'verification_code' => null,
            ],
        );

        if ($customer->invoices()->count() === 0) {
            $this->sampleInvoice($customer, Products::GOLD18, 'buy', 21.5, 3520000, 7, 8, 9, 0, 'خرید طلای آب‌شده');
            $this->sampleInvoice($customer, Products::SEKE_EMAMI, 'buy', 2, 57100000);
            $this->sampleInvoice($customer, Products::DOLLAR, 'buy', 500, 640000, 0, 0, 0, 2.5, 'خرید دلار برای سفر');
        }*/

        // ---------- Sample news & analyses ----------
        if (News::count() === 0) {
            News::create(['title' => 'قیمت طلا امروز صعودی شد', 'body' => "قیمت طلای ۱۸ عیار امروز با افزایش همراه بود و به نرخ … رسید.\n\nکارشناسان علت این رشد را افزایش قیمت اونس جهانی و نوسانات ارزی عنوان می‌کنند."]);
            News::create(['title' => 'بازار سکه در انتظار تصمیم بانک مرکزی', 'body' => 'بازار سکه در روزهای اخیر حالتی انتظاری به خود گرفته است و فعالان بازار منتظر تصمیم‌های جدید بانک مرکزی هستند.']);
            News::create(['title' => 'نرخ ارز در بازار آزاد', 'body' => 'بازار ارز امروز شاهد نوسان محدودی بود و دلار در محدوده … معامله شد.']);
        }

        if (Analysis::count() === 0) {
            Analysis::create(['title' => 'تحلیل تکنیکال طلای ۱۸ عیار', 'body' => "روند کوتاه‌مدت قیمت طلای ۱۸ عیار صعودی ارزیابی می‌شود.\n\nسطوح حمایتی مهم در محدوده … و مقاومت اصلی در … قرار دارد. پیشنهاد می‌شود سرمایه‌گذاری در سقف مقاومت با احتیاط همراه باشد."]);
            Analysis::create(['title' => 'تحلیل بازار سکه', 'body' => 'سکه امامی پس از یک اصلاح کوتاه، دوباره به سمت مقاومت … حرکت کرده است. در صورت تثبیت بالای این سطح، هدف بعدی … خواهد بود.']);
        }
    }

    /**
     * Create a sample invoice for a user.
     */
    protected function sampleInvoice(
        User $user,
        string $product,
        string $kind,
        float $quantity,
        int $unitPrice,
        float $labor = 0,
        float $profit = 0,
        float $vat = 0,
        float $commission = 0,
        ?string $description = null,
    ): void {
        $breakdown = InvoiceCalculator::calculate(
            $product,
            $quantity,
            $unitPrice,
            $labor,
            $profit,
            $vat,
            $commission,
        );

        Invoice::create([
            'invoice_no' => InvoiceNumber::next(),
            'user_id' => $user->id,
            'product' => $product,
            'kind' => $kind,
            'quantity' => $quantity,
            'unit_price' => $unitPrice,
            'labor_percent' => $labor,
            'profit_percent' => $profit,
            'vat_percent' => $vat,
            'commission_percent' => $commission,
            'total' => $breakdown['total'],
            'description' => $description,
        ]);
    }
}
