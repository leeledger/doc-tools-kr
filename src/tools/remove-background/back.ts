// IDCAM1022 D8b: the result's 「이력서 사진 규격 맞추기」 (shown by entry.ts when the address carries ?preset=). Its own
// lazy chunk, loaded on that press only, so the controller's budget carries none of it: the picture goes to
// /id-photo/?preset=<allowed id> through the 이어서 하기 store (from remove-background, so /id-photo/ blocks it for
// passport and driver's licence, D8c). Nothing is sent anywhere. entry.ts disables the button and reports failures.
import { idPhotoBack } from '../../lib/idphoto/bglink';
import { sendTo } from '../../lib/ui/handoff';
import { track } from '../../lib/ui/usage';
import type { Picture } from './bg';

/** Stores the result for /id-photo/ and opens it with `preset` (allowlisted by idPhotoBack); `failed` otherwise. */
export async function goBack(picture: Picture, preset: string, failed: () => void): Promise<void> {
  try {
    const p = await picture();
    if (
      p &&
      (await sendTo('id-photo', 'remove-background', p.blob, p.name, p.blob.type, (path) => {
        track({ e: 'next', t: 'remove-background', o: 'next', v: 'id-photo' });
        location.assign(idPhotoBack(path, preset));
      }))
    )
      return;
  } catch {
    // Reported below.
  }
  failed();
}
