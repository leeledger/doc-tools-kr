// @vitest-environment jsdom
// 이어서 하기 (CHAIN X1): the flow table and the button group.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTool } from '../../src/data/tools';
import { HANDOFF_KEY, type HandoffRecord, type HandoffStore } from '../../src/lib/ui/handoff';
import { FLOW, NEXT_GROUP_LABEL, NEXT_LABELS, NEXT_MAX_BYTES, hideNextSteps, nextTargets, sendFailed, showNextSteps, sourceTool, type NextSource, type NextTarget } from '../../src/lib/ui/next-steps';

const one = (size = 10) => [{ blob: new Blob([new Uint8Array(size)], { type: 'application/pdf' }), name: '사진.pdf' }];

describe('flow table', () => {
  it('never offers the sender itself', () => {
    for (const from of Object.keys(FLOW) as NextSource[]) expect(FLOW[from], from).not.toContain(sourceTool(from));
    expect(Object.keys(FLOW)).toHaveLength(11);
  });

  it('the brief table, in button order', () => {
    expect(FLOW['jpg-to-pdf']).toEqual(['pdf-compress', 'pdf-password', 'pdf-sign']);
    expect(FLOW['pdf-compress']).toEqual(['pdf-password', 'pdf-sign']);
    expect(FLOW['pdf-password-unlock']).toEqual(['pdf-compress', 'pdf-sign', 'pdf-split']);
    expect(FLOW['id-photo']).toEqual(['jpg-to-pdf']);
    // 배경 지우기 is off in unit tests (vitest define), as in a default build: no row, no buttons.
    expect(FLOW['remove-background']).toBeUndefined();
    expect(nextTargets('remove-background', one())).toEqual([]);
  });

  it('lock result, several files, over 200 MB: no buttons', () => {
    expect(nextTargets('pdf-password-lock', one())).toEqual([]);
    expect(nextTargets('jpg-to-pdf', [...one(), ...one()])).toEqual([]);
    expect(nextTargets('jpg-to-pdf', [])).toEqual([]);
    const big = { blob: { size: NEXT_MAX_BYTES + 1 } as Blob, name: 'big.pdf' };
    expect(nextTargets('jpg-to-pdf', [big])).toEqual([]);
    expect(nextTargets('jpg-to-pdf', [{ ...big, blob: { size: NEXT_MAX_BYTES } as Blob }])).toHaveLength(3);
  });

  it('labels are the tool names (pdf-password: 암호 걸기)', () => {
    for (const to of Object.keys(NEXT_LABELS) as NextTarget[]) {
      if (to === 'pdf-password') expect(NEXT_LABELS[to]).toBe('PDF 암호 걸기');
      else expect(NEXT_LABELS[to], to).toBe(getTool(to).name);
    }
    expect(sendFailed('PDF 용량 줄이기')).toBe('파일을 넘기지 못했습니다. 내려받은 뒤 PDF 용량 줄이기에서 골라 주세요.');
  });
});

describe('showNextSteps / hideNextSteps', () => {
  let slot: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = `<div id="jp-next" class="next-steps" role="group" aria-labelledby="jp-next-label" hidden></div><p data-live="alert" hidden></p><p data-live="status"></p>`;
    slot = document.getElementById('jp-next')!;
  });

  const memSession = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  };
  const memStore = (): HandoffStore & { recs: Map<string, HandoffRecord> } => {
    const recs = new Map<string, HandoffRecord>();
    return { recs, put: async (r) => void recs.set(r.key, r), get: async (k) => recs.get(k), delete: async (k) => void recs.delete(k), sweep: async () => undefined, count: async () => recs.size };
  };

  it('label + one button per target; the label names the group', () => {
    showNextSteps(slot, 'jpg-to-pdf', one());
    expect(slot.hidden).toBe(false);
    expect(document.getElementById('jp-next-label')!.textContent).toBe(NEXT_GROUP_LABEL);
    const buttons = [...slot.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['PDF 용량 줄이기', 'PDF 암호 걸기', 'PDF 서명·도장 넣기']);
    for (const b of buttons) {
      expect(b.type).toBe('button');
      expect(b.className).toBe('btn ghost');
    }
    hideNextSteps(slot);
    expect(slot.hidden).toBe(true);
    expect(slot.childElementCount).toBe(0);
  });

  it('no targets: empty and hidden', () => {
    showNextSteps(slot, 'jpg-to-pdf', one());
    showNextSteps(slot, 'pdf-password-lock', one());
    expect(slot.hidden).toBe(true);
    expect(slot.childElementCount).toBe(0);
  });

  it('click: busy while storing, then opens the target with the file', async () => {
    const store = memStore();
    const session = memSession();
    const go = vi.fn();
    showNextSteps(slot, 'jpg-to-pdf', one(), { store, session, local: memSession(), go });
    const b = slot.querySelector<HTMLButtonElement>('[data-next="pdf-compress"]')!;
    b.click();
    expect(b.disabled).toBe(true);
    expect(b.getAttribute('aria-busy')).toBe('true');
    await vi.waitFor(() => expect(go).toHaveBeenCalledWith('/pdf-compress/'));
    const [rec] = [...store.recs.values()];
    expect(rec).toMatchObject({ to: 'pdf-compress', from: 'jpg-to-pdf', name: '사진.pdf', type: 'application/pdf' });
    expect(JSON.parse(session.m.get(HANDOFF_KEY)!).to).toBe('pdf-compress');
  });

  it('store failure: alert, buttons enabled again, no navigation', async () => {
    const go = vi.fn();
    const fail = () => Promise.reject(new Error('quota'));
    showNextSteps(slot, 'jpg-to-pdf', one(), { store: { put: fail, get: fail, delete: fail, sweep: fail, count: fail }, session: memSession(), local: memSession(), go });
    const b = slot.querySelector<HTMLButtonElement>('[data-next="pdf-password"]')!;
    b.click();
    await vi.waitFor(() => expect(b.disabled).toBe(false));
    expect(go).not.toHaveBeenCalled();
    expect(b.hasAttribute('aria-busy')).toBe(false);
    const alert = document.querySelector<HTMLElement>('[data-live="alert"]')!;
    expect(alert.hidden).toBe(false);
    expect(alert.textContent).toBe(sendFailed('PDF 암호 걸기'));
  });
});
