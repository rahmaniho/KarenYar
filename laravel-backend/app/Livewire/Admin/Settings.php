<?php

namespace App\Livewire\Admin;

use App\Models\Banner;
use App\Models\Setting;
use App\Support\Format;
use App\Support\Moj3PriceSource;
use App\Support\PriceService;
use App\Support\Products;
use App\Support\Referrals;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Component;
use Livewire\WithFileUploads;

#[Layout('layouts.app')]
#[Title('تنظیمات')]
class Settings extends Component
{
    use WithFileUploads;

    /**
     * @var array<string, array{price: string, intrinsic: string}>
     */
    public array $prices = [];

    /**
     * The prices last received from the reference site (moj3.ir), in Toman,
     * keyed by product. Shown next to every price in the table, with the
     * tolerance applied.
     *
     * @var array<string, int>
     */
    public array $referencePrices = [];

    /** The tolerance (%) kept on the reference-site prices, e.g. 0.5 or -0.5. */
    public string $priceTolerance = '0';

    public bool $autoUpdate = false;

    public string $contactPhone = '';

    public string $verifyPhone = '';

    /** The invite-message template (the {@code {code}} placeholder fills in each user's code). */
    public string $inviteText = '';

    /** Uploaded banner image file (for adding new banner). */
    public $bannerFile = null;

    /** Optional title for the new banner. */
    public string $bannerTitle = '';

    /** List of all banners. */
    public $banners = [];

    public string $current_password = '';

    public string $password = '';

    public string $password_confirmation = '';

    public ?string $status = null;

    public string $lastRefreshAt = '';

    /** Global gold ounce price (in USD, not a tradeable product). */
    public string $goldOuncePrice = '';

    /** Global gold ounce daily change (%). */
    public string $goldOunceChange = '';

    /** Whether the change-password form is expanded (behind its icon). */
    public bool $showPasswordForm = false;

    /**
     * Toggle the change-password form behind its icon.
     */
    public function togglePasswordForm(): void
    {
        $this->showPasswordForm = ! $this->showPasswordForm;
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
     * Reduce the typed tolerance to a plain signed number. Besides the
     * digits, the Persian decimal separator and the typographic minus sign
     * are accepted so "‎-۰٫۵" reaches the database as "-0.5".
     */
    protected function normalizeTolerance(string $value): string
    {
        return str_replace(['٫', '−', '–'], ['.', '-', '-'], $this->normalizeNumber($value));
    }

    /**
     * Hydrate the settings form.
     */
    public function mount(): void
    {
        $this->autoUpdate = PriceService::autoUpdateEnabled();
        $this->contactPhone = Setting::get('contact_phone', '');
        $this->verifyPhone = Setting::get('verify_phone', '');
        $this->inviteText = Referrals::template();
        $this->lastRefreshAt = Setting::get('last_refresh_at', '');
        $this->goldOuncePrice = Setting::get('gold_ounce_price', '');
        $this->goldOunceChange = Setting::get('gold_ounce_change', '');
        $this->priceTolerance = Setting::get(PriceService::TOLERANCE_SETTING, '0');
        $this->referencePrices = $this->storedReferencePrices();

        $this->loadBanners();
        $this->fillPriceFields();
    }

    /**
     * Load all banners from database.
     */
    protected function loadBanners(): void
    {
        $this->banners = Banner::orderBy('sort_order')->orderBy('id')
            ->get()
            ->mapWithKeys(fn ($banner) => [
                $banner->id => [
                    'id' => $banner->id,
                    'path' => $banner->path,
                    'title' => $banner->title,
                    'sort_order' => $banner->sort_order,
                    'is_active' => $banner->is_active,
                ],
            ])
            ->toArray();
    }

    /**
     * Reflect the stored prices into the editable fields.
     */
    protected function fillPriceFields(): void
    {
        foreach (Products::keys() as $product) {
            $price = PriceService::forProduct($product);

            $this->prices[$product] = [
                // The single reference price (buy/sell are typed into invoices).
                // Stored decimals are padded to their scale; trim the trailing
                // zeros so the fields never show 3520000.00 or 2.20.
                'price' => Format::trimZeros((string) $price->sell_price),
                'intrinsic' => $price->intrinsic_value === null ? '' : Format::trimZeros((string) $price->intrinsic_value),
                'change' => $price->change === null ? '' : Format::trimZeros((string) $price->change),
                'bubble' => $price->bubble === null ? '' : Format::trimZeros((string) $price->bubble),
            ];
        }

        $this->goldOuncePrice = Setting::get('gold_ounce_price', '');
        $this->goldOunceChange = Setting::get('gold_ounce_change', '');
    }

    /**
     * The reference prices remembered from the last fetch from moj3.ir.
     *
     * @return array<string, int>
     */
    protected function storedReferencePrices(): array
    {
        $stored = json_decode((string) Setting::get('reference_prices', '[]'), true);

        return is_array($stored) ? array_filter($stored, 'is_numeric') : [];
    }

    /**
     * The tolerance typed in the form, as a safe number.
     */
    protected function toleranceValue(): float
    {
        return is_numeric($this->priceTolerance) ? (float) $this->priceTolerance : 0.0;
    }

    /**
     * A product's reference-site price with the current tolerance applied,
     * or null when that product was never received from the reference site.
     */
    public function adjustedReferencePrice(string $product): ?int
    {
        $reference = (int) ($this->referencePrices[$product] ?? 0);

        if ($reference <= 0) {
            return null;
        }

        return PriceService::withTolerance($reference, $this->toleranceValue());
    }

    /**
     * The tolerance as it reads in the price table, e.g. "+۰.۵٪" or "‎-۰.۵٪".
     */
    public function toleranceLabel(): string
    {
        $tolerance = $this->toleranceValue();

        return ($tolerance > 0 ? '+' : '').Format::fa((string) $tolerance).'٪';
    }

    /**
     * Save the reference prices, the auto-update toggle and the contact numbers.
     */
    public function save(): void
    {
        $this->priceTolerance = $this->normalizeTolerance($this->priceTolerance);

        foreach (Products::keys() as $product) {
            $this->prices[$product]['price'] = $this->normalizeNumber($this->prices[$product]['price']);
            $this->prices[$product]['intrinsic'] = $this->normalizeNumber($this->prices[$product]['intrinsic']);
            $this->prices[$product]['change'] = $this->normalizeNumber($this->prices[$product]['change']);
            $this->prices[$product]['bubble'] = $this->normalizeNumber($this->prices[$product]['bubble']);
        }

        $rules = [];
        $messages = [];

        foreach (Products::keys() as $product) {
            $rules["prices.{$product}.price"] = ['required', 'numeric', 'gte:0'];
            $rules["prices.{$product}.intrinsic"] = ['nullable', 'numeric', 'gte:0'];
            $rules["prices.{$product}.change"] = ['nullable', 'numeric'];
            $rules["prices.{$product}.bubble"] = ['nullable', 'numeric'];
            $messages["prices.{$product}.price.required"] = 'قیمت را وارد کنید.';
        }

        $data = $this->validate(array_merge($rules, [
            'autoUpdate' => ['boolean'],
            'priceTolerance' => ['required', 'numeric', 'between:-50,50'],
            'contactPhone' => ['nullable', 'string', 'max:30'],
            'verifyPhone' => ['nullable', 'string', 'max:30'],
            'inviteText' => ['nullable', 'string', 'max:500'],
            'goldOuncePrice' => ['nullable', 'string', 'max:20'],
            'goldOunceChange' => ['nullable', 'string', 'max:10'],
        ]), array_merge($messages, [
            'priceTolerance.required' => 'تلرانس را وارد کنید (برای بدون تغییر، ۰ بگذارید).',
            'priceTolerance.numeric' => 'تلرانس باید عدد باشد؛ مثلاً 0.5 یا ‎-0.5.',
            'priceTolerance.between' => 'تلرانس باید بین ‎-۵۰ تا ۵۰ درصد باشد.',
        ]));

        foreach (Products::keys() as $product) {
            $price = $data['prices'][$product]['price'];

            PriceService::forProduct($product)->update([
                'buy_price' => $price,
                'sell_price' => $price,
                'intrinsic_value' => $data['prices'][$product]['intrinsic'] === '' ? null : $data['prices'][$product]['intrinsic'],
                'change' => $data['prices'][$product]['change'] === '' ? null : (float) $data['prices'][$product]['change'],
                'bubble' => $data['prices'][$product]['bubble'] === '' ? null : (float) $data['prices'][$product]['bubble'],
            ]);
        }

        Setting::put('auto_update', $data['autoUpdate'] ? '1' : '0');
        Setting::put(PriceService::TOLERANCE_SETTING, (string) $this->toleranceValue());
        Setting::put('contact_phone', $data['contactPhone']);
        Setting::put('verify_phone', $data['verifyPhone']);
        Setting::put('invite_text', trim($data['inviteText'] ?? ''));
        Setting::put('gold_ounce_price', trim($data['goldOuncePrice'] ?? ''));
        Setting::put('gold_ounce_change', trim($data['goldOunceChange'] ?? ''));

        $this->status = 'تنظیمات ذخیره شد.';
    }

    /**
     * Store the uploaded panel banner image on the public disk.
     */
    public function uploadBanner(): void
    {
        $this->validate([
            'bannerFile' => ['required', 'file', 'image', 'max:5120'],
            'bannerTitle' => ['nullable', 'string', 'max:255'],
        ], [
            'bannerFile.required' => 'یک تصویر انتخاب کنید.',
            'bannerFile.image' => 'فقط تصویر (jpg/png و …) قابل بارگذاری است.',
            'bannerFile.max' => 'حجم تصویر نباید از ۵ مگابایت بیشتر باشد.',
        ]);

        $path = $this->bannerFile->store('banners', 'public');

        $maxSort = Banner::max('sort_order') ?? 0;
        Banner::create([
            'path' => $path,
            'title' => $this->bannerTitle ?: null,
            'sort_order' => $maxSort + 1,
            'is_active' => true,
        ]);

        $this->bannerFile = null;
        $this->bannerTitle = '';
        $this->loadBanners();
        $this->status = 'بنر تصویری اضافه شد.';
    }

    /**
     * Remove a banner.
     */
    public function deleteBanner(int $bannerId): void
    {
        $banner = Banner::find($bannerId);

        if ($banner) {
            Storage::disk('public')->delete($banner->path);
            $banner->delete();
            $this->loadBanners();
            $this->status = 'بنر تصویری حذف شد.';
        }
    }

    /**
     * Toggle banner active status.
     */
    public function toggleBanner(int $bannerId): void
    {
        $banner = Banner::find($bannerId);

        if ($banner) {
            $banner->update(['is_active' => ! $banner->is_active]);
            $this->loadBanners();
            $this->status = 'وضعیت بنر تغییر کرد.';
        }
    }

    /**
     * Update banner sort order.
     */
    public function updateBannerOrder(array $bannerIds): void
    {
        foreach ($bannerIds as $index => $id) {
            Banner::where('id', $id)->update(['sort_order' => $index + 1]);
        }
        $this->loadBanners();
    }

    /**
     * Update banner title.
     */
    public function updateBannerTitle(int $bannerId, string $title): void
    {
        Banner::where('id', $bannerId)->update(['title' => $title ?: null]);
        $this->loadBanners();
    }

    /**
     * Explicit save for a banner (called from save button).
     */
    public function saveBanner(int $bannerId): void
    {
        $banner = Banner::find($bannerId);
        if ($banner) {
            $this->status = 'بنر با موفقیت ذخیره شد.';
        }
    }

    /**
     * Updated hook for banner title.
     */
    public function updatedBanners($value, $key): void
    {
        // key format: "bannerId.property" e.g., "1.title", "1.sort_order", "1.is_active"
        if (str_contains($key, '.')) {
            [$id, $property] = explode('.', $key, 2);
            $banner = Banner::find($id);
            if ($banner) {
                $banner->update([$property => $value]);
                $this->loadBanners();
            }
        }
    }

    /**
     * Refresh prices immediately.
     */
    public function refreshPrices(): void
    {
        PriceService::refresh(2.0);

        $this->lastRefreshAt = Setting::get('last_refresh_at', '');
        $this->fillPriceFields();

        $this->status = 'قیمت‌ها به‌روزرسانی شد.';
    }

    /**
     * Fetch the live prices from the reference site, keep the tolerance on
     * them and store the result as the current prices.
     *
     * The prices received from moj3.ir are remembered so the price table can
     * always show what the reference site says and what the tolerance makes
     * of it, even after a page reload.
     */
    public function fetchReferencePrices(): void
    {
        $this->priceTolerance = $this->normalizeTolerance($this->priceTolerance);

        $this->validate([
            'priceTolerance' => ['required', 'numeric', 'between:-50,50'],
        ], [
            'priceTolerance.required' => 'تلرانس را وارد کنید (برای بدون تغییر، ۰ بگذارید).',
            'priceTolerance.numeric' => 'تلرانس باید عدد باشد؛ مثلاً 0.5 یا ‎-0.5.',
            'priceTolerance.between' => 'تلرانس باید بین ‎-۵۰ تا ۵۰ درصد باشد.',
        ]);

        try {
            $market = Moj3PriceSource::fetch();
        } catch (\Throwable $e) {
            $this->addError('priceTolerance', 'دریافت قیمت از سایت مرجع ناموفق بود: '.$e->getMessage());

            return;
        }

        $tolerance = $this->toleranceValue();

        Setting::put(PriceService::TOLERANCE_SETTING, (string) $tolerance);

        $reference = [];

        foreach (Products::keys() as $product) {
            if (! isset($market[$product]['price'])) {
                continue;
            }

            $received = (int) $market[$product]['price'];
            $reference[$product] = $received;

            $price = PriceService::forProduct($product);

            $price->update([
                'buy_price' => PriceService::withTolerance($received, $tolerance),
                'sell_price' => PriceService::withTolerance($received, $tolerance),
                'intrinsic_value' => $market[$product]['intrinsic'] ?? $price->intrinsic_value,
                'change' => isset($market[$product]['change']) ? (float) $market[$product]['change'] : $price->change,
                'bubble' => isset($market[$product]['bubble']) ? (float) $market[$product]['bubble'] : $price->bubble,
            ]);
        }

        $this->referencePrices = $reference;
        Setting::put('reference_prices', json_encode($reference, JSON_UNESCAPED_UNICODE));

        // The global gold ounce is not a tradeable product, so the tolerance
        // is never applied to it.
        $gold = $market[Products::GOLD18] ?? null;

        if (isset($gold['gold_ounce'])) {
            Setting::put('gold_ounce_price', (string) $gold['gold_ounce']);
            Setting::put('gold_ounce_change', (string) ($gold['gold_ounce_change'] ?? '0'));
        }

        Setting::put('last_refresh_at', now()->toDateTimeString());
        $this->lastRefreshAt = Setting::get('last_refresh_at', '');
        $this->fillPriceFields();

        $this->status = count($reference) === 0
            ? 'سایت مرجع قیمتی برای محصولات برنگرداند.'
            : 'قیمت‌های سایت مرجع دریافت شد'.($tolerance == 0
                ? ' (بدون تلرانس).'
                : ' و با تلرانس '.Format::fa(number_format($tolerance, 2)).'٪ ثبت شد.');
    }

    /**
     * Change the admin account's own password.
     */
    public function updateOwnPassword(): void
    {
        $this->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:6', 'confirmed'],
        ], [
            'current_password.required' => 'رمز عبور فعلی را وارد کنید.',
            'password.required' => 'رمز عبور جدید را وارد کنید.',
            'password.min' => 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.',
            'password.confirmed' => 'تکرار رمز عبور مطابقت ندارد.',
        ]);

        $user = Auth::user();

        if (! Hash::check($this->current_password, $user->password)) {
            $this->addError('current_password', 'رمز عبور فعلی اشتباه است.');

            return;
        }

        $user->update(['password' => $this->password]); // hashed by the cast

        $this->reset(['current_password', 'password', 'password_confirmation']);
        $this->status = 'رمز عبور شما تغییر کرد.';
    }

    public function render()
    {
        return view('livewire.admin.settings', [
            'products' => Products::collection(),
        ]);
    }
}
