<?php

namespace App\Livewire\Panel;

use App\Models\TradeRequest;
use App\Support\Products;
use Illuminate\Support\Facades\Auth;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Attributes\Url;
use Livewire\Component;
use Livewire\WithPagination;

#[Layout('layouts.app')]
#[Title('تاریخچه سفارش‌ها')]
class History extends Component
{
    use WithPagination;

    /** Status filter: '' (all), approved or rejected. */
    #[Url]
    public string $status = '';

    /** Product filter: '' (all) or a Products key. */
    #[Url]
    public string $product = '';

    /** Whether the filter bar is expanded (behind the 🔍 icon). */
    public bool $showFilters = false;

    public function updatedStatus(): void
    {
        $this->resetPage();
    }

    public function updatedProduct(): void
    {
        $this->resetPage();
    }

    /**
     * Toggle the filter bar behind the 🔍 icon.
     */
    public function toggleFilters(): void
    {
        $this->showFilters = ! $this->showFilters;
    }

    public function clearFilters(): void
    {
        $this->reset(['status', 'product']);
        $this->resetPage();
    }

    public function render()
    {
        // Only requests that already have a decision are history; pending
        // requests stay on the dashboard until the admin answers them.
        $query = TradeRequest::where('user_id', Auth::id())
            ->whereIn('status', ['approved', 'rejected']);

        if (in_array($this->status, ['approved', 'rejected'], true)) {
            $query->where('status', $this->status);
        }

        if ($this->product !== '' && Products::collection()->has($this->product)) {
            $query->where('product', $this->product);
        }

        return view('livewire.panel.history', [
            'requests' => $query->orderByDesc('id')->paginate(10),
            'products' => Products::collection(),
            'stats' => $this->stats(),
        ]);
    }

    /**
     * This customer's decided-request totals, ignoring the active filters.
     *
     * @return array{all: int, approved: int, rejected: int}
     */
    protected function stats(): array
    {
        $base = fn () => TradeRequest::where('user_id', Auth::id())
            ->whereIn('status', ['approved', 'rejected']);

        return [
            'all' => $base()->count(),
            'approved' => $base()->where('status', 'approved')->count(),
            'rejected' => $base()->where('status', 'rejected')->count(),
        ];
    }

    public function paginationView()
    {
        return 'pagination.simple';
    }
}
