<?php

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

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

    // حذف نرم است تا دستگاه‌های دیگر هم از طریق سنگ‌قبر باخبر شوند.
    expect(DB::table('products')->where('id', 321)->value('deleted_at'))->not->toBeNull();
    expect(DB::table('products')->where('id', 321)->value('name'))->toBe('ب');
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

    expect(DB::table('products')->where('store_id', $storeA->id)->whereNull('deleted_at')->count())->toBe(0);
    expect(DB::table('products')->where('id', 2)->value('deleted_at'))->toBeNull();
});

it('forbids managers from the store sync endpoints', function () {
    $manager = User::factory()->manager()->create();

    $this->actingAs($manager)->getJson('/api/sync/pull')->assertForbidden();
});

it('pulls incrementally with since and returns the current rev', function () {
    [$store, $user] = storeUser();

    $this->actingAs($user)->postJson('/api/sync/push', [
        'ops' => [['table' => 'products', 'op' => 'insert', 'data' => ['id' => 1, 'name' => 'الف']]],
    ])->assertOk();

    $first = $this->actingAs($user)->getJson('/api/sync/pull')->assertOk();
    $rev = (int) $first->json('rev');

    expect($first->json('full'))->toBeTrue()
        ->and($first->json('storeId'))->toBe($store->id)
        ->and($rev)->toBeGreaterThan(0);

    // بدون تغییر جدید، pull افزایشی هیچ ردیفی برنمی‌گرداند.
    $empty = $this->actingAs($user)->getJson('/api/sync/pull?since='.$rev)->assertOk();
    expect($empty->json('data'))->toBe([])
        ->and((int) $empty->json('rev'))->toBe($rev);

    // بعد از یک تغییر، فقط همان ردیف برمی‌گردد.
    $this->actingAs($user)->postJson('/api/sync/push', [
        'ops' => [['table' => 'customers', 'op' => 'insert', 'data' => ['id' => 55, 'name' => 'مشتری']]],
    ])->assertOk();

    $delta = $this->actingAs($user)->getJson('/api/sync/pull?since='.$rev)->assertOk();
    expect($delta->json('data.customers'))->toHaveCount(1)
        ->and($delta->json('data.products'))->toBeNull()
        ->and((int) $delta->json('rev'))->toBeGreaterThan($rev);
});

it('broadcasts deletes as tombstones to other devices', function () {
    [$store, $userA] = storeUser();
    $userB = App\Models\User::factory()->forStore($store)->create();

    $this->actingAs($userA)->postJson('/api/sync/push', [
        'ops' => [['table' => 'products', 'op' => 'insert', 'data' => ['id' => 9, 'name' => 'کالا']]],
    ])->assertOk();

    $rev = (int) $this->actingAs($userB)->getJson('/api/sync/pull')->json('rev');

    $this->actingAs($userA)->postJson('/api/sync/push', [
        'ops' => [['table' => 'products', 'op' => 'delete', 'id' => 9]],
    ])->assertOk();

    $delta = $this->actingAs($userB)->getJson('/api/sync/pull?since='.$rev)->assertOk();

    expect($delta->json('data.products'))->toHaveCount(1)
        ->and($delta->json('data.products.0.id'))->toBe(9)
        ->and($delta->json('data.products.0.__deleted'))->toBeTrue();
});

it('reports conflicts instead of overwriting a newer server row', function () {
    [$store, $userA] = storeUser();
    $userB = App\Models\User::factory()->forStore($store)->create();

    $this->actingAs($userA)->postJson('/api/sync/push', [
        'ops' => [['table' => 'products', 'op' => 'insert', 'data' => ['id' => 4, 'name' => 'نسخهٔ اول']]],
    ])->assertOk();

    $staleRev = (int) $this->actingAs($userB)->getJson('/api/sync/pull')->json('rev');

    // دستگاه دیگر همان ردیف را ویرایش می‌کند.
    $this->actingAs($userA)->postJson('/api/sync/push', [
        'ops' => [['table' => 'products', 'op' => 'update', 'id' => 4, 'baseRev' => $staleRev, 'data' => ['name' => 'نسخهٔ دوم']]],
    ])->assertOk();

    // حالا push از روی نسخهٔ کهنه تعارض می‌دهد و نباید بنویسد.
    $response = $this->actingAs($userB)->postJson('/api/sync/push', [
        'ops' => [['table' => 'products', 'op' => 'update', 'id' => 4, 'baseRev' => $staleRev, 'data' => ['name' => 'نسخهٔ کهنه']]],
    ])->assertOk();

    expect($response->json('conflicts'))->toHaveCount(1)
        ->and($response->json('conflicts.0.server.name'))->toBe('نسخهٔ دوم')
        ->and($response->json('applied'))->toBe([]);

    expect(DB::table('products')->where('id', 4)->value('name'))->toBe('نسخهٔ دوم');
});

it('imports a backup file once and keeps ids and relations', function () {
    [$store, $user] = storeUser();

    $tables = [
        'customers' => [['id' => 11, 'name' => 'مشتری الف']],
        'products' => [['id' => 21, 'name' => 'کالا', 'buyPrice' => 1000, 'sellPrice' => 2000, 'stock' => 3]],
        'invoices' => [['id' => 31, 'number' => 1, 'date' => '2026-01-02T00:00:00.000Z', 'customerId' => 11, 'total' => 2000]],
        'invoiceItems' => [['id' => 41, 'invoiceId' => 31, 'productId' => 21, 'name' => 'کالا', 'quantity' => 1, 'unitPrice' => 2000]],
        'settings' => [['key' => 'shopName', 'value' => 'فروشگاه من']],
    ];

    $response = $this->actingAs($user)->postJson('/api/sync/import', ['tables' => $tables])->assertOk();

    expect($response->json('imported.customers'))->toBe(1)
        ->and($response->json('imported.invoiceItems'))->toBe(1)
        ->and($response->json('imported.settings'))->toBe(1);

    $this->assertDatabaseHas('invoices', ['id' => 31, 'store_id' => $store->id, 'customer_id' => 11]);
    $this->assertDatabaseHas('invoice_items', ['id' => 41, 'invoice_id' => 31, 'product_id' => 21]);

    // درج دوباره‌ی همان فایل نباید رکورد تکراری بسازد.
    $again = $this->actingAs($user)->postJson('/api/sync/import', ['tables' => $tables])->assertOk();
    expect($again->json('total'))->toBe(0);
    expect(DB::table('products')->where('store_id', $store->id)->count())->toBe(1);

    // داده‌ی واردشده با pull کامل در دسترس است.
    $pull = $this->actingAs($user)->getJson('/api/sync/pull')->assertOk();
    expect($pull->json('data.customers'))->toHaveCount(1)
        ->and($pull->json('data.settings.0.key'))->toBe('shopName');
});
