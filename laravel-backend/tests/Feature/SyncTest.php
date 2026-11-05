<?php

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function storeUser(): array
{
    $store = Store::factory()->create();
    $user = User::factory()->forStore($store)->create();

    return [$store, $user];
}

it('pushes and pulls data for the authenticated store', function () {
    [$store, $user] = storeUser();

    $this->actingAs($user)->postJson('/api/sync/push', [
        'ops' => [
            ['table' => 'products', 'op' => 'insert', 'data' => [
                'id' => 9001,
                'name' => 'کالای تست',
                'category' => 'عمومی',
                'buyPrice' => 10000,
                'sellPrice' => 15000,
                'stock' => 5,
                'unit' => 'عدد',
                'minStock' => 1,
                'createdAt' => '2026-01-01T00:00:00.000Z',
                'updatedAt' => '2026-01-01T00:00:00.000Z',
            ]],
        ],
    ])->assertOk();

    $this->assertDatabaseHas('products', ['id' => 9001, 'store_id' => $store->id]);

    $response = $this->actingAs($user)->getJson('/api/sync/pull')->assertOk();

    expect($response->json('data.products'))->toHaveCount(1)
        ->and($response->json('data.products.0.name'))->toBe('کالای تست')
        ->and($response->json('data.products.0.buyPrice'))->toEqual(10000)
        ->and($response->json('data.products.0.createdAt'))->toBe('2026-01-01T00:00:00.000Z');
});

it('isolates data between stores', function () {
    [$storeA, $userA] = storeUser();
    [, $userB] = storeUser();

    $this->actingAs($userA)->postJson('/api/sync/push', [
        'ops' => [
            ['table' => 'customers', 'op' => 'insert', 'data' => [
                'id' => 500,
                'name' => 'مشتری الف',
            ]],
        ],
    ])->assertOk();

    $pullA = $this->actingAs($userA)->getJson('/api/sync/pull')->assertOk();
    $pullB = $this->actingAs($userB)->getJson('/api/sync/pull')->assertOk();

    expect($pullA->json('data.customers'))->toHaveCount(1)
        ->and($pullB->json('data.customers'))->toHaveCount(0);
});

it('cannot touch another store row by id', function () {
    [$storeA, $userA] = storeUser();
    [, $userB] = storeUser();

    $this->actingAs($userA)->postJson('/api/sync/push', [
        'ops' => [
            ['table' => 'products', 'op' => 'insert', 'data' => ['id' => 777, 'name' => 'کالای الف']],
        ],
    ])->assertOk();

    // فروشگاه B تلاش می‌کند همان شناسه را حذف/ویرایش کند — نباید اثری داشته باشد.
    $this->actingAs($userB)->postJson('/api/sync/push', [
        'ops' => [
            ['table' => 'products', 'op' => 'update', 'id' => 777, 'data' => ['name' => 'دزدیده شد']],
            ['table' => 'products', 'op' => 'delete', 'id' => 777],
        ],
    ])->assertOk();

    $this->assertDatabaseHas('products', ['id' => 777, 'store_id' => $storeA->id, 'name' => 'کالای الف']);
});

it('updates and deletes rows', function () {
    [$store, $user] = storeUser();

    $this->actingAs($user)->postJson('/api/sync/push', [
        'ops' => [
            ['table' => 'products', 'op' => 'insert', 'data' => ['id' => 321, 'name' => 'الف']],
            ['table' => 'products', 'op' => 'update', 'id' => 321, 'data' => ['name' => 'ب']],
        ],
    ])->assertOk();

    $this->assertDatabaseHas('products', ['id' => 321, 'name' => 'ب']);

    $this->actingAs($user)->postJson('/api/sync/push', [
        'ops' => [['table' => 'products', 'op' => 'delete', 'id' => 321]],
    ])->assertOk();

    $this->assertDatabaseMissing('products', ['id' => 321]);
});

it('wipes only the current store data', function () {
    [$storeA, $userA] = storeUser();
    [, $userB] = storeUser();

    $this->actingAs($userA)->postJson('/api/sync/push', [
        'ops' => [['table' => 'products', 'op' => 'insert', 'data' => ['id' => 1, 'name' => 'A']]],
    ])->assertOk();
    $this->actingAs($userB)->postJson('/api/sync/push', [
        'ops' => [['table' => 'products', 'op' => 'insert', 'data' => ['id' => 2, 'name' => 'B']]],
    ])->assertOk();

    $this->actingAs($userA)->postJson('/api/sync/wipe')->assertOk();

    $this->assertDatabaseMissing('products', ['store_id' => $storeA->id]);
    $this->assertDatabaseHas('products', ['id' => 2]);
});

it('forbids managers from the store sync endpoints', function () {
    $manager = User::factory()->manager()->create();

    $this->actingAs($manager)->getJson('/api/sync/pull')->assertForbidden();
});
