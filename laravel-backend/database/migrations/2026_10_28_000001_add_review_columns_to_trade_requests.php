<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * Every buy/sell request already stores the admin's answer in `status`
     * and `note`; these two columns add who decided and when, so the
     * history can show the full trail.
     */
    public function up(): void
    {
        Schema::table('trade_requests', function (Blueprint $table) {
            // Plain column (no foreign key) so the migration also runs on
            // SQLite, where constraints cannot be added to existing tables.
            $table->foreignId('reviewed_by')->nullable();
            $table->timestamp('reviewed_at')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('trade_requests', function (Blueprint $table) {
            $table->dropColumn(['reviewed_by', 'reviewed_at']);
        });
    }
};
