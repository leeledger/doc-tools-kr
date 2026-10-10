// 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
// The PDF file name and the in-page download (SPIKE-HWP-DIRECT §6.2 "download.ts"). A hidden <a download>
// with a blob: URL: no navigation, no new window, no dialog of ours. The caller owns the URL and revokes it on
// reset or replacement, never on a timer (the visible 「다시 내려받기」 link keeps using it).
import { safeFileName } from '../../lib/ui/format';

/** Any last extension (`a.b.hwpx` → `a.b`). */
const LAST_EXT = /\.[^./\\]+$/;

/**
 * `fileName` without the part `strip` matches, plus `ext`, made safe: nothing usable → `문서` + ext. `strip`
 * defaults to the last extension; HWPX HWP 변환 strips only a trailing `.hwpx` (`a.b` → `a.b.hwp`).
 */
export function withExt(fileName: string, ext: string, strip: RegExp = LAST_EXT): string {
  return safeFileName(fileName.replace(strip, ''), ext);
}

/** The original name with .pdf: `law05.hwp` → `law05.pdf`, `a.b.hwpx` → `a.b.pdf`, nothing usable → `문서.pdf`. */
export function pdfName(fileName: string): string {
  return withExt(fileName, '.pdf');
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
