// 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
// The worker watchdog (brief Step 5 "Flow": no worker message for 90 s → terminate → error timeout). Pure
// apart from the timer functions, which tests replace with fake timers.
export const WATCHDOG_MS = 90_000;

export interface Watchdog {
  /** A worker message arrived (or work started): restart the countdown. */
  kick(): void;
  stop(): void;
}

export function createWatchdog(onFire: () => void, ms: number = WATCHDOG_MS): Watchdog {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stop = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  return {
    kick() {
      stop();
      timer = setTimeout(() => {
        timer = null;
        onFire();
      }, ms);
    },
    stop,
  };
}
