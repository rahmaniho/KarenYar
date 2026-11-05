<?php

namespace App\Livewire\Admin;

use App\Models\PasswordRequest;
use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;
use Livewire\Attributes\Layout;
use Livewire\Attributes\Title;
use Livewire\Attributes\Url;
use Livewire\Component;
use Livewire\WithPagination;

#[Layout('layouts.app')]
#[Title('مدیریت کاربران')]
class Users extends Component
{
    use WithPagination;

    public string $newName = '';

    public string $newPhone = '';

    public string $newPassword = '';

    public string $newRole = 'user';

    /** @var array<int, string> */
    public array $issuePasswords = [];

    /** @var array<int, string> */
    public array $editName = [];

    /** @var array<int, string> */
    public array $editPhone = [];

    /** @var array<int, string> */
    public array $editPassword = [];

    /** @var array<int, string> */
    public array $editRoles = [];

    /** @var array<int, bool> */
    public array $editing = [];

    /** Whether the "create user" form is expanded (behind the + icon). */
    public bool $showAddUser = false;

    /** Whether the user search box is expanded (behind the 🔍 icon). */
    public bool $showSearch = false;

    /** @var array<int, bool> Which password-request issue forms are open. */
    public array $issueOpen = [];

    #[Url]
    public string $search = '';

    public ?string $status = null;

    /**
     * Toggle the "create user" form behind the + icon.
     */
    public function toggleAddUser(): void
    {
        $this->showAddUser = ! $this->showAddUser;
    }

    /**
     * Toggle the user search box behind the 🔍 icon.
     */
    public function toggleSearch(): void
    {
        $this->showSearch = ! $this->showSearch;
    }

    /**
     * Searching the user list restarts from the first page.
     */
    public function updatedSearch(): void
    {
        $this->resetPage();
    }

    /**
     * Toggle the issue-password form of one recovery request.
     */
    public function toggleIssue(int $id): void
    {
        $this->issueOpen[$id] = ! ($this->issueOpen[$id] ?? false);
    }

    /**
     * Approve a pending registration (its verification code was received).
     *
     * Approving an invited account rewards the inviter with 2 commission-free
     * transactions for that one joined person. A further 3 commission-free
     * transactions are granted to the inviter when the invited customer makes
     * their own first transaction (see OrderForm::save).
     */
    public function approve(User $user): void
    {
        abort_unless($user->status === 'pending', 422);

        $attributes = [
            'status' => 'approved',
            'verification_code' => null,
        ];

        if ($user->referrer_id) {
            $referrer = User::where('id', $user->referrer_id)->first();

            if ($referrer) {
                $referrer->update([
                    'free_transactions' => (int) $referrer->free_transactions + 2,
                ]);
            }
        }

        $user->update($attributes);

        $this->status = "حساب «{$user->name}» تأیید شد.";
    }

    /**
     * Reject (delete) a pending registration.
     */
    public function reject(User $user): void
    {
        abort_unless($user->status === 'pending' || $user->status === 'rejected', 422);

        $user->delete();

        $this->status = 'درخواست ثبت‌نام حذف شد.';
    }

    /**
     * Toggle a user between approved and blocked.
     */
    public function toggle(User $user): void
    {
        abort_if($user->id === Auth::id(), 422);

        $user->update([
            'status' => $user->status === 'approved' ? 'blocked' : 'approved',
        ]);

        unset($this->editing[$user->id]);
        $this->status = "وضعیت «{$user->name}» به‌روزرسانی شد.";
    }

    /**
     * Open the inline editor for one user, pre-filling the current values.
     */
    public function edit(User $user): void
    {
        $this->editing[$user->id] = true;
        $this->editName[$user->id] = $user->name;
        $this->editPhone[$user->id] = $user->phone;
        $this->editRoles[$user->id] = $user->role;
        $this->editPassword[$user->id] = '';
    }

    /**
     * Close the inline editor for one user without saving.
     */
    public function cancelEdit(User $user): void
    {
        unset($this->editing[$user->id]);
    }

    /**
     * Save the edited name / phone / role / password for one user.
     */
    public function update(User $user): void
    {
        $this->validate([
            "editName.{$user->id}" => ['required', 'string', 'max:100'],
            "editPhone.{$user->id}" => ['required', 'string', 'max:20', Rule::unique('users', 'phone')->ignore($user->id)],
            "editRoles.{$user->id}" => ['required', Rule::in(['user', 'admin'])],
            "editPassword.{$user->id}" => ['nullable', 'string', 'min:6'],
        ], [
            "editName.{$user->id}.required" => 'نام را وارد کنید.',
            "editPhone.{$user->id}.required" => 'شماره موبایل را وارد کنید.',
            "editPhone.{$user->id}.unique" => 'این شماره موبایل قبلاً ثبت شده است.',
            "editPassword.{$user->id}.min" => 'رمز عبور باید حداقل ۶ کاراکتر باشد.',
        ]);

        $attributes = [
            'name' => $this->editName[$user->id] ?? $user->name,
            'phone' => $this->editPhone[$user->id] ?? $user->phone,
            'role' => $this->editRoles[$user->id] ?? $user->role,
        ];

        $password = trim($this->editPassword[$user->id] ?? '');

        if ($password !== '') {
            $attributes['password'] = $password; // hashed by the cast
        }

        $user->update($attributes);

        unset($this->editing[$user->id]);
        $this->status = "اطلاعات «{$user->name}» به‌روزرسانی شد.";
    }

    /**
     * Manually create a user account.
     */
    public function store(): void
    {
        $this->validate([
            'newName' => ['required', 'string', 'max:100'],
            'newPhone' => ['required', 'string', 'max:20', Rule::unique('users', 'phone')],
            'newPassword' => ['required', 'string', 'min:6'],
            'newRole' => ['required', Rule::in(['user', 'admin'])],
        ], [
            'newName.required' => 'نام را وارد کنید.',
            'newPhone.required' => 'شماره موبایل را وارد کنید.',
            'newPhone.unique' => 'این شماره موبایل قبلاً ثبت شده است.',
            'newPassword.required' => 'رمز عبور را وارد کنید.',
            'newPassword.min' => 'رمز عبور باید حداقل ۶ کاراکتر باشد.',
        ]);

        User::create([
            'name' => $this->newName,
            'phone' => $this->newPhone,
            'password' => $this->newPassword, // hashed by the model cast
            'role' => $this->newRole,
            'status' => 'pre_verified',
            'referral_code' => User::generateReferralCode(),
        ]);

        $this->reset(['newName', 'newPhone', 'newPassword']);
        $this->newRole = 'user';
        $this->status = 'کاربر جدید ایجاد شد.';
    }

    /**
     * Issue a new password for a user on behalf of a recovery request.
     */
    public function issuePassword(PasswordRequest $passwordRequest): void
    {
        $password = $this->issuePasswords[$passwordRequest->id] ?? '';

        $this->validate([
            "issuePasswords.{$passwordRequest->id}" => ['required', 'string', 'min:6'],
        ], [
            "issuePasswords.{$passwordRequest->id}.required" => 'رمز جدید را وارد کنید.',
            "issuePasswords.{$passwordRequest->id}.min" => 'رمز جدید باید حداقل ۶ کاراکتر باشد.',
        ]);

        $user = $passwordRequest->user;

        if (! $user) {
            $user = User::where('phone', $passwordRequest->phone)->first();
        }

        abort_unless($user, 422, 'برای این شماره حساب کاربری وجود ندارد.');

        $user->update(['password' => $password]); // hashed by the cast
        $passwordRequest->update([
            'status' => 'approved',
            'issued_password' => $password,
        ]);

        unset($this->issuePasswords[$passwordRequest->id]);

        $this->status = "رمز جدید برای «{$user->name}» صادر شد.";
    }

    /**
     * Delete a password request once the new password reached the customer.
     */
    public function destroyRequest(PasswordRequest $passwordRequest): void
    {
        $passwordRequest->delete();

        $this->status = 'درخواست بازیابی رمز حذف شد.';
    }

    public function render()
    {
        $query = User::with('referrer')->withCount('invoices');

        if ($this->search !== '') {
            $term = '%'.trim($this->search).'%';
            $query->where(fn ($query) => $query
                ->where('name', 'like', $term)
                ->orWhere('phone', 'like', $term));
        }

        return view('livewire.admin.users', [
            // Customer number (id) order, so new customers appear last.
            'users' => $query->orderBy('id')->paginate(10),
            'pending' => User::where('status', 'pending')->orderBy('id')->get(),
            'passwordRequests' => PasswordRequest::with('user')->orderByDesc('id')->get(),
        ]);
    }

    public function paginationView()
    {
        return 'pagination.simple';
    }
}
