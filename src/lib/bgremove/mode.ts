// The remembered choice "사진을 보내지 않고 기기에서 처리" (C2-cloud, brief §4): localStorage
// `docttak-bg-mode=device`. Only this word is stored, never anything about a photo. Storage that throws (private
// mode, blocked) means "not chosen": the page asks again.
export const MODE_KEY = 'docttak-bg-mode';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function store(): Store | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function deviceChosen(s: Store | null = store()): boolean {
  try {
    return s?.getItem(MODE_KEY) === 'device';
  } catch {
    return false;
  }
}

export function chooseDevice(on: boolean, s: Store | null = store()): void {
  try {
    if (on) s?.setItem(MODE_KEY, 'device');
    else s?.removeItem(MODE_KEY);
  } catch {
    // Not remembered; the choice still holds for this photo.
  }
}
