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
        // تاریخچه‌ی ماشین‌حساب که در localStorage با کلید hesabyar-calc-history
        // به‌صورت [{ expr, result }, ...] ذخیره می‌شود.
        Schema::create('calculator_history', function (Blueprint $table) {
            $table->id();
            $table->text('expression');
            $table->string('result');
            $table->timestamps();

            $table->index('created_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('calculator_history');
    }
};
