<?php

namespace App\Services\Demo;

use App\Models\Store;
use App\Models\User;
use App\Services\Billing\LicenseService;
use App\Support\AuditLogger;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * دموی امن کارو.
 *
 * هر دمو یک فروشگاه واقعیِ جدا با کاربر مستقل و لایسنس آزمایشی کوتاه‌عمر است.
 * اصول:
 * - هیچ پرداخت/سفارش/فاکتور اشتراکی جعلی ساخته نمی‌شود؛ فقط دادهٔ عملیاتی نمونه.
 * - دمو با آمار واقعی مدیر (درآمد، مشترکان) قاطی نمی‌شود و در فهرست مشترکان نمی‌آید.
 * - پایان دمو = حذف کامل داده؛ هیچ داده‌ای از مشتری واقعی لمس نمی‌شود.
 */
class DemoService
{
    public function __construct(private readonly LicenseService $licenses) {}

    public function enabled(): bool
    {
        return (bool) config('demo.enabled', true);
    }

    public function hours(): int
    {
        return max(1, min(72, (int) config('demo.hours', 24)));
    }

    /**
     * ساخت دمو (فروشگاه + کاربر + لایسنس + دادهٔ نمونه).
     *
     * @return array{store: Store, user: User, expires_at: string}
     */
    public function create(): array
    {
        if (! $this->enabled()) {
            throw ValidationException::withMessages([
                'demo' => ['دموی آنلاین فعلاً غیرفعال است.'],
            ]);
        }

        $this->purgeExpired();
        $this->assertCapacity();

        $hours = $this->hours();
        $code = $this->code();
        $expiresAt = now()->addHours($hours);

        /** @var array{store: Store, user: User, expires_at: string} $result */
        $result = DB::transaction(function () use ($code, $expiresAt, $hours): array {
            $store = Store::create([
                'name' => 'دموی کارو — '.$code,
                'slug' => 'demo-'.$code,
                'owner_name' => 'کاربر دمو',
                'is_active' => true,
                'is_demo' => true,
                'demo_expires_at' => $expiresAt,
            ]);

            $user = User::create([
                // دامنهٔ رزروشده: هیچ ایمیلی به این آدرس نمی‌رود و قابل ثبت‌نام نیست.
                'email' => 'demo-'.$code.'@demo.invalid',
                'name' => 'کاربر دمو',
                'password' => Str::password(32),
                'role' => User::ROLE_STORE,
                'store_id' => $store->getKey(),
                'is_active' => true,
            ]);

            // email_verified_at در $fillable نیست؛ صریح ثبت می‌شود.
            $user->forceFill(['email_verified_at' => now()])->save();

            $this->licenses->startDemo($store, $hours, $user->getKey());

            if (config('demo.seed_data', true)) {
                $this->seed($store);
            }

            AuditLogger::record('demo_created', [
                'store_id' => $store->getKey(),
                'user_id' => $user->getKey(),
                'subject_type' => 'store',
                'subject_key' => $store->getKey(),
                'meta' => [
                    'code' => $code,
                    'hours' => $hours,
                    'store' => $store->name,
                ],
            ]);

            return [
                'store' => $store,
                'user' => $user,
                'expires_at' => $expiresAt->toIso8601String(),
            ];
        });

        return $result;
    }

    /** پایان دادن به دمو و حذف کامل دادهٔ آن. */
    public function end(Store $store, string $reason = 'user_request'): void
    {
        $snapshot = [
            'store_id' => $store->getKey(),
            'name' => $store->name,
            'reason' => $reason,
        ];

        // ممیزی پیش از حذف ثبت می‌شود تا ارجاع کاربر/فروشگاه معتبر باشد
        // (کلیدهای خارجی دفتر رویداد با حذف، خودکار null می‌شوند).
        AuditLogger::record('demo_ended', [
            'store_id' => $store->getKey(),
            'user_id' => null,
            'subject_type' => 'store',
            'subject_key' => $snapshot['store_id'],
            'meta' => $snapshot,
        ]);

        DB::transaction(function () use ($store): void {
            User::query()->where('store_id', $store->getKey())->delete();
            $store->delete();
        });
    }

    /** پاک‌سازی همهٔ دموهای منقضی. خروجی: تعداد حذف‌شده. */
    public function purgeExpired(): int
    {
        $expired = Store::query()
            ->where('is_demo', true)
            ->whereNotNull('demo_expires_at')
            ->where('demo_expires_at', '<=', now())
            ->limit(200)
            ->get();

        $count = 0;

        foreach ($expired as $store) {
            try {
                $this->end($store, 'expired');
                $count++;
            } catch (Throwable $exception) {
                report($exception);
            }
        }

        return $count;
    }

    /** آیا ظرفیت دمو پر است؟ */
    public function activeCount(): int
    {
        return Store::query()->where('is_demo', true)->count();
    }

    private function assertCapacity(): void
    {
        $max = max(1, (int) config('demo.max_active', 40));

        if ($this->activeCount() >= $max) {
            throw ValidationException::withMessages([
                'demo' => ['ظرفیت دموهای هم‌زمان پر است؛ چند دقیقهٔ دیگر دوباره تلاش کنید.'],
            ]);
        }
    }

    private function code(): string
    {
        do {
            $code = Str::lower(Str::random(6));
        } while (Store::query()->where('slug', 'demo-'.$code)->exists());

        return $code;
    }

    /**
     * دادهٔ نمونهٔ علامت‌خورده در فروشگاه دمو.
     *
     * همهٔ ردیف‌ها با شمارندهٔ همگام‌سازی (`rev`) درج می‌شوند تا کلاینت سروری
     * آن‌ها را در اولین pull بگیرد.
     */
    private function seed(Store $store): void
    {
        $storeId = (int) $store->getKey();
        $rev = 0;

        /** @var callable(string, array<string, mixed>): int $insert */
        $insert = function (string $table, array $row) use ($storeId, &$rev): int {
            $rev++;

            return (int) DB::table($table)->insertGetId([
                ...$row,
                'store_id' => $storeId,
                'rev' => $rev,
                'deleted_at' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        };

        $products = [
            ['چای کیسه‌ای ۲۵ عددی', 'خواربار', 85_000, 120_000, 40, 'بسته'],
            ['روغن سرخ‌کردنی ۱٫۸ لیتری', 'خواربار', 180_000, 235_000, 24, 'بطری'],
            ['برنج ایرانی ۵ کیلویی', 'خواربار', 620_000, 750_000, 18, 'کیسه'],
            ['شیر پرچرب ۱ لیتری', 'لبنیات', 32_000, 42_000, 60, 'عدد'],
            ['ماست دبه‌ای ۲ کیلویی', 'لبنیات', 95_000, 128_000, 15, 'دبه'],
            ['دستمال کاغذی ۳۰۰ برگ', 'بهداشتی', 55_000, 78_000, 32, 'بسته'],
            ['مایع ظرفشویی ۱ لیتری', 'بهداشتی', 48_000, 69_000, 22, 'بطری'],
            ['تخم‌مرغ ۳۰ عددی', 'پروتئین', 210_000, 265_000, 12, 'شانه'],
        ];

        $productIds = [];

        foreach ($products as [$name, $category, $buy, $sell, $stock, $unit]) {
            $productIds[] = $insert('products', [
                'name' => $name,
                'barcode' => null,
                'category' => $category,
                'buy_price' => $buy,
                'buy_tax_percent' => 0,
                'shipping_per_unit' => 0,
                'overhead_per_unit' => 0,
                'cost_price' => $buy,
                'sell_price' => $sell,
                'stock' => $stock,
                'unit' => $unit,
                'min_stock' => 5,
            ]);
        }

        $customers = [
            ['فروشگاه گلستان', '02133445566', 'تهران، خیابان ولیعصر'],
            ['کافه رستوران نارنج', '02177889900', 'تهران، سعادت‌آباد'],
            ['خانم رضایی', '09121234567', null],
            ['شرکت پخش آفتاب', '02144332211', 'کرج، عظیمیه'],
        ];

        $customerIds = [];

        foreach ($customers as [$name, $phone, $address]) {
            $customerIds[] = $insert('customers', [
                'name' => $name,
                'phone' => $phone,
                'address' => $address,
                'notes' => 'مشتری نمونه (دمو)',
            ]);
        }

        // فاکتورهای نمونهٔ دو هفتهٔ گذشته؛ یکی نسیه و یکی باطل‌شده برای نمایش ابزارها.
        $invoices = [
            ['days' => 18, 'items' => [[0, 3], [3, 6]], 'credit' => false, 'method' => 'cash'],
            ['days' => 14, 'items' => [[2, 1], [1, 2]], 'credit' => true, 'method' => 'credit'],
            ['days' => 10, 'items' => [[5, 4]], 'credit' => false, 'method' => 'card'],
            ['days' => 6, 'items' => [[4, 2], [7, 3]], 'credit' => false, 'method' => 'card'],
            ['days' => 3, 'items' => [[0, 2], [6, 1], [3, 4]], 'credit' => false, 'method' => 'cash'],
            ['days' => 0, 'items' => [[1, 1], [2, 1]], 'credit' => true, 'method' => 'credit'],
        ];

        $taxPercent = 10;
        $number = 1001;

        foreach ($invoices as $index => $invoice) {
            $date = now()->subDays($invoice['days'])->setTime(11, 30);
            $subtotal = 0;
            $lines = [];

            foreach ($invoice['items'] as [$productIndex, $qty]) {
                $price = $products[$productIndex][3];
                $cost = $products[$productIndex][2];
                $total = $qty * $price;
                $subtotal += $total;
                $lines[] = [
                    'product_id' => $productIds[$productIndex],
                    'name' => $products[$productIndex][0],
                    'qty' => $qty,
                    'unit_price' => $price,
                    'unit' => $products[$productIndex][5],
                    'unit_cost' => $cost,
                    'total' => $total,
                ];
            }

            $taxAmount = (int) round($subtotal * $taxPercent / 100);
            $isCredit = (bool) $invoice['credit'];

            $currentNumber = $number++;

            $invoiceId = $insert('invoices', [
                'number' => $currentNumber,
                'date' => $date,
                'customer_name' => $customers[$index % count($customers)][0],
                'customer_id' => $customerIds[$index % count($customerIds)],
                'is_credit' => $isCredit,
                'subtotal' => $subtotal,
                'discount_type' => 'amount',
                'discount_value' => 0,
                'discount_amount' => 0,
                'tax_percent' => $taxPercent,
                'tax_amount' => $taxAmount,
                'shipping_amount' => 0,
                'other_amount' => 0,
                'total' => $subtotal + $taxAmount,
                'due_date' => $date->copy()->addDays(30),
                'status' => 'completed',
                'source' => 'invoice',
                'payment_method' => $invoice['method'],
                'note' => 'فاکتور نمونهٔ دمو',
                'revision' => 1,
                'issued_at' => $date,
                'checkout_key' => 'demo-'.$storeId.'-'.$currentNumber,
            ]);

            foreach ($lines as $line) {
                $insert('invoice_items', [
                    'invoice_id' => $invoiceId,
                    ...$line,
                    'discount_type' => 'amount',
                    'discount_value' => 0,
                    'discount_amount' => 0,
                ]);
            }
        }

        // یک فاکتور باطل‌شده تا مسیر «ابطال با دلیل» هم در دمو دیده شود.
        $voidNumber = $number++;
        $voidTotal = $products[0][3];

        $voidId = $insert('invoices', [
            'number' => $voidNumber,
            'date' => now()->subDays(8)->setTime(16, 0),
            'customer_name' => $customers[2][0],
            'customer_id' => $customerIds[2],
            'is_credit' => false,
            'subtotal' => $voidTotal,
            'discount_type' => 'amount',
            'discount_value' => 0,
            'discount_amount' => 0,
            'tax_percent' => $taxPercent,
            'tax_amount' => (int) round($voidTotal * $taxPercent / 100),
            'shipping_amount' => 0,
            'other_amount' => 0,
            'total' => $voidTotal + (int) round($voidTotal * $taxPercent / 100),
            'status' => 'voided',
            'source' => 'invoice',
            'payment_method' => 'cash',
            'note' => 'نمونهٔ فاکتور باطل‌شده',
            'revision' => 2,
            'issued_at' => now()->subDays(8)->setTime(16, 0),
            'voided_at' => now()->subDays(8)->setTime(17, 0),
            'void_reason' => 'اشتباه در تعداد اقلام (نمونهٔ دمو)',
        ]);

        $insert('invoice_items', [
            'invoice_id' => $voidId,
            'product_id' => $productIds[0],
            'name' => $products[0][0],
            'qty' => 1,
            'unit_price' => $voidTotal,
            'unit' => $products[0][5],
            'unit_cost' => $products[0][2],
            'discount_type' => 'amount',
            'discount_value' => 0,
            'discount_amount' => 0,
            'total' => $voidTotal,
        ]);

        DB::table('sync_counters')->updateOrInsert(
            ['store_id' => $storeId],
            ['rev' => $rev, 'created_at' => now(), 'updated_at' => now()],
        );
    }
}
