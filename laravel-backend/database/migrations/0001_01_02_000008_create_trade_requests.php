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
        Schema::create('trade_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->index();
            $table->string('kind'); // buy | sell
            $table->string('product')->default('gold18');
            $table->decimal('weight', 14, 4)->nullable();
            $table->decimal('amount', 16, 0)->nullable();
            $table->decimal('min_price', 16, 0)->nullable();
            $table->decimal('max_price', 16, 0)->nullable();
            $table->string('status')->default('pending'); // pending | approved | rejected
            $table->text('note')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('trade_requests');
    }
};
