// The AdSense P1 length metric (FORM1020 round 2, orchestrator): rendered div.guide-body prose, no spaces, no URLs.
import { describe, expect, it } from 'vitest';
import { decodeEntities, guideBodyChars, guideBodyText } from '../../scripts/lib/guide-length.mjs';

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
});
