<?php

namespace App\Livewire\Panel;

use App\Models\Invoice;
use App\Support\InvoiceCalculator;
use Illuminate\Support\Facades\Auth;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Component;

#[Layout('layouts.app')]
#[Title('جزئیات فاکتور')]
class OrderShow extends Component
{
    public Invoice $invoice;

    /**
     * Load the invoice and confirm it belongs to the current user.
     */
    public function mount(Invoice $invoice): void
    {
        abort_unless($invoice->user_id === Auth::id(), 403);

        $this->invoice = $invoice;
    }

    public function render()
    {
        return view('livewire.panel.order-show', [
            'invoice' => $this->invoice,
            'breakdown' => InvoiceCalculator::calculate(
                $this->invoice->product,
                $this->invoice->quantity,
                $this->invoice->unit_price,
                $this->invoice->labor_percent,
                $this->invoice->profit_percent,
                $this->invoice->vat_percent,
                $this->invoice->commission_percent,
            ),
        ]);
    }
}
