<?php

use App\Models\License;
use App\Models\Order;
use App\Models\Store;
use App\Models\User;
use App\Services\Billing\PaymentGatewayManager;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Tests\Support\FakeGateway;

uses(RefreshDatabase::class);

/** یک فروشگاه با کاربر آمادهٔ خرید. */
function billingStoreUser(): array
{
    $store = Store::factory()->create();
    $user = User::factory()->forStore($store)->create([
        'email' => 'billing-'.uniqid().'@test.local',
        'password' => Hash::make('password'),
    ]);

    return [$store, $user];
}

/** درگاه ساختگی را جای درگاه دستی می‌گذارد. */
function fakeBillingGateway(bool $approve = true): FakeGateway
{
    $fake = new FakeGateway;
    $fake->approve = $approve;

    app(PaymentGatewayManager::class)->extend('manual', fn () => $fake);

    return $fake;
}

it('publishes the plan catalog and available gateways', function () {
    $response = $this->getJson('/api/plans')->assertOk();

    $plans = collect($response->json('plans'));

    expect($plans)->not->toBeEmpty()
        ->and($plans->pluck('key'))->toContain('pro_yearly', 'lifetime')
        ->and($response->json('gateways.0.key'))->toBe('manual')
        ->and($response->json('trial_days'))->toBe(14);
});

it('shows the subscription state of the signed-in store', function () {
    [$store, $user] = billingStoreUser();

    License::create([
        'store_id' => $store->id,
        'tier' => 'pro',
        'is_active' => true,
        'starts_at' => now()->subDays(10),
        'expires_at' => now()->addDays(20),
    ]);

    $response = $this->actingAs($user)->getJson('/api/billing')->assertOk();

    expect($response->json('license.tier'))->toBe('pro')
        ->and($response->json('license.days_remaining'))->toBeIn([19, 20])
        ->and($response->json('orders'))->toBe([])
        ->and($response->json('pending_order'))->toBeNull();
});

it('creates a pending order and sends the buyer to the gateway', function () {
    [$store, $user] = billingStoreUser();
    $fake = fakeBillingGateway();

    $response = $this->actingAs($user)
        ->postJson('/api/billing/checkout', ['plan' => 'pro_yearly'])
        ->assertCreated()
        ->assertJsonPath('order.status', 'pending')
        ->assertJsonPath('redirect_url', 'https://pay.test/1');

    expect($fake->requestCount)->toBe(1);

    $this->assertDatabaseHas('orders', [
        'store_id' => $store->id,
        'plan' => 'pro_yearly',
        'amount' => 4_900_000,
        'status' => 'pending',
    ]);

    // تا پرداخت تأیید نشده هیچ لایسنسی صادر نمی‌شود.
    expect($store->license()->exists())->toBeFalse();

    $this->assertDatabaseHas('audit_logs', [
        'action' => 'order_created',
        'store_id' => $store->id,
    ]);
});

it('activates the license when the gateway confirms payment', function () {
    [$store, $user] = billingStoreUser();
    fakeBillingGateway();

    $orderId = (int) $this->actingAs($user)
        ->postJson('/api/billing/checkout', ['plan' => 'pro_monthly'])
        ->json('order.id');

    $response = $this->get("/api/billing/callback?order={$orderId}&Status=OK");
    $response->assertRedirect();
    expect($response->headers->get('Location'))->toContain('payment=success');

    $order = Order::findOrFail($orderId);
    expect($order->status)->toBe(Order::STATUS_PAID)
        ->and($order->reference_id)->toBe('REF-'.$orderId)
        ->and($order->paid_at)->not->toBeNull();

    $license = $store->license()->first();
    expect($license)->not->toBeNull()
        ->and($license->tier)->toBe('pro')
        ->and($license->is_active)->toBeTrue()
        ->and($license->is_trial)->toBeFalse()
        ->and($license->isCurrentlyValid())->toBeTrue()
        ->and($license->daysRemaining())->toBeGreaterThanOrEqual(29);

    $this->assertDatabaseHas('audit_logs', ['action' => 'order_paid', 'store_id' => $store->id]);
    $this->assertDatabaseHas('audit_logs', ['action' => 'license_renewed', 'store_id' => $store->id]);
});

it('does not extend the license twice when the callback is repeated', function () {
    [$store, $user] = billingStoreUser();
    $fake = fakeBillingGateway();

    $orderId = (int) $this->actingAs($user)
        ->postJson('/api/billing/checkout', ['plan' => 'pro_monthly'])
        ->json('order.id');

    $this->get("/api/billing/callback?order={$orderId}&Status=OK");
    $firstExpiry = $store->license()->first()->expires_at->toIso8601String();

    $this->get("/api/billing/callback?order={$orderId}&Status=OK");

    $license = $store->license()->first();
    expect($license->expires_at->toIso8601String())->toBe($firstExpiry)
        ->and($fake->verifyCount)->toBe(1);
});

it('keeps the license untouched when the gateway rejects the payment', function () {
    [$store, $user] = billingStoreUser();
    fakeBillingGateway(approve: false);

    $orderId = (int) $this->actingAs($user)
        ->postJson('/api/billing/checkout', ['plan' => 'pro_monthly'])
        ->json('order.id');

    $response = $this->get("/api/billing/callback?order={$orderId}&Status=OK");
    $response->assertRedirect();
    expect($response->headers->get('Location'))->toContain('payment=failed');

    expect(Order::findOrFail($orderId)->status)->toBe(Order::STATUS_FAILED)
        ->and($store->license()->exists())->toBeFalse();

    $this->assertDatabaseHas('audit_logs', ['action' => 'order_failed', 'store_id' => $store->id]);
});

it('talks to zarinpal with rials and stores the reference id', function () {
    config([
        'billing.gateway' => 'zarinpal',
        'billing.gateways.zarinpal.enabled' => true,
        'billing.gateways.zarinpal.merchant_id' => 'MERCHANT-TEST',
        'billing.gateways.zarinpal.base_url' => 'https://payment.zarinpal.test',
    ]);

    Http::fake([
        'https://payment.zarinpal.test/pg/v4/payment/request.json' => Http::response([
            'data' => ['code' => 100, 'message' => 'Success', 'authority' => 'A'.str_repeat('0', 35)],
            'errors' => [],
        ]),
        'https://payment.zarinpal.test/pg/v4/payment/verify.json' => Http::response([
            'data' => ['code' => 100, 'message' => 'Success', 'ref_id' => 987654321],
            'errors' => [],
        ]),
    ]);

    [$store, $user] = billingStoreUser();

    $response = $this->actingAs($user)
        ->postJson('/api/billing/checkout', ['plan' => 'pro_monthly', 'gateway' => 'zarinpal'])
        ->assertCreated();

    $authority = 'A'.str_repeat('0', 35);

    expect($response->json('redirect_url'))
        ->toBe('https://payment.zarinpal.test/pg/StartPay/'.$authority);

    Http::assertSent(function ($request) {
        return str_ends_with($request->url(), '/pg/v4/payment/request.json')
            && $request['merchant_id'] === 'MERCHANT-TEST'
            // ۴۹۰٬۰۰۰ تومان ⇒ ۴٬۹۰۰٬۰۰۰ ریال
            && (int) $request['amount'] === 4_900_000
            && $request['currency'] === 'IRR';
    });

    $orderId = (int) $response->json('order.id');

    $response = $this->get("/api/billing/callback?order={$orderId}&Authority={$authority}&Status=OK");
    $response->assertRedirect();
    expect($response->headers->get('Location'))->toContain('payment=success');

    expect(Order::findOrFail($orderId)->reference_id)->toBe('987654321')
        ->and($store->license()->first()->isCurrentlyValid())->toBeTrue();
});

it('lets a manager approve a manual payment and renew the license', function () {
    [$store, $user] = billingStoreUser();
    $manager = User::factory()->manager()->create();

    $orderId = (int) $this->actingAs($user)
        ->postJson('/api/billing/checkout', ['plan' => 'proplus_monthly', 'gateway' => 'manual'])
        ->assertCreated()
        ->json('order.id');

    $this->actingAs($manager)
        ->getJson('/api/manager/orders?status=pending')
        ->assertOk()
        ->assertJsonPath('totals.pending', 1);

    $this->actingAs($manager)
        ->postJson("/api/manager/orders/{$orderId}/approve", ['reference' => 'رسید ۱۲۳'])
        ->assertOk()
        ->assertJsonPath('order.status', 'paid');

    $license = $store->license()->first();
    expect($license->tier)->toBe('proplus')
        ->and($license->isCurrentlyValid())->toBeTrue();

    $this->assertDatabaseHas('audit_logs', ['action' => 'order_paid', 'user_id' => $manager->id]);
});

it('lets a manager reject an order without touching the license', function () {
    [$store, $user] = billingStoreUser();
    $manager = User::factory()->manager()->create();

    $orderId = (int) $this->actingAs($user)
        ->postJson('/api/billing/checkout', ['plan' => 'pro_monthly'])
        ->json('order.id');

    $this->actingAs($manager)
        ->postJson("/api/manager/orders/{$orderId}/reject", ['reason' => 'رسید نامعتبر'])
        ->assertOk()
        ->assertJsonPath('order.status', 'canceled');

    expect($store->license()->exists())->toBeFalse();
    $this->assertDatabaseHas('audit_logs', ['action' => 'order_canceled', 'store_id' => $store->id]);
});

it('keeps order management away from store users', function () {
    [, $user] = billingStoreUser();

    $this->actingAs($user)->getJson('/api/manager/orders')->assertForbidden();
});

it('rejects an unknown plan', function () {
    [, $user] = billingStoreUser();

    $this->actingAs($user)
        ->postJson('/api/billing/checkout', ['plan' => 'free_forever'])
        ->assertStatus(422)
        ->assertJsonValidationErrors('plan');
});

it('extends an active license from its current expiry instead of today', function () {
    [$store, $user] = billingStoreUser();
    fakeBillingGateway();

    $license = License::create([
        'store_id' => $store->id,
        'tier' => 'pro',
        'is_active' => true,
        'starts_at' => now()->subMonths(11),
        'expires_at' => now()->addDays(10),
    ]);

    $expected = $license->expires_at->copy()->addMonths(1)->toDateString();

    $orderId = (int) $this->actingAs($user)
        ->postJson('/api/billing/checkout', ['plan' => 'pro_monthly'])
        ->json('order.id');

    $this->get("/api/billing/callback?order={$orderId}&Status=OK");

    expect($store->license()->first()->expires_at->toDateString())->toBe($expected);
});

it('grants a lifetime license that never expires', function () {
    [$store, $user] = billingStoreUser();
    fakeBillingGateway();

    $orderId = (int) $this->actingAs($user)
        ->postJson('/api/billing/checkout', ['plan' => 'lifetime'])
        ->json('order.id');

    $this->get("/api/billing/callback?order={$orderId}&Status=OK");

    $license = $store->license()->first();
    expect($license->is_lifetime)->toBeTrue()
        ->and($license->expires_at)->toBeNull()
        ->and($license->tier)->toBe('proplus')
        ->and($license->isCurrentlyValid())->toBeTrue();
});
