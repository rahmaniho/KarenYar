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
        Schema::create('invoices', function (Blueprint $table) {
            $table->id();
            $table->string('invoice_no')->unique();
            $table->foreignId('user_id')->index();
            $table->string('product');
            $table->string('kind'); // buy | sell
            $table->decimal('quantity', 14, 4)->default(0);
            $table->decimal('unit_price', 16, 0)->default(0);
            $table->decimal('labor_percent', 6, 2)->default(0);
            $table->decimal('profit_percent', 6, 2)->default(0);
            $table->decimal('vat_percent', 6, 2)->default(0);
            $table->decimal('commission_percent', 6, 2)->default(0);
            $table->decimal('total', 18, 0)->default(0);
            $table->text('description')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('invoices');
    }
};
