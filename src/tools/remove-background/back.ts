// IDCAM1022 D8b: the result's 「이력서 사진 규격 맞추기」 (shown by entry.ts when the address carries ?preset=). Its own
// lazy chunk, loaded on that press only, so the controller's budget carries none of it: the picture goes to
// /id-photo/?preset=<allowed id> through the 이어서 하기 store (from remove-background, so /id-photo/ blocks it for
// passport and driver's licence, D8c). Nothing is sent anywhere.
import { idPhotoBack } from '../../lib/idphoto/bglink';
import { announce } from '../../lib/ui/announce';
import { sendTo } from '../../lib/ui/handoff';
import { track } from '../../lib/ui/usage';
import type { Picture } from './bg';

export const BACK_FAILED = '사진을 넘기지 못했어요. 흰색 배경으로 내려받은 뒤 여권·증명사진 규격 맞추기에서 골라 주세요.';

/** Stores the result for /id-photo/ and opens it with `preset` (allowlisted by idPhotoBack); otherwise says why. */
export async function goBack(btn: HTMLButtonElement, picture: Picture, preset: string): Promise<void> {
  btn.disabled = true;
  let ok = false;
  try {
    const p = await picture();
    ok = !!p && (await sendTo('id-photo', 'remove-background', p.blob, p.name, p.blob.type, (path) => {
      track({ e: 'next', t: 'remove-background', o: 'next', v: 'id-photo' });
      location.assign(idPhotoBack(path, preset));
    }));
  } catch {
    ok = false;
  }
  if (ok) return;
  btn.disabled = false;
  const box = document.getElementById('bg-error');
  if (box) {
    box.textContent = BACK_FAILED;
    box.hidden = false;
  }
  announce('alert', BACK_FAILED, document.getElementById('bg-tool') ?? document);
}
