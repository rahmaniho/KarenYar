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
        Schema::create('transactions', function (Blueprint $table) {
            $table->id();
            $table->dateTime('date')->index();

            $table->string('type', 20)->index(); // income | expense
            $table->string('category')->index();
            $table->decimal('amount', 18, 2)->default(0);
            $table->text('description')->nullable();

            // فروش خودکار فقط از طریق فاکتور قابل اصلاح است.
            $table->string('source', 20)->default('manual')->index();

            $table->foreignId('invoice_id')
                ->nullable()
                ->constrained('invoices')
                ->nullOnDelete();

            $table->timestamps();

            // هر فروش فقط یک تراکنش خودکار داشته باشد.
            $table->unique(['source', 'invoice_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('transactions');
    }
};
