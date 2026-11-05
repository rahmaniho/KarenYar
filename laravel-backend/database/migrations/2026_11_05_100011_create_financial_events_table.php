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

            $table->foreignId('invoice_id')
                ->nullable()
                ->constrained('invoices')
                ->nullOnDelete();

            $table->foreignId('customer_id')
                ->nullable()
                ->constrained('customers')
                ->nullOnDelete();

            $table->string('payment_key')->nullable();
            $table->foreignId('payment_id')
                ->nullable()
                ->constrained('customer_payments')
                ->nullOnDelete();

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
