import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  message: string;
}

/** مرز خطای سراسری با پیام فارسی — از کرش کامل اپ جلوگیری می‌کند. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // در نسخه‌ی فروش می‌توان این را به سرویس مانیتورینگ (بدون داده‌ی کاربر) فرستاد.
    console.error('خطای غیرمنتظره:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-4" dir="rtl">
        <div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-card">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <h1 className="text-lg font-extrabold">مشکلی پیش آمد!</h1>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            متأسفیم؛ خطای غیرمنتظره‌ای رخ داد. نگران نباشید، داده‌های شما روی همین دستگاه ذخیره شده
            و از بین نرفته است. لطفاً برنامه را دوباره بارگذاری کنید.
          </p>
          {this.state.message && (
            <p
              className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground"
              dir="ltr"
            >
              {this.state.message}
            </p>
          )}
          <Button className="mt-5" onClick={() => window.location.reload()}>
            <RotateCcw className="h-4 w-4" />
            بارگذاری دوباره
          </Button>
        </div>
      </div>
    );
  }
}
