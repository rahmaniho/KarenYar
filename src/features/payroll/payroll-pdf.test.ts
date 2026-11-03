/**
 * Real-output test for the vector payslip PDF (payroll): fonts embedded,
 * A4, shaped glyphs (no .notdef), searchable logical ActualText.
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import type { Employee } from '@/core/db/db';
import { DEFAULT_PAYROLL_RATES, calculatePayroll, type PayrollInput } from '@/core/calc/payroll';
import { loadTrueTypeFont } from '@/core/pdf/font';
import { buildPayslipPdf, payslipFileName } from './payroll-pdf';

function stubFetch() {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = String(input);
    const match = url.match(/fonts\/(Vazirmatn-\w+)\.ttf$/);
    if (match) {
      const buf = readFileSync(`public/fonts/${match[1]}.ttf`);
      return new Response(new Uint8Array(buf), { status: 200 });
    }
    return new Response(null, { status: 404 });
  });
}

afterEach(() => vi.unstubAllGlobals());

function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function decompressedStreams(bytes: Uint8Array): string[] {
  const raw = Buffer.from(bytes).toString('latin1');
  const out: string[] = [];
  const re = /stream\r?\n([\s\S]*?)endstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    try {
      out.push(inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'));
    } catch {
      out.push(m[1]);
    }
  }
  return out;
}

function decodeActualTexts(streams: string[]): string {
  const re = /\/ActualText\s*<([0-9A-Fa-f]+)>/g;
  let all = '';
  for (const s of streams) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      const buf = Buffer.from(m[1], 'hex');
      const be = Buffer.alloc(buf.length);
      for (let i = 0; i + 1 < buf.length; i += 2) {
        be[i] = buf[i + 1];
        be[i + 1] = buf[i];
      }
      let text = be.toString('utf16le');
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      all += text + '\n';
    }
  }
  return all;
}

const employee: Employee = {
  id: 3,
  name: 'می‌روم — کارمند نمونه (Sample Employee)',
  nationalId: '0012345678',
  position: 'حسابدار نرم‌افزار',
  baseSalary: 50_000_000,
  children: 2,
  married: true,
  seniorityYears: 5,
  createdAt: '2020-01-01T00:00:00.000Z',
};

const input: PayrollInput = {
  baseSalary: employee.baseSalary,
  children: employee.children,
  married: employee.married,
  seniorityYears: employee.seniorityYears,
  workedDays: 26,
  overtimeHours: 6,
  nightShiftHours: 4,
  otherBenefits: 3_000_000,
  otherDeductions: 1_200_000,
};

describe('payslip vector PDF', () => {
  it('file name pattern is unchanged', () => {
    expect(payslipFileName('نگار', '1405-08')).toBe('payslip-نگار-1405-08.pdf');
  });

  it('produces an embedded-font, A4, searchable, correctly-shaped PDF', async () => {
    stubFetch();
    const result = calculatePayroll(input, DEFAULT_PAYROLL_RATES);
    const blob = await buildPayslipPdf({
      employee,
      month: '1405-08',
      input,
      result,
      rates: DEFAULT_PAYROLL_RATES,
      workedDays: 26,
      overtimeHours: 6,
      nightHours: 4,
      unit: 'toman',
      shopName: 'حسابیار — KarenSoft',
    });
    const bytes = await blobBytes(blob);
    expect(bytes.length).toBeGreaterThan(50_000);

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);

    // embedded fonts
    const rawLatin = Buffer.from(bytes).toString('latin1');
    expect((rawLatin.match(/\/FontFile2/g) ?? []).length).toBeGreaterThanOrEqual(3);
    const fontDict = doc.getPage(0).node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict);
    expect(fontDict).toBeTruthy();
    let embedded = 0;
    for (const [, value] of fontDict!.entries()) {
      const font = doc.context.lookup(value) as PDFDict;
      const descs: (PDFDict | undefined)[] = [
        font.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict),
        ...(() => {
          const arr = font.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray);
          return arr ? [doc.context.lookup(arr.get(0)) as PDFDict] : [];
        })(),
      ];
      for (const holder of descs) {
        if (
          holder?.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict)?.has(PDFName.of('FontFile2'))
        )
          embedded++;
      }
    }
    expect(embedded).toBeGreaterThanOrEqual(3);

    const streams = decompressedStreams(bytes);
    const actualText = decodeActualTexts(streams);
    expect(actualText).toContain('می‌روم');
    expect(actualText).toContain('0012345678');
    expect(actualText).toContain('۱۴۰۵');
    expect(actualText).toContain('خالص قابل پرداخت');

    // drawn glyphs: no .notdef, and presentation forms are used
    const re = /<([0-9A-Fa-f]{4})>\s*Tj/g;
    const glyphIds: number[] = [];
    for (const s of streams) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(s))) glyphIds.push(parseInt(m[1], 16));
    }
    expect(glyphIds.length).toBeGreaterThan(50);
    expect(glyphIds).not.toContain(0);
    const b = readFileSync('public/fonts/Vazirmatn-Regular.ttf');
    const font = loadTrueTypeFont(
      b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
    );
    const presentation = glyphIds.filter((gid) => {
      const cp = font.codePointForGlyph(gid);
      return cp !== undefined && cp >= 0xfb50 && cp <= 0xfeff;
    });
    expect(presentation.length).toBeGreaterThan(20);
  }, 30_000);
});
