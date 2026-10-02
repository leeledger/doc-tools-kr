// The 사진 배경 지우기 page state (Sprint C, C2; brief build order 7). Pure, so the allowed moves and what each state
// shows are unit-tested without a DOM.
//   empty -> consent -> downloading -> loading-engine -> working -> done | nosubject | error
// A cached engine skips consent and downloading, a live one (kept between photos) goes straight to working; a WebGPU
// failure goes back to downloading (the WASM runtime) once.

export type Phase = 'empty' | 'opening' | 'consent' | 'downloading' | 'loading-engine' | 'working' | 'done' | 'nosubject' | 'error';

/** Moves besides the ones every phase may make (to 'opening' for a new photo, 'empty' for 취소, 'error'). */
const NEXT: Record<Phase, readonly Phase[]> = {
  empty: [],
  opening: ['consent', 'downloading', 'working'],
  consent: ['downloading'],
  downloading: ['loading-engine'],
  'loading-engine': ['working', 'downloading'],
  working: ['done', 'nosubject', 'downloading'],
  done: [],
  nosubject: [],
  error: ['downloading', 'working'],
};
const ALWAYS: readonly Phase[] = ['opening', 'empty', 'error'];

/** The next phase, or `from` when the move is not allowed (a late reply of an older photo cannot jump states). */
export function move(from: Phase, to: Phase): Phase {
  return from === to || ALWAYS.includes(to) || NEXT[from].includes(to) ? to : from;
}

export interface View {
  drop: boolean;
  consent: boolean;
  progress: boolean;
  /** The progress bar shows bytes (downloading) rather than an indeterminate bar. */
  bytes: boolean;
  cancel: boolean;
  result: boolean;
  nosubject: boolean;
}

/** Which panels a phase shows. */
export function view(p: Phase): View {
  const busy = p === 'opening' || p === 'downloading' || p === 'loading-engine' || p === 'working';
  return {
    drop: p === 'empty' || p === 'error',
    consent: p === 'consent',
    progress: busy,
    bytes: p === 'downloading',
    cancel: p === 'downloading',
    result: p === 'done',
    nosubject: p === 'nosubject',
  };
}
