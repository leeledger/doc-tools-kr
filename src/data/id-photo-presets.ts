// 여권·증명사진 presets (brief Step 4 "Presets" — the data contract). Every shipped preset carries its source
// URLs, the verbatim quote from the official page and the retrieval date (BUILD-LOG Step 4, 0.1). Values
// that are our own choice are marked in `note`. Dropped (확인 필요): TOEIC, 고용24, 지방공무원 — see BUILD-LOG
// Known Gaps. G2 A2 added history, korcham, teps, kuksiwon (no print size where the source's pixels do not match
// it within 1.5 %, or where it says "약"). TOOLS4 T1 added the `print` kind (주민등록증: the source states only a
// paper size), 운전면허증 (official: the 도로교통공단 photo rule, read from its image alt text) and the select
// groups; no visa preset (BUILD-LOG "TOOLS4 Step 0"; owner decision 2026-10-06).

import { DEFAULT_PRESET_ID } from './preset-ids';

/**
 * `official`: the source states the file spec. `print`: the source states only a paper size (mm); the pixels are
 * that size at 300 ppi and the result screen says to print it. `arithmetic`: our own general size. `user`: 직접 입력.
 */
export type PresetStatus = 'official' | 'print' | 'arithmetic' | 'user';
/** The 제출처 select's groups, in display order (an empty group is not rendered). */
export const PRESET_GROUPS = ['여권·신분증', '비자', '시험·원서', '이력서', '기타'] as const;
export type PresetGroup = (typeof PRESET_GROUPS)[number];
/** "이하" → KB × 1000; "미만" → KB × 1000 − 1 (the Step 3 convention: safe under both 1000 and 1024). */
export type LimitRule = 'le' | 'lt' | null;

export interface HeadBand {
  /** `official`: the source's own head rule (quoted in `bandQuote`); `reference`: the passport ratio as a guide. */
  kind: 'official' | 'reference';
  /** Head length (top to chin) as a fraction of the output height. */
  minFrac: number;
  maxFrac: number;
  /** Where the head length starts: `crown` = 정수리(머리카락 제외); `hair` = 머리카락 포함 (some visa rules). */
  measure: 'crown' | 'hair';
  /** The source's head rule, verbatim; part of `quote` so the quote check covers it. Required for `official`. */
  bandQuote?: string;
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
  group: PresetGroup;
  sourceUrls: string[];
  quote?: string;
  /** ISO date (YYYY-MM-DD) the sources were read. */
  retrieved: string;
  note?: string;
}

export const RETRIEVED = '2026-09-29';
/** The G2 A2 presets (history, korcham, teps, kuksiwon) were read on this date. */
export const A2_RETRIEVED = '2026-10-02';
/** The TOOLS4 T1 presets (id_card, driver_license) were read on this date. */
export const T1_RETRIEVED = '2026-10-06';
/** 32–36 mm of a 45 mm-high photo (passport.go.kr menuPos=32). */
export const PASSPORT_BAND = { minFrac: 32 / 45, maxFrac: 36 / 45 } as const;
const reference: HeadBand = { kind: 'reference', measure: 'crown', ...PASSPORT_BAND };
/** Print presets are 300 ppi (brief TOOLS4 decision 6). */
export const PRINT_PPI = 300;
/** Pixels of `mm` at the print resolution. */
export const printPx = (mm: number): number => Math.round((mm * PRINT_PPI) / 25.4);
/** "3.5×4.5 cm" of a print size. */
export const cmLabel = (mm: { w: number; h: number }): string => `${mm.w / 10}×${mm.h / 10} cm`;
/** A preset whose numbers come from an official page (the guides and the quote check treat both as sourced). */
export const isSourced = (p: IdPreset): boolean => p.status === 'official' || p.status === 'print';

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
    headBand: {
      kind: 'official',
      measure: 'crown',
      ...PASSPORT_BAND,
      bandQuote: '머리 길이는 정수리(머리카락을 제외한 머리 최상부)부터 턱까지 3.2~3.6cm 사이인 사진을 제출해야 함',
    },
    dpi: 300,
    fileTag: 'passport',
    status: 'official',
    group: '여권·신분증',
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
    id: 'id_card',
    label: '주민등록증 (인화용 3.5×4.5 cm)',
    source: '정부24',
    outW: printPx(35),
    outH: printPx(45),
    limitRule: null,
    mm: { w: 35, h: 45 },
    headBand: reference,
    dpi: PRINT_PPI,
    fileTag: 'idcard',
    status: 'print',
    group: '여권·신분증',
    sourceUrls: ['https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=13100000013', 'https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=13100000018'],
    quote: '6개월 이내에 촬영한 3.5㎝×4.5㎝의 모자 등을 쓰지 않은 상반신 사진 1장',
    retrieved: T1_RETRIEVED,
    note: '정부24는 종이 사진 크기만 정합니다. 그 크기로 인화할 수 있게 맞춥니다.',
  },
  {
    id: 'driver_license',
    label: '운전면허증 (적성검사·갱신)',
    source: '도로교통공단 안전운전 통합민원',
    outW: 413,
    outH: 531,
    pxRange: { w: [395, 431], h: [507, 550] },
    limitBytes: limitBytes(500, 'le'),
    limitRule: 'le',
    mm: { w: 35, h: 45 },
    headBand: {
      kind: 'official',
      measure: 'crown',
      ...PASSPORT_BAND,
      bandQuote: '머리 길이가 정수리(머리 최상부)부터 턱까지 3.2~3.6cm 사이인 사진',
    },
    dpi: 300,
    fileTag: 'license',
    status: 'official',
    group: '여권·신분증',
    // The rule popup (its text is the alt of one image; check:quotes reads alt text since TOOLS4 round 2) is opened
    // by the 「허용되는 사진 규격」 button on the guide page, which is listed first as the link people see.
    sourceUrls: ['https://www.safedriving.or.kr/diGuide/selectDiGuide01.do?menuCd=MN-PO-1211', 'https://www.safedriving.or.kr/commonManage/selectCommonPhotoRulePop.do'],
    quote:
      '6개월 이내 촬영한 컬러 사진 (규격 3.5cm*4.5cm, 여권용) / 머리 길이가 정수리(머리 최상부)부터 턱까지 3.2~3.6cm 사이인 사진 … 온라인 신청시:파일 크기 500KB 이하의 JPG파일, 가로 413 픽셀(pixel), 세로 531 픽셀 권장, *가로 395~431, 세로 507~550 필셀 이내만 업로드 가능, 300dpi 해상도 권장',
    retrieved: T1_RETRIEVED,
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
    group: '시험·원서',
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
    group: '시험·원서',
    sourceUrls: ['https://www.q-net.or.kr/qnet/html/guideQnet/guide_02.html'],
    quote: '파일형식 : *.JPG 또는 *.JPEG · 파일용량 : 200KB 이하',
    retrieved: RETRIEVED,
    note: 'Q-Net은 픽셀 크기를 정하지 않아 여권 온라인 규격(413×531)으로 맞춥니다.',
  },
  {
    id: 'history',
    label: '한국사능력검정시험 원서',
    source: '한국사능력검정시험',
    outW: 120,
    outH: 160,
    limitRule: null,
    headBand: reference,
    dpi: 96,
    fileTag: 'history',
    status: 'official',
    group: '시험·원서',
    sourceUrls: ['https://www.historyexam.go.kr/pst/view.do?bbs=faq&pst_sno=1000015355'],
    quote: '규정 사진 파일은 GIF와 JPG형식의 이미지 파일만 가능하며, 이미지의 권장크기는 가로 120픽셀 X 세로 160픽셀입니다.(약 가로 3cm X 세로 4cm)',
    retrieved: A2_RETRIEVED,
    note: '120×160은 권장 크기입니다.',
  },
  {
    id: 'korcham',
    label: '대한상공회의소 자격시험 원서',
    source: '대한상공회의소',
    outW: 400,
    outH: 500,
    limitRule: null,
    headBand: reference,
    dpi: 96,
    fileTag: 'korcham',
    status: 'official',
    group: '시험·원서',
    sourceUrls: ['https://license.korcham.net/customer/guideDetail.do?no=194&pg=1&cd=10'],
    quote: '사진파일은 JPG, JPEG, PNG, GIF만 가능합니다. - 사진 크기는 400 x 500 픽셀로 변경되며 1 : 1.25 비율로 맞춰주셔야 사진이 정상적으로 보입니다.',
    retrieved: A2_RETRIEVED,
  },
  {
    id: 'teps',
    label: 'TEPS 원서',
    source: 'TEPS관리위원회',
    outW: 126,
    outH: 165,
    limitBytes: limitBytes(50, 'le'),
    limitRule: 'le',
    headBand: reference,
    dpi: 96,
    fileTag: 'teps',
    status: 'official',
    group: '시험·원서',
    sourceUrls: ['https://www.teps.or.kr/Etc2/FaqList?sch_faqType=09'],
    quote: '반드시 증명사진을 스캔하여 3Cm × 4Cm(126*165 Pixel) 사이즈, 파일 크기는 50KB 이하의 jpg 파일만 사용 가능 합니다.',
    retrieved: A2_RETRIEVED,
  },
  {
    id: 'kuksiwon',
    label: '보건의료인 국가시험 원서',
    source: '한국보건의료인국가시험원',
    outW: 276,
    outH: 354,
    limitRule: null,
    mm: { w: 35, h: 45 },
    headBand: reference,
    dpi: dpiFor(276, 35),
    fileTag: 'kuksiwon',
    status: 'official',
    group: '시험·원서',
    sourceUrls: ['https://www.kuksiwon.or.kr/faq/brd/m_52/view.do?seq=60', 'https://www.kuksiwon.or.kr/faq/brd/m_52/view.do?seq=13'],
    quote: '사진의 올바른 규격은 가로 276px, 354px(3.5cm ×4.5cm), 해상도 200dpi이상 입니다. … 모자를 쓰지 않고 정면을 바라본 상반신 컬러사진 파일(6개월 이내 촬영분, 276X354픽셀 이상 JPG, PNG 형식)',
    retrieved: A2_RETRIEVED,
    note: '276×354는 최소 크기입니다.',
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
    group: '이력서',
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
    group: '이력서',
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
    group: '기타',
    sourceUrls: [],
    retrieved: RETRIEVED,
    note: '3 cm를 해상도 300으로 계산한 크기: 354×472픽셀 (계산값)',
  },
];

export const DEFAULT_PRESET = DEFAULT_PRESET_ID;

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
    group: '기타',
    sourceUrls: [],
    retrieved: RETRIEVED,
  };
}

/** `passport_413x531.jpg`, `photo_200x250.jpg`: ASCII only, so no user file name leaks. */
export const outputName = (p: IdPreset): string => `${p.fileTag}_${p.outW}x${p.outH}.jpg`;

export const getPreset = (id: string): IdPreset | undefined => PRESETS.find((p) => p.id === id);

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const PASSPORT_ASPECT = 35 / 45;
/**
 * Presets shipped before TOOLS4 with the reference band on a portrait aspect other than 35:45 (3:4, 4:5, 5:7).
 * Any new preset with a reference band must be within 1.5 % of 35:45 (brief TOOLS4 decision 6: a passport band on
 * another shape, such as a square visa photo, would be a made-up guide).
 */
const REFERENCE_ASPECT_EXEMPT: ReadonlySet<string> = new Set(['history', 'korcham', 'teps', 'saramin', 'jobkorea', 'half_card']);

/** Schema problems of a shipped preset (empty when valid). The build and the unit tests run this. */
export function validatePreset(p: IdPreset): string[] {
  const e: string[] = [];
  const status: string = p.status;
  if (!['official', 'print', 'arithmetic', 'user'].includes(status)) e.push(`${p.id}: status "${status}" is not shippable`);
  if (!(PRESET_GROUPS as readonly string[]).includes(p.group)) e.push(`${p.id}: group "${p.group}" is not a select group`);
  if (!ISO.test(p.retrieved) || Number.isNaN(Date.parse(p.retrieved))) e.push(`${p.id}: retrieved is not an ISO date`);
  if (isSourced(p)) {
    if (!p.sourceUrls.length) e.push(`${p.id}: ${p.status} preset without a source URL`);
    if (!p.quote) e.push(`${p.id}: ${p.status} preset without a quote`);
  }
  if (p.status === 'print') {
    if (!p.mm) e.push(`${p.id}: print preset without a print size`);
    else {
      if (p.dpi !== PRINT_PPI || dpiFor(p.outW, p.mm.w) !== PRINT_PPI || dpiFor(p.outH, p.mm.h) !== PRINT_PPI) e.push(`${p.id}: print preset is not ${PRINT_PPI} ppi`);
      if (!p.label.endsWith(`(인화용 ${cmLabel(p.mm)})`)) e.push(`${p.id}: print preset label must end "(인화용 ${cmLabel(p.mm)})"`);
    }
  }
  for (const u of p.sourceUrls) if (!/^https:\/\//.test(u)) e.push(`${p.id}: source URL is not https: ${u}`);
  if (!/^[a-z0-9]+$/.test(p.fileTag)) e.push(`${p.id}: fileTag must be lowercase ASCII`);
  if (!Number.isInteger(p.outW) || !Number.isInteger(p.outH) || p.outW < 1 || p.outH < 1) e.push(`${p.id}: output size`);
  if (p.pxRange && (p.outW < p.pxRange.w[0] || p.outW > p.pxRange.w[1] || p.outH < p.pxRange.h[0] || p.outH > p.pxRange.h[1])) {
    e.push(`${p.id}: output size outside the accepted range`);
  }
  if (p.mm && Math.abs(p.outW / p.outH / (p.mm.w / p.mm.h) - 1) > 0.015) e.push(`${p.id}: aspect differs from the print size by > 1.5 %`);
  if ((p.limitRule === null) !== (p.limitBytes === undefined)) e.push(`${p.id}: limitRule and limitBytes disagree`);
  const band = p.headBand;
  if (!(band.minFrac > 0 && band.minFrac < band.maxFrac && band.maxFrac < 1)) e.push(`${p.id}: head band`);
  if (band.measure !== 'crown' && band.measure !== 'hair') e.push(`${p.id}: head band measure`);
  if (band.kind === 'official') {
    if (!isSourced(p)) e.push(`${p.id}: official head band on a ${p.status} preset`);
    if (!band.bandQuote?.trim()) e.push(`${p.id}: official head band without bandQuote`);
    else if (!p.quote?.includes(band.bandQuote)) e.push(`${p.id}: bandQuote is not part of the quote`);
  } else if (band.bandQuote !== undefined) {
    e.push(`${p.id}: a reference band carries no bandQuote`);
  }
  if (band.kind === 'reference' && p.status !== 'user' && !REFERENCE_ASPECT_EXEMPT.has(p.id) && Math.abs(p.outW / p.outH / PASSPORT_ASPECT - 1) > 0.015) {
    e.push(`${p.id}: reference band on an aspect other than 35:45 (no head rule in the source: do not ship)`);
  }
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
