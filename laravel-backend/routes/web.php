<?php

use App\Livewire\Admin\Analyses as AdminAnalyses;
use App\Livewire\Admin\AnalysesForm as AdminAnalysesForm;
use App\Livewire\Admin\Dashboard as AdminDashboard;
use App\Livewire\Admin\History as AdminHistory;
use App\Livewire\Admin\News as AdminNews;
use App\Livewire\Admin\NewsForm as AdminNewsForm;
use App\Livewire\Admin\OrderForm;
use App\Livewire\Admin\Orders as AdminOrders;
use App\Livewire\Admin\Settings as AdminSettings;
use App\Livewire\Admin\Users;
use App\Livewire\Auth\Forgot;
use App\Livewire\Auth\Login;
use App\Livewire\Auth\Register;
use App\Livewire\Auth\Verify;
use App\Livewire\Landing;
use App\Livewire\Panel\Analyses as PanelAnalyses;
use App\Livewire\Panel\Dashboard as PanelDashboard;
use App\Livewire\Panel\History as PanelHistory;
use App\Livewire\Panel\News as PanelNews;
use App\Livewire\Panel\Orders as PanelOrders;
use App\Livewire\Panel\OrderShow;
use App\Livewire\Panel\Settings as PanelSettings;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Public routes
|--------------------------------------------------------------------------
*/

Route::get('/', Landing::class)->name('landing');

Route::middleware('guest')->group(function (): void {
    Route::get('/login', Login::class)->name('auth.login');
    Route::get('/register', Register::class)->name('auth.register');
    Route::get('/register/verify/{phone}', Verify::class)->name('auth.verify');

    Route::get('/forgot', Forgot::class)->name('auth.forgot');
});

Route::post('/logout', function () {
    auth()->logout();
    session()->invalidate();
    session()->regenerateToken();

    return redirect()->route('landing');
})
    ->middleware('auth')
    ->name('auth.logout');

/*
|--------------------------------------------------------------------------
| Theme preference
|--------------------------------------------------------------------------
*/

Route::post('/theme', function () {
    $value = request()->input('theme') === 'dark' ? 'dark' : 'light';

    return response()
        ->json(['ok' => true])
        ->cookie(cookie('amin_gold_theme', $value, 60 * 24 * 365, '/'));
})->name('theme');

/*
|--------------------------------------------------------------------------
| Uploaded files (served by the app, never from the document root)
|--------------------------------------------------------------------------
*/

// Files live under storage/app/public (the "public" disk). They are never
// exposed from the document root; this route streams them from the disk so
// the current domain is always used in the generated URLs.
Route::get('/media/{path}', function (string $path) {
    $normalized = preg_replace('~^/+~', '', $path);

    // Reject path traversal and anything outside the public disk.
    if ($normalized === '' || str_contains($normalized, '..') || $normalized === '.') {
        abort(404);
    }

    $disk = Storage::disk('public');

    if (! $disk->exists($normalized)) {
        abort(404);
    }

    return $disk->response($normalized);
})
    ->where('path', '.*')
    ->name('media.show');

/*
|--------------------------------------------------------------------------
| Customer panel
|--------------------------------------------------------------------------
*/

Route::middleware(['auth', 'role:user'])->prefix('panel')->name('panel.')->group(function (): void {
    Route::get('/', PanelDashboard::class)->name('dashboard');

    Route::get('/orders', PanelOrders::class)->name('orders');
    Route::get('/orders/{invoice}', OrderShow::class)->name('order.show');

    Route::get('/history', PanelHistory::class)->name('history');

    Route::get('/news', PanelNews::class)->name('news');
    Route::get('/analyses', PanelAnalyses::class)->name('analyses');

    Route::get('/settings', PanelSettings::class)->name('settings');
});

/*
|--------------------------------------------------------------------------
| Admin panel
|--------------------------------------------------------------------------
*/

Route::middleware(['auth', 'role:admin'])->prefix('admin')->name('admin.')->group(function (): void {
    Route::get('/', AdminDashboard::class)->name('dashboard');

    Route::get('/users', Users::class)->name('users');

    Route::get('/orders', AdminOrders::class)->name('orders');
    Route::get('/orders/create', OrderForm::class)->name('orders.create');
    Route::get('/orders/{invoice}/edit', OrderForm::class)->name('orders.edit');

    Route::get('/history', AdminHistory::class)->name('history');

    Route::get('/news', AdminNews::class)->name('news');
    Route::get('/news/create', AdminNewsForm::class)->name('news.create');
    Route::get('/news/{news}/edit', AdminNewsForm::class)->name('news.edit');

    Route::get('/analyses', AdminAnalyses::class)->name('analyses');
    Route::get('/analyses/create', AdminAnalysesForm::class)->name('analyses.create');
    Route::get('/analyses/{analysis}/edit', AdminAnalysesForm::class)->name('analyses.edit');

    Route::get('/settings', AdminSettings::class)->name('settings');
});
