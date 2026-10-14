// 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
// The worker watchdog (brief Step 5 "Flow": no worker message for 90 s → terminate → error timeout). Pure
// apart from the timer functions, which tests replace with fake timers.
// REQ1014-B D8: paused while the page is hidden. Phones freeze workers when the user switches app; the main
// thread timer then fired on return and reported a false timeout. Hidden clears the timer (and remembers it was
// armed); visible again re-arms a full window. Without a document it behaves as before.
export const WATCHDOG_MS = 90_000;

export interface Watchdog {
  /** A worker message arrived (or work started): restart the countdown. */
  kick(): void;
  stop(): void;
}

/** The part of `document` the pause needs. */
export interface WatchdogDoc {
  readonly hidden: boolean;
  addEventListener(type: 'visibilitychange', fn: () => void): void;
}

export function createWatchdog(onFire: () => void, ms: number = WATCHDOG_MS, deps: { doc?: WatchdogDoc | null } = { doc: globalThis.document }): Watchdog {
  const doc = deps.doc ?? null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** kick() was called and neither stop() nor the fire followed: the countdown runs, or waits for visible. */
  let armed = false;
  const clear = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const arm = (): void => {
    clear();
    timer = setTimeout(() => {
      timer = null;
      armed = false;
      onFire();
    }, ms);
  };
  doc?.addEventListener('visibilitychange', () => {
    if (!armed) return;
    if (doc.hidden) clear();
    else arm();
  });
  return {
    kick() {
      armed = true;
      if (doc?.hidden) clear();
      else arm();
    },
    stop() {
      armed = false;
      clear();
    },
  };
}
