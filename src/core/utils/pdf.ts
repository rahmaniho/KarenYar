/**
 * ساخت PDF از یک المان صفحه (فاکتور/فیش حقوقی) — تصویربرداری با html2canvas
 * تا متن فارسی و راست‌چین دقیقاً مثل صفحه رندر شود، سپس صفحه‌بندی A4 با jsPDF.
 */
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { saveBlob } from './file-save';

export async function exportElementToPdf(element: HTMLElement, fileName: string): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });
  const imgData = canvas.toDataURL('image/jpeg', 0.92);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const imgWidth = pageWidth - margin * 2;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  if (imgHeight <= pageHeight - margin * 2) {
    pdf.addImage(imgData, 'JPEG', margin, margin, imgWidth, imgHeight);
  } else {
    // سند چندصفحه‌ای: تصویر بلند با آفست منفی صفحه‌به‌صفحه بریده می‌شود
    let heightLeft = imgHeight;
    let position = margin;
    pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
    heightLeft -= pageHeight - margin * 2;
    while (heightLeft > 0) {
      position -= pageHeight - margin * 2;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - margin * 2;
    }
  }
  await saveBlob(fileName, pdf.output('blob'));
}
