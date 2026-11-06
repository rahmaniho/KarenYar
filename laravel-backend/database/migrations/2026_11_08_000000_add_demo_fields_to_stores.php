<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * فیلدهای «دموی امن»:
     * - is_demo: فروشگاه آزمایشیِ ساخته‌شده از صفحهٔ ورود است (از آمار واقعی جدا می‌شود).
     * - demo_expires_at: پایان عمر دمو؛ پس از آن ورود بسته و داده به‌صورت خودکار پاک می‌شود.
     */
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            if (! Schema::hasColumn('stores', 'is_demo')) {
                $table->boolean('is_demo')->default(false)->index();
            }

            if (! Schema::hasColumn('stores', 'demo_expires_at')) {
                $table->dateTime('demo_expires_at')->nullable()->index();
            }
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table) {
            if (Schema::hasColumn('stores', 'demo_expires_at')) {
                $table->dropColumn('demo_expires_at');
            }

            if (Schema::hasColumn('stores', 'is_demo')) {
                $table->dropColumn('is_demo');
            }
        });
    }
};
