// 본 제품은 한컴의 HWP 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
// Copy of the /hwp-viewer/ controls (G2 A0 build order 8; docs/COPY.md). The tool copy is 합니다체; the two
// lines the brief fixes word for word ("원본과 다르게 보일 수 있어요.", "찾기를 멈췄어요") keep its wording.

const n = (v: number): string => v.toLocaleString('ko-KR');

export const VIEWER_COPY = {
  differ: '원본과 다르게 보일 수 있어요.',
  total: (pages: number): string => `/ ${n(pages)}`,
  searching: (done: number, of: number): string => `찾는 중 · ${n(done)}/${n(of)}쪽`,
  found: (hits: number): string => (hits ? `${n(hits)}개 찾음` : '찾지 못했습니다'),
  stopped: (hits: number): string => `찾기를 멈췄어요 · ${n(hits)}개 찾음`,
  capped: (pages: number, hits: number): string => `찾기를 멈췄어요 · 처음 ${n(pages)}쪽에서 ${n(hits)}개 찾음`,
  hitAt: (k: number, of: number, page: number): string => `${n(k)} / ${n(of)} · ${n(page)}쪽`,
  empty: '찾을 단어를 넣어 주세요.',
  zoom: (pct: string): string => `${pct}로 보는 중`,
} as const;
