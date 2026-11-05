<?php

namespace App\Livewire\Auth;

use App\Models\PasswordRequest;
use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Component;

#[Layout('layouts.app')]
#[Title('فراموشی رمز عبور')]
class Forgot extends Component
{
    public string $phone = '';

    public ?string $status = null;

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
     * Record a password-recovery request for an admin to fulfil.
     */
    public function submit(): void
    {
        $this->validate([
            'phone' => ['required', 'string', 'max:20'],
        ], [
            'phone.required' => 'شماره موبایل را وارد کنید.',
        ]);

        $hasPending = PasswordRequest::where('phone', $this->phone)
            ->where('status', 'pending')
            ->exists();

        if (! $hasPending) {
            $user = User::where('phone', $this->phone)->first();

            PasswordRequest::create([
                'user_id' => $user?->id,
                'phone' => $this->phone,
                'status' => 'pending',
            ]);
        }

        $this->status = 'درخواست شما ثبت شد. رمز جدید پس از صدور توسط فروشگاه، به اطلاع شما می‌رسد.';
    }

    public function render()
    {
        return view('livewire.auth.forgot');
    }
}
