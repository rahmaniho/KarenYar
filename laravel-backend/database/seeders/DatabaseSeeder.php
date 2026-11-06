<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     *
     * حساب مدیر کل به‌صورت پیش‌فرض ساخته می‌شود تا از پنل مدیریت بتوان
     * فروشگاه‌ها و لایسنس‌ها را تعریف کرد. داده‌ی فروشگاه‌ها هنگام کار با
     * برنامه از مرورگر به دیتابیس منتقل و ذخیره می‌شود.
     */
    public function run(): void
    {
        User::updateOrCreate(
            ['email' => 'manager@hesabyar.local'],
            [
                'name' => 'مدیر کل',
                'role' => User::ROLE_MANAGER,
                'store_id' => null,
                'is_active' => true,
                'password' => Hash::make('manager1234'),
            ],
        );
    }
}
