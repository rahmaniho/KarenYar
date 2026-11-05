<?php

namespace App\Livewire\Panel;

use App\Models\Invoice;
use App\Support\Products;
use Illuminate\Support\Facades\Auth;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Attributes\Url;
use Livewire\Component;
use Livewire\WithPagination;

#[Layout('layouts.app')]
#[Title('فاکتورها')]
class Orders extends Component
{
    use WithPagination;

    #[Url]
    public string $product = '';

    #[Url]
    public string $invoiceNo = '';

    /** Whether the filter bar is expanded (behind the 🔍 icon). */
    public bool $showFilters = false;

    /** Whether the whole invoice list is expanded (closed by default). */
    public bool $showOrders = false;

    /** @var array<int, bool> Expanded state of the "…" details per invoice. */
    public array $expanded = [];

    public function updatedProduct(): void
    {
        $this->resetPage();
    }

    public function updatedInvoiceNo(): void
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

    /**
     * Toggle the whole invoice list (collapsed by default).
     */
    public function toggleOrders(): void
    {
        $this->showOrders = ! $this->showOrders;
    }

    /**
     * Toggle the "…" details row of one compact order tile.
     */
    public function toggleDetails(int $id): void
    {
        $this->expanded[$id] = ! ($this->expanded[$id] ?? false);
    }

    public function clearFilters(): void
    {
        $this->product = '';
        $this->invoiceNo = '';
        $this->resetPage();
    }

    public function render()
    {
        $query = Invoice::where('user_id', Auth::id());

        if ($this->product !== '' && Products::collection()->has($this->product)) {
            $query->where('product', $this->product);
        }

        $no = trim($this->invoiceNo);

        if ($no !== '') {
            $query->where('invoice_no', 'like', '%'.$no.'%');
        }

        // The full filtered count, for the "مشاهده فاکتورها (N)" toggle label.
        $countQuery = Invoice::where('user_id', Auth::id());

        if ($this->product !== '' && Products::collection()->has($this->product)) {
            $countQuery->where('product', $this->product);
        }

        if (trim($this->invoiceNo) !== '') {
            $countQuery->where('invoice_no', 'like', '%'.trim($this->invoiceNo).'%');
        }

        $count = $countQuery->count();

        return view('livewire.panel.orders', [
            'invoices' => $query->orderByDesc('id')->paginate(10),
            'count' => $count,
            'products' => Products::collection(),
        ]);
    }

    public function paginationView()
    {
        return 'pagination.simple';
    }
}
