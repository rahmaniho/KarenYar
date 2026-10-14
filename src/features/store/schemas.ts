import { z } from 'zod';

/** اسکیماهای فروشگاهی — مبلغ‌ها به واحد نمایشی‌اند و هنگام ذخیره به تومان تبدیل می‌شوند. */

export const productSchema = z.object({
  name: z.string().trim().min(2, 'نام کالا حداقل ۲ نویسه باشد.'),
  barcode: z.string().trim().max(64).optional().or(z.literal('')),
  category: z.string().trim().min(1, 'دسته‌بندی را وارد کنید.'),
  buyPrice: z
    .number({ invalid_type_error: 'قیمت خرید را وارد کنید.' })
    .min(0, 'قیمت خرید نامعتبر است.'),
  buyTaxPercent: z.number().min(0, 'درصد نامعتبر است.').max(100, 'درصد حداکثر ۱۰۰ است.'),
  shippingPerUnit: z.number().min(0, 'حمل نامعتبر است.'),
  overheadPerUnit: z.number().min(0, 'سربار نامعتبر است.'),
  sellPrice: z
    .number({ invalid_type_error: 'قیمت فروش را وارد کنید.' })
    .positive('قیمت فروش باید بیشتر از صفر باشد.'),
  stock: z
    .number({ invalid_type_error: 'موجودی را وارد کنید.' })
    .int('موجودی عدد صحیح باشد.')
    .min(0, 'موجودی منفی نمی‌شود.'),
  unit: z.string().trim().min(1, 'واحد کالا را انتخاب کنید.'),
  minStock: z.number().int().min(0, 'حد هشدار نامعتبر است.'),
});
export type ProductFormValues = z.infer<typeof productSchema>;

export const customerSchema = z.object({
  name: z.string().trim().min(2, 'نام مشتری حداقل ۲ نویسه باشد.'),
  phone: z
    .string()
    .trim()
    .regex(/^$|^[\d\s\-+()]+$/, 'شماره تماس معتبر نیست.')
    .optional()
    .or(z.literal('')),
  address: z.string().trim().max(200).optional().or(z.literal('')),
  notes: z.string().trim().max(300).optional().or(z.literal('')),
});
export type CustomerFormValues = z.infer<typeof customerSchema>;
