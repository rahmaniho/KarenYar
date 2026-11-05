<div>
    <section class="card">
        <div class="card-head">
            <h2>{{ $news ? 'ویرایش خبر' : 'خبر جدید' }}</h2>
            <a class="btn btn-ghost btn-sm" href="{{ route('admin.news') }}" wire:navigate>بازگشت</a>
        </div>

        <form wire:submit="save" class="form">
            <div class="field">
                <label for="title">عنوان</label>
                <input id="title" type="text" wire:model="title" required>
                @error('title') <span class="field-err">{{ $message }}</span> @enderror
            </div>

            <div class="field">
                <label for="body">متن خبر</label>
                <textarea id="body" rows="8" wire:model="body" required></textarea>
                @error('body') <span class="field-err">{{ $message }}</span> @enderror
            </div>

            <button class="btn btn-gold btn-block" type="submit" wire:loading.attr="disabled">{{ $news ? 'ذخیره تغییرات' : 'انتشار خبر' }}</button>
        </form>
    </section>
</div>