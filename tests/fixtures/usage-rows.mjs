// Analytics Engine rows for the /admin/ page and the weekly report (brief handoff/ARCHITECT-BRIEF-ADMIN-UI.md, step 0).
// FULL: one period of the four queries (6+ tools; success rates hitting good / warn / bad / few / none; fails with an
// unknown code; settings; guides with dl 0 and 1; arrive events). PREV: the previous-period "AS kind" query.
// XSS: markup in every free-text column. Used by tests/unit and scripts/qa/admin-preview.mjs.

const ev = (tool, event, via, n) => ({ tool, event, via, n });

export const FULL = {
  events: [
    // 사진 용량 줄이기: 114 / 118 -> 97% (good)
    ev('photo-compress', 'pick', 'direct', 150),
    ev('photo-compress', 'start', 'direct', 90),
    ev('photo-compress', 'start', 'guide', 30),
    ev('photo-compress', 'success', 'direct', 74),
    ev('photo-compress', 'success', 'guide', 40),
    ev('photo-compress', 'fail', 'direct', 3),
    ev('photo-compress', 'fail', 'guide', 1),
    ev('photo-compress', 'download', 'direct', 110),
    // PDF 용량 줄이기: 70 / 80 -> 88% (warn); n as a string, as the SQL API may send it
    ev('pdf-compress', 'pick', 'direct', '95'),
    ev('pdf-compress', 'start', 'direct', '80'),
    ev('pdf-compress', 'success', 'direct', '60'),
    ev('pdf-compress', 'success', 'guide', '10'),
    ev('pdf-compress', 'fail', 'direct', '10'),
    ev('pdf-compress', 'download', 'direct', '66'),
    // PDF 합치기: 40 / 55 -> 73% (bad)
    ev('pdf-merge', 'pick', 'direct', 70),
    ev('pdf-merge', 'start', 'direct', 60),
    ev('pdf-merge', 'success', 'direct', 40),
    ev('pdf-merge', 'fail', 'direct', 15),
    ev('pdf-merge', 'download', 'direct', 38),
    // 증명사진: 8 / 10 -> few (under 20 attempts)
    ev('id-photo', 'pick', 'direct', 14),
    ev('id-photo', 'start', 'direct', 10),
    ev('id-photo', 'success', 'direct', 8),
    ev('id-photo', 'fail', 'direct', 2),
    ev('id-photo', 'download', 'direct', 7),
    // HWP PDF 변환: 48 / 50 -> 96% (good)
    ev('hwp-to-pdf', 'pick', 'direct', 55),
    ev('hwp-to-pdf', 'start', 'direct', 50),
    ev('hwp-to-pdf', 'success', 'direct', 48),
    ev('hwp-to-pdf', 'fail', 'direct', 2),
    ev('hwp-to-pdf', 'download', 'direct', 47),
    // 사진 PDF 변환: picked, never started -> "-"
    ev('jpg-to-pdf', 'pick', 'direct', 5),
    // arrivals (guide -> tool)
    ev('photo-compress', 'arrive', 'guide', 25),
    ev('pdf-compress', 'arrive', 'guide', 10),
    // ignored: unknown tool, unknown event
    ev('not-a-tool', 'start', 'direct', 999),
    ev('not-a-tool', 'arrive', 'guide', 99),
    ev('pdf-merge', 'bogus', 'direct', 999),
  ],
  fails: [
    { tool: 'pdf-merge', code: 'corrupt', phase: 'parse', n: 9 },
    { tool: 'pdf-compress', code: 'wrong-password', phase: 'parse', n: 6 },
    { tool: 'pdf-merge', code: 'oom', phase: 'process', n: 4 },
    { tool: 'pdf-compress', code: 'engine', phase: 'load', n: 4 },
    { tool: 'photo-compress', code: 'heic', phase: 'parse', n: 3 },
    { tool: 'pdf-merge', code: 'mystery-code', phase: 'save', n: 2 },
    { tool: 'id-photo', code: 'unreachable', phase: 'save', n: 2 },
    { tool: 'hwp-to-pdf', code: 'timeout', phase: 'parse', n: 2 },
    { tool: 'photo-compress', code: 'not-image', phase: 'parse', n: 1 },
  ],
  settings: [
    { tool: 'photo-compress', setting: 'target-kb', value: 'le200', n: 60 },
    { tool: 'photo-compress', setting: 'target-kb', value: 'le100', n: 35 },
    { tool: 'photo-compress', setting: 'target-kb', value: 'le500', n: 25 },
    { tool: 'pdf-compress', setting: 'level', value: 'recommended', n: 50 },
    { tool: 'pdf-compress', setting: 'level', value: 'strong', n: 20 },
    { tool: 'pdf-compress', setting: 'target-mb', value: 'le5', n: 10 },
    { tool: 'id-photo', setting: 'preset', value: 'passport_online', n: 6 },
    { tool: 'id-photo', setting: 'preset', value: 'custom', n: 4 },
  ],
  guides: [
    { guide: 'photo-200kb', tool: 'photo-compress', dl: '1', n: 15 },
    { guide: 'photo-200kb', tool: 'photo-compress', dl: '0', n: 5 },
    { guide: 'pdf-under-5mb', tool: 'pdf-compress', dl: '1', n: 10 },
    { guide: 'resume-photo', tool: 'photo-compress', dl: '0', n: 5 },
  ],
};

/** The previous period ("AS kind" query): pick / download / unknown kinds are ignored by fetchPrevTotals. */
export const PREV = [
  { kind: 'start', n: 300 },
  { kind: 'success', n: 250 },
  { kind: 'fail', n: 25 },
  { kind: 'arrive', n: 35 },
  { kind: 'pick', n: 400 },
  { kind: 'download', n: 240 },
  { kind: 'bogus', n: 9 },
];

const XSS_TEXT = '<script>alert(1)</script>';
const XSS_IMG = '"><img src=x onerror=alert(1)>';

export const XSS = {
  events: [
    ev('pdf-merge', 'start', 'direct', 3),
    ev('pdf-merge', 'success', 'direct', 2),
    ev('pdf-merge', 'fail', 'direct', 1),
    ev(XSS_TEXT, 'start', 'direct', 5),
  ],
  fails: [
    { tool: 'pdf-merge', code: XSS_TEXT, phase: 'load', n: 3 },
    { tool: XSS_IMG, code: 'oom', phase: XSS_IMG, n: 1 },
  ],
  settings: [{ tool: 'pdf-merge', setting: XSS_TEXT, value: XSS_IMG, n: 2 }],
  guides: [{ guide: XSS_IMG, tool: XSS_TEXT, dl: '1', n: 1 }],
};

export const EMPTY = { events: [], fails: [], settings: [], guides: [] };
