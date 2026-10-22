// 증명사진 촬영 -> 여권·증명사진 규격 맞추기 (IDCAM1022 D2): the photo waits in the 이어서 하기 store (IndexedDB, 10 min, on
// this device) and /id-photo/?preset=<id> opens it. The store code loads on the first hand-over only. false: nothing
// opened (storage blocked or full); the caller offers 「사진 저장」 instead.
import { getPreset, DEFAULT_PRESET } from '../../data/id-photo-presets';
import { bgUrl } from '../../lib/idphoto/bglink';
import { track, type UsageTool } from '../../lib/ui/usage';

export const SLUG = 'id-photo-camera';

/** The /id-photo/ address for `preset` (an unknown id falls back to the default preset). */
export function idPhotoUrl(path: string, preset: string): string {
  const id = getPreset(preset)?.id ?? DEFAULT_PRESET;
  return `${path}?preset=${encodeURIComponent(id)}`;
}

type Assign = (url: string) => void;
const go: Assign = (u) => window.location.assign(u);

async function send(to: UsageTool, blob: Blob, name: string, type: string, url: (path: string) => string, assign: Assign): Promise<boolean> {
  try {
    const { sendTo } = await import('../../lib/ui/handoff');
    return await sendTo(to, SLUG, blob, name, type, (path) => {
      track({ e: 'next', t: SLUG, o: 'next', v: to });
      assign(url(path));
    });
  } catch {
    return false;
  }
}

export const sendToIdPhoto = (blob: Blob, name: string, type: string, preset: string, assign: Assign = go): Promise<boolean> =>
  send('id-photo', blob, name, type, (path) => idPhotoUrl(path, preset), assign);

/**
 * D8b (only called in a build with 배경 지우기, __BG_REMOVE__): the still goes to /remove-background/?bg=white&preset=<id>,
 * which opens it and waits for the user's tap there; nothing is sent from this page.
 */
export const sendToBg = (blob: Blob, name: string, type: string, preset: string, assign: Assign = go): Promise<boolean> =>
  send('remove-background', blob, name, type, (path) => bgUrl(path, preset), assign);
