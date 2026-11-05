<?php

namespace App\Livewire\Admin;

use App\Models\Invoice;
use App\Models\User;
use App\Support\Format;
use App\Support\HoldingsService;
use App\Support\InvoiceCalculator;
use App\Support\InvoiceNumber;
use App\Support\Products;
use Illuminate\Validation\Rule;
use Livewire\Attributes\Computed;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Component;

#[Layout('layouts.app')]
#[Title('صدور فاکتور')]
class OrderForm extends Component
{
    public ?Invoice $invoice = null;

    /** Customer number (user id) chosen for the invoice. */
    public string $userId = '';

    /** Phone number field; filling it resolves the user and fills the id. */
    public string $userPhone = '';

    /** Customer name, auto-filled from the phone / customer number. */
    public string $userName = '';

    public string $product = 'gold18';

    public string $kind = 'buy';

    public string $quantity = '';

    public string $unitPrice = '';

    public string $laborPercent = '0';

    public string $profitPercent = '0';

    public string $vatPercent = '0';

    public string $commissionPercent = '0';

    public string $description = '';

    /**
     * Pre-fill the form when editing an existing invoice.
     */
    public function mount(?Invoice $invoice = null): void
    {
        $this->invoice = $invoice;

        if ($invoice) {
            $this->userId = (string) $invoice->user_id;
            $this->userPhone = $invoice->user?->phone ?? '';
            $this->userName = $invoice->user?->name ?? '';
            $this->product = $invoice->product;
            $this->kind = $invoice->kind;
            // Amounts and percentages are stored padded to the column scale;
            // trim the trailing zeros so the fields read 100 and 20.2 rather
            // than 100.0000 and 20.200.
            $this->quantity = Format::trimZeros((string) $invoice->quantity);
            $this->unitPrice = Format::trimZeros((string) $invoice->unit_price);
            $this->laborPercent = Format::trimZeros((string) $invoice->labor_percent);
            $this->profitPercent = Format::trimZeros((string) $invoice->profit_percent);
            $this->vatPercent = Format::trimZeros((string) $invoice->vat_percent);
            $this->commissionPercent = Format::trimZeros((string) $invoice->commission_percent);
            $this->description = (string) $invoice->description;
        }
    }

    /**
     * The admin typed in the phone field — resolve the user and fill the
     * customer number and name fields automatically.
     */
    public function updatedUserPhone(): void
    {
        $phone = trim($this->userPhone);

        if ($phone === '') {
            $this->userId = '';
            $this->userName = '';

            return;
        }

        $user = User::where('phone', $phone)->first();

        $this->userId = $user ? (string) $user->id : '';
        $this->userName = $user ? $user->name : '';
    }

    /**
     * The admin typed in the customer number field — resolve the user and
     * fill the phone and name fields automatically.
     */
    public function updatedUserId(): void
    {
        $id = trim($this->userId);

        if ($id === '') {
            $this->userPhone = '';
            $this->userName = '';

            return;
        }

        $user = User::where('id', (int) $id)->first();

        $this->userPhone = $user ? ($user->phone ?? '') : '';
        $this->userName = $user ? $user->name : '';
    }

    /**
     * The admin typed in the unit price — normalize Persian digits and
     * thousand separators before the live preview consumes the value.
     */
    public function updatedUnitPrice(): void
    {
        $this->unitPrice = $this->normalizeNumber($this->unitPrice);
    }

    /**
     * Strip grouping characters and convert Persian digits to Latin so
     * numeric validation and math always work on clean input.
     */
    protected function normalizeNumber(string $value): string
    {
        return str_replace(['٬', ',', ' '], '', Format::input($value));
    }

    /**
     * The resolved customer for the invoice, if a valid customer number
     * has been chosen.
     */
    #[Computed]
    public function customer(): ?User
    {
        if ($this->userId === '') {
            return null;
        }

        return User::where('id', (int) $this->userId)->first();
    }

    /**
     * The formula family of the selected product.
     */
    #[Computed]
    public function formula(): string
    {
        return Products::item($this->product)['formula'];
    }

    /**
     * The measurement unit label of the selected product.
     */
    #[Computed]
    public function unit(): string
    {
        return Products::item($this->product)['unit'];
    }

    /**
     * Live price breakdown for the current form values.
     *
     * @return array<string, float|int>
     */
    #[Computed]
    public function preview(): array
    {
        return InvoiceCalculator::calculate(
            $this->product,
            $this->quantity ?: 0,
            $this->unitPrice ?: 0,
            $this->laborPercent,
            $this->profitPercent,
            $this->vatPercent,
            $this->commissionPercent,
        );
    }

    /**
     * Persist the invoice (create or update).
     */
    public function save(): void
    {
        $this->unitPrice = $this->normalizeNumber($this->unitPrice);

        $rules = [
            'userId' => ['required', 'integer', 'exists:users,id'],
            'product' => ['required', Rule::in(Products::keys())],
            'kind' => ['required', Rule::in(['buy', 'sell', 'delivery'])],
            'quantity' => ['required', 'numeric', 'gt:0'],
            'description' => ['nullable', 'string', 'max:500'],
        ];

        if ($this->kind !== 'delivery') {
            // Delivery invoices carry no price: they only move physical goods.
            $rules['unitPrice'] = ['required', 'numeric', 'gte:0'];
            $rules['laborPercent'] = ['nullable', 'numeric', 'min:0', 'max:100'];
            $rules['profitPercent'] = ['nullable', 'numeric', 'min:0', 'max:100'];
            $rules['vatPercent'] = ['nullable', 'numeric', 'min:0', 'max:100'];
            $rules['commissionPercent'] = ['nullable', 'numeric', 'min:0', 'max:100'];
        }

        $data = $this->validate($rules, [
            'userId.required' => 'مشتری را انتخاب کنید.',
            'product.required' => 'نوع محصول را انتخاب کنید.',
            'kind.required' => 'نوع معامله را انتخاب کنید.',
            'quantity.required' => 'مقدار را وارد کنید.',
            'quantity.gt' => 'مقدار باید بزرگ‌تر از صفر باشد.',
            'unitPrice.required' => 'قیمت واحد را وارد کنید.',
        ]);

        if ($data['kind'] === 'delivery') {
            // A delivery hands physical goods to the customer, so it can
            // never exceed the amount the customer actually holds.
            $user = User::where('id', (int) $data['userId'])->first();
            $available = (float) HoldingsService::forUser($user)[$data['product']]['quantity'];
            $requested = round((float) $data['quantity'], 4);

            if ($requested > $available) {
                $this->addError('quantity', 'مقدار تحویل از دارایی این مشتری بیشتر است.');

                return;
            }
        }

        $payload = [
            'user_id' => $data['userId'],
            'product' => $data['product'],
            'kind' => $data['kind'],
            'quantity' => $data['quantity'],
            'description' => $data['description'] ?: null,
        ];

        if ($data['kind'] === 'delivery') {
            $payload = array_merge($payload, [
                'unit_price' => 0,
                'labor_percent' => 0,
                'profit_percent' => 0,
                'vat_percent' => 0,
                'commission_percent' => 0,
                'total' => 0,
            ]);
        } else {
            $customer = User::where('id', (int) $data['userId'])->first();
            $commissionPercent = $data['commissionPercent'] ?: 0;
            $freeTransactions = (int) ($customer?->free_transactions ?? 0);

            $breakdown = InvoiceCalculator::calculate(
                $this->product,
                $this->quantity,
                $this->unitPrice,
                $this->laborPercent,
                $this->profitPercent,
                $this->vatPercent,
                $commissionPercent,
            );

            // Referral customers carry commission-free transactions; when
            // one is available on a commissionable invoice, waive the
            // commission and consume the bonus slot.
            if ($freeTransactions > 0 && round($breakdown['commission']) > 0) {
                $commissionPercent = 0;
                $breakdown = InvoiceCalculator::calculate(
                    $this->product,
                    $this->quantity,
                    $this->unitPrice,
                    $this->laborPercent,
                    $this->profitPercent,
                    $this->vatPercent,
                    0,
                );

                $customer->update(['free_transactions' => $freeTransactions - 1]);
            }

            $payload = array_merge($payload, [
                'unit_price' => $data['unitPrice'],
                'labor_percent' => $data['laborPercent'] ?: 0,
                'profit_percent' => $data['profitPercent'] ?: 0,
                'vat_percent' => $data['vatPercent'] ?: 0,
                'commission_percent' => $commissionPercent,
                'total' => $breakdown['total'],
            ]);
        }

        if ($this->invoice) {
            $this->invoice->update($payload);

            session()->flash('status', 'فاکتور با موفقیت ویرایش شد.');
        } else {
            Invoice::create(array_merge(['invoice_no' => InvoiceNumber::next()], $payload));

            // The inviter earns 3 commission-free transactions once the
            // invited customer performs their first trade.
            if ($data['kind'] !== 'delivery') {
                $invited = User::where('id', (int) $data['userId'])->first();

                if ($invited && $invited->referrer_id && ! $invited->referral_bonus_granted
                    && Invoice::where('user_id', $invited->id)->count() === 1) {
                    $referrer = User::where('id', $invited->referrer_id)->first();

                    if ($referrer) {
                        $referrer->update([
                            'free_transactions' => (int) $referrer->free_transactions + 3,
                        ]);
                        $invited->update(['referral_bonus_granted' => true]);
                    }
                }
            }

            session()->flash('status', 'فاکتور با موفقیت صادر شد.');
        }

        $this->redirectRoute('admin.orders');
    }

    public function render()
    {
        return view('livewire.admin.order-form', [
            'products' => Products::collection(),
        ]);
    }
}
