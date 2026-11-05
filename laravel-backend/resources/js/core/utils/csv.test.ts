import { describe, expect, it } from 'vitest';
import { buildCsv } from './csv';

describe('خروجی CSV امن', () => {
  it('سلول شروع‌شونده با فرمول اکسل خنثی می‌شود', () => {
    const csv = buildCsv([
      ['نام', '=HYPERLINK("https://example.com")'],
      ['عادی', 'سلام'],
    ]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain('سلام');
  });
  it('نقل قول و کاما escape می‌شوند', () => {
    expect(buildCsv([['a,b', 'c"d']])).toContain('"a,b","c""d"');
  });
});
