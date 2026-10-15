// 글자수 세기 (TOOLS1015 C1): the page controller. Recounts once per animation frame while typing, shows the goal bar,
// copies, clears with one undo. Stores nothing (no Web Storage, no IndexedDB); a leave prompt only while there is text.
// Usage: pick on the first text, start (o=basis) when a goal is first set, next when an /id-photo/ chain link is used;
// never the text, a count or the goal number.
import { track } from '../../lib/ui/usage';
import { BASES, count, goalStatus, parseGoal, valueOf, type Basis, type Counts } from './count';

const fmt = (n: number): string => n.toLocaleString('ko-KR');

export function initCharCount(): void {
  const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
  const text = byId<HTMLTextAreaElement>('cc-text');
  if (!text) return;
  const goalInput = byId<HTMLInputElement>('cc-goal');
  const basisSelect = byId<HTMLSelectElement>('cc-basis');
  const goalBox = byId<HTMLElement>('cc-goal-box');
  const goalOut = byId<HTMLElement>('cc-goal-out');
  const progress = byId<HTMLProgressElement>('cc-progress');
  const goalText = byId<HTMLElement>('cc-goal-text');
  const copyBtn = byId<HTMLButtonElement>('cc-copy');
  const clearBtn = byId<HTMLButtonElement>('cc-clear');
  const undoBtn = byId<HTMLButtonElement>('cc-undo');
  const note = byId<HTMLElement>('cc-note');
  const live = byId<HTMLElement>('cc-live');
  const outs: Record<keyof Counts, HTMLElement> = {
    withSpace: byId('cc-n-space'),
    noSpace: byId('cc-n-nospace'),
    bytes2: byId('cc-n-byte2'),
    bytes3: byId('cc-n-byte3'),
    lines: byId('cc-n-lines'),
    paragraphs: byId('cc-n-paras'),
  };

  let frame = 0;
  let picked = false;
  let started = false;
  let nexted = false;
  let wasOver = false;
  /** Off for the first render: text and goal the browser restored (back/forward) are counted without an announcement. */
  let announce = false;
  let leaveGuard = false;
  /** The text 지우기 removed, until the next input (one undo step, in memory only). */
  let cleared: string | null = null;

  const onBeforeUnload = (e: BeforeUnloadEvent): void => {
    e.preventDefault();
    e.returnValue = '';
  };
  // Attached only while there is text, so an empty page keeps the back-forward cache.
  const guardLeave = (on: boolean): void => {
    if (on === leaveGuard) return;
    leaveGuard = on;
    if (on) window.addEventListener('beforeunload', onBeforeUnload);
    else window.removeEventListener('beforeunload', onBeforeUnload);
  };

  const basis = (): Basis => (BASES as readonly string[]).includes(basisSelect.value) ? (basisSelect.value as Basis) : 'space';

  const render = (): void => {
    frame = 0;
    const c = count(text.value);
    for (const k of Object.keys(outs) as (keyof Counts)[]) outs[k].textContent = fmt(c[k]);
    const empty = text.value.length === 0;
    copyBtn.disabled = empty;
    clearBtn.disabled = empty;
    guardLeave(!empty);
    const goal = parseGoal(goalInput.value);
    goalInput.setAttribute('aria-invalid', String(goalInput.value !== '' && goal === null));
    if (goal === null) {
      goalOut.hidden = true;
      goalBox.dataset.over = 'false';
      wasOver = false;
      return;
    }
    const value = valueOf(c, basis());
    const status = goalStatus(value, goal, basis());
    goalOut.hidden = false;
    progress.max = goal;
    progress.value = Math.min(value, goal);
    goalText.textContent = status.text;
    goalBox.dataset.over = String(status.over);
    // Announced only when the goal is crossed, either way.
    if (announce && status.over !== wasOver) live.textContent = status.over ? `목표보다 ${status.text}` : '목표 글자 수 안으로 들어왔어요';
    wasOver = status.over;
  };
  const schedule = (): void => {
    if (!frame) frame = requestAnimationFrame(render);
  };

  const goalChanged = (): void => {
    if (!started && parseGoal(goalInput.value) !== null) {
      started = true;
      track({ e: 'start', t: 'char-count', o: 'basis', v: basis() });
    }
    render();
  };

  text.addEventListener('input', () => {
    if (cleared !== null) {
      cleared = null;
      undoBtn.hidden = true;
    }
    note.textContent = '';
    if (!picked && text.value.length > 0) {
      picked = true;
      track({ e: 'pick', t: 'char-count' });
    }
    schedule();
  });
  goalInput.addEventListener('input', goalChanged);
  basisSelect.addEventListener('change', render);
  for (const chip of document.querySelectorAll<HTMLButtonElement>('#cc-goal-box [data-goal]')) {
    chip.addEventListener('click', () => {
      goalInput.value = chip.dataset.goal ?? '';
      goalChanged();
    });
  }

  copyBtn.addEventListener('click', () => {
    const value = text.value;
    if (!value) return;
    const fallback = (): void => {
      text.focus();
      text.select();
      note.textContent = 'Ctrl+C로 복사하세요. 휴대폰에서는 길게 눌러 복사하세요.';
    };
    if (!navigator.clipboard?.writeText) return fallback();
    navigator.clipboard.writeText(value).then(() => {
      note.textContent = '복사했어요. 붙여 넣을 곳에 붙여 넣으세요.';
    }, fallback);
  });
  clearBtn.addEventListener('click', () => {
    if (!text.value) return;
    cleared = text.value;
    text.value = '';
    undoBtn.hidden = false;
    note.textContent = '글을 지웠어요. 되돌리기를 누르면 다시 나옵니다.';
    render();
    text.focus();
  });
  undoBtn.addEventListener('click', () => {
    if (cleared === null) return;
    text.value = cleared;
    cleared = null;
    undoBtn.hidden = true;
    note.textContent = '';
    render();
    text.focus();
  });

  for (const a of document.querySelectorAll<HTMLAnchorElement>('#cc-chain a[href^="/id-photo/"]')) {
    a.addEventListener('click', () => {
      if (nexted) return;
      nexted = true;
      track({ e: 'next', t: 'char-count', o: 'next', v: 'id-photo' });
    });
  }

  // Text and goal the browser restored (back/forward, autofill) are counted silently: now, and again on pageshow,
  // because Chromium fills the restored form values in after this module has run.
  const silentRender = (): void => {
    announce = false;
    render();
    announce = true;
  };
  silentRender();
  window.addEventListener('pageshow', silentRender);
}
