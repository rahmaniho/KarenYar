<?php

namespace App\Livewire\Auth;

use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Component;

#[Layout('layouts.app')]
#[Title('ورود')]
class Login extends Component
{
    public string $phone = '';

    public string $password = '';

    public bool $remember = false;

    /**
     * Redirect authenticated users to their panel.
     */
    public function mount(): void
    {
        if (Auth::check()) {
            $this->redirect(Auth::user()->isAdmin() ? route('admin.dashboard') : route('panel.dashboard'));
        }
    }

    /**
     * Attempt to authenticate the visitor.
     */
    public function login(): void
    {
        $this->validate([
            'phone' => ['required', 'string', 'max:20'],
            'password' => ['required', 'string'],
        ], [
            'phone.required' => 'شماره موبایل را وارد کنید.',
            'password.required' => 'رمز عبور را وارد کنید.',
        ]);

        $user = User::where('phone', $this->phone)->first();

        if (!$user) {
            $this->addError('phone', 'شماره موبایل یا رمز عبور اشتباه است.');

            return;
        }

        switch ($user->status) {
            case 'pending':
                $this->addError('phone', 'حساب شما هنوز توسط فروشگاه تأیید نشده است.');
                return;
            case 'pre_verified':
                $this->addError('phone', 'حساب شما هنوز توسط فروشگاه تایید شده ولی نیاز هست ابتدا ثبت نام کنید.');
                return;
            case 'blocked':
                $this->addError('phone', 'حساب شما توسط فروشگاه تا اطلاع ثانوی مسدود شده.');
                return;
        }

        if (!Hash::check($this->password, $user->password)) {
            $this->addError('phone', 'شماره موبایل یا رمز عبور اشتباه است.');

            return;
        }

        Auth::login($user, $this->remember);
        session()->regenerate();

        $this->redirect($user->isAdmin() ? route('admin.dashboard') : route('panel.dashboard'));
    }

    public function render()
    {
        return view('livewire.auth.login');
    }
}
