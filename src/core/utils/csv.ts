import { saveBlob } from './file-save';

/**
 * خروجی CSV سازگار با اکسل (BOM + جداکننده‌ی کاما + escape نقل‌قول)
 */

function escapeCsvCell(value: string | number): string {
  const text = String(value);
  if (/[",\n;]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function buildCsv(rows: (string | number)[][]): string {
  const body = rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
  return '\uFEFF' + body;
}

export async function downloadCsv(fileName: string, rows: (string | number)[][]): Promise<void> {
  const blob = new Blob([buildCsv(rows)], { type: 'text/csv;charset=utf-8' });
  await saveBlob(fileName, blob);
}
