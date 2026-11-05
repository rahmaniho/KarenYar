<?php

namespace App\Livewire\Auth;

use App\Models\Setting;
use App\Models\User;
use App\Support\PriceService;
use Illuminate\Support\Facades\Auth;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Component;

#[Layout('layouts.app')]
#[Title('کد تأیید')]
class Verify extends Component
{
    public ?string $phone = null;

    public ?User $user = null;

    public string $verifyPhone = '';

    /**
     * Load the freshly registered user from the session flash.
     */
    public function mount(string $phone): void
    {
        if (Auth::check()) {
            $this->redirect(Auth::user()->isAdmin() ? route('admin.dashboard') : route('panel.dashboard'));

            return;
        }

        $this->phone = $phone;

        $id = session()->get('registered_user');

        $user = $id ? User::where('id', $id)->where('phone', $phone)->first() : null;

        if (! $user || $user->status !== 'pending') {
            $this->redirectRoute('auth.login');

            return;
        }

        $this->user = $user;
        $this->verifyPhone = Setting::get('verify_phone', '');
    }

    public function render()
    {
        PriceService::maybeAutoRefresh();

        return view('livewire.auth.verify');
    }
}
