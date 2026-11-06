<?php

use App\Mail\LicenseExpiringMail;
use App\Models\License;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;

uses(RefreshDatabase::class);

/** فروشگاهی با لایسنس منقضی‌شونده در N روز. */
function reminderStore(int $days, ?bool $lifetime = false): array
{
    $store = Store::factory()->create(['license_reminder_stage' => 0]);

    User::factory()->forStore($store)->create(['email' => 'owner-'.uniqid().'@test.local']);

    $license = License::create([
        'store_id' => $store->id,
        'tier' => 'pro',
        'is_active' => true,
        'is_lifetime' => $lifetime,
        'starts_at' => now()->subMonths(11),
        'expires_at' => $lifetime ? null : now()->addDays($days),
    ]);

    return [$store, $license];
}

it('sends the 30-day notice once and remembers it', function () {
    Mail::fake();
    [$store] = reminderStore(20);

    $this->artisan('karo:licenses:remind')->assertSuccessful();

    Mail::assertSent(LicenseExpiringMail::class, 1);
    expect($store->fresh()->license_reminder_stage)->toBe(1);

    // اجرای بعدی نباید ایمیل تکراری بفرستد.
    $this->artisan('karo:licenses:remind')->assertSuccessful();
    Mail::assertSent(LicenseExpiringMail::class, 1);
});

it('escalates to the 7-day notice for the same store', function () {
    Mail::fake();
    [$store, $license] = reminderStore(5);

    $this->artisan('karo:licenses:remind')->assertSuccessful();

    Mail::assertSent(LicenseExpiringMail::class, 1);
    expect($store->fresh()->license_reminder_stage)->toBe(2);

    // تاریخ انقضا به فردا می‌رسد؛ باید هشدار انقضا (پنجرهٔ صفر) فرستاده شود.
    $license->forceFill(['expires_at' => now()->subDay()])->save();

    $this->artisan('karo:licenses:remind')->assertSuccessful();

    Mail::assertSent(LicenseExpiringMail::class, 2);
    expect($store->fresh()->license_reminder_stage)->toBe(3);

    $this->assertDatabaseHas('audit_logs', [
        'action' => 'license_expired_notice',
        'store_id' => $store->id,
    ]);
});

it('ignores lifetime licenses and stores without an expiry', function () {
    Mail::fake();
    reminderStore(0, true);

    $this->artisan('karo:licenses:remind')->assertSuccessful();

    Mail::assertNotSent(LicenseExpiringMail::class);
});

it('resets the reminder stage after a renewal', function () {
    Mail::fake();
    [$store] = reminderStore(3);

    $this->artisan('karo:licenses:remind')->assertSuccessful();
    expect($store->fresh()->license_reminder_stage)->toBe(2);

    // تمدید از طریق مسیر پرداخت
    $store->license()->update(['expires_at' => now()->addYear()]);
    $store->forceFill(['license_reminder_stage' => 0])->save();

    $this->artisan('karo:licenses:remind')->assertSuccessful();

    Mail::assertSent(LicenseExpiringMail::class, 1);
});

it('supports a dry run without sending or marking', function () {
    Mail::fake();
    [$store] = reminderStore(10);

    $this->artisan('karo:licenses:remind', ['--dry-run' => true])->assertSuccessful();

    Mail::assertNothingSent();
    expect($store->fresh()->license_reminder_stage)->toBe(0);
});
