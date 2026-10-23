// 증명사진 촬영 -> 사진 배경 지우기 -> 여권·증명사진 규격 맞추기 (IDCAM1022 D8b). Pure: the camera page, /remove-background/
// and the unit tests share it. Only the 제출처 no cited rule forbids an edited background may take this way: the 이력서
// group (saramin, jobkorea) and 반명함 (half_card, 기타). custom is on the D8b list too, but no address can carry it
// (/id-photo/ deep links never take custom), so it goes on as saramin. Passport and driver's licence ids never pass:
// whatever arrives, the link back to /id-photo/ names an allowed id, and /id-photo/ still blocks those two when the
// photo came from 배경 지우기 (D8c, warnings.ts).

/** The preset ids whose photo may go through 배경 지우기 and come back with that id. */
export const BG_PRESETS: readonly string[] = ['saramin', 'jobkorea', 'half_card'];
/** The 제출처 used when the incoming id is not allowed (or is custom). */
export const BG_FALLBACK = 'saramin';

/** Whether the 「배경을 흰색으로 바꾸기」 offer applies to `id` (D8b: 이력서, 기타 반명함, custom). */
export const bgOffered = (id: string): boolean => id === 'custom' || BG_PRESETS.includes(id);

/** The allowed id to pass on: `raw` itself when allowed, else saramin. */
export const bgPreset = (raw: string | null | undefined): string => (raw && BG_PRESETS.includes(raw) ? raw : BG_FALLBACK);

export interface BgLink {
  /** ?bg=white: the result opens on the white background. */
  white: boolean;
  /** ?preset=<id> (allowlisted, else saramin), or null when the address has none: no link back to /id-photo/. */
  preset: string | null;
}

/** What /remove-background/ reads from its address. */
export function parseBgLink(search: string): BgLink {
  const p = new URLSearchParams(search);
  return { white: p.get('bg') === 'white', preset: p.has('preset') ? bgPreset(p.get('preset')) : null };
}

/** The /remove-background/ address the camera page opens for `preset` (an allowed id; else saramin). */
export const bgUrl = (path: string, preset: string): string => `${path}?bg=white&preset=${bgPreset(preset)}`;

/** The /id-photo/ address the 배경 지우기 result links to. */
export const idPhotoBack = (path: string, preset: string): string => `${path}?preset=${bgPreset(preset)}`;
