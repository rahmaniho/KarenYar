import { CalendarRange, Coins, Landmark, Percent, Ruler, Sigma } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScientificCalculator } from './ScientificCalculator';
import { PercentTools } from './PercentTools';
import { LoanTools } from './LoanTools';
import { UnitConverter } from './UnitConverter';
import { CurrencyConverter } from './CurrencyConverter';
import { DateDiffTool } from './DateDiffTool';

/** صفحه‌ی محاسبات حرفه‌ای — همه‌ی ابزارها کاملاً آفلاین کار می‌کنند. */
export function CalculatorPage() {
  return (
    <div>
      <PageHeader
        title="ماشین‌حساب حرفه‌ای"
        subtitle="ماشین‌حساب علمی، درصد، وام و سود، تبدیل واحد و ارز و تاریخ‌شمار شمسی"
      />
      <Tabs defaultValue="calculator" dir="rtl">
        <TabsList aria-label="ابزارهای محاسباتی">
          <TabsTrigger value="calculator">
            <Sigma aria-hidden /> ماشین‌حساب
          </TabsTrigger>
          <TabsTrigger value="percent">
            <Percent aria-hidden /> درصد و تخفیف
          </TabsTrigger>
          <TabsTrigger value="loan">
            <Landmark aria-hidden /> وام و سود
          </TabsTrigger>
          <TabsTrigger value="unit">
            <Ruler aria-hidden /> تبدیل واحد
          </TabsTrigger>
          <TabsTrigger value="currency">
            <Coins aria-hidden /> تبدیل ارز
          </TabsTrigger>
          <TabsTrigger value="date">
            <CalendarRange aria-hidden /> تاریخ‌شمار
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calculator">
          <ScientificCalculator />
        </TabsContent>
        <TabsContent value="percent">
          <PercentTools />
        </TabsContent>
        <TabsContent value="loan">
          <LoanTools />
        </TabsContent>
        <TabsContent value="unit">
          <UnitConverter />
        </TabsContent>
        <TabsContent value="currency">
          <CurrencyConverter />
        </TabsContent>
        <TabsContent value="date">
          <DateDiffTool />
        </TabsContent>
      </Tabs>
    </div>
  );
}
