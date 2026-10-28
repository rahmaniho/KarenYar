import { expect, test } from '@playwright/test';

test.describe('حساب‌یار کارن سافت — سناریوهای اصلی', () => {
  test('داشبورد فارسی و راست‌چین بارگذاری می‌شود', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fa');
    await expect(page.getByRole('heading', { name: /داشبورد/ })).toBeVisible();
    await expect(
      page.getByRole('main').getByRole('link', { name: 'ماشین‌حساب', exact: true }),
    ).toBeVisible();
  });

  test('ماشین‌حساب: ۲+۳×۴ برابر ۱۴ می‌شود', async ({ page }) => {
    await page.goto('/calculator');
    await expect(page.getByRole('heading', { name: 'ماشین‌حساب حرفه‌ای' })).toBeVisible();
    await page.keyboard.type('2+3*4');
    await page.keyboard.press('Enter');
    await expect(page.getByText('۱۴', { exact: true }).first()).toBeVisible();
  });

  test('ثبت تراکنش شخصی از فرم انجام می‌شود', async ({ page }) => {
    await page.goto('/personal/transactions');
    await page
      .getByRole('button', { name: /تراکنش جدید|ثبت اولین تراکنش/ })
      .first()
      .click();
    await page.getByLabel(/دسته‌بندی/).fill('حقوق و دستمزد');
    await page.getByLabel(/مبلغ/).fill('5000000');
    await page.getByRole('button', { name: /ثبت تراکنش/ }).click();
    await expect(page.getByText('۵٬۰۰۰٬۰۰۰').first()).toBeVisible();
  });

  test('صفحه‌ی تنظیمات بخش فعال‌سازی لایسنس را دارد', async ({ page }) => {
    await page.goto('/settings#license');
    await expect(page.getByText('لایسنس و فعال‌سازی')).toBeVisible();
    await expect(page.getByLabel('کلید لایسنس')).toBeVisible();
  });
});
