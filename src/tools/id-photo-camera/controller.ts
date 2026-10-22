// 증명사진 촬영 controller (IDCAM1022 D3, D5, D7; Step B). Loaded by entry.ts on the first press in the tool. States:
// idle -> starting -> live (-> countdown) -> review, back to idle on any failure or when the page is hidden. The camera
// runs only between 「카메라 켜기」 and the capture (or hide/leave); every track is stopped then. The live view shows the
// whole frame with the preset's guide (src/tools/id-photo/overlay.ts drawGuides, the /id-photo/ geometry) inside the
// overlay rectangle; the still is that rectangle cut from the frame at its own resolution, never mirrored (the front
// camera preview is). Nothing leaves the device: the still goes to /id-photo/ through the 이어서 하기 store.
import { getPreset, DEFAULT_PRESET, type IdPreset } from '../../data/id-photo-presets';
import { announce, clearAlert } from '../../lib/ui/announce';
import { track } from '../../lib/ui/usage';
import { drawGuides } from '../id-photo/overlay';
import { isBlackFrame, isLowres, overlayRect, toBox, unmirrorRect, type Rect } from './capture';
import { COPY } from './copy';
import { CAMERA_ERRORS, cameraFailCode } from './errors';
import { SLUG, sendToIdPhoto } from './send';

type Phase = 'idle' | 'starting' | 'live' | 'countdown' | 'review';
type Facing = 'user' | 'environment';

/** getUserMedia request (D5): the largest picture the camera gives, no sound. */
export const constraints = (facing: Facing): MediaStreamConstraints => ({
  video: { facingMode: facing, width: { ideal: 2560 }, height: { ideal: 1440 } },
  audio: false,
});

const JPEG_QUALITY = 0.92;
/** Side of the copy the black-frame check reads. */
const PROBE = 32;

function must<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
}

export function initCamera(): { start(): void } | null {
  const found = document.getElementById('cam-tool');
  if (!found) return null;
  const root: HTMLElement = found;
  const select = must<HTMLSelectElement>('cam-preset');
  const startBox = must<HTMLElement>('cam-start');
  const onBtn = must<HTMLButtonElement>('cam-on');
  const fallback = must<HTMLElement>('cam-fallback');
  const live = must<HTMLElement>('cam-live');
  const stage = must<HTMLElement>('cam-stage');
  const video = must<HTMLVideoElement>('cam-video');
  const overlay = must<HTMLCanvasElement>('cam-overlay');
  const count = must<HTMLElement>('cam-count');
  const shootBtn = must<HTMLButtonElement>('cam-shoot');
  const flipBtn = must<HTMLButtonElement>('cam-flip');
  const review = must<HTMLElement>('cam-review');
  const still = must<HTMLImageElement>('cam-still');
  const lowresNote = must<HTMLElement>('cam-lowres');
  const useBtn = must<HTMLButtonElement>('cam-use');
  const retakeBtn = must<HTMLButtonElement>('cam-retake');
  const saveRow = must<HTMLElement>('cam-save-row');
  const saveLink = must<HTMLAnchorElement>('cam-save');

  let phase: Phase = 'idle';
  let facing: Facing = 'user';
  let mirrored = false;
  let stream: MediaStream | null = null;
  /** Bumped by every start and stop: a getUserMedia that resolves after a stop is dropped. */
  let run = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let shot: Blob | null = null;
  let shotUrl: string | null = null;
  /** A capture is running (toBlob is async): a second tap or timer end must not start another. */
  let capturing = false;

  const preset = (): IdPreset => getPreset(select.value) ?? getPreset(DEFAULT_PRESET)!;
  const say = (msg: string): void => announce('status', msg, root);

  function setPhase(p: Phase): void {
    phase = p;
    root.dataset.state = p;
    startBox.hidden = p !== 'idle' && p !== 'starting';
    onBtn.disabled = p === 'starting';
    live.hidden = p !== 'live' && p !== 'countdown';
    review.hidden = p !== 'review';
    shootBtn.disabled = p !== 'live';
    flipBtn.disabled = p !== 'live';
    count.hidden = p !== 'countdown';
    // The still was cut at the chosen 제출처's aspect: the choice is fixed until 「다시 찍기」 (review fix 4).
    select.disabled = p === 'review';
  }

  function stopTracks(): void {
    run++;
    for (const t of stream?.getTracks() ?? []) t.stop();
    stream = null;
    video.srcObject = null;
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  }

  function fail(err: unknown): void {
    const code = cameraFailCode(err);
    track({ e: 'fail', t: SLUG, c: code, p: 'load' });
    stopTracks();
    setPhase('idle');
    fallback.hidden = false;
    announce('alert', CAMERA_ERRORS[code], root);
  }

  async function start(): Promise<void> {
    if (phase === 'starting' || phase === 'live' || phase === 'countdown') return;
    clearAlert(root);
    dropShot();
    const media = navigator.mediaDevices;
    if (!media || typeof media.getUserMedia !== 'function') return fail(null);
    stopTracks();
    const my = run;
    setPhase('starting');
    say(COPY.starting);
    let s: MediaStream;
    try {
      s = await media.getUserMedia(constraints(facing));
    } catch (err) {
      if (my === run) fail(err);
      return;
    }
    // Stopped (page hidden, left) while the camera was starting: release it at once.
    if (my !== run || document.visibilityState === 'hidden') {
      for (const t of s.getTracks()) t.stop();
      if (my === run) setPhase('idle');
      return;
    }
    stream = s;
    const settings = s.getVideoTracks()[0]?.getSettings?.() ?? {};
    // The front camera's preview is mirrored, as people expect; a camera that names no side follows the request.
    mirrored = (settings.facingMode ?? facing) === 'user';
    stage.dataset.mirror = mirrored ? '1' : '0';
    video.srcObject = s;
    setPhase('live');
    try {
      await video.play();
    } catch {
      // autoplay + muted + playsinline plays without this; a refusal leaves the first frame, still capturable.
    }
    if (!video.videoWidth) await new Promise<void>((r) => video.addEventListener('loadedmetadata', () => r(), { once: true }));
    if (my !== run) return;
    layout();
    track({ e: 'start', t: SLUG, o: 'preset', v: preset().id });
    say(COPY.live);
  }

  /** The overlay rectangle of the current frame and preset, in frame pixels. */
  const frameRect = (): Rect => overlayRect({ w: video.videoWidth, h: video.videoHeight }, { w: preset().outW, h: preset().outH });

  function layout(): void {
    const fw = video.videoWidth;
    const fh = video.videoHeight;
    if (!fw || !fh) return;
    stage.style.setProperty('--cam-ar', `${fw} / ${fh}`);
    stage.style.setProperty('--cam-arn', String(fw / fh));
    draw();
  }

  function draw(): void {
    const fw = video.videoWidth;
    const fh = video.videoHeight;
    const cw = stage.clientWidth;
    const ch = stage.clientHeight;
    if (!fw || !fh || !cw || !ch) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    overlay.width = Math.round(cw * dpr);
    overlay.height = Math.round(ch * dpr);
    const g = overlay.getContext('2d');
    if (!g) return;
    const W = overlay.width;
    const H = overlay.height;
    // The guide rectangle on the canvas (reviewer note on Step A: guides() gets the rectangle's size, drawn at its origin).
    const box = toBox(frameRect(), { w: fw, h: fh }, { w: W, h: H });
    g.clearRect(0, 0, W, H);
    g.save();
    g.beginPath();
    g.rect(0, 0, W, H);
    g.rect(box.x, box.y, box.w, box.h);
    g.fillStyle = 'rgba(0, 0, 0, 0.5)';
    g.fill('evenodd');
    g.strokeStyle = '#fff';
    g.lineWidth = Math.max(1, W / 300);
    g.strokeRect(box.x, box.y, box.w, box.h);
    g.translate(box.x, box.y);
    drawGuides(g, preset(), box.w, box.h);
    g.restore();
  }

  function shoot(): void {
    if (phase !== 'live' || capturing) return;
    const checked = root.querySelector<HTMLInputElement>('input[name="cam-timer"]:checked');
    let left = Number(checked?.value ?? '3');
    if (!(left > 0)) {
      void capture();
      return;
    }
    setPhase('countdown');
    count.textContent = String(left);
    say(COPY.countdown(left));
    timer = setInterval(() => {
      left--;
      if (left > 0) {
        count.textContent = String(left);
        return;
      }
      clearInterval(timer);
      timer = undefined;
      void capture();
    }, 1000);
  }

  async function capture(): Promise<void> {
    if (capturing) return;
    capturing = true;
    shootBtn.disabled = true;
    try {
      await captureOnce();
    } finally {
      capturing = false;
    }
  }

  async function captureOnce(): Promise<void> {
    const fw = video.videoWidth;
    const fh = video.videoHeight;
    const rect = unmirrorRect(frameRect(), fw, mirrored);
    const canvas = document.createElement('canvas');
    canvas.width = rect.w;
    canvas.height = rect.h;
    const g = canvas.getContext('2d');
    if (!fw || !fh || !rect.w || !rect.h || !g) {
      setPhase('live');
      announce('alert', COPY.black, root);
      return;
    }
    g.drawImage(video, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    const probe = document.createElement('canvas');
    probe.width = PROBE;
    probe.height = PROBE;
    const pg = probe.getContext('2d');
    pg?.drawImage(canvas, 0, 0, PROBE, PROBE);
    if (!pg || isBlackFrame(pg.getImageData(0, 0, PROBE, PROBE).data)) {
      setPhase('live');
      announce('alert', COPY.black, root);
      return;
    }
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', JPEG_QUALITY));
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) {
      setPhase('live');
      announce('alert', COPY.black, root);
      return;
    }
    stopTracks();
    shot = blob;
    if (shotUrl) URL.revokeObjectURL(shotUrl);
    shotUrl = URL.createObjectURL(blob);
    still.src = shotUrl;
    const p = preset();
    const low = isLowres(rect, { w: p.outW, h: p.outH });
    lowresNote.textContent = low ? COPY.lowres(p.outW, p.outH) : '';
    lowresNote.hidden = !low;
    if (low) fallback.hidden = false;
    saveRow.hidden = true;
    useBtn.disabled = false;
    setPhase('review');
    track({ e: 'success', t: SLUG });
    say(COPY.captured);
    useBtn.focus({ preventScroll: true });
  }

  function dropShot(): void {
    if (shotUrl) URL.revokeObjectURL(shotUrl);
    shotUrl = null;
    shot = null;
    still.removeAttribute('src');
    saveRow.hidden = true;
    saveLink.removeAttribute('href');
  }

  async function use(): Promise<void> {
    if (!shot || !shotUrl) return;
    useBtn.disabled = true;
    clearAlert(root);
    say(COPY.sending);
    const ok = await sendToIdPhoto(shot, 'photo.jpg', 'image/jpeg', preset().id);
    if (ok) return;
    // F: storage blocked or full: the still can still be saved and picked on /id-photo/.
    useBtn.disabled = false;
    saveLink.href = shotUrl;
    saveRow.hidden = false;
    announce('alert', COPY.sendFailed, root);
  }

  function stopForHide(): void {
    if (phase !== 'starting' && phase !== 'live' && phase !== 'countdown') return;
    stopTracks();
    setPhase('idle');
    say(COPY.stopped);
  }

  shootBtn.addEventListener('click', shoot);
  flipBtn.addEventListener('click', () => {
    facing = facing === 'user' ? 'environment' : 'user';
    stopTracks();
    setPhase('idle');
    void start();
  });
  useBtn.addEventListener('click', () => void use());
  retakeBtn.addEventListener('click', () => {
    dropShot();
    setPhase('idle');
    void start();
  });
  select.addEventListener('change', () => {
    if (phase === 'live' || phase === 'countdown') draw();
  });
  video.addEventListener('resize', layout);
  window.addEventListener('resize', () => {
    if (phase === 'live' || phase === 'countdown') draw();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stopForHide();
  });
  window.addEventListener('pagehide', () => {
    stopTracks();
    if (phase !== 'review') setPhase('idle');
  });
  // Back from /id-photo/ (back-forward cache): the review is as it was, so the photo can be handed over again (a new
  // record; the first one was taken).
  window.addEventListener('pageshow', (e) => {
    if (e.persisted && phase === 'review' && shot) useBtn.disabled = false;
  });

  setPhase('idle');
  return { start: () => void start() };
}
