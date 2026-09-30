// The PDF file name and the in-page download (SPIKE-HWP-DIRECT §6.2 "download.ts"). A hidden <a download>
// with a blob: URL: no navigation, no new window, no dialog of ours. The caller owns the URL and revokes it on
// reset or replacement, never on a timer (the visible 「다시 내려받기」 link keeps using it).
import { safeFileName } from '../../lib/ui/format';

/** The original name with .pdf: `law05.hwp` → `law05.pdf`, `a.b.hwpx` → `a.b.pdf`, nothing usable → `문서.pdf`. */
export function pdfName(fileName: string): string {
  return safeFileName(fileName.replace(/\.[^./\\]+$/, ''), '.pdf');
}

export function triggerDownload(url: string, name: string, doc: Document = document): void {
  const a = doc.createElement('a');
  a.href = url;
  a.download = name;
  a.hidden = true;
  doc.body.append(a);
  a.click();
  a.remove();
}
