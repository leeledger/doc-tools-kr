// 여권·증명사진 presets (brief Step 4 "Presets" — the data contract). Every shipped preset carries its source
// URLs, the verbatim quote from the official page and the retrieval date (BUILD-LOG Step 4, 0.1). Values
// that are our own choice are marked in `note`. Dropped (확인 필요): 주민등록증, 운전면허증, TOEIC, 고용24,
// 지방공무원 — see FAQ 4 and BUILD-LOG Known Gaps.

export type PresetStatus = 'official' | 'arithmetic' | 'user';
/** "이하" → KB × 1000; "미만" → KB × 1000 − 1 (the Step 3 convention: safe under both 1000 and 1024). */
export type LimitRule = 'le' | 'lt' | null;

export interface HeadBand {
  /** `official`: the agency's rule (passport only); `reference`: the passport ratio as a guide. */
  kind: 'official' | 'reference';
  /** Head length (crown to chin) as a fraction of the output height. */
  minFrac: number;
  maxFrac: number;
}

export interface IdPreset {
  id: string;
  /** UI label (select option). */
  label: string;
  /** Short agency name for the source line. */
  source: string;
  outW: number;
  outH: number;
  /** Pixel range the destination accepts, when published. */
  pxRange?: { w: [number, number]; h: [number, number] };
  limitBytes?: number;
  limitRule: LimitRule;
  /** Physical print size, when the destination states one. */
  mm?: { w: number; h: number };
  headBand: HeadBand;
  /** JFIF density written into the output (dots per inch). */
  dpi: number;
  /** ASCII tag of the output file name: `{fileTag}_{w}x{h}.jpg`. */
  fileTag: string;
  status: PresetStatus;
  sourceUrls: string[];
  quote?: string;
  /** ISO date (YYYY-MM-DD) the sources were read. */
  retrieved: string;
  note?: string;
}

export const RETRIEVED = '2026-09-29';
/** 32–36 mm of a 45 mm-high photo (passport.go.kr menuPos=32). */
export const PASSPORT_BAND = { minFrac: 32 / 45, maxFrac: 36 / 45 } as const;
const reference: HeadBand = { kind: 'reference', ...PASSPORT_BAND };

/** "이하" (≤) or "미만" (<) KB limit in bytes. */
export function limitBytes(kb: number, rule: 'le' | 'lt'): number {
  return rule === 'le' ? kb * 1000 : kb * 1000 - 1;
}

/** JFIF density that prints `px` at `mm` (rounded dpi). */
export const dpiFor = (px: number, mm: number): number => Math.round((px * 25.4) / mm);

export const PASSPORT_CHECK_URL = 'https://www.passport.go.kr/home/kor/onlinePhotoVerify/index.do?menuPos=33';
export const PASSPORT_RULE_URL = 'https://www.passport.go.kr/home/kor/contents.do?menuPos=32';

export const PRESETS: readonly IdPreset[] = [
  {
    id: 'passport_online',
    label: '여권 (온라인 신청·정부24)',
    source: '외교부 여권안내',
    outW: 413,
    outH: 531,
    pxRange: { w: [395, 431], h: [507, 550] },
    limitBytes: limitBytes(500, 'le'),
    limitRule: 'le',
    mm: { w: 35, h: 45 },
    headBand: { kind: 'official', ...PASSPORT_BAND },
    dpi: 300,
    fileTag: 'passport',
    status: 'official',
    sourceUrls: [
      'https://www.passport.go.kr/home/kor/contents.do?menuPos=12',
      PASSPORT_RULE_URL,
      'https://www.gov.kr/portal/service/serviceInfo/126200000030',
    ],
    quote:
      '파일 크기 500KB 이하, 파일 형식 JPG/JPEG 가로 413 픽셀(pixel), 세로 531 픽셀 사이즈 권장(가로 395~431 픽셀, 세로 507~550 픽셀 이내만 업로드 가능) 해상도는 300dpi 권장 / 머리 길이는 정수리(머리카락을 제외한 머리 최상부)부터 턱까지 3.2~3.6cm 사이인 사진을 제출해야 함',
    retrieved: RETRIEVED,
  },
  {
    id: 'gosi',
    label: '국가공무원 시험 (공무원 채용시스템)',
    source: '인사혁신처 공무원 채용시스템',
    outW: 137,
    outH: 177,
    limitBytes: limitBytes(350, 'lt'),
    limitRule: 'lt',
    mm: { w: 35, h: 45 },
    headBand: reference,
    dpi: dpiFor(137, 35),
    fileTag: 'gosi',
    status: 'official',
    sourceUrls: ['https://gongmuwon.gosi.kr/oprut/AppApAplfSbmsnAplfRcptGd.do'],
    quote: '응시원서 등록용 사진파일(JPG, PNG) 규격 크기 3.5cm x 4.5cm(137 x 177 pixel) 기준 파일용량 350KB 미만(중증장애인 선발시험 제외)',
    retrieved: RETRIEVED,
  },
  {
    id: 'qnet',
    label: 'Q-Net 자격시험 원서',
    source: '한국산업인력공단 Q-Net',
    outW: 413,
    outH: 531,
    limitBytes: limitBytes(200, 'le'),
    limitRule: 'le',
    headBand: reference,
    dpi: 300,
    fileTag: 'qnet',
    status: 'official',
    sourceUrls: ['https://www.q-net.or.kr/qnet/html/guideQnet/guide_02.html'],
    quote: '파일형식 : *.JPG 또는 *.JPEG · 파일용량 : 200KB 이하',
    retrieved: RETRIEVED,
    note: 'Q-Net은 픽셀 크기를 정하지 않아 여권 온라인 규격(413×531)으로 맞춥니다.',
  },
  {
    id: 'saramin',
    label: '사람인 이력서',
    source: '사람인 고객센터',
    outW: 100,
    outH: 140,
    limitBytes: limitBytes(10_000, 'le'),
    limitRule: 'le',
    headBand: reference,
    dpi: 96,
    fileTag: 'saramin',
    status: 'official',
    sourceUrls: ['https://www.saramin.co.kr/zf_user/help/help-word/view?idx=524'],
    quote: '1. 용량 : 10MB 2. 파일형태 : .jpg .gif 3. 권장 크기 : 100 x 140 픽셀',
    retrieved: RETRIEVED,
  },
  {
    id: 'jobkorea',
    label: '잡코리아 이력서',
    source: '잡코리아 고객센터',
    outW: 150,
    outH: 210,
    limitBytes: limitBytes(5_000, 'le'),
    limitRule: 'le',
    headBand: reference,
    dpi: 96,
    fileTag: 'jobkorea',
    status: 'official',
    sourceUrls: ['https://www.jobkorea.co.kr/help/faq/user?tab=2'],
    quote: '1. 이미지 사이즈가 150px * 210px 초과하는 경우 … 업로드 파일 확장자 : gif, jpg, jpeg, png - 업로드 용량은 5MB 이내',
    retrieved: RETRIEVED,
    note: '150×210은 최대 크기입니다.',
  },
  {
    id: 'half_card',
    label: '반명함판 3×4 cm (일반 크기, 기관 규격 아님)',
    source: '계산값',
    outW: 354,
    outH: 472,
    limitRule: null,
    mm: { w: 30, h: 40 },
    headBand: reference,
    dpi: 300,
    fileTag: 'halfcard',
    status: 'arithmetic',
    sourceUrls: [],
    retrieved: RETRIEVED,
    note: '3 cm를 해상도 300으로 계산한 크기: 354×472픽셀 (계산값)',
  },
];

export const DEFAULT_PRESET = 'passport_online';

export const CUSTOM_BOUNDS = { minPx: 50, maxPx: 2000, minKb: 10, maxKb: 10_000 } as const;

/** 직접 입력: w × h px, optional KB limit (× 1000, "이하"). Null when out of bounds. */
export function customPreset(w: number, h: number, kb?: number | null): IdPreset | null {
  const { minPx, maxPx, minKb, maxKb } = CUSTOM_BOUNDS;
  const int = (v: number): boolean => Number.isInteger(v);
  if (!int(w) || !int(h) || w < minPx || w > maxPx || h < minPx || h > maxPx) return null;
  if (kb !== undefined && kb !== null && (!int(kb) || kb < minKb || kb > maxKb)) return null;
  return {
    id: 'custom',
    label: '직접 입력',
    source: '직접 입력',
    outW: w,
    outH: h,
    ...(kb ? { limitBytes: limitBytes(kb, 'le') } : {}),
    limitRule: kb ? 'le' : null,
    headBand: reference,
    dpi: 96,
    fileTag: 'photo',
    status: 'user',
    sourceUrls: [],
    retrieved: RETRIEVED,
  };
}

/** `passport_413x531.jpg`, `photo_200x250.jpg`: ASCII only, so no user file name leaks. */
export const outputName = (p: IdPreset): string => `${p.fileTag}_${p.outW}x${p.outH}.jpg`;

export const getPreset = (id: string): IdPreset | undefined => PRESETS.find((p) => p.id === id);

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Schema problems of a shipped preset (empty when valid). The build and the unit tests run this. */
export function validatePreset(p: IdPreset): string[] {
  const e: string[] = [];
  const status: string = p.status;
  if (!['official', 'arithmetic', 'user'].includes(status)) e.push(`${p.id}: status "${status}" is not shippable`);
  if (!ISO.test(p.retrieved) || Number.isNaN(Date.parse(p.retrieved))) e.push(`${p.id}: retrieved is not an ISO date`);
  if (p.status === 'official') {
    if (!p.sourceUrls.length) e.push(`${p.id}: official preset without a source URL`);
    if (!p.quote) e.push(`${p.id}: official preset without a quote`);
  }
  for (const u of p.sourceUrls) if (!/^https:\/\//.test(u)) e.push(`${p.id}: source URL is not https: ${u}`);
  if (!/^[a-z0-9]+$/.test(p.fileTag)) e.push(`${p.id}: fileTag must be lowercase ASCII`);
  if (!Number.isInteger(p.outW) || !Number.isInteger(p.outH) || p.outW < 1 || p.outH < 1) e.push(`${p.id}: output size`);
  if (p.pxRange && (p.outW < p.pxRange.w[0] || p.outW > p.pxRange.w[1] || p.outH < p.pxRange.h[0] || p.outH > p.pxRange.h[1])) {
    e.push(`${p.id}: output size outside the accepted range`);
  }
  if (p.mm && Math.abs(p.outW / p.outH / (p.mm.w / p.mm.h) - 1) > 0.015) e.push(`${p.id}: aspect differs from the print size by > 1.5 %`);
  if ((p.limitRule === null) !== (p.limitBytes === undefined)) e.push(`${p.id}: limitRule and limitBytes disagree`);
  if (!(p.headBand.minFrac > 0 && p.headBand.minFrac < p.headBand.maxFrac && p.headBand.maxFrac < 1)) e.push(`${p.id}: head band`);
  if (p.headBand.kind === 'official' && p.id !== 'passport_online') e.push(`${p.id}: only the passport band is official`);
  return e;
}

/** Days since `retrieved` (the check-dist staleness warning uses > 180). */
export function ageDays(p: IdPreset, now: Date = new Date()): number {
  return Math.floor((now.getTime() - Date.parse(`${p.retrieved}T00:00:00Z`)) / 86_400_000);
}

/** "여권 (온라인 신청·정부24) 413×531 픽셀·500 KB 이하, …" for FAQ 4: the numbers come from the data. */
export function presetSummary(): string {
  const kb = (p: IdPreset): string => {
    if (p.limitBytes === undefined || p.limitRule === null) return '';
    const v = p.limitRule === 'lt' ? (p.limitBytes + 1) / 1000 : p.limitBytes / 1000;
    const txt = v >= 1000 && v % 1000 === 0 ? `${(v / 1000).toLocaleString('ko-KR')} MB` : `${v.toLocaleString('ko-KR')} KB`;
    return `·${txt} ${p.limitRule === 'lt' ? '미만' : '이하'}`;
  };
  const one = (p: IdPreset): string => `${p.label.replace(/ \(일반 크기, 기관 규격 아님\)$/, '')} ${p.outW}×${p.outH} 픽셀${kb(p)}${p.status === 'arithmetic' ? '(계산값)' : ''}`;
  return `${PRESETS.map(one).join(', ')}입니다.`;
}
