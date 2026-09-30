// The done-state summary of 사진 용량 줄이기 (UX-AUDIT-2 P1-2). Pure: the controller maps rows to outcomes.
// Each outcome is counted on its own (줄임 / 그대로 / 늘어남), so a grown or kept photo is never summed up
// as "줄였습니다", and only the reduced photos go into the before → after total.

export type Outcome = 'reduced' | 'same' | 'grown' | 'failed' | 'waiting';

export interface OutcomeRow {
  outcome: Outcome;
  /** Input and output bytes of a row with a result (reduced, grown, or a same-size result). */
  inBytes?: number;
  outBytes?: number;
}

const LABEL: Record<Outcome, string> = { reduced: '줄임', same: '그대로', grown: '늘어남', failed: '못 줄임', waiting: '대기' };
const ORDER: readonly Outcome[] = ['reduced', 'same', 'grown', 'failed', 'waiting'];

/** A row's outcome from its state and, when it has one, its result sizes. */
export function outcomeOf(state: string, sizes: { inBytes: number; outBytes: number } | null): Outcome {
  if (sizes) return sizes.outBytes < sizes.inBytes ? 'reduced' : sizes.outBytes > sizes.inBytes ? 'grown' : 'same';
  if (state === 'kept') return 'same';
  if (state === 'pending') return 'waiting';
  return 'failed';
}

/**
 * `text` is announced; the headline is `text` plus `sizes` (the reduced photos' total, or the one photo's
 * before → after when it grew).
 */
export function doneSummary(rows: readonly OutcomeRow[], size: (bytes: number) => string): { text: string; sizes: string | null } {
  const count = (o: Outcome): number => rows.filter((r) => r.outcome === o).length;
  const reduced = rows.filter((r) => r.outcome === 'reduced');
  const arrow = (list: readonly OutcomeRow[]): string =>
    `${size(list.reduce((a, r) => a + (r.inBytes ?? 0), 0))} → ${size(list.reduce((a, r) => a + (r.outBytes ?? 0), 0))}`;

  if (rows.length === 1) {
    const r = rows[0]!;
    switch (r.outcome) {
      case 'reduced':
        return { text: '사진을 줄였습니다.', sizes: arrow([r]) };
      case 'grown':
        return { text: '다시 저장해 용량이 조금 늘었습니다.', sizes: arrow([r]) };
      case 'same':
        return { text: '이미 충분히 작아서 그대로 두었어요. 원본을 받으셔도 됩니다.', sizes: null };
      case 'waiting':
        return { text: '줄이기를 취소했습니다.', sizes: null };
      case 'failed':
        return { text: '사진을 줄이지 못했습니다.', sizes: null };
    }
  }
  if (reduced.length === rows.length) return { text: `사진 ${rows.length}장을 모두 줄였습니다.`, sizes: arrow(reduced) };
  const parts = ORDER.filter((o) => count(o) > 0).map((o) => `${LABEL[o]} ${count(o)}장`);
  return {
    text: `사진 ${rows.length}장: ${parts.join(' · ')}`,
    sizes: reduced.length ? `(줄인 사진 ${arrow(reduced)})` : null,
  };
}
