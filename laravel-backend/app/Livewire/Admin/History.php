<?php

namespace App\Livewire\Admin;

use App\Models\TradeRequest;
use App\Support\Products;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;
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

    /** Free-text search over the customer's name and phone number. */
    #[Url]
    public string $search = '';

    /** Whether the filter bar is expanded (behind the 🔍 icon). */
    public bool $showFilters = false;

    /** @var array<int, bool> Which history rows have their edit form open. */
    public array $editing = [];

    /** @var array<int, array{status: string, note: string}> Draft values of the open edit forms. */
    public array $form = [];

    /** Feedback message shown after an admin action. */
    public ?string $feedback = null;

    public function updatedStatus(): void
    {
        $this->resetPage();
    }

    public function updatedProduct(): void
    {
        $this->resetPage();
    }

    public function updatedSearch(): void
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
        $this->reset(['status', 'product', 'search']);
        $this->resetPage();
    }

    /**
     * Open (or close) the inline edit form of one history record.
     */
    public function edit(int $id): void
    {
        if ($this->editing[$id] ?? false) {
            $this->cancelEdit($id);

            return;
        }

        $request = TradeRequest::findOrFail($id);

        $this->editing[$id] = true;
        $this->form[$id] = [
            'status' => $request->status,
            'note' => (string) ($request->note ?? ''),
        ];

        $this->resetErrorBag();
    }

    /**
     * Close the edit form of one history record without saving.
     */
    public function cancelEdit(int $id): void
    {
        unset($this->editing[$id], $this->form[$id]);

        $this->resetErrorBag();
    }

    /**
     * Save the admin's changes to one history record.
     */
    public function save(int $id): void
    {
        $request = TradeRequest::findOrFail($id);

        $this->validate([
            'form.'.$id.'.status' => ['required', Rule::in(['pending', 'approved', 'rejected'])],
            'form.'.$id.'.note' => ['nullable', 'string', 'max:1000'],
        ], [
            'form.*.status.required' => 'وضعیت را انتخاب کنید.',
            'form.*.status.in' => 'وضعیت انتخاب‌شده معتبر نیست.',
            'form.*.note.max' => 'یادداشت نباید بیشتر از ۱۰۰۰ نویسه باشد.',
        ]);

        $data = $this->form[$id];
        $note = trim($data['note'] ?? '');
        $status = $data['status'];

        $request->update([
            'status' => $status,
            'note' => $note === '' ? null : $note,
            // Keep the original decision stamp when the admin only edits
            // the wording; stamp it now when the decision changes.
            'reviewed_by' => $status === 'pending' ? null : ($request->reviewed_by ?? Auth::id()),
            'reviewed_at' => $status === 'pending' ? null : ($request->reviewed_at ?? now()),
        ]);

        unset($this->editing[$id], $this->form[$id]);

        $this->feedback = 'سابقه سفارش ویرایش شد.';
    }

    /**
     * Delete a history record permanently.
     */
    public function destroy(TradeRequest $tradeRequest): void
    {
        $tradeRequest->delete();

        unset($this->editing[$tradeRequest->id], $this->form[$tradeRequest->id]);

        $this->feedback = 'سابقه سفارش حذف شد.';
    }

    public function render()
    {
        // Pending requests are handled on the invoices page; the history only
        // holds requests that the admin has already approved or rejected.
        $query = TradeRequest::with(['user', 'reviewer'])
            ->whereIn('status', ['approved', 'rejected']);

        if (in_array($this->status, ['approved', 'rejected'], true)) {
            $query->where('status', $this->status);
        }

        if ($this->product !== '' && Products::collection()->has($this->product)) {
            $query->where('product', $this->product);
        }

        $search = trim($this->search);

        if ($search !== '') {
            $query->whereHas('user', fn ($user) => $user->where(fn ($user) => $user
                ->where('name', 'like', '%'.$search.'%')
                ->orWhere('phone', 'like', '%'.$search.'%')));
        }

        return view('livewire.admin.history', [
            'requests' => $query->orderByDesc('id')->paginate(10),
            'products' => Products::collection(),
            'stats' => $this->stats(),
        ]);
    }

    /**
     * Totals of decided requests, ignoring the active filters.
     *
     * @return array{all: int, approved: int, rejected: int}
     */
    protected function stats(): array
    {
        $base = fn () => TradeRequest::whereIn('status', ['approved', 'rejected']);

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
