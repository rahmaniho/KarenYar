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
        Schema::create('employees', function (Blueprint $table) {
            $table->id();
            $table->string('name')->index();
            $table->string('national_id', 20)->nullable();
            $table->string('position')->nullable();

            $table->decimal('base_salary', 18, 2)->default(0);
            $table->unsignedTinyInteger('children')->default(0);
            $table->boolean('married')->default(false);
            $table->decimal('seniority_years', 8, 2)->default(0);
            $table->date('start_date')->nullable();

            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('employees');
    }
};
