<?php

namespace App\Http\Controllers\Api\Manager;

use App\Http\Controllers\Controller;
use App\Http\Resources\StoreResource;
use App\Models\Store;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * مدیریت فروشگاه‌ها و لایسنس آن‌ها — فقط برای مدیر کل.
 */
class StoreController extends Controller
{
    public function index(): JsonResponse
    {
        $stores = Store::with('license')->withCount('users')->latest()->get();

        return response()->json(['stores' => StoreResource::collection($stores)]);
    }

    public function show(Store $store): JsonResponse
    {
        $store->load('license')->loadCount('users');

        return response()->json(['store' => new StoreResource($store)]);
    }

    /**
     * @throws Throwable
     */
    public function store(Request $request): JsonResponse
    {
        $data = $this->validatePayload($request);

        $store = DB::transaction(function () use ($data, $request) {
            $store = Store::create([
                'name' => $data['name'],
                'slug' => $this->uniqueSlug($data['name']),
                'owner_name' => $data['owner_name'] ?? null,
                'phone' => $data['phone'] ?? null,
                'address' => $data['address'] ?? null,
                'is_active' => $data['is_active'] ?? true,
            ]);

            User::create([
                'name' => ($data['owner_name'] ?? null) ?: $data['name'],
                'email' => $data['email'],
                'password' => $data['password'],
                'role' => User::ROLE_STORE,
                'store_id' => $store->id,
                'is_active' => true,
            ]);

            if (! empty($data['license'])) {
                $this->saveLicense($store, $data['license'], (int) $request->user()->id);
            }

            return $store;
        });

        $store->load('license')->loadCount('users');

        return response()->json(['store' => new StoreResource($store)], 201);
    }

    /**
     * @throws Throwable
     */
    public function update(Request $request, Store $store): JsonResponse
    {
        $data = $this->validatePayload($request, $store);

        DB::transaction(function () use ($data, $store, $request) {
            $store->update(array_filter([
                'name' => $data['name'],
                'owner_name' => $data['owner_name'] ?? null,
                'phone' => $data['phone'] ?? null,
                'address' => $data['address'] ?? null,
                'is_active' => $data['is_active'] ?? $store->is_active,
            ], fn ($value) => $value !== null));

            $user = $store->users()->orderBy('id')->first();

            if ($user) {
                $fields = ['email' => $data['email']];

                if (! empty($data['password'])) {
                    $fields['password'] = $data['password'];
                }

                if (array_key_exists('owner_name', $data) && $data['owner_name']) {
                    $fields['name'] = $data['owner_name'];
                }

                $user->update($fields);
            }

            if (isset($data['license']) && is_array($data['license'])) {
                $this->saveLicense($store, $data['license'], (int) $request->user()->id);
            }
        });

        $store->refresh()->load('license')->loadCount('users');

        return response()->json(['store' => new StoreResource($store)]);
    }

    /**
     * @throws Throwable
     */
    public function destroy(Store $store): JsonResponse
    {
        DB::transaction(function () use ($store) {
            // کاربران فروشگاه پیش از حذف فروشگاه پاک می‌شوند؛ دادهٔ فروشگاه با
            // کلیدهای خارجی cascade حذف می‌شود.
            User::where('store_id', $store->id)->delete();
            $store->delete();
        });

        return response()->json(['ok' => true]);
    }

    /**
     * تعریف/به‌روزرسانی لایسنس یک فروشگاه.
     *
     * @throws Throwable
     */
    public function updateLicense(Request $request, Store $store): JsonResponse
    {
        $data = $request->validate($this->licenseRules());

        DB::transaction(function () use ($data, $store, $request) {
            $this->saveLicense($store, $data, (int) $request->user()->id);
        });

        $store->refresh()->load('license')->loadCount('users');

        return response()->json(['store' => new StoreResource($store)]);
    }

    /**
     * @return array<string, mixed>
     */
    private function validatePayload(Request $request, ?Store $store = null): array
    {
        $existingUser = $store?->users()->orderBy('id')->first();

        $rules = [
            'name' => ['required', 'string', 'max:120'],
            'owner_name' => ['nullable', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:30'],
            'address' => ['nullable', 'string', 'max:1000'],
            'is_active' => ['sometimes', 'boolean'],
            'email' => [
                'required', 'string', 'email', 'max:190',
                Rule::unique('users', 'email')->ignore($existingUser?->id),
            ],
            'password' => [$store ? 'nullable' : 'required', 'string', 'min:6', 'max:190'],
            'license' => ['sometimes', 'nullable', 'array'],
            'license.tier' => ['nullable', 'in:pro,proplus'],
            'license.is_lifetime' => ['sometimes', 'boolean'],
            'license.is_active' => ['sometimes', 'boolean'],
            'license.starts_at' => ['nullable', 'date'],
            'license.expires_at' => ['nullable', 'date'],
            'license.notes' => ['nullable', 'string', 'max:1000'],
        ];

        return $request->validate($rules);
    }

    /**
     * @return array<string, list<string>>
     */
    private function licenseRules(): array
    {
        return [
            'tier' => ['nullable', 'in:pro,proplus'],
            'is_lifetime' => ['sometimes', 'boolean'],
            'is_active' => ['sometimes', 'boolean'],
            'starts_at' => ['nullable', 'date'],
            'expires_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
    }

    /**
     * @param  array<string, mixed>  $license
     */
    private function saveLicense(Store $store, array $license, int $createdBy): void
    {
        $isLifetime = (bool) ($license['is_lifetime'] ?? false);
        $expiresAt = $license['expires_at'] ?? null;

        if (! $isLifetime && ! $expiresAt) {
            throw ValidationException::withMessages([
                'license.expires_at' => ['برای لایسنس غیرمادام‌العمر، تاریخ انقضا لازم است.'],
            ]);
        }

        $store->license()->updateOrCreate([], [
            'tier' => $license['tier'] ?? 'pro',
            'is_lifetime' => $isLifetime,
            'is_active' => $license['is_active'] ?? true,
            'starts_at' => $license['starts_at'] ?? now(),
            'expires_at' => $isLifetime ? null : $expiresAt,
            'notes' => $license['notes'] ?? null,
            'created_by' => $createdBy,
        ]);
    }

    private function uniqueSlug(string $name): string
    {
        $base = Str::slug(Str::ascii($name));

        if ($base === '') {
            $base = 'store';
        }

        $slug = $base;
        $suffix = 1;

        while (Store::where('slug', $slug)->exists()) {
            $slug = $base.'-'.(++$suffix);
        }

        return $slug;
    }
}
