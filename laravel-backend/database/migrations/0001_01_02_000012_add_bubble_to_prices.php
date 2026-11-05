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
        Schema::table('prices', function (Blueprint $table) {
            // The "حباب" premium from moj3.ir, shown next to a bubble icon
            // on the price lists (red/green number).
            $table->decimal('bubble', 8, 2)->nullable()->after('change');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('prices', function (Blueprint $table) {
            $table->dropColumn('bubble');
        });
    }
};
