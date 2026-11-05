<?php

namespace App\Livewire\Auth;

use App\Models\User;
use App\Support\Format;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Component;

#[Layout('layouts.app')]
#[Title('ثبت‌نام')]
class Register extends Component
{
    public string $name = '';

    public string $phone = '';

    public string $password = '';

    public string $password_confirmation = '';

    /** Optional referral code (کد معرف) of the user who invited this person. */
    public string $referral_code = '';

    /**
     * Redirect authenticated users to their panel and pre-fill the referral
     * code from the registration link (e.g. /register?ref=AMIN99).
     */
    public function mount(): void
    {
        $ref = trim((string)request('ref', request('referral_code', '')));

        if ($ref !== '') {
            $this->referral_code = Str::upper($ref);
        }

        if (Auth::check()) {
            $this->redirect(Auth::user()->isAdmin() ? route('admin.dashboard') : route('panel.dashboard'));
        }
    }

    /**
     * Create the pending customer account and go to the verification page.
     */
    public function register(): void
    {
        $this->validate([
            'name' => ['required', 'string', 'max:100'],
            'phone' => ['required', 'string', 'max:20'],
            'password' => ['required', 'string', 'min:6', 'confirmed'],
            'referral_code' => ['nullable', 'string', 'max:20'],
        ], [
            'name.required' => 'نام و نام خانوادگی را وارد کنید.',
            'phone.required' => 'شماره موبایل را وارد کنید.',
//            'phone.unique' => 'این شماره موبایل قبلاً ثبت شده است.',
            'password.required' => 'رمز عبور را وارد کنید.',
            'password.min' => 'رمز عبور باید حداقل ۶ کاراکتر باشد.',
            'password.confirmed' => 'تکرار رمز عبور مطابقت ندارد.',
        ]);

        $referralCode = trim($this->referral_code);
        $referrer = null;

        if ($referralCode !== '') {
            $referrer = User::where('referral_code', Str::upper($referralCode))->first();

            if (!$referrer) {
                $this->addError('referral_code', 'کد معرف یافت نشد.');

                return;
            }
        }

        $u = User::where('phone', $this->phone)->first();
        if ($u == null) {
            // new user
            $user = User::create([
                'name' => $this->name,
                'phone' => $this->phone,
                'password' => $this->password, // hashed by the model cast
                'role' => 'user',
                'status' => 'pending',
                'verification_code' => Format::pad(random_int(0, 9999), 4),
                'referral_code' => User::generateReferralCode(),
                'referrer_id' => $referrer?->id,
            ]);

            session()->flash('registered_user', $user->id);

            $this->redirectRoute('auth.verify', ['phone' => $user->phone]);
        } else {
            // user exists
            if ($u->status == 'approved') {
                // already registered
                $this->addError('phone', "این شماره موبایل قبلاً ثبت شده است.");
            } else if ($u->status == 'pending') {
                // already registered but not verified
                session()->flash('registered_user', $u->id);
                $this->redirectRoute('auth.verify', ['phone' => $u->phone]);
            } else if ($u->status == 'pre_verified') {
                // user was created by the admin. so let's just skip to the end.
                session()->flash('registered_user', $u->id);
                $u->status = 'approved';
                $u->name = $this->name;
                $u->password = Hash::make($this->password);
                $u->save();
                Auth::login($u);
                $this->redirectRoute('panel.dashboard');
            }
            else if ($u->status == 'blocked') {
                // user is blocked by the admin
                $this->addError('phone', "این شماره موبایل توسط مدیریت مسدود شده است.");
            }
        }
    }

    public function render()
    {
        return view('livewire.auth.register');
    }
}
