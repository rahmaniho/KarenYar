<?php

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

it('creates a store, trial license and owner account from the console', function () {
    $this->artisan('karo:store-user', [
        'email' => 'owner@shop.test',
        '--create-store' => 'فروشگاه تازه',
        '--password' => 'secret123',
        '--name' => 'مالک فروشگاه',
        '--seats' => 3,
    ])->assertSuccessful();

    $user = User::query()->where('email', 'owner@shop.test')->first();

    expect($user)->not->toBeNull()
        ->and($user->role)->toBe(User::ROLE_STORE)
        ->and($user->name)->toBe('مالک فروشگاه')
        ->and($user->is_active)->toBeTrue()
        ->and($user->email_verified_at)->not->toBeNull()
        ->and(Hash::check('secret123', $user->password))->toBeTrue()
        ->and($user->password)->not->toBe('secret123');

    $store = Store::query()->where('name', 'فروشگاه تازه')->first();

    expect($store)->not->toBeNull()
        ->and($store->users()->whereKey($user->getKey())->exists())->toBeTrue()
        ->and($store->license)->not->toBeNull()
        ->and($store->license->seats)->toBe(3);
});

it('resets the password of an existing store user without duplicating it', function () {
    $store = Store::factory()->create(['name' => 'فروشگاه موجود']);
    $user = User::factory()->forStore($store)->create(['email' => 'existing@shop.test']);

    $this->artisan('karo:store-user', [
        'email' => $user->email,
        '--store' => (string) $store->getKey(),
        '--password' => 'brand-new-pass',
    ])->assertSuccessful();

    expect(User::query()->where('email', $user->email)->count())->toBe(1)
        ->and(Hash::check('brand-new-pass', $user->fresh()->password))->toBeTrue();
});

it('generates a password when none is provided', function () {
    $this->artisan('karo:store-user', [
        'email' => 'generated@shop.test',
        '--create-store' => 'فروشگاه رمز خودکار',
    ])->assertSuccessful();

    $user = User::query()->where('email', 'generated@shop.test')->first();

    expect($user)->not->toBeNull()
        ->and((string) $user->password)->toStartWith('$2y$')
        ->and(mb_strlen((string) $user->password))->toBeGreaterThan(20);
});

it('refuses to create a user without a store and rejects weak passwords', function () {
    $this->artisan('karo:store-user', ['email' => 'no-store@shop.test'])
        ->assertFailed();

    expect(User::query()->where('email', 'no-store@shop.test')->exists())->toBeFalse();

    $this->artisan('karo:store-user', [
        'email' => 'weak@shop.test',
        '--create-store' => 'فروشگاه رمز ضعیف',
        '--password' => '123',
    ])->assertFailed();

    expect(User::query()->where('email', 'weak@shop.test')->exists())->toBeFalse();
});
