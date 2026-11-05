<?php

namespace App\Livewire\Panel;

use App\Models\Banner;
use App\Models\Setting;
use App\Models\TradeRequest;
use App\Models\User;
use App\Support\Format;
use App\Support\HoldingsService;
use App\Support\PriceService;
use App\Support\Products;
use App\Support\ProfitService;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;
use Livewire\Attributes\Computed;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Component;

#[Layout('layouts.app')]
#[Title('داشبورد')]
class Dashboard extends Component
{
    /** Whether the per-product holdings breakdown is shown under the total. */
    public bool $showBreakdown = false;

    /** Whether the per-product profit breakdown is shown under the profit total. */
    public bool $showProfitBreakdown = false;

    /** Whether the list of referred-and-joined users is expanded. */
    public bool $showReferrals = false;

    /** Whether the "سفارش‌های من" list is expanded (closed by default). */
    public bool $showMyRequests = false;

    /** Whether the trade request form is expanded (collapsed by default). */
    public bool $showTradeForm = false;

    /** Trade request form: خرید or فروش. */
    public string $tradeKind = 'sell';

    /** Trade request form: the single product the request is about. */
    public string $tradeProduct = Products::GOLD18;

    /** Trade request form: money amount in Toman. */
    public string $tradeAmount = '';

    /** Trade request form: weight in grams of gold18. */
    public string $tradeWeight = '';

    /** Whether a price-range condition is attached to the request. */
    public bool $tradeHasRange = false;

    /** Trade request form: the acceptable price range bounds. */
    public string $tradeMinPrice = '';

    /** Trade request form: the acceptable price range bounds. */
    public string $tradeMaxPrice = '';

    /** Feedback message shown after placing a trade request. */
    public ?string $status = null;

    /**
     * Toggle the per-product holdings breakdown under the total.
     */
    public function toggleBreakdown(): void
    {
        $this->showBreakdown = ! $this->showBreakdown;
    }

    /**
     * Toggle the per-product profit breakdown under the profit total.
     */
    public function toggleProfitBreakdown(): void
    {
        $this->showProfitBreakdown = ! $this->showProfitBreakdown;
    }

    /**
     * Toggle the collapsible list of people this user referred who joined.
     */
    public function toggleReferrals(): void
    {
        $this->showReferrals = ! $this->showReferrals;
    }

    /**
     * Toggle the collapsible "سفارش‌های من" list (closed by default).
     */
    public function toggleMyRequests(): void
    {
        $this->showMyRequests = ! $this->showMyRequests;
    }

    /**
     * The users who joined using this user's referral code.
     */
    #[Computed]
    public function myReferrals(): Collection
    {
        return User::where('referrer_id', Auth::id())->orderByDesc('id')->get();
    }

    /**
     * Toggle the trade request form (collapsed by default).
     */
    public function toggleTradeForm(): void
    {
        $this->showTradeForm = ! $this->showTradeForm;
    }

    /**
     * Open the trade request form, e.g. from the hero call-to-action.
     */
    public function openTradeForm(): void
    {
        $this->showTradeForm = true;
    }

    /**
     * The price of the selected product, used to convert money into the
     * product's unit and back: a customer buys at the shop's sell price
     * and sells at the shop's buy price.
     *
     * @return array<string, int>
     */
    #[Computed]
    public function tradePrices(): array
    {
        return [
            'buy' => PriceService::buyPrice($this->tradeProduct),
            'sell' => PriceService::sellPrice($this->tradeProduct),
        ];
    }

    /**
     * The label of the quantity field, per product: grams for gold,
     * dollar for the US dollar and count for the coins.
     */
    #[Computed]
    public function tradeWeightLabel(): string
    {
        return match ($this->tradeProduct) {
            Products::DOLLAR => 'مقدار (دلار)',
            Products::GOLD18 => 'وزن (گرم)',
            default => 'تعداد (عدد)',
        };
    }

    /**
     * The example value shown in the quantity field, per product. The
     * dollar placeholder shows 100 (a round dollar figure) instead of the
     * generic 27 used for grams.
     */
    #[Computed]
    public function tradeWeightPlaceholder(): string
    {
        return match ($this->tradeProduct) {
            Products::DOLLAR => 'مثلاً ۱۰۰ دلار',
            Products::GOLD18 => 'مثلاً ۲۷ گرم',
            default => 'مثلاً ۲ عدد',
        };
    }

    /**
     * Switching the product resets the typed quantity fields so they never
     * mix units of two different products.
     */
    public function updatedTradeProduct(): void
    {
        $this->reset(['tradeAmount', 'tradeWeight', 'tradeMinPrice', 'tradeMaxPrice']);
        $this->tradeHasRange = false;
    }

    /**
     * Typing money locks the weight field (it stays empty).
     */
    public function updatedTradeAmount(): void
    {
        $this->tradeWeight = '';
    }

    /**
     * Typing weight locks the money field (it stays empty).
     */
    public function updatedTradeWeight(): void
    {
        $this->tradeAmount = '';
    }

    /**
     * Whether the money field is hidden because the weight was typed.
     */
    #[Computed]
    public function tradeAmountHidden(): bool
    {
        return $this->tradeWeight !== '';
    }

    /**
     * Whether the weight field is hidden because the money was typed.
     */
    #[Computed]
    public function tradeWeightHidden(): bool
    {
        return $this->tradeAmount !== '';
    }

    /**
     * Reduce a typed value to plain digits so separators added by the
     * input formatter never reach validation or the database.
     */
    protected function normalizeNumber(string $value): string
    {
        return str_replace(['٬', ',', ' '], '', Format::input($value));
    }

    /**
     * Place a buy/sell request for the admin to confirm.
     *
     * The customer provides exactly one of the two: the money amount or the
     * gold weight. The price at hand is only used as reference — the final
     * amount is worked out on the invoice, because the price moves.
     */
    public function placeTradeRequest(): void
    {
        // Submitting (or failing) reveals the form so errors stay visible.
        $this->showTradeForm = true;

        $this->tradeAmount = $this->normalizeNumber($this->tradeAmount);
        $this->tradeWeight = $this->normalizeNumber($this->tradeWeight);
        $this->tradeMinPrice = $this->normalizeNumber($this->tradeMinPrice);
        $this->tradeMaxPrice = $this->normalizeNumber($this->tradeMaxPrice);

        $this->validate([
            'tradeKind' => ['required', Rule::in(['buy', 'sell'])],
            'tradeProduct' => ['required', Rule::in(Products::keys())],
        ], [
            'tradeKind.required' => 'نوع سفارش را انتخاب کنید.',
            'tradeProduct.required' => 'محصول را انتخاب کنید.',
        ]);

        $amount = trim($this->tradeAmount);
        $weight = trim($this->tradeWeight);

        if ($amount === '' && $weight === '') {
            $this->addError('tradeAmount', 'مبلغ یا وزن را وارد کنید.');

            return;
        }

        if ($amount !== '' && (! is_numeric($amount) || (float) $amount <= 0)) {
            $this->addError('tradeAmount', 'مبلغ باید عددی بزرگ‌تر از صفر باشد.');

            return;
        }

        if ($weight !== '' && (! is_numeric($weight) || (float) $weight <= 0)) {
            $this->addError('tradeWeight', 'وزن باید عددی بزرگ‌تر از صفر باشد.');

            return;
        }

        if ($this->tradeHasRange) {
            if ($this->tradeMinPrice === '' || $this->tradeMaxPrice === '') {
                $this->addError('tradeMinPrice', 'حد پایین و بالای بازه قیمت را وارد کنید.');

                return;
            }

            $min = (float) $this->tradeMinPrice;
            $max = (float) $this->tradeMaxPrice;

            if ($min >= $max) {
                $this->addError('tradeMinPrice', 'حد پایین باید کوچک‌تر از حد بالا باشد.');

                return;
            }
        } else {
            $min = null;
            $max = null;
        }

        TradeRequest::create([
            'user_id' => Auth::id(),
            'kind' => $this->tradeKind,
            'product' => $this->tradeProduct,
            'weight' => $weight === '' ? null : $weight,
            'amount' => $amount === '' ? null : $amount,
            'min_price' => $min,
            'max_price' => $max,
            'status' => 'pending',
        ]);

        $this->reset(['tradeAmount', 'tradeWeight', 'tradeMinPrice', 'tradeMaxPrice']);
        $this->tradeHasRange = false;
        $this->status = 'سفارش شما ثبت شد و در انتظار تأیید مدیر است.';
    }

    /**
     * This user's buy/sell requests that are still waiting for the admin's
     * decision, newest first. Decided requests live in the history page.
     */
    #[Computed]
    public function myTradeRequests(): Collection
    {
        return TradeRequest::where('user_id', Auth::id())
            ->where('status', 'pending')
            ->orderByDesc('id')
            ->get();
    }

    public function render()
    {
        PriceService::maybeAutoRefresh();

        $user = Auth::user();

        return view('livewire.panel.dashboard', [
            'user' => $user,
            'holdings' => HoldingsService::forUser($user),
            'total' => HoldingsService::totalForUser($user),
            'profits' => ProfitService::forUser($user),
            'profitTotal' => ProfitService::totalForUser($user),
            'contactPhone' => Setting::get('contact_phone', ''),
            'banners' => Banner::activeOrdered()->get(),
            'products' => Products::collection(),
        ]);
    }
}
