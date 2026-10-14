import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';

export function NotFoundPage() {
  return (
    <EmptyState
      icon={Compass}
      title="این صفحه پیدا نشد"
      description="آدرسی که وارد کرده‌اید وجود ندارد یا جابه‌جا شده است."
      action={
        <Button asChild>
          <Link to="/">بازگشت به داشبورد</Link>
        </Button>
      }
    />
  );
}
