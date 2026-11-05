<?php

use App\Models\License;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('lets a manager create a store with a lifetime license', function () {
    $manager = User::factory()->manager()->create();

    $this->actingAs($manager)
        ->postJson('/api/manager/stores', [
            'name' => 'فروشگاه یک',
            'owner_name' => 'علی',
            'phone' => '09120000000',
            'email' => 'store1@test.local',
            'password' => 'secret123',
            'license' => [
                'tier' => 'pro',
                'is_lifetime' => true,
                'is_active' => true,
            ],
        ])
        ->assertCreated()
        ->assertJsonPath('store.license.is_lifetime', true)
        ->assertJsonPath('store.license.is_valid', true)
        ->assertJsonPath('store.license.expires_at', null);

    $this->assertDatabaseHas('stores', ['name' => 'فروشگاه یک']);
    $this->assertDatabaseHas('users', ['email' => 'store1@test.local', 'role' => 'store']);
});

it('requires an expiry for a non-lifetime license', function () {
    $manager = User::factory()->manager()->create();

    $this->actingAs($manager)
        ->postJson('/api/manager/stores', [
            'name' => 'فروشگاه دو',
            'email' => 'store2@test.local',
            'password' => 'secret123',
            'license' => [
                'tier' => 'proplus',
                'is_lifetime' => false,
            ],
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('license.expires_at');
});

it('creates a store with a time-limited license and marks it valid', function () {
    $manager = User::factory()->manager()->create();

    $response = $this->actingAs($manager)->postJson('/api/manager/stores', [
        'name' => 'فروشگاه سه',
        'email' => 'store3@test.local',
        'password' => 'secret123',
        'license' => [
            'tier' => 'pro',
            'is_lifetime' => false,
            'expires_at' => now()->addDays(30)->toIso8601String(),
        ],
    ]);

    $response->assertCreated()
        ->assertJsonPath('store.license.is_lifetime', false)
        ->assertJsonPath('store.license.is_valid', true);

    expect($response->json('store.license.days_remaining'))->toBeGreaterThan(25);
});

it('updates a license to lifetime', function () {
    $manager = User::factory()->manager()->create();
    $store = Store::factory()->create();
    License::factory()->expiringSoon()->for($store)->create();

    $this->actingAs($manager)
        ->putJson("/api/manager/stores/{$store->id}/license", [
            'tier' => 'pro',
            'is_lifetime' => true,
            'is_active' => true,
        ])
        ->assertOk()
        ->assertJsonPath('store.license.is_lifetime', true);

    expect($store->fresh()->license->is_lifetime)->toBeTrue();
});

it('forbids store users from manager routes', function () {
    $store = Store::factory()->create();
    $user = User::factory()->forStore($store)->create();

    $this->actingAs($user)->getJson('/api/manager/stores')->assertForbidden();
});

it('deletes the store and its data', function () {
    $manager = User::factory()->manager()->create();
    $store = Store::factory()->create();
    User::factory()->forStore($store)->create();

    $this->actingAs($manager)
        ->deleteJson("/api/manager/stores/{$store->id}")
        ->assertOk();

    $this->assertDatabaseMissing('stores', ['id' => $store->id]);
    $this->assertDatabaseMissing('users', ['store_id' => $store->id]);
});
