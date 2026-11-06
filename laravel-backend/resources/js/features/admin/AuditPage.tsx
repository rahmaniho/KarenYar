import { useMemo, useState } from 'react';
import { History, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toFaDigits } from '@/core/currency/currency';
import { formatJalaliLongISO } from '@/core/jalali/jalali';
import { adminApi } from './admin-api';
import {
  EmptyState,
  LoadingRows,
  Pagination,
  Panel,
  Pill,
  RefreshButton,
} from './admin-ui';
import { useAsync } from './admin-lib';
import { AUDIT_ACTION_LABELS, AUDIT_ACTION_TONES } from './admin-types';

export function AuditPage() {
  const [action, setAction] = useState('');
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<number | null>(null);

  const list = useAsync(
    () => adminApi.audit({ action: action || undefined, q: query || undefined, page, limit: 25 }),
    [action, query, page],
  );
  const actions = useAsync(() => adminApi.auditActions(), []);

  const options = useMemo(() => actions.data?.actions ?? [], [actions.data]);

  return (
    <Panel
      title="دفتر رویدادها"
      subtitle="چه کسی، کِی، در کدام فروشگاه چه کاری کرد"
      icon={History}
      actions={<RefreshButton onClick={() => void list.reload()} loading={list.loading} />}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form
          className="relative"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setQuery(term.trim());
          }}
        >
          <Search className="absolute end-2.5 top-2.5 h-4 w-4 text-white/35" aria-hidden />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="نام کاربر، فروشگاه یا شناسه"
            aria-label="جست‌وجوی رویداد"
            className="h-9 w-60 border-white/10 bg-white/[0.05] pe-8 text-white placeholder:text-white/35"
          />
        </form>

        <Select
          value={action || 'all'}
          onValueChange={(value) => {
            setPage(1);
            setAction(value === 'all' ? '' : value);
          }}
        >
          <SelectTrigger className="h-9 w-52 border-white/10 bg-white/[0.05] text-white" aria-label="نوع رویداد">
            <SelectValue placeholder="همهٔ رویدادها" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همهٔ رویدادها</SelectItem>
            {options.map((item) => (
              <SelectItem key={item.action} value={item.action}>
                {AUDIT_ACTION_LABELS[item.action] ?? item.action} ({toFaDigits(item.total)})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {list.error && <p className="mb-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{list.error}</p>}
      {list.loading && !list.data && <LoadingRows rows={6} />}
      {!list.loading && (list.data?.events.length ?? 0) === 0 && <EmptyState text="رویدادی با این شرایط پیدا نشد." />}

      {list.data && list.data.events.length > 0 && (
        <ul className="divide-y divide-white/[0.06] text-xs">
          {list.data.events.map((event) => (
            <li key={event.id} className="py-2">
              <button
                type="button"
                className="flex w-full flex-wrap items-center gap-2 text-start"
                onClick={() => setExpanded(expanded === event.id ? null : event.id)}
              >
                <Pill tone={AUDIT_ACTION_TONES[event.action]}>{AUDIT_ACTION_LABELS[event.action] ?? event.action}</Pill>
                <span className="font-bold text-white/85">{event.userName ?? event.userEmail ?? 'سیستم'}</span>
                {event.storeName && <span className="text-white/50">· {event.storeName}</span>}
                {event.subjectType && (
                  <span className="text-white/30">
                    {event.subjectType}:{event.subjectKey ?? '—'}
                  </span>
                )}
                <span className="ms-auto text-[10px] text-white/35">
                  {event.createdAt ? formatJalaliLongISO(event.createdAt) : '—'}
                </span>
              </button>
              {expanded === event.id && (
                <div className="mt-2 grid gap-1 rounded-xl bg-black/25 p-2 text-[11px] text-white/50">
                  <span>IP: {event.ip ?? '—'}</span>
                  {event.meta && (
                    <pre dir="ltr" className="overflow-x-auto text-[10px] text-white/40">
                      {JSON.stringify(event.meta, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {list.data && <Pagination meta={list.data.meta} onChange={setPage} />}
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="ghost" className="text-white/40" onClick={() => void actions.reload()}>
          به‌روزرسانی فهرست رویدادها
        </Button>
      </div>
    </Panel>
  );
}
