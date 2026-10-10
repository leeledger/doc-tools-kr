// 이어서 하기 (CHAIN, brief handoff/ARCHITECT-BRIEF-CHAIN.md decision 7): which tools a result can open in, and the
// button group under a tool's download button. Shown only for one result file of at most 200 MB; the slot stays empty
// and hidden otherwise. The strings live here (late font face), never in the page markup.
import { announce } from './announce';
import { MB } from './device';
import type { HandoffDeps } from './handoff';
import { track, type UsageTool } from './usage';

export type NextTarget = 'pdf-compress' | 'pdf-password' | 'pdf-sign' | 'pdf-split' | 'photo-compress' | 'jpg-to-pdf';
/** A sender, by tool; 암호 풀기 and 암호 걸기 results of /pdf-password/ differ. */
export type NextSource =
  | 'jpg-to-pdf'
  | 'pdf-merge'
  | 'pdf-split'
  | 'hwp-to-pdf'
  | 'pdf-compress'
  | 'pdf-sign'
  | 'pdf-password-unlock'
  | 'pdf-password-lock'
  | 'image-to-jpg'
  | 'photo-compress'
  | 'remove-background'
  | 'id-photo';

/**
 * Button order = array order. A tool never offers itself. The 배경 지우기 row exists only in a build with
 * PUBLIC_BG_REMOVE on (a flag-off build may not name that tool at all; check-dist).
 */
export const FLOW = {
  'jpg-to-pdf': ['pdf-compress', 'pdf-password', 'pdf-sign'],
  'pdf-merge': ['pdf-compress', 'pdf-password', 'pdf-sign'],
  'pdf-split': ['pdf-compress', 'pdf-password', 'pdf-sign'],
  'hwp-to-pdf': ['pdf-compress', 'pdf-password', 'pdf-sign'],
  'pdf-compress': ['pdf-password', 'pdf-sign'],
  'pdf-sign': ['pdf-compress', 'pdf-password'],
  'pdf-password-unlock': ['pdf-compress', 'pdf-sign', 'pdf-split'],
  // An encrypted result: every next tool would ask for the password again.
  'pdf-password-lock': [],
  'image-to-jpg': ['photo-compress', 'jpg-to-pdf'],
  'photo-compress': ['jpg-to-pdf'],
  'id-photo': ['jpg-to-pdf'],
  ...(__BG_REMOVE__ ? { 'remove-background': ['jpg-to-pdf', 'photo-compress'] } : {}),
} as Readonly<Record<NextSource, readonly NextTarget[] | undefined>>;

/** Button labels: the tool names of src/data/tools.ts (a unit test keeps them equal), except 암호 걸기. */
export const NEXT_LABELS: Readonly<Record<NextTarget, string>> = {
  'pdf-compress': 'PDF 용량 줄이기',
  'pdf-password': 'PDF 암호 걸기',
  'pdf-sign': 'PDF 서명·도장 넣기',
  'pdf-split': 'PDF 나누기·쪽 편집',
  'photo-compress': '사진 용량 줄이기',
  'jpg-to-pdf': '사진 PDF 변환',
};

export const NEXT_GROUP_LABEL = '이 파일로 이어서 하기';
/** Sender alert when the file could not be stored. */
export const sendFailed = (label: string): string => `파일을 넘기지 못했습니다. 내려받은 뒤 ${label}에서 골라 주세요.`;
/** Results above this are not offered. */
export const NEXT_MAX_BYTES = 200 * MB;

export interface NextFile {
  blob: Blob;
  name: string;
}

/** The usage/handoff tool of a sender. */
export function sourceTool(from: NextSource): UsageTool {
  return from === 'pdf-password-unlock' || from === 'pdf-password-lock' ? 'pdf-password' : from;
}

/** The tools `files` can be opened in: none unless there is exactly one file of at most 200 MB. */
export function nextTargets(from: NextSource, files: readonly NextFile[]): readonly NextTarget[] {
  if (files.length !== 1 || files[0]!.blob.size > NEXT_MAX_BYTES) return [];
  return FLOW[from] ?? [];
}

/** Empties and hides the slot (reset, new file, error). */
export function hideNextSteps(slot: HTMLElement): void {
  slot.replaceChildren();
  slot.hidden = true;
}

export interface NextDeps extends HandoffDeps {
  go?: (path: string) => void;
}

/** Fills the slot with the group label and one button per next tool; hidden when there is none. */
export function showNextSteps(slot: HTMLElement, from: NextSource, files: readonly NextFile[], deps: NextDeps = {}): void {
  const targets = nextTargets(from, files);
  if (!targets.length) {
    hideNextSteps(slot);
    return;
  }
  const file = files[0]!;
  const tool = sourceTool(from);
  const label = document.createElement('p');
  label.id = `${slot.id}-label`;
  label.className = 'next-steps-label';
  label.textContent = NEXT_GROUP_LABEL;
  const row = document.createElement('div');
  row.className = 'row';
  const buttons = targets.map((to) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn ghost';
    b.dataset.next = to;
    b.textContent = NEXT_LABELS[to];
    return b;
  });
  for (const b of buttons) {
    const to = b.dataset.next as NextTarget;
    b.addEventListener('click', () => {
      if (b.disabled) return;
      for (const x of buttons) x.disabled = true;
      b.setAttribute('aria-busy', 'true');
      track({ e: 'next', t: tool, o: 'next', v: to });
      // The IndexedDB code loads on the first click only (src/lib/ui/handoff.ts); a failed load counts as a failed store.
      void import('./handoff')
        .then(({ sendTo }) => sendTo(to, tool, file.blob, file.name, file.blob.type, deps.go, deps))
        .catch(() => false)
        .then((ok) => {
          if (ok) return;
          for (const x of buttons) x.disabled = false;
          b.removeAttribute('aria-busy');
          announce('alert', sendFailed(NEXT_LABELS[to]));
        });
    });
  }
  row.append(...buttons);
  slot.replaceChildren(label, row);
  slot.hidden = false;
}
