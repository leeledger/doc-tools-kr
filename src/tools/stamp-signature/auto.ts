// 전자서명·도장 이미지: the automatic 진하기 ladder (REQ1014-B D15). Pure. When the first result of a newly loaded
// photo finds no ink (a faint pen) or reads the whole paper as ink (a dark photo) while 진하기 is still 보통, the
// photo tab re-runs the key on the cached planes at these steps (within the slider's own range) and keeps the first
// one that passes the area check. A user's own slider or mode change never starts it.
import type { InkStatus } from '../../lib/ink/key';

export function autoLadder(status: InkStatus): readonly number[] {
  if (status === 'noink') return [1, 2];
  if (status === 'allpaper') return [-1, -2];
  return [];
}
