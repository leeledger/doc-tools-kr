// 영문주소 변환기: the optional 상세주소 (동·층·호) the visitor types, written the official way on the device (ADDREN1016
// decision 10; never sent anywhere).
// V7 주소정보누리집 「도로명주소 영문 표기방법」 (fetched 2026-10-16): `705-dong 1104-ho`; 동·층·호 로마자 표기 원칙,
// 널리 쓰는 영어식 '층' -> 'F', '지하' -> 'B'. V8 UPU Korea (Rep.): `101-dong 103-ho`, basement `B`.

export interface Detail {
  /** The converted line 2 ('' when nothing was typed or when it needs the visitor's own English). */
  line2: string;
  /** Hangul other than 동·층·호·지하 is left: line 2 is not copyable; the page asks for the English by hand. */
  needsManual: boolean;
}

const RULES: [RegExp, (n: string) => string][] = [
  [/지하\s*(\d+)\s*층/g, (n) => `B${n}F`],
  [/지하\s*(\d+)\s*호/g, (n) => `B${n}-ho`],
  [/(\d+)\s*동/g, (n) => `${n}-dong`],
  [/(\d+)\s*층/g, (n) => `${n}F`],
  [/(\d+)\s*호/g, (n) => `${n}-ho`],
];

/**
 * `101동 1203호` -> `101-dong 1203-ho`; `지하1층` -> `B1F`; `지하 3호` -> `B3-ho`; `3층` -> `3F`. Latin letters, digits,
 * `-`, `,` and spaces stay as typed, in the typed order; other symbols are dropped. Any other Hangul -> needsManual.
 */
export function convertDetail(raw: string): Detail {
  let s = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  for (const [re, to] of RULES) s = s.replace(re, (_, n: string) => ` ${to(n)} `);
  if (/[ᄀ-ᇿ㄰-㆏가-힣]/.test(s)) return { line2: '', needsManual: true };
  const line2 = s
    .replace(/[^A-Za-z0-9\-, ]/g, ' ')
    .replace(/ +/g, ' ')
    .replace(/ ,/g, ',')
    .replace(/^[ ,]+|[ ,]+$/g, '');
  return { line2, needsManual: false };
}
