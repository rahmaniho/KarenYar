<?php

namespace App\Livewire\Panel;

use App\Models\Setting;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Component;

#[Layout('layouts.app')]
#[Title('تنظیمات حساب')]
class Settings extends Component
{
    public string $current_password = '';

    public string $password = '';

    public string $password_confirmation = '';

    public ?string $status = null;

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
     * Update the authenticated user's password.
     */
    public function updatePassword(): void
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

        $user->update(['password' => $this->password]); // hashed by the model cast

        $this->reset(['current_password', 'password', 'password_confirmation']);
        $this->status = 'رمز عبور شما با موفقیت تغییر کرد.';
    }

    public function render()
    {
        return view('livewire.panel.settings', [
            'contactPhone' => Setting::get('contact_phone', ''),
        ]);
    }
}
