// @vitest-environment jsdom
// 안내 글 링크 누름 (brief handoff/ARCHITECT-BRIEF-REV3.md Decision 6): src/lib/ui/guide-out.ts sends the guide's out
// event without importing usage.ts (the guide JS budget). These tests keep it equal to usage.ts and the server whitelist.
import { describe, expect, it } from 'vitest';
import { GUIDE_OUT_MAX, GUIDE_OUT_PATH, bindGuideOut, guideDevice, guideOutPayload } from '../../src/lib/ui/guide-out';
import { buildPayload } from '../../src/lib/ui/usage';
import { detectDevice } from '../../src/lib/ui/device';
import { GUIDE_OUT, MAX_EVENTS, USAGE_PATH, sampleWeight, validate } from '../../scripts/lib/usage.mjs';

describe('guide-out == usage.ts', () => {
  it('the path, the event cap, the device rule and the weight are usage.ts\'s', () => {
    expect(GUIDE_OUT_PATH).toBe(USAGE_PATH);
    expect(GUIDE_OUT_MAX).toBe(MAX_EVENTS);
    expect(guideDevice()).toBe(detectDevice());
    for (const rate of [1, 0.5, 0.3, 0.1, 0.01]) expect(guideOutPayload('id-photo', 'cp-tripod', 'x', { device: 'desktop', build: 'dev', rate }).w).toBe(sampleWeight(rate));
  });

  it('the payload is buildPayload\'s (same keys, order and values) and the server accepts every GUIDE_OUT pair', () => {
    for (const [t, dests] of Object.entries(GUIDE_OUT)) {
      for (const v of dests) {
        const ours = guideOutPayload(t as never, v as never, 'passport-photo', { device: 'mobile', build: 'abc1234', rate: 0.5 });
        const theirs = buildPayload({ e: 'out', t: t as never, o: 'out', v: v as never, g: 'passport-photo' }, { via: 'direct', ua: 'x', device: 'mobile', build: 'abc1234', w: 2 });
        expect(JSON.stringify(ours)).toBe(JSON.stringify(theirs));
        expect(validate(JSON.stringify(ours))).toMatchObject({ e: 'out', t, v, g: 'passport-photo', via: 'guide' });
      }
    }
    expect(guideOutPayload('id-photo', 'cp-tripod', 'x', { device: 'desktop', build: 'not a build', rate: 1 }).b).toBe('dev');
  });
});

describe('bindGuideOut', () => {
  const page = (attrs = 'data-guide="passport-photo" data-tool="id-photo"') => {
    document.head.innerHTML = '<meta name="build-id" content="abc1234">';
    document.body.innerHTML = `<div class="out-links" ${attrs}><p>광고</p><ul><li><a href="https://example.com/a" rel="sponsored noopener" target="_blank" data-out="cp-backdrop"><span>배경천</span></a></li></ul></div>`;
    return document.querySelector('a')!;
  };
  const sink = () => {
    const sent: [string, string][] = [];
    return { sent, send: (p: string, b: string) => (sent.push([p, b]), true) };
  };

  it('one press = one beacon with the link kind only, the link itself untouched (no preventDefault)', () => {
    const a = page();
    const { sent, send } = sink();
    bindGuideOut(document, { rate: 1, random: () => 0, send });
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    a.querySelector('span')!.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(a.getAttribute('href')).toBe('https://example.com/a');
    expect(sent).toHaveLength(1);
    expect(sent[0]![0]).toBe('/api/usage');
    expect(JSON.parse(sent[0]![1])).toEqual({ e: 'out', t: 'id-photo', o: 'out', v: 'cp-backdrop', g: 'passport-photo', via: 'guide', d: 'desktop', b: 'abc1234', w: 1 });
    expect(sent[0]![1]).not.toContain('example.com');
  });

  it('no beacon: sampled out, no block attributes, a click outside a link; capped at MAX_EVENTS; a throwing send is swallowed', () => {
    let a = page();
    const out = sink();
    bindGuideOut(document, { rate: 0.5, random: () => 0.9, send: out.send });
    a.click();
    expect(out.sent).toEqual([]);
    a = page('data-guide="passport-photo"');
    bindGuideOut(document, { rate: 1, random: () => 0, send: out.send });
    a.click();
    expect(out.sent).toEqual([]);
    a = page();
    const many = sink();
    bindGuideOut(document, { rate: 1, random: () => 0, send: many.send });
    document.querySelector('p')!.click();
    expect(many.sent).toEqual([]);
    for (let i = 0; i < MAX_EVENTS + 5; i++) a.click();
    expect(many.sent).toHaveLength(MAX_EVENTS);
    a = page();
    bindGuideOut(document, { rate: 1, random: () => 0, send: () => { throw new Error('beacon'); } });
    expect(() => a.click()).not.toThrow();
  });
});
