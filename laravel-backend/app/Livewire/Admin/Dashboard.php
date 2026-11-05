<?php

namespace App\Livewire\Admin;

use App\Models\User;
use App\Support\HoldingsService;
use App\Support\PriceService;
use App\Support\Products;
use Illuminate\Pagination\LengthAwarePaginator;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Component;
use Livewire\WithPagination;

#[Layout('layouts.app')]
#[Title('داشبورد مدیریت')]
class Dashboard extends Component
{
    use WithPagination;

    public bool $showBreakdown = false;

    /** Whether the user search box is expanded (behind the 🔍 icon). */
    public bool $showSearch = false;

    /** Per-user per-product breakdown of the holdings list. */
    public bool $showUserBreakdown = false;

    /** Live search over the holdings list (name or phone). */
    public string $search = '';

    /**
     * Toggle the per-product holdings breakdown under the total.
     */
    public function toggleBreakdown(): void
    {
        $this->showBreakdown = ! $this->showBreakdown;
    }

    /**
     * Toggle the user search box behind the 🔍 icon.
     */
    public function toggleSearch(): void
    {
        $this->showSearch = ! $this->showSearch;
    }

    /**
     * Toggle per-product holdings under each user row.
     */
    public function toggleUserBreakdown(): void
    {
        $this->showUserBreakdown = ! $this->showUserBreakdown;
    }

    /**
     * Searching the holdings list restarts from the first page.
     */
    public function updatedSearch(): void
    {
        $this->resetPage();
    }

    public function render()
    {
        PriceService::maybeAutoRefresh();

        $query = User::with('invoices')->where('role', 'user');

        if ($this->search !== '') {
            $term = '%'.trim($this->search).'%';
            $query->where(fn ($query) => $query
                ->where('name', 'like', $term)
                ->orWhere('phone', 'like', $term));
        }

        // Highest holding first; users with equal holdings are ordered by
        // name. A single comparator is required: chaining sortBy would
        // re-sort the whole list and destroy the holdings order.
        $users = $query->get()->map(function ($user) {
            $user->total_assets = HoldingsService::totalForUser($user);

            return $user;
        })->sort(function (User $a, User $b) {
            return [$b->total_assets, $a->name] <=> [$a->total_assets, $b->name];
        })->values();

        $perPage = 10;
        $currentPage = LengthAwarePaginator::resolveCurrentPage();
        $paginatedUsers = new LengthAwarePaginator(
            $users->forPage($currentPage, $perPage),
            $users->count(),
            $perPage,
            $currentPage,
            ['path' => LengthAwarePaginator::resolveCurrentPath()]
        );

        $totals = $paginatedUsers->mapWithKeys(fn (User $user) => [
            $user->id => $user->total_assets ?? 0,
        ]);
        $userHoldings = [];

        foreach ($paginatedUsers as $user) {
            $userHoldings[$user->id] = HoldingsService::forUser($user);
        }

        return view('livewire.admin.dashboard', [
            'users' => $paginatedUsers,
            'totals' => $totals,
            'userHoldings' => $userHoldings,
            'holdings' => HoldingsService::forAllUsers(),
            'grandTotal' => HoldingsService::totalForAllUsers(),
            'products' => Products::collection(),
        ]);
    }

    public function paginationView()
    {
        return 'pagination.simple';
    }
}
