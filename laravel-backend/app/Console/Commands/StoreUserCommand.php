<?php

namespace App\Console\Commands;

use App\Models\Store;
use App\Models\User;
use App\Services\Billing\LicenseService;
use App\Support\AuditLogger;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

/**
 * ساخت یا بازنشانی حساب کاربر فروشگاه از خط فرمان.
 *
 * هیچ رمز پیش‌فرضی در کد یا Seeder وجود ندارد؛ برای راه‌اندازی اولیه یا پشتیبانی
 * این دستور را با ایمیل دلخواه اجرا کنید. اگر رمز داده نشود یک رمز قوی ساخته و
 * همان‌جا چاپ می‌شود (فقط یک‌بار قابل مشاهده است).
 *
 * نمونه:
 *   php artisan karo:store-user owner@shop.ir --create-store="فروشگاه من" --name="مالک"
 *   php artisan karo:store-user owner@shop.ir --store=12 --password="Ramz-12345"
 */
class StoreUserCommand extends Command
{
    protected $signature = 'karo:store-user
        {email : ایمیل ورود کاربر فروشگاه}
        {--name= : نام نمایشی کاربر}
        {--password= : رمز عبور (حداقل ۸ نویسه)؛ خالی بماند، ساخته می‌شود}
        {--store= : شناسه، نام یا اسلاگ فروشگاه موجود}
        {--create-store= : نام فروشگاه تازه (اگر وجود نداشته باشد ساخته می‌شود)}
        {--seats=1 : تعداد صندلی لایسنس فروشگاه تازه}
        {--trial-days= : طول دورهٔ آزمایشی فروشگاه تازه}';

    protected $description = 'ساخت یا بازنشانی کاربر فروشگاه برای راه‌اندازی و پشتیبانی';

    public function handle(LicenseService $licenses): int
    {
        $email = Str::lower(trim((string) $this->argument('email')));

        if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            $this->error('ایمیل معتبر نیست.');

            return self::FAILURE;
        }

        $password = (string) ($this->option('password') ?? '');
        $generated = false;

        if ($password === '') {
            $password = Str::password(14, symbols: false);
            $generated = true;
        } elseif (mb_strlen($password) < 8) {
            $this->error('رمز عبور باید حداقل ۸ نویسه باشد.');

            return self::FAILURE;
        }

        try {
            /** @var array{user: User, store: ?Store, created: bool} $result */
            $result = DB::transaction(function () use ($email, $password, $licenses): array {
                $store = $this->resolveStore($licenses);
                $user = User::query()->where('email', $email)->first();
                $created = $user === null;

                if ($user !== null) {
                    $user->fill([
                        'name' => (string) ($this->option('name') ?: $user->name),
                        'role' => User::ROLE_STORE,
                        'store_id' => $store?->getKey() ?? $user->store_id,
                        'is_active' => true,
                    ])->save();

                    $user->forceFill(['password' => $password])->save();
                } else {
                    if ($store === null) {
                        throw new RuntimeException(
                            'فروشگاه مشخص نشده است؛ از --store یا --create-store استفاده کنید.',
                        );
                    }

                    $user = User::create([
                        'name' => (string) ($this->option('name') ?: $store->name),
                        'email' => $email,
                        'password' => $password,
                        'role' => User::ROLE_STORE,
                        'store_id' => $store->getKey(),
                        'is_active' => true,
                        'email_verified_at' => now(),
                    ]);
                }

                return ['user' => $user, 'store' => $store ?? $user->store, 'created' => $created];
            });
        } catch (RuntimeException $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        } catch (Throwable $exception) {
            report($exception);
            $this->error('ساخت کاربر ناموفق بود: '.$exception->getMessage());

            return self::FAILURE;
        }

        $user = $result['user'];
        $store = $result['store'];

        AuditLogger::record($result['created'] ? 'store_user_created' : 'store_user_password_reset', [
            'store_id' => $store?->getKey(),
            'user_id' => $user->getKey(),
            'subject_type' => 'user',
            'subject_key' => $user->getKey(),
            'meta' => [
                'email' => $user->email,
                'store' => $store?->name,
                'via' => 'console',
                'password_generated' => $generated,
            ],
        ]);

        $this->newLine();
        $this->info($result['created'] ? 'کاربر فروشگاه ساخته شد.' : 'کاربر موجود به‌روزرسانی شد و رمز تازه ثبت شد.');
        $this->table(['فیلد', 'مقدار'], [
            ['فروشگاه', $store?->name ?? '—'],
            ['شناسهٔ فروشگاه', $store?->getKey() ?? '—'],
            ['ایمیل', (string) $user->email],
            ['رمز عبور', $password],
            ['نقش', (string) $user->role],
        ]);

        if ($generated) {
            $this->warn('این رمز فقط همین حالا نمایش داده می‌شود؛ آن را جای امن ذخیره کنید.');
        }

        $this->line('ورود: /login');

        return self::SUCCESS;
    }

    private function resolveStore(LicenseService $licenses): ?Store
    {
        $storeOption = $this->option('store');
        $createName = $this->option('create-store');

        if (filled($createName)) {
            $name = trim((string) $createName);

            $store = Store::query()
                ->where('name', $name)
                ->orWhere('slug', Str::slug($name))
                ->first();

            if ($store !== null) {
                return $store;
            }

            $store = Store::create([
                'name' => $name,
                'slug' => $this->uniqueSlug($name),
                'is_active' => true,
            ]);

            $licenses->startTrial(
                $store,
                null,
                $this->option('trial-days') !== null ? (int) $this->option('trial-days') : null,
                max(1, (int) $this->option('seats')),
            );

            return $store;
        }

        if (blank($storeOption)) {
            return null;
        }

        $raw = trim((string) $storeOption);

        $store = ctype_digit($raw)
            ? Store::query()->find((int) $raw)
            : Store::query()->where('slug', $raw)->orWhere('name', $raw)->first();

        if ($store === null) {
            throw new RuntimeException("فروشگاهی با «{$raw}» پیدا نشد.");
        }

        return $store;
    }

    private function uniqueSlug(string $name): string
    {
        $base = Str::slug(Str::ascii($name));
        $base = $base !== '' ? $base : 'store';

        $slug = $base;
        $suffix = 1;

        while (Store::query()->where('slug', $slug)->exists()) {
            $slug = $base.'-'.(++$suffix);
        }

        return $slug;
    }
}
