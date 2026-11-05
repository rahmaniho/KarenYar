<div>
    @if ($status)
        <div class="toast toast-success" role="status">{{ $status }}</div>
    @endif

    @if ($pending->isNotEmpty())
        <section class="card card-warn">
            <div class="card-head"><h2>در انتظار تأیید ({{ $pending->count() }})</h2></div>
            <p class="muted">کاربران زیر ثبت‌نام کرده و کد تأیید را پیامک کرده‌اند؛ پس از تطبیق کد، حساب را تأیید کنید.</p>

            <div class="pending-list">
                @foreach ($pending as $user)
                    <div class="pending-row">
                        <div class="pending-info">
                            <div class="pending-name">{{ $user->name }}</div>
                            <div class="pending-phone" dir="ltr">{{ $user->phone }}</div>
                            <div class="pending-code">کد تأیید: <strong dir="ltr">{{ $user->verification_code }}</strong></div>
                        </div>
                        <div class="pending-actions">
                            <button class="btn btn-gold btn-sm" type="button" wire:click="approve({{ $user->id }})">تأیید</button>
                            <button class="btn btn-danger btn-sm" type="button" wire:click="reject({{ $user->id }})" wire:confirm="این درخواست حذف شود؟">رد</button>
                        </div>
                    </div>
                @endforeach
            </div>
        </section>
    @endif

    <section class="card">
        <div class="card-head">
            <h2>ایجاد کاربر جدید</h2>
            <button class="icon-toggle {{ $showAddUser ? 'active' : '' }}" type="button" wire:click="toggleAddUser" aria-label="ایجاد کاربر جدید">+</button>
        </div>
        @if ($showAddUser)
            <form wire:submit="store" class="form form-grid">
                <div class="field">
                    <label for="newName">نام</label>
                    <input id="newName" type="text" wire:model="newName" required>
                    @error('newName') <span class="field-err">{{ $message }}</span> @enderror
                </div>
                <div class="field">
                    <label for="newPhone">شماره موبایل</label>
                    <input id="newPhone" type="tel" wire:model="newPhone" dir="ltr" required>
                    @error('newPhone') <span class="field-err">{{ $message }}</span> @enderror
                </div>
                <div class="field">
                    <label for="newPassword">رمز عبور</label>
                    <input id="newPassword" type="text" wire:model="newPassword" dir="ltr" minlength="6" required>
                    @error('newPassword') <span class="field-err">{{ $message }}</span> @enderror
                </div>
                <div class="field">
                    <label for="newRole">نقش</label>
                    <select id="newRole" wire:model="newRole">
                        <option value="user">کاربر عادی</option>
                        <option value="admin">مدیر</option>
                    </select>
                </div>
                <div class="filters-actions">
                    <button class="btn btn-gold btn-sm" type="submit">ایجاد کاربر</button>
                </div>
            </form>
        @endif
    </section>

    @if ($passwordRequests->isNotEmpty())
        <section class="card">
            <div class="card-head"><h2>درخواست‌های بازیابی رمز</h2></div>

            <div class="pending-list">
                @foreach ($passwordRequests as $request)
                    <div class="pending-row pending-row-stack">
                        <div class="pending-info">
                            <div class="pending-phone" dir="ltr">{{ $request->phone }}</div>
                            <div class="muted">{{ $request->status === 'approved' ? 'انجام‌شده' : ($request->status === 'rejected' ? 'ردشده' : 'جدید') }}
                                — {{ \App\Support\Jalali::format($request->created_at) }}</div>
                        </div>

                        @if ($request->status === 'pending')
                            @if ($issueOpen[$request->id] ?? false)
                                <form wire:submit="issuePassword({{ $request->id }})" class="issue-form">
                                    <div class="field">
                                        <label>رمز جدید برای این شماره</label>
                                        <input type="text" wire:model="issuePasswords.{{ $request->id }}" dir="ltr" minlength="6" required placeholder="رمز جدید را وارد کنید">
                                        @error("issuePasswords.{$request->id}") <span class="field-err">{{ $message }}</span> @enderror
                                    </div>
                                    <button class="btn btn-gold btn-sm" type="submit">صدور رمز</button>
                                </form>
                            @else
                                <button class="btn btn-outline btn-sm" type="button" wire:click="toggleIssue({{ $request->id }})">🔑 صدور رمز</button>
                            @endif
                        @elseif ($request->status === 'approved' && $request->issued_password)
                            <div class="filters-actions">
                                <a class="btn btn-gold btn-sm" dir="ltr"
                                   href="sms:{{ $request->phone }}?body={{ $request->issued_password }}">
                                    ارسال رمز جدید ({{ $request->phone }})
                                </a>
                                <button class="btn btn-danger btn-sm" type="button"
                                        wire:click="destroyRequest({{ $request->id }})"
                                        wire:confirm="این درخواست حذف شود؟">حذف درخواست</button>
                            </div>
                        @endif
                    </div>
                @endforeach
            </div>
            <div class="card-foot muted">بعد از صدور رمز، با دکمه «ارسال رمز جدید» آن را پیامک کنید؛ سپس «حذف درخواست» را بزنید تا صفحه خالی شود.</div>
        </section>
    @endif

    <section class="card">
        <div class="card-head">
            <h2>همه کاربران ({{ $users->total() }})</h2>
            <button class="icon-toggle {{ $search !== '' ? 'active' : '' }}" type="button" wire:click="toggleSearch" aria-label="جستجوی کاربر">🔍</button>
        </div>

        @if ($showSearch)
            <div class="field">
                <label for="user-search">جستجوی کاربر</label>
                <input id="user-search" class="user-search" type="search" wire:model.live.debounce.300ms="search" dir="auto"
                       placeholder="جستجو با نام یا شماره موبایل…">
            </div>
        @endif

        @if ($users->isEmpty())
            <div class="empty"><p>کاربری با این مشخصات یافت نشد.</p></div>
        @else
            <div class="table-wrap">
                <table class="table">
                    <thead>
                        <tr>
                            <th>شماره مشتری</th>
                            <th>نام</th>
                            <th>شماره</th>
                            <th>معرف</th>
                            <th>نقش</th>
                            <th>وضعیت</th>
                            <th>فاکتورها</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        @foreach ($users as $user)
                            <tr class="{{ ($editing[$user->id] ?? false) ? 'row-editing' : '' }}">
                                <td dir="ltr">{{ $user->id }}</td>
                                <td>{{ $user->name }}</td>
                                <td dir="ltr">{{ $user->phone }}</td>
                                <td>{{ $user->referrer?->name ?? '—' }}</td>
                                <td>{{ $user->role === 'admin' ? 'مدیر' : 'کاربر' }}</td>
                                <td>
                                    @if ($user->status === 'approved')
                                        <span class="badge badge-buy">فعال</span>
                                    @else
                                        <span class="badge badge-sell">{{ $user->status === 'blocked' ? 'مسدود' : 'در انتظار' }}</span>
                                    @endif
                                </td>
                                <td>{{ \App\Support\Format::num($user->invoices_count) }}</td>
                                <td>
                                    <a class="btn btn-ghost btn-sm" href="{{ route('admin.orders', ['userId' => $user->id]) }}" wire:navigate>فاکتورها</a>

                                    @if ($user->status !== 'pending' && $user->id !== auth()->id())
                                        <button class="btn btn-outline btn-sm" type="button" wire:click="edit({{ $user->id }})">ویرایش</button>
                                        <button class="btn btn-ghost btn-sm" type="button"
                                                wire:click="toggle({{ $user->id }})"
                                                wire:confirm="{{ $user->status === 'approved' ? 'این کاربر مسدود شود؟' : 'این کاربر فعال شود؟' }}">
                                            {{ $user->status === 'approved' ? 'مسدود' : 'فعال‌سازی' }}
                                        </button>
                                    @endif
                                </td>
                            </tr>

                            @if ($editing[$user->id] ?? false)
                                <tr class="edit-reset-row"><td colspan="8"></td></tr>
                            @endif
                        @endforeach
                    </tbody>
                </table>
            </div>

            @if ($users->hasPages())
                <div class="pager">{!! $users->links() !!}</div>
            @endif

            @if (count($editing) > 0)
                @foreach ($users as $user)
                    @if (! ($editing[$user->id] ?? false))
                        @continue
                    @endif
                    <div class="edit-user-form">
                        <div class="card-head-sub"><h3>ویرایش کاربر: {{ $user->name }}</h3></div>
                        <form wire:submit="update({{ $user->id }})" class="form">
                            <div class="form-grid">
                                <div class="field">
                                    <label for="editName_{{ $user->id }}">نام</label>
                                    <input id="editName_{{ $user->id }}" type="text" wire:model="editName.{{ $user->id }}" required>
                                    @error("editName.{$user->id}") <span class="field-err">{{ $message }}</span> @enderror
                                </div>
                                <div class="field">
                                    <label for="editPhone_{{ $user->id }}">شماره موبایل</label>
                                    <input id="editPhone_{{ $user->id }}" type="tel" wire:model="editPhone.{{ $user->id }}" dir="ltr" required>
                                    @error("editPhone.{$user->id}") <span class="field-err">{{ $message }}</span> @enderror
                                </div>
                                <div class="field">
                                    <label for="editRole_{{ $user->id }}">نقش</label>
                                    <select id="editRole_{{ $user->id }}" wire:model="editRoles.{{ $user->id }}">
                                        <option value="user">کاربر عادی</option>
                                        <option value="admin">مدیر</option>
                                    </select>
                                </div>
                                <div class="field">
                                    <label for="editPassword_{{ $user->id }}">رمز عبور جدید (اختیاری)</label>
                                    <input id="editPassword_{{ $user->id }}" type="text" wire:model="editPassword.{{ $user->id }}" dir="ltr" minlength="6" placeholder="برای تغییر نذارید">
                                </div>
                            </div>
                            <div class="filters-actions">
                                <button class="btn btn-gold btn-sm" type="submit">ذخیره تغییرات</button>
                                <button class="btn btn-ghost btn-sm" type="button" wire:click="cancelEdit({{ $user->id }})">انصراف</button>
                            </div>
                        </form>
                    </div>
                @endforeach
            @endif
        @endif
    </section>
</div>