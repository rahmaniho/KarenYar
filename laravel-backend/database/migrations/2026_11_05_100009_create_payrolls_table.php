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
        Schema::create('payrolls', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();

            $table->foreignId('employee_id')
                ->constrained('employees')
                ->cascadeOnDelete();

            // کلید ماه شمسی مثل 1404-07
            $table->string('month', 7)->index();

            // ورودی و نتیجه‌ی محاسبه، مطابق PayrollInput / PayrollResult در فرانت‌اند.
            $table->json('input');
            $table->json('result');

            $table->decimal('net_pay', 18, 2)->default(0);
            $table->timestamps();

            $table->index(['employee_id', 'month']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('payrolls');
    }
};
