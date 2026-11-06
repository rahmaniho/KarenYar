<?php

use App\Models\License;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('registers a store with a trial license and signs the owner in', function () {
    $response = $this->postJson('/api/register', [
        'store_name' => 'فروشگاه گل‌ها',
        'owner_name' => 'مریم احمدی',
        'phone' => '09120000000',
        'email' => 'maryam@test.local',
        'password' => 'secret-pass',
        'password_confirmation' => 'secret-pass',
        'terms' => true,
    ])->assertCreated();

    expect($response->json('user.email'))->toBe('maryam@test.local')
        ->and($response->json('user.role'))->toBe('store')
        ->and($response->json('user.store.name'))->toBe('فروشگاه گل‌ها');

    $store = Store::where('name', 'فروشگاه گل‌ها')->firstOrFail();
    $user = User::where('email', 'maryam@test.local')->firstOrFail();

    expect($user->store_id)->toBe($store->id);

    $license = $store->license()->firstOrFail();
    expect($license->is_trial)->toBeTrue()
        ->and($license->tier)->toBe('pro')
        ->and($license->isCurrentlyValid())->toBeTrue()
        ->and($license->daysRemaining())->toBeGreaterThanOrEqual(13);

    // کاربر بلافاصله وارد شده است.
    $this->getJson('/api/me')->assertOk()->assertJsonPath('user.id', $user->id);

    $this->assertDatabaseHas('audit_logs', [
        'action' => 'store_self_registered',
        'store_id' => $store->id,
        'user_id' => $user->id,
    ]);
});

it('rejects a duplicate email', function () {
    User::factory()->create(['email' => 'taken@test.local']);

    $this->postJson('/api/register', [
        'store_name' => 'فروشگاه تکراری',
        'email' => 'taken@test.local',
        'password' => 'secret-pass',
        'password_confirmation' => 'secret-pass',
        'terms' => true,
    ])->assertStatus(422)->assertJsonValidationErrors('email');
});

it('requires a strong enough password and accepted terms', function () {
    $this->postJson('/api/register', [
        'store_name' => 'فروشگاه ضعیف',
        'email' => 'weak@test.local',
        'password' => '123',
        'password_confirmation' => '123',
    ])->assertStatus(422)->assertJsonValidationErrors(['password', 'terms']);
});

it('reports the trial length to the signup page', function () {
    config(['billing.trial_days' => 21]);

    $response = $this->postJson('/api/register', [
        'store_name' => 'فروشگاه بیست‌ویک',
        'email' => 'trial21@test.local',
        'password' => 'secret-pass',
        'password_confirmation' => 'secret-pass',
        'terms' => true,
    ])->assertCreated();

    $storeId = (int) Store::where('name', 'فروشگاه بیست‌ویک')->value('id');
    $license = License::where('store_id', $storeId)->firstOrFail();

    expect($license->daysRemaining())->toBeGreaterThanOrEqual(20)
        ->and($response->json('user.store.license.is_trial'))->toBeTrue();
});

it('can be closed by configuration', function () {
    config(['billing.public_registration' => false]);

    $this->postJson('/api/register', [
        'store_name' => 'فروشگاه بسته',
        'email' => 'closed@test.local',
        'password' => 'secret-pass',
        'password_confirmation' => 'secret-pass',
        'terms' => true,
    ])->assertStatus(422);

    expect(Store::where('name', 'فروشگاه بسته')->exists())->toBeFalse();
});
