// CONTENT1021 D8: the tool notes (src/content/tool-notes/<slug>.md): one per Korean tool page and no other, every note
// passes its schema and fact check, the copy rules hold in the Markdown itself (the flag-gated pages are built only in a
// flagged build, so check-dist alone would not see their notes in the default build), and the check-dist helper finds
// the rendered section.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { NOTE_SLUGS, gateNoteHtml, toolNoteProblems } from '../../src/data/tool-notes';
import { toolNoteSchema } from '../../src/data/tool-note-schema';
import { TOOLS } from '../../src/data/tools';
import { JARGON } from '../../scripts/lib/plain-words.mjs';
import { CLAIM_RE, EXCEPTION_RE } from '../../scripts/lib/bgcloud.mjs';
import { sharedBlocks, toolNotes } from '../../scripts/lib/guide-check.mjs';
import { toolBodyChars } from '../../scripts/lib/guide-length.mjs';

const DIR = join(__dirname, '..', '..', 'src', 'content', 'tool-notes');
const files = readdirSync(DIR).filter((f) => f.endsWith('.md'));
const notes = files.map((f) => {
  const raw = readFileSync(join(DIR, f), 'utf8').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw)!;
  return { slug: f.replace(/\.md$/, ''), data: toolNoteSchema.parse(parseYaml(m[1]!) ?? {}), body: m[2]! };
});

describe('tool notes (CONTENT1021 D8)', () => {
  it('one note per Korean tool page, the flag-gated pages included, and no other', () => {
    expect(NOTE_SLUGS).toHaveLength(24);
    for (const t of TOOLS) expect(NOTE_SLUGS, t.slug).toContain(t.slug);
    expect(NOTE_SLUGS).toContain('remove-background');
    expect(NOTE_SLUGS).toContain('english-address');
    expect(NOTE_SLUGS).toContain('id-photo-camera');
    expect(notes.map((n) => n.slug).sort()).toEqual([...NOTE_SLUGS].sort());
  });

  it('every note passes: known tool, right tool facts, no number with a unit nothing backs; it has H2s', () => {
    for (const n of notes) {
      expect(toolNoteProblems(n.slug, n.data, n.body), n.slug).toEqual([]);
      expect(n.body, n.slug).toMatch(/^## /m);
    }
  });

  it('every listed tool fact (a tool limit) appears in its note as written, so a changed limit fails here', () => {
    let n = 0;
    for (const note of notes) {
      for (const f of note.data.toolFacts) {
        if (typeof f.value !== 'number') continue;
        expect(note.body, `${note.slug}: ${f.ref}`).toContain(f.value.toLocaleString('ko-KR'));
        n++;
      }
    }
    expect(n).toBeGreaterThanOrEqual(10);
  });

  it('an unknown slug, a wrong or unknown tool fact and an unsourced number fail', () => {
    const empty = { sources: [], toolFacts: [] };
    expect(toolNoteProblems('pdf-magic', empty, '').join()).toContain('is not a Korean tool page');
    expect(toolNoteProblems('pdf-merge', empty, '합계 500 MB까지').join()).toContain('500 MB');
    expect(toolNoteProblems('pdf-merge', { sources: [], toolFacts: [{ ref: 'pdf-merge.maxTotalMb.desktop', value: 500 }] }, '합계 500 MB까지')).toEqual([]);
    expect(toolNoteProblems('pdf-merge', { sources: [], toolFacts: [{ ref: 'pdf-merge.maxFiles', value: 60 }] }, '').join()).toContain('is 50');
    expect(toolNoteProblems('pdf-merge', { sources: [], toolFacts: [{ ref: 'made.up', value: 1 }] }, '').join()).toContain('not in src/data/tool-facts.ts');
    expect(toolNoteProblems('id-photo', empty, '만 17세 이상').join()).toContain('17 세');
  });

  it('copy rules in the Markdown: plain words, no site-wide "never leaves" claim, no 배경 지우기 exception wording', () => {
    for (const n of notes) {
      const text = n.body.replace(/\]\([^)]*\)/g, ']');
      expect(text.match(JARGON) ?? [], n.slug).toEqual([]);
      expect(text.match(CLAIM_RE) ?? [], n.slug).toEqual([]);
      expect(EXCEPTION_RE.test(text), n.slug).toBe(false);
      expect(text, n.slug).not.toMatch(/Docttak|독딱|안올림/);
      // The shipped-copy bans of tests/unit/postbuild.test.ts ("copy: no dpi, …"), here for the flag-gated notes too.
      for (const bad of ['구조 정리', '처음부터', '받아주세요', '결과 확인 중']) expect(text, `${n.slug}: ${bad}`).not.toContain(bad);
      expect(text, n.slug).not.toMatch(/\d %/);
    }
    // Page-specific words the tool pages' own check-dist rules forbid.
    const body = (slug: string) => notes.find((n) => n.slug === slug)!.body;
    expect(body('power-of-attorney')).not.toContain('인감');
    for (const bad of ['공식', '영어 이름', '외교부 인증', '정확한 여권 이름', '띄어 쓰기']) expect(body('english-name')).not.toContain(bad);
    expect(body('english-name')).not.toMatch(/\d\s*%/);
    for (const bad of ['법적 효력이 있', '인감 대신', '인감 등록', '인감으로 쓸 수']) expect(body('stamp-maker')).not.toContain(bad);
    expect(body('english-address')).not.toMatch(/보내지 않아요|주소 검색으로 보내/);
  });

  it('PRINT1023 A: a passage marked data-requires="id-camera" is unwrapped with the camera on and dropped with it off', () => {
    const html = '<ul><li><span data-requires="id-camera">증명사진 촬영에서 넘어옵니다.</span> 여권은 원본을 쓰세요.</li></ul>';
    expect(gateNoteHtml(html, true)).toBe('<ul><li>증명사진 촬영에서 넘어옵니다. 여권은 원본을 쓰세요.</li></ul>');
    expect(gateNoteHtml(html, false)).toBe('<ul><li>여권은 원본을 쓰세요.</li></ul>');
    expect(gateNoteHtml('<p>그대로</p>', false)).toBe('<p>그대로</p>');
    expect(() => gateNoteHtml('<span data-requires="bg-remove">x</span>', true)).toThrow(/data-requires/);
  });

  it('PRINT1023 A: the 배경 지우기 note marks its 증명사진 촬영 passage, and only there', () => {
    for (const n of notes) {
      const text = gateNoteHtml(n.body, false);
      if (n.slug !== 'id-photo-camera') expect(text.includes('증명사진 촬영'), n.slug).toBe(false);
    }
    expect(notes.find((n) => n.slug === 'remove-background')!.body).toContain('<span data-requires="id-camera">증명사진 촬영');
  });

  it('check-dist helpers: toolNotes finds the rendered section; a block shared by two notes is caught', () => {
    const page = '<main><section class="tool"><p>위젯</p></section><section class="why"><p>왜</p></section><section class="tool-notes" aria-labelledby="a"><div><h2 id="a">이럴 때</h2><p>노트 글</p></div></section><section class="faq"><p>질문</p></section></main>';
    expect(toolNotes(page)).toContain('노트 글');
    expect(toolNotes(page)).not.toContain('질문');
    expect(toolNotes('<main><section class="tool"></section></main>')).toBe('');
    // The notes count in the tool metric (they are not cut like the widget).
    expect(toolBodyChars(page)).toBe([...'왜이럴때노트글질문'].length);
    const long = '<p>' + '가'.repeat(60) + '</p>';
    expect(sharedBlocks([['/a/', long], ['/b/', long]]).join()).toContain('/b/ repeats a block of /a/');
  });
});
