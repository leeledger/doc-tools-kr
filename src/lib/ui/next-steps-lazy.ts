// 이어서 하기 for a tool controller whose budget has no room for next-steps.ts (check-dist): import this file
// dynamically when the result is shown. A function of its own, not a re-export: a dynamic import of the shared
// next-steps chunk itself needs a namespace helper that the bundler places in an unrelated chunk (seen: the HWP export
// chunk, which check-dist then counted into every page that uses next-steps).
import { showNextSteps } from './next-steps';

export function showNextStepsLater(...args: Parameters<typeof showNextSteps>): void {
  showNextSteps(...args);
}
