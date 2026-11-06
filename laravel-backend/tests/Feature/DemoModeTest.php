<?php

use App\Models\Invoice;
use App\Models\License;
use App\Models\Product;
use App\Models\Order;
use App\Models\Store;
use App\Models\SubscriptionPayment;
use App\Models\User;
use App\Services\Demo\DemoService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\TestCase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

beforeEach(function () {
    // محدودیت نرخ ورود/دمو بین تست‌ها نباید باقی بماند.
    Cache::flush();
});

/** حساب دمو را از مسیر عمومی می‌سازد و کاربر را برمی‌گرداند. */
function startDemo(TestCase $case): User
{
    $case->postJson('/api/demo/session')->assertCreated();

    return User::query()->where('role', User::ROLE_STORE)->latest('id')->firstOrFail();
}

it('creates an isolated demo store with a real trial license and sample data', function () {
    $response = $this->postJson('/api/demo/session')->assertCreated();

    $response->assertJsonPath('user.store.is_demo', true)
        ->assertJsonPath('demo.hours', (int) config('demo.hours'));

    $this->assertAuthenticated();

    $user = User::query()->where('email', 'like', 'demo-%@demo.invalid')->firstOrFail();
    $store = Store::query()->where('is_demo', true)->firstOrFail();

    expect($user->store_id)->toBe($store->id)
        ->and($user->email_verified_at)->not->toBeNull()
        ->and(Hash::check('wrong-password', $user->password))->toBeFalse()
        ->and($store->demo_expires_at)->not->toBeNull()
        ->and($store->demo_expires_at->isFuture())->toBeTrue()
        ->and($store->license)->not->toBeNull()
        ->and($store->license->is_trial)->toBeTrue()
        ->and($store->license->expires_at->isFuture())->toBeTrue()
        ->and(Product::query()->where('store_id', $store->id)->count())->toBeGreaterThan(5)
        ->and(Invoice::query()->where('store_id', $store->id)->count())->toBeGreaterThan(3);

    // هیچ پرداخت/سفارش جعلی ساخته نمی‌شود.
    expect(Order::query()->count())->toBe(0)
        ->and(SubscriptionPayment::query()->count())->toBe(0);
});

it('lets the demo user read data but blocks purchase, team and import actions', function () {
    $user = startDemo($this);

    $this->actingAs($user)->getJson('/api/sync/pull')->assertOk();
    $this->actingAs($user)->getJson('/api/subscription')->assertOk();

    $this->actingAs($user)->postJson('/api/subscription/checkout', [
        'plan' => 'pro',
        'months' => 1,
        'seats' => 1,
    ])->assertForbidden();

    $this->actingAs($user)->postJson('/api/team', [
        'name' => 'همکار',
        'email' => 'teammate@test.local',
        'password' => 'secret123',
        'password_confirmation' => 'secret123',
    ])->assertForbidden();

    $this->actingAs($user)->postJson('/api/sync/wipe')->assertForbidden();

    expect(Order::query()->count())->toBe(0);
});

it('keeps demo traffic out of manager stats and subscriber lists', function () {
    $realStore = Store::factory()->create(['name' => 'فروشگاه واقعی']);
    User::factory()->forStore($realStore)->create(['email' => 'real@test.local']);
    License::create([
        'store_id' => $realStore->id,
        'tier' => 'pro',
        'plan_code' => 'pro',
        'seats' => 2,
        'status' => License::STATUS_ACTIVE,
        'is_active' => true,
        'starts_at' => now()->subMonth(),
        'expires_at' => now()->addMonth(),
    ]);

    app(DemoService::class)->create();

    $manager = User::factory()->manager()->create();

    $this->actingAs($manager)
        ->getJson('/api/manager/subscribers')
        ->assertOk()
        ->assertJsonPath('meta.total', 1)
        ->assertJsonPath('subscribers.0.store_name', 'فروشگاه واقعی');

    $this->actingAs($manager)
        ->getJson('/api/manager/dashboard')
        ->assertOk()
        ->assertJsonPath('kpis.stores_total', 1)
        ->assertJsonPath('kpis.subs_trial', 0);
});

it('ends the demo and deletes every piece of its data', function () {
    $user = startDemo($this);
    $store = $user->store;

    $this->actingAs($user)->deleteJson('/api/demo/session')->assertOk();

    $this->assertGuest();
    $this->assertDatabaseMissing('stores', ['id' => $store->id]);
    $this->assertDatabaseMissing('users', ['id' => $user->id]);
    $this->assertDatabaseMissing('products', ['store_id' => $store->id]);
    $this->assertDatabaseMissing('invoices', ['store_id' => $store->id]);
});

it('blocks login for an expired demo and purges it with the command', function () {
    $user = startDemo($this);
    $store = $user->store;

    $user->forceFill(['password' => 'secret123'])->save();
    $store->forceFill(['demo_expires_at' => now()->subMinute()])->save();
    $store->license()->update(['expires_at' => now()->subMinute()]);

    $response = $this->postJson('/api/login', [
        'email' => $user->email,
        'password' => 'secret123',
    ])->assertStatus(422);

    expect($response->json('errors.email.0'))->toContain('دموی شما');

    $this->artisan('karo:demo:purge')->assertSuccessful();

    $this->assertDatabaseMissing('stores', ['id' => $store->id]);
    $this->assertDatabaseMissing('users', ['id' => $user->id]);
});

it('honours the enabled flag and the concurrency cap', function () {
    config(['demo.enabled' => false]);

    $this->postJson('/api/demo/session')
        ->assertStatus(422)
        ->assertJsonValidationErrors('demo');

    config(['demo.enabled' => true, 'demo.max_active' => 1]);

    $this->postJson('/api/demo/session')->assertCreated();
    $this->postJson('/api/logout')->assertOk();

    $this->postJson('/api/demo/session')
        ->assertStatus(422)
        ->assertJsonValidationErrors('demo');

    expect(Store::query()->where('is_demo', true)->count())->toBe(1);
});
