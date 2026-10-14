import { z } from 'zod';

/** اسکیماهای اعتبارسنجی فرم‌های حساب‌یار شخصی — پیام‌ها همه فارسی‌اند. */

export const transactionSchema = z.object({
  type: z.enum(['income', 'expense']),
  category: z.string().trim().min(1, 'دسته‌بندی را انتخاب یا وارد کنید.'),
  /** مبلغ به واحد نمایشی فعلی (تومان/ریال) — هنگام ذخیره به تومان داخلی تبدیل می‌شود */
  amount: z
    .number({ invalid_type_error: 'مبلغ را وارد کنید.' })
    .positive('مبلغ باید بیشتر از صفر باشد.'),
  date: z.string().min(1, 'تاریخ را وارد کنید.'),
  description: z
    .string()
    .trim()
    .max(200, 'توضیحات حداکثر ۲۰۰ نویسه است.')
    .optional()
    .or(z.literal('')),
});
export type TransactionFormValues = z.infer<typeof transactionSchema>;

export const budgetSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'ماه را از فهرست انتخاب کنید.'),
  category: z.string().trim().min(1, 'دسته‌بندی را انتخاب کنید.'),
  limit: z
    .number({ invalid_type_error: 'سقف بودجه را وارد کنید.' })
    .positive('سقف بودجه باید بیشتر از صفر باشد.'),
});
export type BudgetFormValues = z.infer<typeof budgetSchema>;

export const debtSchema = z
  .object({
    title: z.string().trim().min(2, 'عنوان بدهی حداقل ۲ نویسه باشد.'),
    kind: z.enum(['debt', 'installment']),
    amount: z
      .number({ invalid_type_error: 'مبلغ کل را وارد کنید.' })
      .positive('مبلغ باید بیشتر از صفر باشد.'),
    dueDate: z.string().min(1, 'تاریخ سررسید را وارد کنید.'),
    installmentsCount: z.number().int().positive('تعداد اقساط معتبر نیست.').optional(),
    installmentAmount: z.number().positive('مبلغ قسط معتبر نیست.').optional(),
    description: z.string().trim().max(200).optional().or(z.literal('')),
  })
  .refine((v) => v.kind !== 'installment' || (!!v.installmentsCount && !!v.installmentAmount), {
    message: 'تعداد و مبلغ اقساط را کامل وارد کنید.',
    path: ['installmentsCount'],
  });
export type DebtFormValues = z.infer<typeof debtSchema>;
