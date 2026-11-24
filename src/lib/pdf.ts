/**
 * Turns the on-screen invoice or quote into an A4 PDF in the browser (no server, no cost),
 * then hands it to the phone's share sheet (WhatsApp, Gmail, Mail…) or downloads it.
 * The PDF libraries load only when someone asks for a PDF.
 */
const A4_PX = 794; // A4 width at 96 dpi

export async function elementToPdf(el: HTMLElement, filename: string): Promise<File> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${A4_PX}px;background:#fff;`;
  const clone = el.cloneNode(true) as HTMLElement;
  clone.classList.add('paper-capture');
  host.appendChild(clone);
  document.body.appendChild(host);
  try {
    await document.fonts?.ready;
    const canvas = await html2canvas(clone, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: A4_PX });
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const sliceH = Math.floor((canvas.width * ph) / pw);
    for (let y = 0, page = 0; y < canvas.height; y += sliceH, page++) {
      const part = document.createElement('canvas');
      part.width = canvas.width;
      part.height = Math.min(sliceH, canvas.height - y);
      const ctx = part.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, part.width, part.height);
      ctx.drawImage(canvas, 0, y, canvas.width, part.height, 0, 0, canvas.width, part.height);
      if (page) pdf.addPage();
      pdf.addImage(part.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, pw, (part.height * pw) / canvas.width);
    }
    return new File([pdf.output('blob')], filename, { type: 'application/pdf' });
  } finally {
    host.remove();
  }
}

export type ShareResult = 'shared' | 'downloaded' | 'cancelled' | 'needs-tap';

/** Share sheet with the PDF attached where the phone supports it; otherwise download it. */
export async function sharePdf(file: File, title: string, text: string): Promise<ShareResult> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title, text });
      return 'shared';
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === 'AbortError') return 'cancelled';
      // Safari only allows sharing straight after a tap; building the PDF took too long.
      if (name === 'NotAllowedError') return 'needs-tap';
    }
  }
  downloadFile(file);
  return 'downloaded';
}

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Base64 (no data: prefix) for sending a file in a JSON body. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
