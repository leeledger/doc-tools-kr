// "PDF로 저장" guidance per browser (brief Step 5 §3.3). The detection is a pure function of the user agent,
// the platform and the touch-point count (unit-tested with UA strings). Label strings follow each browser's
// Korean print UI; Gate 11 checks them in real browsers.

export type BrowserId = 'chrome-pc' | 'edge-pc' | 'safari-mac' | 'firefox-pc' | 'android-chrome' | 'ios-safari' | 'android-firefox' | 'inapp';

export interface Guide {
  id: BrowserId;
  title: string;
  steps: string[];
}

export const GUIDES: Guide[] = [
  { id: 'chrome-pc', title: 'Chrome (PC)', steps: ['인쇄 창의 「대상」에서 「PDF로 저장」을 고릅니다.', '「저장」을 누릅니다.', '여백은 「기본」, 「머리글과 바닥글」은 끈 상태로 둡니다.'] },
  { id: 'edge-pc', title: 'Edge (PC)', steps: ['인쇄 창의 「프린터」에서 「PDF로 저장」을 고릅니다.', '「저장」을 누릅니다.', '여백은 「기본」, 「머리글과 바닥글」은 끈 상태로 둡니다.'] },
  { id: 'safari-mac', title: 'Safari (Mac)', steps: ['인쇄 창 왼쪽 아래의 「PDF」 메뉴를 엽니다.', '「PDF로 저장」을 고릅니다.'] },
  { id: 'firefox-pc', title: 'Firefox (PC)', steps: ['인쇄 창의 「대상」에서 「PDF로 저장」을 고릅니다.', '「저장」을 누릅니다.'] },
  { id: 'android-chrome', title: '안드로이드 Chrome·삼성 인터넷', steps: ['인쇄 화면 위쪽의 프린터 선택을 누릅니다.', '「PDF로 저장」을 고릅니다.', 'PDF 다운로드 버튼을 누릅니다.'] },
  { id: 'ios-safari', title: '아이폰·아이패드 Safari', steps: ['「프린트 옵션」 화면에서 공유 버튼을 누릅니다.', '「파일에 저장」을 고릅니다.'] },
  { id: 'android-firefox', title: '안드로이드 Firefox', steps: ['메뉴에서 「인쇄」를 고른 뒤 「PDF로 저장」을 고릅니다.', '인쇄 메뉴가 없으면 Chrome에서 열어 주세요.'] },
  { id: 'inapp', title: '앱 안의 브라우저', steps: ['오른쪽 위 메뉴에서 「다른 브라우저로 열기」를 누른 뒤 다시 시도해 주세요.'] },
];

export interface UaInput {
  ua: string;
  platform?: string;
  maxTouchPoints?: number;
}

const INAPP = /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\//i;

export function detectBrowser({ ua, platform = '', maxTouchPoints = 0 }: UaInput): BrowserId {
  if (INAPP.test(ua)) return 'inapp';
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1) || /^iP(hone|ad|od)/.test(platform);
  if (ios) return 'ios-safari';
  const android = /Android/i.test(ua);
  if (android) {
    // Samsung Internet shares the Android print dialog, so it shares the Android Chrome card.
    if (/Firefox\//.test(ua)) return 'android-firefox';
    return 'android-chrome';
  }
  if (/Edg\//.test(ua)) return 'edge-pc';
  if (/Firefox\//.test(ua)) return 'firefox-pc';
  if (/Chrome\/|Chromium\//.test(ua)) return 'chrome-pc';
  if (/Safari\//.test(ua) && (/Macintosh/.test(ua) || /^Mac/.test(platform))) return 'safari-mac';
  return 'chrome-pc';
}

/** The detected guide first, then every other one (the page puts those in <details>). */
export function orderedGuides(id: BrowserId): Guide[] {
  const lead = GUIDES.find((g) => g.id === id) ?? GUIDES[0];
  return [lead, ...GUIDES.filter((g) => g !== lead)];
}
