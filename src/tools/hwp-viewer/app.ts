// 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
// /hwp-viewer/ controller (G2 A0 "Flow" V2): the shared HWP document session (../hwp-shared/session.ts) with
// zoomable pages, no PDF warm-up (the PDF is optional here: 「PDF로 내려받기」 loads the export chunk on its
// first click, for the same open document) and the viewer controls (./ui), which start loading when a file
// starts opening. Imported by ../hwp-shared/boot.ts after the first paint or on the first interaction. The
// file is named app.ts, not controller.ts, so the service worker does not precache it (brief: the viewer
// adds its HTML and small entry only).
import type { BootStart } from '../hwp-shared/boot';
import { startHwpSession, type OpenDocument } from '../hwp-shared/session';
import type { Attached } from './ui';

type Ui = typeof import('./ui');

export function initHwpViewer(start: BootStart = {}): void {
  let ui: Promise<Ui> | null = null;
  let attached: Attached | null = null;
  const loadUi = (): Promise<Ui> => (ui ??= import('./ui').catch((err: unknown) => {
    ui = null;
    throw err;
  }));

  const attach = async (doc: OpenDocument): Promise<void> => {
    let m: Ui;
    try {
      m = await loadUi();
    } catch {
      // Without the controls the pages still scroll; the next file retries the import.
      return;
    }
    if (!doc.alive()) return;
    attached?.destroy();
    attached = m.attach(doc);
  };

  startHwpSession(start, {
    tool: 'hwp-viewer',
    warmExport: false,
    viewer: {
      zoomable: true,
      onRendered: (i, el) => attached?.onRendered(i, el),
      onCleared: (i) => attached?.onCleared(i),
    },
    onOpening: () => void loadUi().catch(() => undefined),
    onDocument: (doc) => void attach(doc),
    onClear: () => {
      attached?.destroy();
      attached = null;
    },
  });
}
