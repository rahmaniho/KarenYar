<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('financial_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();

            // ارجاع به فاکتور/پرداخت به‌صورت نرم نگه داشته می‌شود؛ این جدول رویدادنگار
            // است و رویداد «حذف پیش‌نویس» به سندی اشاره می‌کند که دیگر وجود ندارد.
            $table->unsignedBigInteger('invoice_id')->nullable()->index();

            $table->foreignId('customer_id')
                ->nullable()
                ->constrained('customers')
                ->nullOnDelete();

            $table->string('payment_key')->nullable();
            $table->unsignedBigInteger('payment_id')->nullable()->index();

            // draft_saved | issued | voided | payment_recorded | refund_recorded
            // payment_reversed | draft_discarded | customer_payment_received
            $table->string('action', 40)->index();

            $table->decimal('amount', 18, 2)->nullable();
            $table->text('reason')->nullable();
            $table->timestamps();

            $table->index(['invoice_id', 'payment_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('financial_events');
    }
};
