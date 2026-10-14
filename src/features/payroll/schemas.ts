import { z } from 'zod';

export const employeeSchema = z.object({
  name: z.string().trim().min(2, 'نام کارمند حداقل ۲ نویسه باشد.'),
  nationalId: z
    .string()
    .trim()
    .regex(/^$|^\d{10}$/, 'کد ملی باید ۱۰ رقم باشد.')
    .optional()
    .or(z.literal('')),
  position: z.string().trim().max(60).optional().or(z.literal('')),
  /** حقوق پایه به واحد نمایشی — هنگام ذخیره به تومان تبدیل می‌شود */
  baseSalary: z
    .number({ invalid_type_error: 'حقوق پایه را وارد کنید.' })
    .positive('حقوق پایه باید بیشتر از صفر باشد.'),
  children: z.number().int('تعداد فرزند صحیح نیست.').min(0).max(15, 'تعداد فرزند نامعتبر است.'),
  married: z.boolean(),
  seniorityYears: z.number().min(0, 'سابقه نامعتبر است.').max(60, 'سابقه نامعتبر است.'),
  startDate: z.string().optional().or(z.literal('')),
});
export type EmployeeFormValues = z.infer<typeof employeeSchema>;

export const taxBracketSchema = z.object({
  upTo: z.number().positive('سقف پله باید بیشتر از صفر باشد.').nullable(),
  ratePercent: z.number().min(0, 'نرخ نامعتبر است.').max(100, 'نرخ حداکثر ۱۰۰٪ است.'),
});

export const payrollRatesSchema = z.object({
  minDailyWage: z.number().positive('حداقل مزد روزانه را وارد کنید.'),
  housingAllowance: z.number().min(0),
  groceryAllowance: z.number().min(0),
  childAllowancePerChild: z.number().min(0),
  marriageAllowance: z.number().min(0),
  seniorityDailyBase: z.number().min(0),
  insuranceRatePercent: z.number().min(0).max(100),
  overtimeFactor: z.number().positive(),
  nightShiftRatePercent: z.number().min(0).max(200),
  taxBrackets: z.array(taxBracketSchema).min(1, 'حداقل یک پله‌ی مالیاتی لازم است.'),
});
