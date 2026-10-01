// "자주 쓰는 규격" quick links on the tool pages (Growth G.6). Every value is derived from a sourced constant:
// the id-photo presets (src/data/id-photo-presets.ts) and the Gmail limit below. Nothing is typed twice.
import { PRESETS, getPreset, type IdPreset } from './id-photo-presets';

export interface QuickLink {
  href: string;
  /** Link text. */
  label: string;
  /** Used in the announcement "○○ 규격으로 바꿨어요". */
  name: string;
}

/** Gmail's attachment limit (the source of the pdf-compress link and of the email-attachment guide). */
export const GMAIL_LIMIT = {
  mb: 25,
  url: 'https://support.google.com/mail/answer/6584?hl=ko',
  quote: '개인 Gmail 계정의 경우 제한은 25MB입니다.',
  retrieved: '2026-09-30',
} as const;

/** The limit of a preset in KB as the agency writes it (350 for "350KB 미만") and its rule word. */
export function presetLimit(p: IdPreset): { kb: number; rule: '이하' | '미만' } | null {
  if (p.limitBytes === undefined || !p.limitRule) return null;
  return p.limitRule === 'lt' ? { kb: (p.limitBytes + 1) / 1000, rule: '미만' } : { kb: p.limitBytes / 1000, rule: '이하' };
}

/** The photo-compress target that fits a preset's limit: floor(limitBytes / 1000) KB. */
export const fitKb = (p: IdPreset): number => Math.floor(p.limitBytes! / 1000);

/** Photo-compress links: one per preset whose KB limit is sourced, in this order, with the brief's names. */
const PHOTO_LINKS: readonly [string, string][] = [
  ['qnet', 'Q-Net 원서 사진'],
  ['gosi', '공무원 시험 원서 사진'],
  ['passport_online', '여권 온라인 신청 사진'],
];

/**
 * /id-photo/ quick links (G2 brief A step 6): at most 8, these preset ids first in this order (any that did not
 * ship is skipped), then the other presets in PRESETS order.
 */
export const ID_PHOTO_LINK_ORDER = ['passport_online', 'id_card', 'toeic', 'history', 'gosi', 'qnet', 'korcham', 'admission'] as const;
export const ID_PHOTO_LINK_MAX = 8;

export function quickLinks(slug: string): QuickLink[] {
  if (slug === 'id-photo') {
    const first = ID_PHOTO_LINK_ORDER.map((id) => getPreset(id)).filter((p): p is IdPreset => !!p);
    const ordered = [...first, ...PRESETS.filter((p) => !first.includes(p))].slice(0, ID_PHOTO_LINK_MAX);
    return ordered.map((p) => ({ href: `/id-photo/?preset=${p.id}`, label: p.label, name: p.label }));
  }
  if (slug === 'photo-compress') {
    return PHOTO_LINKS.map(([id, name]) => {
      const p = getPreset(id)!;
      const lim = presetLimit(p)!;
      const label = `${name} (${lim.kb}KB ${lim.rule})`;
      return { href: `/photo-compress/?target=${fitKb(p)}`, label, name: label };
    });
  }
  if (slug === 'pdf-compress') {
    const gmail = `지메일 첨부 한도 (${GMAIL_LIMIT.mb}MB)`;
    return [
      { href: `/pdf-compress/?target=${GMAIL_LIMIT.mb}`, label: gmail, name: gmail },
      { href: '/pdf-compress/?target=10', label: '10MB로', name: '10MB' },
      { href: '/pdf-compress/?target=5', label: '5MB로', name: '5MB' },
    ];
  }
  return [];
}
