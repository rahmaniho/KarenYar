<?php

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

/** یک فروشگاه با کاربر فعال می‌سازد و رمز را «password» می‌گذارد. */
function auditStoreUser(string $password = 'password'): array
{
    $store = Store::factory()->create();
    $user = User::factory()->forStore($store)->create([
        'email' => 'store-'.uniqid().'@test.local',
        'password' => Hash::make($password),
    ]);

    return [$store, $user];
}

it('records a successful login in the audit log', function () {
    [, $user] = auditStoreUser();

    $this->postJson('/api/login', [
        'email' => $user->email,
        'password' => 'password',
    ])->assertOk();

    $this->assertDatabaseHas('audit_logs', [
        'action' => 'login',
        'user_id' => $user->id,
        'store_id' => $user->store_id,
    ]);
});

it('records failed and blocked logins without a user id', function () {
    [, $user] = auditStoreUser();

    $this->postJson('/api/login', [
        'email' => $user->email,
        'password' => 'wrong-password',
    ])->assertStatus(422);

    $this->assertDatabaseHas('audit_logs', [
        'action' => 'login_failed',
        'user_id' => null,
    ]);

    $user->forceFill(['is_active' => false])->save();

    $this->postJson('/api/login', [
        'email' => $user->email,
        'password' => 'password',
    ])->assertStatus(422);

    $this->assertDatabaseHas('audit_logs', [
        'action' => 'login_blocked',
        'user_id' => $user->id,
    ]);
});

it('records logout', function () {
    [, $user] = auditStoreUser();

    $this->actingAs($user)->postJson('/api/logout')->assertOk();

    $this->assertDatabaseHas('audit_logs', ['action' => 'logout', 'user_id' => $user->id]);
});

it('records store creation and license changes', function () {
    $manager = User::factory()->manager()->create();

    $response = $this->actingAs($manager)->postJson('/api/manager/stores', [
        'name' => 'فروشگاه گزارش',
        'email' => 'report@test.local',
        'password' => 'secret123',
        'license' => ['tier' => 'pro', 'is_lifetime' => true, 'is_active' => true],
    ])->assertCreated();

    $storeId = (int) $response->json('store.id');

    $this->assertDatabaseHas('audit_logs', [
        'action' => 'store_created',
        'store_id' => $storeId,
        'user_id' => $manager->id,
    ]);

    $this->actingAs($manager)->putJson("/api/manager/stores/{$storeId}/license", [
        'tier' => 'proplus',
        'is_lifetime' => false,
        'is_active' => true,
        'expires_at' => now()->addMonths(6)->toDateString(),
    ])->assertOk();

    $this->assertDatabaseHas('audit_logs', [
        'action' => 'license_updated',
        'store_id' => $storeId,
    ]);
});

it('lets a manager list every store event and blocks store users', function () {
    $manager = User::factory()->manager()->create();
    [, $user] = auditStoreUser();

    $this->postJson('/api/login', ['email' => $user->email, 'password' => 'password'])->assertOk();

    $response = $this->actingAs($manager)->getJson('/api/manager/audit?limit=10')->assertOk();

    expect($response->json('events'))->not->toBeEmpty()
        ->and($response->json('events.0.action'))->toBe('login');

    $this->actingAs($user)->getJson('/api/manager/audit')->assertForbidden();
});

it('shows a store user only the events of their own store', function () {
    [$storeA, $userA] = auditStoreUser();
    [, $userB] = auditStoreUser();

    $this->postJson('/api/login', ['email' => $userA->email, 'password' => 'password'])->assertOk();
    $this->postJson('/api/login', ['email' => $userB->email, 'password' => 'password'])->assertOk();

    $response = $this->actingAs($userA)->getJson('/api/audit')->assertOk();

    $events = $response->json('events');
    expect($events)->not->toBeEmpty();

    foreach ($events as $event) {
        expect($event['storeId'])->toBe($storeA->id);
    }
});
