// /id-photo/ save rule (brief Step 4 Test map, "controller reducer"): the confirmation clears on every change.
import { describe, expect, it } from 'vitest';
import { INITIAL, SAVE_REASON, canSave, reduce, saveReason, type SaveAction } from '../../src/tools/id-photo/model';
import { keyIntent, type StageHandlers } from '../../src/tools/id-photo/stage';

const adjusted = reduce(INITIAL, { type: 'phase', phase: 'adjust' });
const confirmed = reduce(adjusted, { type: 'confirm', value: true });

describe('save model', () => {
  it('save needs the adjust phase, no block and the box checked', () => {
    expect(canSave(adjusted)).toBe(false);
    expect(saveReason(adjusted)).toBe(SAVE_REASON.confirm);
    expect(canSave(confirmed)).toBe(true);
    expect(saveReason(confirmed)).toBe('');
    const blocked = reduce(confirmed, { type: 'blocks', blocks: ['outside'] });
    expect(canSave(blocked)).toBe(false);
    expect(saveReason(blocked)).toBe(SAVE_REASON.blocked);
    expect(canSave(reduce(confirmed, { type: 'phase', phase: 'blocked' }))).toBe(false);
    expect(canSave({ ...confirmed, phase: 'exporting' })).toBe(false);
  });

  it.each(['pan', 'zoom', 'rotate', 'reset', 'preset'] as const)('%s clears the confirmation', (type) => {
    const next = reduce(confirmed, { type } as SaveAction);
    expect(next.confirmed).toBe(false);
    expect(canSave(next)).toBe(false);
  });

  it('leaving the adjust phase clears it; blocks do not', () => {
    expect(reduce(confirmed, { type: 'phase', phase: 'done' }).confirmed).toBe(false);
    expect(reduce(confirmed, { type: 'blocks', blocks: [] }).confirmed).toBe(true);
  });
});

describe('stage keys', () => {
  const calls: string[] = [];
  const h: StageHandlers = {
    pan: (x, y) => calls.push(`pan ${x} ${y}`),
    zoom: (f) => calls.push(`zoom ${f.toFixed(4)}`),
    pinch: () => calls.push('pinch'),
    rotate: (d) => calls.push(`rotate ${d}`),
    reset: () => calls.push('reset'),
    end: () => undefined,
  };
  it('maps the brief keys', () => {
    for (const [k, s] of [['ArrowLeft', false], ['ArrowDown', true], ['+', false], ['=', true], ['-', false], ['[', false], [']', false], ['Home', false]] as const) keyIntent(k, s, h)!();
    expect(calls).toEqual(['pan -1 0', 'pan 0 10', 'zoom 1.0100', 'zoom 1.0500', 'zoom 0.9901', 'rotate -0.5', 'rotate 0.5', 'reset']);
    expect(keyIntent('a', false, h)).toBeNull();
  });
});
