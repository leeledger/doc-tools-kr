// The AdSense P1 length metrics (FORM1020 round 2; CONTENT1021 D4): rendered div.guide-body prose for guides and hubs,
// metric T for tool pages; no spaces, no URLs; the bars are never lowered.
import { describe, expect, it } from 'vitest';
import { GUIDE_MIN_CHARS, LENGTH_PENDING, TOOL_MIN_CHARS, cutElements, decodeEntities, guideBodyChars, guideBodyText, toolBodyChars, toolBodyText } from '../../scripts/lib/guide-length.mjs';

describe('guide length metric', () => {
  const page = '<h1>제목은 빼요</h1><div class="guide-answer-box"><p>답 상자</p></div><div class="guide-body"><h2>가 나</h2><p>다 <a href="/x/">라</a> https://www.law.go.kr/a?b=1 &amp; &#39;마&#39;</p><table><tr><td>바</td></tr></table></div><section class="guide-faq"><p>FAQ는 빼요</p></section>';
  it('counts only the body prose: no title, answer box, FAQ, tags, URLs or whitespace; entities decoded', () => {
    expect(guideBodyText(page)).toBe("가 나 다 라 & '마' 바");
    expect(guideBodyChars(page)).toBe([..."가나다라&'마'바"].length);
  });
  it('no body is 0; entities', () => {
    expect(guideBodyChars('<p>x</p>')).toBe(0);
    expect(decodeEntities('&lt;&#x41;&#66;&nbsp;&zz;')).toBe('<AB &zz;');
  });
  it('a figure caption counts, its alt text does not', () => {
    expect(guideBodyText('<div class="guide-body"><figure class="guide-fig"><img src="/a.svg" alt="대체 글"><figcaption>설명 글</figcaption></figure></div>')).toBe('설명 글');
  });
});

describe('CONTENT1021 D4: bars and the tool metric', () => {
  it('the bars are 2,500 (guides, hubs) and 2,000 (tool pages)', () => {
    expect(GUIDE_MIN_CHARS).toBe(2500);
    expect(TOOL_MIN_CHARS).toBe(2000);
  });

  it('LENGTH_PENDING (Steps A–C scaffolding) holds no Step A pilot and no page that already passed', () => {
    for (const s of ['photo-sizes', 'photo-kb', 'passport-reissue-photo', 'passport-photo', 'pdf-merge', 'power-of-attorney', 'passport-english-name']) expect(LENGTH_PENDING.has(s), s).toBe(false);
    for (const s of ['id-photo-size', 'id-photo-kb', 'passport-photo-error', 'pdf-merge-free']) expect(LENGTH_PENDING.has(s), s).toBe(false);
    // After Steps B1 and B2 every guide and hub is expanded: only Step C's tool paths remain.
    expect([...LENGTH_PENDING].filter((p) => !p.startsWith('/'))).toEqual([]);
  });

  const tool = [
    '<header>머리</header><main id="main">',
    '<section class="tool-hero"><h1>도구 이름</h1><p>한 줄 설명</p></section>',
    '<section class="tool" aria-label="위젯"><p>위젯 글</p><section class="inner"><p>안쪽 섹션</p></section><p>위젯 끝</p></section>',
    '<section class="quick"><p>자주 쓰는 규격</p></section>',
    '<section class="howto"><p>쓰는 법 https://example.com/a &amp; 끝</p></section>',
    '<div class="ad-slot ad-rect" id="ad-x"></div>',
    '<section class="faq"><h3>질문</h3><p>답</p></section>',
    '<section class="related"><a href="/guide/x/">관련 안내</a></section>',
    '<template><p>템플릿</p></template><script>var 스크립트 = 1;</script><style>.x{}</style>',
    '</main><footer>바닥</footer>',
  ].join('');

  it('toolBodyText: <main> only, minus the widget (nested sections included), quick, related, ad slots, template/script/style; FAQ counts', () => {
    expect(toolBodyText(tool)).toBe('도구 이름 한 줄 설명 쓰는 법 & 끝 질문 답');
    expect(toolBodyChars(tool)).toBe([...'도구이름한줄설명쓰는법&끝질문답'].length);
  });

  it('toolBodyText: a page without <main> is 0; a class that only starts with "tool" is kept', () => {
    expect(toolBodyChars('<p>본문</p>')).toBe(0);
    expect(toolBodyText('<main><section class="tool-hero"><p>남아요</p></section></main>')).toBe('남아요');
  });

  it('cutElements is balanced: a nested section never ends the cut early; unclosed cuts to the end', () => {
    const html = '<p>a</p><section class="tool"><section><p>b</p></section><p>c</p></section><p>d</p>';
    expect(cutElements(html, 'section', (t: string) => t.includes('"tool"'))).toBe('<p>a</p><p>d</p>');
    expect(cutElements('<p>a</p><section class="tool"><p>b</p>', 'section', (t: string) => t.includes('"tool"'))).toBe('<p>a</p>');
  });
});
