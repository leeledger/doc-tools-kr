// /remove-background/ page script (Sprint C, C2). The controller (bg.ts, and through it the asset loader and the
// workers) is imported on the first interaction with the tool, never on page load (LCP; the /stamp-signature/
// pattern). A photo picked or dropped while it loads is handed to it. A module that cannot load shows the shared
// engine panel. The only thing done at load: the crash check of the previous attempt in this tab (guard.ts).
// IDCAM1022 D8b: a photo handed over by 증명사진 촬영 (이어서 하기) loads the controller at once and stops where the user
// decides (ready on the cloud path, the consent panel on this device): it is never sent or worked on by itself.
// ?bg=white opens the result on white.
import { takeCrash } from '../../lib/bgremove/guard';
import { sessionStore } from '../../lib/face/guard';
import { showEngineError } from '../../lib/ui/engine-error';
import { withEngineRetry } from '../../lib/ui/engine-load';
import { pendingHandoff, sweepIfDue } from '../../lib/ui/handoff-marker';
import { parseBgLink } from '../../lib/idphoto/bglink';
import { startUsage, track, trackOut } from '../../lib/ui/usage';
import { COPY } from './copy';

type Api = { open(file: File, opts?: { held?: boolean }): void; picture: import('./bg').Picture } | null;

const root = document.getElementById('bg-tool');
const drop = document.getElementById('bg-drop');
const crash = document.getElementById('bg-crash');
if (crash && takeCrash(sessionStore())) {
  crash.textContent = COPY.crashBefore;
  crash.hidden = false;
}
if (root && drop) {
  startUsage('remove-background');
  // 제휴 링크 (REV3): count presses of the result block's links (link kind only).
  trackOut(document.getElementById('bg-result'), 'remove-background');
  let loading: Promise<Api> | null = null;
  const EVENTS = ['pointerdown', 'keydown', 'focusin', 'touchstart', 'change'] as const;
  const start = (): void => void load();
  const onDragOver = (e: DragEvent): void => {
    e.preventDefault();
    start();
  };
  const onDrop = (e: DragEvent): void => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    if (loading) void loading.then((api) => api?.open(f));
    else void load(f);
  };
  const load = (pending?: File): Promise<Api> =>
    (loading ??= withEngineRetry(() => import('./bg')).then(
      (m) => {
        for (const ev of EVENTS) root.removeEventListener(ev, start);
        drop.removeEventListener('dragover', onDragOver);
        drop.removeEventListener('drop', onDrop);
        return m.initBgTool(pending);
      },
      () => {
        loading = null;
        track({ e: 'fail', t: 'remove-background', c: 'engine', p: 'load' });
        void showEngineError();
        return null;
      },
    ));
  for (const ev of EVENTS) root.addEventListener(ev, start, { passive: true });
  drop.addEventListener('dragover', onDragOver);
  drop.addEventListener('drop', onDrop);
  // The result's 배경 chips are native controls: ?bg=white is chosen before the controller loads (it reads them).
  const link = parseBgLink(location.search);
  if (link.white) {
    const white = root.querySelector<HTMLInputElement>('input[name="bg-bg"][value="white"]');
    if (white) white.checked = true;
  }
  // With ?preset= the result links back to /id-photo/ (./back, loaded on the press; the controller lends the picture).
  const back = document.getElementById('bg-idphoto') as HTMLButtonElement | null;
  const preset = link.preset;
  if (back && preset) {
    back.hidden = false;
    back.addEventListener('click', () => {
      void Promise.all([load(), import('./back')])
        .then(([api, m]) => api && m.goBack(back, api.picture, preset))
        .catch(() => void showEngineError());
    });
  }
  const notice = document.getElementById('bg-arrived');
  if (notice && pendingHandoff('remove-background')) {
    // Opened as if picked, but held at ready / consent (D8b: never sent by itself).
    const ready = load();
    void import('../../lib/ui/handoff')
      .then(({ receiveHandoff }) =>
        receiveHandoff('remove-background', root, async (f) => {
          const api = await ready;
          if (!api) return false;
          api.open(f, { held: true });
          return true;
        }, { notice }),
      )
      .catch(() => void showEngineError());
  } else {
    // This page sends files (이어서 하기): a file stored earlier and never taken is deleted once older than 10 minutes.
    sweepIfDue();
  }
}
