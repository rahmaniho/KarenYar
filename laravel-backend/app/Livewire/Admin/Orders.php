<?php

namespace App\Livewire\Admin;

use App\Models\Invoice;
use App\Models\TradeRequest;
use App\Models\User;
use App\Support\Products;
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

    #[Url]
    public string $userId = '';

    /** Whether the filter bar is expanded (behind the 🔍 icon). */
    public bool $showFilters = false;

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

    public function updatedUserId(): void
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
     * Toggle the "…" details row of one compact order tile.
     */
    public function toggleDetails(int $id): void
    {
        $this->expanded[$id] = ! ($this->expanded[$id] ?? false);
    }

    /** @var array<int, string> Admin notes when confirming buy/sell requests. */
    public array $requestNotes = [];

    /** Feedback message shown after an admin action. */
    public ?string $status = null;

    /**
     * Confirm a customer buy/sell request.
     */
    public function approveRequest(TradeRequest $tradeRequest): void
    {
        $note = trim($this->requestNotes[$tradeRequest->id] ?? '');

        $tradeRequest->update([
            'status' => 'approved',
            'note' => $note === '' ? null : $note,
            'reviewed_by' => auth()->id(),
            'reviewed_at' => now(),
        ]);

        unset($this->requestNotes[$tradeRequest->id]);
        $this->status = 'سفارش تأیید شد؛ کاربر از آن مطلع می‌شود.';
    }

    /**
     * Reject a customer buy/sell request.
     */
    public function rejectRequest(TradeRequest $tradeRequest): void
    {
        $note = trim($this->requestNotes[$tradeRequest->id] ?? '');

        $tradeRequest->update([
            'status' => 'rejected',
            'note' => $note === '' ? null : $note,
            'reviewed_by' => auth()->id(),
            'reviewed_at' => now(),
        ]);

        unset($this->requestNotes[$tradeRequest->id]);
        $this->status = 'سفارش رد شد؛ کاربر از آن مطلع می‌شود.';
    }

    /**
     * Delete a customer buy/sell request permanently.
     */
    public function deleteRequest(TradeRequest $tradeRequest): void
    {
        $tradeRequest->delete();

        unset($this->requestNotes[$tradeRequest->id]);
        $this->status = 'سفارش حذف شد.';
    }

    public function clearFilters(): void
    {
        $this->product = '';
        $this->invoiceNo = '';
        $this->userId = '';
        $this->resetPage();
    }

    /**
     * Delete an invoice.
     */
    public function destroy(Invoice $invoice): void
    {
        $invoice->delete();

        $this->status = 'فاکتور حذف شد.';
    }

    public function render()
    {
        $query = Invoice::with('user');

        if ($this->product !== '' && Products::collection()->has($this->product)) {
            $query->where('product', $this->product);
        }

        $search = trim($this->invoiceNo);

        if ($search !== '') {
            // One search term covers the invoice number, the amount and the
            // customer (mobile number, customer number or name).
            $query->where(fn ($q) => $q
                ->where('invoice_no', 'like', '%'.$search.'%')
                ->orWhere('total', 'like', '%'.$search.'%')
                ->orWhereHas('user', fn ($u) => $u
                    ->where('phone', 'like', '%'.$search.'%')
                    ->orWhere('id', $search)
                    ->orWhere('name', 'like', '%'.$search.'%')));

            // Date search only applies to date-like terms (e.g. 14050601,
            // 2026-09-17), so ordinary digits don't match every timestamp.
            if (preg_match('/^[\d:\-\/\s\.]+$/', $search) && strlen($search) >= 6) {
                $query->orWhere('created_at', 'like', '%'.$search.'%');
            }
        }

        if ($this->userId !== '') {
            $query->where('user_id', (int) $this->userId);
        }

        return view('livewire.admin.orders', [
            'invoices' => $query->orderByDesc('id')->paginate(10),
            'products' => Products::collection(),
            'users' => User::orderBy('name')->get(),
            'tradeRequests' => TradeRequest::with('user')
                ->where('status', 'pending')
                ->orderByDesc('id')
                ->get(),
        ]);
    }

    public function paginationView()
    {
        return 'pagination.simple';
    }
}
