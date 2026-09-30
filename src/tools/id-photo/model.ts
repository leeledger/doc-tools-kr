// The /id-photo/ page state that decides the save button (brief Step 4 §3.2). Pure, so the rule "any
// adjustment clears the confirmation" is unit-tested without a DOM.

export type Phase = 'empty' | 'loading' | 'adjust' | 'blocked' | 'exporting' | 'done' | 'error';

export interface SaveModel {
  phase: Phase;
  /** The required confirmation checkbox. */
  confirmed: boolean;
  /** Current checklist blocks (outside, lowres, custom). */
  blocks: string[];
}

export type SaveAction =
  | { type: 'pan' | 'zoom' | 'rotate' | 'reset' | 'preset' }
  | { type: 'confirm'; value: boolean }
  | { type: 'blocks'; blocks: string[] }
  | { type: 'phase'; phase: Phase };

export const INITIAL: SaveModel = { phase: 'empty', confirmed: false, blocks: [] };

export function reduce(m: SaveModel, a: SaveAction): SaveModel {
  switch (a.type) {
    case 'pan':
    case 'zoom':
    case 'rotate':
    case 'reset':
    case 'preset':
      // The user confirmed what they saw; after any change they must look again.
      return m.confirmed ? { ...m, confirmed: false } : m;
    case 'confirm':
      return { ...m, confirmed: a.value };
    case 'blocks':
      return { ...m, blocks: a.blocks };
    case 'phase':
      return a.phase === 'adjust' || a.phase === 'blocked' ? { ...m, phase: a.phase } : { ...m, phase: a.phase, confirmed: false };
  }
}

export const canSave = (m: SaveModel): boolean => m.phase === 'adjust' && m.blocks.length === 0 && m.confirmed;

export const SAVE_REASON = {
  blocked: '확인 목록에 저장을 막는 항목이 있습니다. 그 항목을 먼저 해결해 주세요.',
  confirm: '위의 확인란에 체크하면 저장할 수 있습니다.',
} as const;

/** The visible reason next to a disabled save button, or '' when saving is possible. */
export function saveReason(m: SaveModel): string {
  if (m.phase !== 'adjust' && m.phase !== 'blocked') return '';
  if (m.blocks.length || m.phase === 'blocked') return SAVE_REASON.blocked;
  if (!m.confirmed) return SAVE_REASON.confirm;
  return '';
}
