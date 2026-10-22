// 증명사진 촬영 -> 여권·증명사진 규격 맞추기 (IDCAM1022 D2): the photo waits in the 이어서 하기 store (IndexedDB, 10 min, on
// this device) and /id-photo/?preset=<id> opens it. The store code loads on the first hand-over only. false: nothing
// opened (storage blocked or full); the caller offers 「사진 저장」 instead.
import { getPreset, DEFAULT_PRESET } from '../../data/id-photo-presets';
import { track } from '../../lib/ui/usage';

export const SLUG = 'id-photo-camera';

/** The /id-photo/ address for `preset` (an unknown id falls back to the default preset). */
export function idPhotoUrl(path: string, preset: string): string {
  const id = getPreset(preset)?.id ?? DEFAULT_PRESET;
  return `${path}?preset=${encodeURIComponent(id)}`;
}

export async function sendToIdPhoto(blob: Blob, name: string, type: string, preset: string, assign: (url: string) => void = (u) => window.location.assign(u)): Promise<boolean> {
  try {
    const { sendTo } = await import('../../lib/ui/handoff');
    return await sendTo('id-photo', SLUG, blob, name, type, (path) => {
      track({ e: 'next', t: SLUG, o: 'next', v: 'id-photo' });
      assign(idPhotoUrl(path, preset));
    });
  } catch {
    return false;
  }
}
