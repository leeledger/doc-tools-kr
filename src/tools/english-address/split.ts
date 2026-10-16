// 영문주소 변환기: the official English road address split into the fields of an overseas shopping form (ADDREN1016
// decision 10). Pure; nothing is romanised here: every value is a piece of what 행정안전부 returned.
//
// Sources (fetched 2026-10-16):
// - V7 주소정보누리집 「도로명주소 영문 표기방법」 (https://www.juso.go.kr/introduction/RoadAddress): written from the
//   small unit to the large one; 상세주소 first (`705-dong 1104-ho, 56 Dalgubeol-daero 323beon-gil, Suseong-gu, Daegu`).
// - V8 UPU, Korea (Rep.) (https://www.upu.int/UPU/media/upu/PostalEntitiesFiles/addressingUnit/korEn.pdf, 03/2016):
//   building + door / premises + street (+ eup/myeon) + sub-province / province + postcode / REP. OF KOREA.

/** One search result (the Function's whitelisted fields). */
export interface AddrItem {
  road: string;
  jibun: string;
  zip: string;
  si: string;
  sgg: string;
  emd: string;
  kor: string;
}

export const COUNTRY = 'South Korea';

export interface SplitRows {
  /** Building number + road (+ eup/myeon): `road` without the trailing sub-province and province. */
  line1: string;
  /** The sub-province (`sgg`), or the province when there is none (세종). */
  city: string;
  state: string;
  zip: string;
  country: string;
  /** `road` did not have the expected shape: line1 is the whole road address; the page puts the one-line copy first. */
  fallback: boolean;
}

/** Where `, {part}` starts in `road` as a whole comma-separated part (followed by a comma or the end), or -1. */
function partAt(road: string, part: string): number {
  const needle = `, ${part}`;
  for (let i = road.indexOf(needle); i > 0; i = road.indexOf(needle, i + 1)) {
    const end = i + needle.length;
    if (end === road.length || road[end] === ',') return i;
  }
  return -1;
}

export function splitRoad(item: Pick<AddrItem, 'road' | 'si' | 'sgg' | 'zip'>): SplitRows {
  const { road, si, sgg, zip } = item;
  const city = sgg || si;
  const base = { city, state: si, zip, country: COUNTRY };
  const suffix = sgg ? `, ${sgg}, ${si}` : `, ${si}`;
  if (si && road.length > suffix.length && road.endsWith(suffix)) return { ...base, line1: road.slice(0, -suffix.length), fallback: false };
  const at = city ? partAt(road, city) : -1;
  if (at > 0) return { ...base, line1: road.slice(0, at), fallback: false };
  return { ...base, line1: road, fallback: true };
}

/** The whole address on one line: [상세주소, ] road address + postcode (V7 small to large; V8 province + postcode). */
export function fullLine(road: string, zip: string, line2 = ''): string {
  return `${line2 ? `${line2}, ` : ''}${road}${zip ? ` ${zip}` : ''}`;
}
