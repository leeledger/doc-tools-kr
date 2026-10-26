// 영문주소 변환기 (ADDREN1016, brief handoff/ARCHITECT-BRIEF-ADDREN1016.md Test map). Runs only in the cloud-* projects,
// against dist-bgcloud/ (PUBLIC_ADDR_EN=1 with the officer and contact; usage statistics and GA on). /api/addr-en never
// reaches Cloudflare or juso: page.route answers it with fixtures or an error. The no-upload fixture stays on with two
// allowed requests, POST /api/addr-en and the usage beacon POST /api/usage, no query; everything else is strict.
// The page checks that site.spec / polish.spec make for every other tool page run here too (axe, SEO, JSON-LD, related
// tools, 360 px, no late UI face before interaction): those specs run on dist/, where this page does not exist.
import AxeBuilder from '@axe-core/playwright';
import type { Page, Request, Route } from '@playwright/test';
import { validate } from '../../scripts/lib/usage.mjs';
import { expect, gotoReady, test } from './no-upload';

test.use({ allowUpload: [[{ method: 'POST', path: '/api/addr-en' }, { method: 'POST', path: '/api/usage' }], { scope: 'test' }] });

const PATH = '/english-address/';
const API = /\/api\/addr-en$/;
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const LATE_FACE = /\/_astro\/anolim-ui-late-\d+\.[^/]*\.woff2$/;
const MSG = {
  short: '주소를 두 글자 이상 적어 주세요.',
  sido: '시·도 이름만으로는 찾을 수 없어요. 도로명이나 동 이름까지 적어 주세요.',
  digits: '숫자만으로는 찾을 수 없어요. 도로명이나 건물 이름을 같이 적어 주세요.',
  long: '80글자까지 적을 수 있어요.',
  chars: '기호를 빼고 다시 찾아 주세요.',
  broad: '찾은 주소가 너무 많아요. 건물 번호까지 적어 주세요.',
  none: '찾은 주소가 없어요. 도로명과 건물 번호(예: 세종대로 110)나 동 이름과 번지로 다시 찾아 주세요.',
  busy: '잠깐 너무 많이 찾았어요. 몇 초 뒤에 다시 눌러 주세요.',
  offline: '인터넷에 연결된 뒤에 다시 찾아 주세요.',
  other: '지금은 주소를 찾을 수 없어요. 잠시 뒤에 다시 해 주세요.',
};

const SEJONG = { road: '110 Sejong-daero, Jung-gu, Seoul', jibun: '31 Taepyeongno 1-ga, Jung-gu, Seoul', zip: '04524', si: 'Seoul', sgg: 'Jung-gu', emd: 'Taepyeongno 1-ga', kor: '서울특별시 중구 세종대로 110 (태평로1가)' };
const BANPO = { road: '18-1 Banpo-daero, Seocho-gu, Seoul', jibun: '18-1 Banpo-dong, Seocho-gu, Seoul', zip: '06591', si: 'Seoul', sgg: 'Seocho-gu', emd: 'Banpo-dong', kor: '서울특별시 서초구 반포대로 18-1' };
const SEJONG_CITY = { road: '261 Dasom-ro, Sejong-si', jibun: '1 Eojin-dong, Sejong-si', zip: '30116', si: 'Sejong-si', sgg: '', emd: 'Eojin-dong', kor: '세종특별자치시 다솜로 261' };
const ODD = { road: '20 Pangyo-ro, Seongnam-si Bundang-gu, Gyeonggi-do', jibun: '1 Baekhyeon-dong, Bundang-gu, Seongnam-si, Gyeonggi-do', zip: '13487', si: 'Gyeonggi-do', sgg: 'Bundang-gu, Seongnam-si', emd: 'Baekhyeon-dong', kor: '경기도 성남시 분당구 판교로 20' };
const many = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ ...SEJONG, road: `${from + i + 1} Sejong-daero, Jung-gu, Seoul`, kor: `서울특별시 중구 세종대로 ${from + i + 1}` }));

type Answer = { status: number; body: unknown } | 'abort';

/** Answers POST /api/addr-en in order (the last answer repeats) and records each request body and content type. */
async function api(page: Page, ...answers: Answer[]): Promise<{ bodies: string[]; types: string[]; methods: string[] }> {
  const bodies: string[] = [];
  const types: string[] = [];
  const methods: string[] = [];
  await page.route(API, async (route: Route) => {
    const r: Request = route.request();
    methods.push(r.method());
    bodies.push(r.postData() ?? '');
    types.push((await r.allHeaders())['content-type'] ?? '');
    const a = answers[Math.min(bodies.length - 1, answers.length - 1)]!;
    if (a === 'abort') return route.abort('internetdisconnected');
    await route.fulfill({ status: a.status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, private' }, body: JSON.stringify(a.body) });
  });
  return { bodies, types, methods };
}

/** Records the usage beacons (answered 204). */
async function beacons(page: Page): Promise<Record<string, unknown>[]> {
  const seen: Record<string, unknown>[] = [];
  page.context().on('request', (r: Request) => {
    if (new URL(r.url()).pathname !== '/api/usage') return;
    const body = r.postData() ?? '';
    expect(validate(body), body).not.toBeNull();
    seen.push(JSON.parse(body) as Record<string, unknown>);
  });
  await page.route('**/api/usage', (route) => route.fulfill({ status: 204, body: '' }));
  return seen;
}

async function search(page: Page, q: string): Promise<void> {
  await page.locator('#ea-q').fill(q);
  await page.getByRole('button', { name: '찾기', exact: true }).click();
}

const ok = (items: unknown[], total = items.length, page = 1) => ({ status: 200, body: { total, page, items } });

test('search, pick, 상세주소, field rows, copy; the request is exactly {q,page}; nothing in the URL or storage', async ({ page, browserName, context }) => {
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const seen = await beacons(page);
  const calls = await api(page, ok([SEJONG, BANPO, SEJONG_CITY]));
  await gotoReady(page, PATH);
  await expect(page.locator('#ea-q')).not.toHaveAttribute('name', /.*/);
  await search(page, '  세종대로   110 ');
  await expect(page.locator('.ea-card')).toHaveCount(3);
  await expect(page.locator('.ea-count')).toHaveText('찾은 주소 3개');
  await expect(page.locator('.ea-more')).toHaveCount(0);
  expect(calls.methods).toEqual(['POST']);
  expect(calls.types[0]).toMatch(/^application\/json/);
  expect(calls.bodies).toEqual(['{"q":"세종대로 110","page":1}']);
  const first = page.locator('.ea-card').first();
  await expect(first.locator('.ea-kor')).toHaveText(SEJONG.kor);
  await expect(first.locator('.ea-road')).toHaveText(SEJONG.road);
  await expect(first).toContainText('31 Taepyeongno 1-ga');
  await expect(first).toContainText('우편번호 04524');

  await first.getByRole('button', { name: '이 주소 쓰기' }).click();
  await expect(page.locator('#ea-split-title')).toBeFocused();
  await expect(page.locator('#ea-split-title')).toHaveText('해외 직구 주소 칸에 나눠 넣기');
  await page.locator('#ea-detail').fill('101동 1203호');
  const val = (f: string) => page.locator(`[data-row="${f}"] .ea-val`);
  await expect(val('line1')).toHaveText('110 Sejong-daero');
  await expect(val('line2')).toHaveText('101-dong 1203-ho');
  await expect(val('city')).toHaveText('Jung-gu');
  await expect(val('state')).toHaveText('Seoul');
  await expect(val('zip')).toHaveText('04524');
  await expect(val('country')).toHaveText('South Korea');
  await expect(page.locator('.ea-split')).toContainText('나라: South Korea (Republic of Korea)');
  await expect(page.locator('.ea-full')).toHaveText('101-dong 1203-ho, 110 Sejong-daero, Jung-gu, Seoul 04524');

  await page.getByRole('button', { name: 'Address line 1 복사' }).click();
  await expect(page.locator('#ea-live')).toHaveText(/복사했어요|길게 눌러 복사해 주세요/);
  if (browserName === 'chromium') {
    await expect(page.locator('#ea-live')).toHaveText('복사했어요');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('110 Sejong-daero');
    await page.getByRole('button', { name: '한 줄로 복사' }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('101-dong 1203-ho, 110 Sejong-daero, Jung-gu, Seoul 04524');
  }

  // Privacy (decision 6): the address is in no URL, no storage, no beacon.
  expect(page.url()).toBe(new URL(PATH, page.url()).href);
  const stored = await page.evaluate(() => ({ local: localStorage.length, session: Object.keys(sessionStorage).filter((k) => k !== 'docttak:utm') }));
  expect(stored.local).toBe(0);
  expect(stored.session).toEqual([]);
  await expect.poll(() => seen.filter((e) => e.e === 'download').length).toBeGreaterThanOrEqual(1);
  const events = seen.filter((e) => e.t === 'english-address');
  expect(events.map((e) => e.e).filter((e) => e !== 'download')).toEqual(['start', 'success']);
  expect(events.find((e) => e.e === 'download')).toMatchObject({ o: 'field', v: 'line1' });
  for (const e of seen) expect(JSON.stringify(e)).not.toMatch(/세종|Sejong|04524|1203|Jung-gu|Seoul/);
});

test('Enter before the controller has loaded still searches once', async ({ page }) => {
  const calls = await api(page, ok([SEJONG]));
  await gotoReady(page, PATH);
  await page.locator('#ea-q').fill('세종대로 110');
  await page.locator('#ea-q').press('Enter');
  await expect(page.locator('.ea-card')).toHaveCount(1);
  expect(calls.bodies).toEqual(['{"q":"세종대로 110","page":1}']);
  expect(page.url()).not.toContain('?');
});

test('더 보기: page 2 is appended, the hint shows, the button goes when all are shown', async ({ page }) => {
  const calls = await api(page, ok(many(10), 15), ok(many(5, 10), 15, 2));
  await gotoReady(page, PATH);
  await search(page, '세종대로');
  await expect(page.locator('.ea-card')).toHaveCount(10);
  await expect(page.locator('.ea-hint')).toHaveText('건물 번호까지 적으면 더 빨리 찾아요.');
  await page.getByRole('button', { name: '더 보기' }).click();
  await expect(page.locator('.ea-card')).toHaveCount(15);
  await expect(page.locator('.ea-more')).toHaveCount(0);
  expect(calls.bodies).toEqual(['{"q":"세종대로","page":1}', '{"q":"세종대로","page":2}']);
});

test('더 보기 by keyboard: focus moves to the first new card; the picked card and the split card stay', async ({ page }) => {
  await api(page, ok(many(10), 25), ok(many(10, 10), 25, 2), ok(many(5, 20), 25, 3));
  await gotoReady(page, PATH);
  await search(page, '세종대로');
  await page.locator('.ea-card').nth(1).getByRole('button', { name: '이 주소 쓰기' }).click();
  await expect(page.locator('.ea-card').nth(1)).toHaveAttribute('data-picked', 'true');
  const first = await page.locator('.ea-card').first().elementHandle();
  await page.locator('.ea-more').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.ea-card')).toHaveCount(20);
  // Focus is on the 11th card (the first of page 2), never dropped to the page body.
  await expect(page.locator('.ea-card').nth(10)).toBeFocused();
  await expect(page.locator('.ea-card').nth(10).locator('.ea-kor')).toHaveText('서울특별시 중구 세종대로 11');
  // Nothing already shown was rebuilt: the same first card node, the picked mark, the split card and the count.
  expect(await first!.evaluate((n) => n.isConnected)).toBe(true);
  await expect(page.locator('.ea-card[data-picked="true"]')).toHaveCount(1);
  await expect(page.locator('.ea-card').nth(1)).toHaveAttribute('data-picked', 'true');
  await expect(page.locator('#ea-split-title')).toBeVisible();
  await expect(page.locator('.ea-count')).toHaveText('찾은 주소 25개');
  await page.locator('.ea-more').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.ea-card')).toHaveCount(25);
  await expect(page.locator('.ea-card').nth(20)).toBeFocused();
  await expect(page.locator('.ea-more')).toHaveCount(0);
});

// The usage fail code of each answer (acting-Arch Q2: key = engine, juso down / HTTP error / timeout = upstream).
const FAIL: Record<string, string> = { short: 'query', sido: 'query', digits: 'query', long: 'query', chars: 'query', broad: 'query', busy: 'busy', engine: 'engine', upstream: 'upstream', timeout: 'upstream', off: 'unknown', bad: 'unknown' };
for (const [code, status] of [['short', 400], ['sido', 400], ['digits', 400], ['long', 400], ['chars', 400], ['broad', 400], ['busy', 429], ['engine', 503], ['upstream', 502], ['timeout', 504], ['off', 404], ['bad', 400]] as const) {
  test(`answer ${status} ${code} -> its message and fail ${FAIL[code]}`, async ({ page }) => {
    const seen = await beacons(page);
    await api(page, { status, body: { error: code } });
    await gotoReady(page, PATH);
    await search(page, '세종대로 110');
    await expect(page.locator('#ea-msg')).toHaveText(MSG[code in MSG ? (code as keyof typeof MSG) : 'other']);
    await expect(page.locator('.ea-card')).toHaveCount(0);
    await expect.poll(() => seen.filter((e) => e.e === 'fail' && e.t === 'english-address').map((e) => e.c)).toEqual([FAIL[code]]);
  });
}

test('not our JSON (a Workers limit page) -> the generic message', async ({ page }) => {
  await page.route(API, (route) => route.fulfill({ status: 503, contentType: 'text/html', body: '<html>Error 1027</html>' }));
  await gotoReady(page, PATH);
  await search(page, '세종대로 110');
  await expect(page.locator('#ea-msg')).toHaveText(MSG.other);
});

test('0 results -> the none message; a failed request (offline) -> the offline message', async ({ page }) => {
  const seen = await beacons(page);
  await api(page, ok([]), 'abort');
  await gotoReady(page, PATH);
  await search(page, '없는주소 999');
  await expect(page.locator('#ea-msg')).toHaveText(MSG.none);
  await search(page, '세종대로 110');
  await expect(page.locator('#ea-msg')).toHaveText(MSG.offline);
  await expect.poll(() => seen.filter((e) => e.e === 'fail').map((e) => e.c)).toEqual(['no-result']);
});

test('the page checks length first: 1 character or 81 -> message, no request', async ({ page }) => {
  const calls = await api(page, ok([SEJONG]));
  await gotoReady(page, PATH);
  await search(page, '가');
  await expect(page.locator('#ea-msg')).toHaveText(MSG.short);
  await search(page, '%%%');
  await expect(page.locator('#ea-msg')).toHaveText(MSG.short);
  await search(page, '가'.repeat(81));
  await expect(page.locator('#ea-msg')).toHaveText(MSG.long);
  expect(calls.bodies).toEqual([]);
});

test('apartment name in the 상세주소 -> do it by hand, line 2 not copyable; 지하 and 층 converted', async ({ page }) => {
  await api(page, ok([SEJONG]));
  await gotoReady(page, PATH);
  await search(page, '세종대로 110');
  await page.getByRole('button', { name: '이 주소 쓰기' }).click();
  const line2 = page.locator('[data-row="line2"]');
  await expect(line2.getByRole('button')).toBeDisabled();
  await page.locator('#ea-detail').fill('래미안아파트 101동 1203호');
  await expect(page.locator('#ea-manual')).toBeVisible();
  await expect(page.locator('#ea-manual')).toHaveText('동·층·호 말고 다른 한글은 영문으로 직접 적어 주세요. 아파트 이름은 빼도 돼요.');
  await expect(line2.getByRole('button')).toBeDisabled();
  await expect(page.locator('.ea-full')).toHaveText('110 Sejong-daero, Jung-gu, Seoul 04524');
  // Acting-Arch Q6: symbols are dropped, and the visitor sees the final line 2 and the one-line address before copying.
  await page.locator('#ea-detail').fill('#1203호');
  await expect(page.locator('#ea-manual')).toBeHidden();
  await expect(line2.locator('.ea-val')).toHaveText('1203-ho');
  await expect(page.locator('.ea-full')).toHaveText('1203-ho, 110 Sejong-daero, Jung-gu, Seoul 04524');
  await page.locator('#ea-detail').fill('지하1층 3호');
  await expect(page.locator('#ea-manual')).toBeHidden();
  await expect(line2.locator('.ea-val')).toHaveText('B1F 3-ho');
  await expect(line2.getByRole('button')).toBeEnabled();
});

test('Sejong (no sgg): city is the si; an unexpected road shape puts the one-line copy first', async ({ page }) => {
  await api(page, ok([SEJONG_CITY, ODD]));
  await gotoReady(page, PATH);
  await search(page, '다솜로 261');
  await page.locator('.ea-card').nth(0).getByRole('button', { name: '이 주소 쓰기' }).click();
  await expect(page.locator('[data-row="line1"] .ea-val')).toHaveText('261 Dasom-ro');
  await expect(page.locator('[data-row="city"] .ea-val')).toHaveText('Sejong-si');
  await expect(page.locator('.ea-split')).toHaveAttribute('data-fallback', 'false');
  await page.locator('.ea-card').nth(1).getByRole('button', { name: '이 주소 쓰기' }).click();
  await expect(page.locator('.ea-split')).toHaveAttribute('data-fallback', 'true');
  await expect(page.locator('[data-row="line1"] .ea-val')).toHaveText(ODD.road);
  const order = await page.locator('.ea-split').evaluate((s) => [...s.children].map((c) => c.className || c.tagName));
  expect(order.indexOf('ea-full-row')).toBeLessThan(order.indexOf('ea-rows'));
});

test('clipboard refused and no execCommand: the value is selected, 「길게 눌러 복사해 주세요」', async ({ page }) => {
  await page.addInitScript(() => {
    if (navigator.clipboard) Object.defineProperty(navigator.clipboard, 'writeText', { value: () => Promise.reject(new Error('denied')) });
    Object.defineProperty(document, 'execCommand', { value: () => false });
  });
  const seen = await beacons(page);
  await api(page, ok([SEJONG]));
  await gotoReady(page, PATH);
  await search(page, '세종대로 110');
  await page.getByRole('button', { name: '이 주소 쓰기' }).click();
  await page.getByRole('button', { name: 'ZIP code 복사' }).click();
  await expect(page.locator('#ea-live')).toHaveText('길게 눌러 복사해 주세요');
  expect(await page.evaluate(() => getSelection()?.toString())).toBe('04524');
  // Review should-fix 4: nothing was copied, so no download is counted.
  await expect.poll(() => seen.filter((e) => e.e === 'success').length).toBe(1);
  await page.waitForTimeout(500);
  expect(seen.filter((e) => e.e === 'download')).toEqual([]);
});

test('page: SEO, JSON-LD (WebApplication + FAQPage), related tools, privacy and source links, CSP', async ({ page }) => {
  const res = await gotoReady(page, PATH);
  expect(res?.status()).toBe(200);
  expect(res?.headers()['content-security-policy'] ?? '').not.toMatch(/juso/);
  await expect(page).toHaveTitle('영문주소 변환기 — 도로명주소 영문 변환·해외직구 주소 칸 | 문서딱');
  await expect(page.locator('h1')).toHaveText('영문주소 변환기');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('meta[name="keywords"]')).toHaveCount(0);
  const desc = (await page.locator('meta[name="description"]').getAttribute('content')) ?? '';
  expect(desc).toContain('영문 도로명주소');
  expect([...desc].length).toBeGreaterThanOrEqual(40);
  expect([...desc].length).toBeLessThanOrEqual(80);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/english-address\/$/);
  const data = (await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap((j) => JSON.parse(j));
  expect(data.find((d: { '@type': string }) => d['@type'] === 'WebApplication')).toMatchObject({ applicationCategory: 'UtilitiesApplication', offers: { price: 0 } });
  const faq = data.find((d: { '@type': string }) => d['@type'] === 'FAQPage');
  expect(faq.mainEntity.map((q: { name: string }) => q.name)).toEqual(['어떤 주소로 바꿔 주나요?', '해외직구 칸에는 어떻게 넣나요?', '상세주소는 어떻게 쓰나요?', '적은 주소를 저장하나요?']);
  await expect(page.locator('.related a')).toHaveCount(3);
  await expect(page.locator('.related').getByRole('link', { name: '여권·증명사진 규격 맞추기' })).toHaveAttribute('href', '/id-photo/');
  await expect(page.locator('.related').getByRole('link', { name: 'PDF 합치기' })).toHaveAttribute('href', '/pdf-merge/');
  // CARD1026 C19: 영문 명함.
  await expect(page.locator('.related').getByRole('link', { name: '전자명함 만들기' })).toHaveAttribute('href', '/business-card/');
  await expect(page.locator('#ea-privacy')).toHaveText('찾는 주소는 행정안전부 주소 검색으로 보내 영문 주소를 받아 와요. 문서딱은 저장하지 않아요. 개인정보 처리방침');
  await expect(page.locator('#ea-privacy a')).toHaveAttribute('href', '/privacy/#addr');
  await expect(page.locator('.ea-source a')).toHaveAttribute('href', 'https://www.juso.go.kr/');
  await expect(page.locator('main')).not.toContainText('보내지 않아요');
  await expect(page.locator('#ea-q')).toHaveAttribute('type', 'search');
  await expect(page.locator('#ea-q')).toHaveAttribute('enterkeyhint', 'search');
  await expect(page.locator('#ea-q')).toHaveAttribute('autocomplete', 'off');
  const go = await page.getByRole('button', { name: '찾기', exact: true }).boundingBox();
  expect(go!.height).toBeGreaterThanOrEqual(44);
});

test('/privacy/ and /terms/ name the address search; home links the tool', async ({ page }) => {
  await gotoReady(page, '/privacy/');
  const addr = page.locator('#addr');
  await expect(addr).toContainText('영문주소 변환기에서 주소를 보내는 경우');
  await expect(page.locator('main')).toContainText('행정안전부 주소정보누리집 (주소 검색), Cloudflare, Inc. (전달)');
  await expect(page.locator('main')).toContainText('상세주소(동·호)는 보내지 않고 이 기기 안에서 바꿔요.');
  await expect(page.locator('main')).toContainText('개인정보 보호책임자');
  // Acting-Arch round 2: 처리 위탁 framing, the typed address only, the IP only counted for a minute, 행정안전부's own policy linked.
  await expect(page.locator('main')).toContainText('처리 위탁: 행정안전부 주소정보누리집 (주소 검색), Cloudflare, Inc. (전달)');
  await expect(page.locator('main')).toContainText('찾기 칸에 적은 주소 글자만 보내요.');
  await expect(page.locator('main')).toContainText('너무 많은 요청을 막으려고 접속한 IP 주소로 1분 동안의 요청 수만 세고, 기록하거나 저장하지 않아요.');
  await expect(page.locator('main').getByRole('link', { name: '주소정보누리집 개인정보처리방침' })).toHaveAttribute('href', 'https://www.juso.go.kr/Privacy');
  await expect(page.locator('h2').first()).toHaveText('1. 이름·연락처는 받지 않아요');
  await gotoReady(page, '/terms/');
  await expect(page.locator('#addr')).toContainText('상세주소(동·호) 바꾸기는 참고용이니');
  await gotoReady(page, '/');
  await expect(page.locator('.card.live').getByRole('link', { name: '영문주소 변환기' })).toHaveAttribute('href', PATH);
});

test('axe: no serious or critical violations, before and after results; 360 px has no horizontal scroll', async ({ page }) => {
  await api(page, ok([SEJONG, BANPO]));
  await page.setViewportSize({ width: 360, height: 740 });
  await gotoReady(page, PATH);
  const bad = async () => (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(await bad()).toEqual([]);
  await search(page, '세종대로 110');
  await page.locator('.ea-card').first().getByRole('button', { name: '이 주소 쓰기' }).click();
  await page.locator('#ea-detail').fill('101동 1203호');
  // The focus move scrolls the split card under the sticky header's bottom edge; scrolled there, the header covers part
  // of the 찾기 button above and axe counts that overlap as a target-size failure (any page scrolled to the middle of a
  // control does). Back at the top (the whole DOM, the split card included, is still checked) once the scroll stops.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => new Promise<boolean>((r) => { const y = scrollY; setTimeout(() => r(scrollY === y), 250); }))).toBe(true);
  expect(await bad()).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('no late UI face before interaction (networkidle + 1 s)', async ({ page, network }) => {
  await gotoReady(page, PATH);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  expect(network.requests.map((r) => r.url()).filter((u) => LATE_FACE.test(u))).toEqual([]);
});
