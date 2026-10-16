// 영문주소 변환기 controller (ADDREN1016 decisions 6, 10, 12, 13, 17). Loaded lazily by entry.ts. Searches only on
// 찾기 / 더 보기 (no type-ahead), one request in flight; results as cards; 「이 주소 쓰기」 builds the split card with a copy
// button per field. The query, the results and the 상세주소 live only in this module's memory: no Web Storage,
// IndexedDB, URL or history, and the usage events carry only the event, the fail code and the copied field.
import { track } from '../../lib/ui/usage';
import type { AddrField } from '../../lib/ui/usage';
import { copyText } from './copy';
import { convertDetail } from './detail';
import { failCode, MANUAL, MESSAGES, messageCode } from './messages';
import { cleanQuery, lengthProblem, MAX_PAGE } from './query';
import { searchAddress, type SearchResult } from './search';
import { COUNTRY, fullLine, splitRoad, type AddrItem } from './split';

const PER_PAGE = 10;
const T = 'english-address';
const COPY = {
  count: (n: number) => `찾은 주소 ${n.toLocaleString('ko-KR')}개`,
  narrow: '건물 번호까지 적으면 더 빨리 찾아요.',
  more: '더 보기',
  use: '이 주소 쓰기',
  copy: '복사',
  copyRoad: '영문 도로명주소 복사',
  jibun: '지번',
  zip: '우편번호',
  splitTitle: '해외 직구 주소 칸에 나눠 넣기',
  detail: '상세주소 (동·호)',
  detailHint: '예: 101동 1203호',
  line2Empty: '동·호를 적으면 여기에 나와요',
  country: '나라: South Korea (Republic of Korea)',
  fallback: '이 주소는 칸으로 나누지 못했어요. 한 줄 주소를 먼저 쓰고, 칸이 나뉜 곳에는 아래 값을 참고해 주세요.',
  full: '한 줄로 복사',
  copied: '복사했어요',
  manual: '길게 눌러 복사해 주세요',
} as const;
const ROWS: { field: Exclude<AddrField, 'full' | 'road'>; label: string }[] = [
  { field: 'line1', label: 'Address line 1' },
  { field: 'line2', label: 'Address line 2' },
  { field: 'city', label: 'City' },
  { field: 'state', label: 'State·Province' },
  { field: 'zip', label: 'ZIP code' },
  { field: 'country', label: 'Country' },
];

type Attrs = Record<string, string | boolean | undefined>;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'text') e.textContent = String(v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...kids);
  return e;
}

export function initEnglishAddress(opts: { submitNow?: boolean } = {}): void {
  // Typed as present; the guard below returns when the page lacks any of them.
  const form = document.getElementById('ea-form') as HTMLFormElement;
  const input = document.getElementById('ea-q') as HTMLInputElement;
  const go = document.getElementById('ea-go') as HTMLButtonElement;
  const msg = document.getElementById('ea-msg') as HTMLElement;
  const results = document.getElementById('ea-results') as HTMLElement;
  const split = document.getElementById('ea-split') as HTMLElement;
  const live = document.getElementById('ea-live') as HTMLElement;
  if (!form || !input || !go || !msg || !results || !split || !live) return;

  let query = '';
  let page = 0;
  let total = 0;
  let items: AddrItem[] = [];
  let busy = false;

  const say = (text: string, error = false): void => {
    msg.textContent = text;
    if (error) msg.dataset.kind = 'error';
    else delete msg.dataset.kind;
  };
  const announce = (text: string): void => {
    // Re-set so the same words are announced again.
    live.textContent = '';
    window.setTimeout(() => (live.textContent = text), 50);
  };
  const setBusy = (on: boolean): void => {
    busy = on;
    go.disabled = on;
    results.setAttribute('aria-busy', String(on));
    const more = results.querySelector<HTMLButtonElement>('.ea-more');
    if (more) more.disabled = on;
  };

  async function copy(field: AddrField, value: string, shown: Element): Promise<void> {
    const how = await copyText(value, shown);
    announce(how === 'copied' ? COPY.copied : COPY.manual);
    // Review should-fix 4: a copy counts only when the clipboard got it (the manual fallback copied nothing yet).
    if (how === 'copied') track({ e: 'download', t: T, o: 'field', v: field });
  }

  function copyButton(field: AddrField, label: string, value: () => string, shown: () => Element): HTMLButtonElement {
    const b = h('button', { type: 'button', class: 'btn small ghost', 'data-field': field, 'aria-label': label, text: COPY.copy });
    b.addEventListener('click', () => void copy(field, value(), shown()));
    return b;
  }

  function renderSplit(item: AddrItem): void {
    const rows = splitRoad(item);
    let line2 = '';
    const heading = h('h2', { id: 'ea-split-title', tabindex: '-1', text: COPY.splitTitle });
    const picked = h('p', { class: 'ea-kor', text: item.kor });
    const detail = h('input', { id: 'ea-detail', class: 'ea-detail', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: COPY.detailHint, 'aria-describedby': 'ea-manual' });
    const manual = h('p', { class: 'ea-manual', id: 'ea-manual', hidden: true, text: MANUAL });
    const values = new Map<string, HTMLElement>();
    const valueOf = (field: string): string => {
      if (field === 'line1') return rows.line1;
      if (field === 'line2') return line2;
      if (field === 'city') return rows.city;
      if (field === 'state') return rows.state;
      if (field === 'zip') return rows.zip;
      if (field === 'country') return COUNTRY;
      return fullLine(item.road, item.zip, line2);
    };
    const dl = h('dl', { class: 'ea-rows' });
    for (const r of ROWS) {
      const val = h('span', { class: 'ea-val', lang: 'en', text: valueOf(r.field) });
      values.set(r.field, val);
      const btn = copyButton(r.field, `${r.label} ${COPY.copy}`, () => valueOf(r.field), () => val);
      dl.append(h('div', { 'data-row': r.field }, h('dt', { text: r.label }), h('dd', {}, val, btn)));
    }
    const country = h('p', { class: 'ea-note', text: COPY.country });
    const full = h('p', { class: 'ea-full', lang: 'en', text: valueOf('full') });
    const fullBtn = copyButton('full', COPY.full, () => valueOf('full'), () => full);
    fullBtn.textContent = COPY.full;
    fullBtn.className = 'btn small primary';
    const fullRow = h('div', { class: 'ea-full-row' }, full, fullBtn);

    const update = (): void => {
      const d = convertDetail(detail.value);
      manual.hidden = !d.needsManual;
      detail.setAttribute('aria-invalid', String(d.needsManual));
      line2 = d.line2;
      const v = values.get('line2')!;
      v.textContent = line2 || COPY.line2Empty;
      v.dataset.empty = String(!line2);
      v.lang = line2 ? 'en' : 'ko';
      const b = dl.querySelector<HTMLButtonElement>('[data-field="line2"]')!;
      b.disabled = !line2;
      full.textContent = valueOf('full');
    };
    detail.addEventListener('input', update);

    const parts: Node[] = [heading, picked];
    if (rows.fallback) parts.push(h('p', { class: 'ea-note', text: COPY.fallback }), fullRow);
    parts.push(h('label', { for: 'ea-detail', text: COPY.detail }), detail, manual, dl, country);
    if (!rows.fallback) parts.push(fullRow);
    const section = h('section', { class: 'ea-split', 'aria-labelledby': 'ea-split-title', 'data-fallback': String(rows.fallback) }, ...parts);
    split.replaceChildren(section);
    update();
    heading.focus();
  }

  function card(item: AddrItem): HTMLLIElement {
    const road = h('p', { class: 'ea-road', lang: 'en', text: item.road });
    const use = h('button', { type: 'button', class: 'btn small primary', text: COPY.use });
    const li = h(
      'li',
      { class: 'ea-card' },
      h('p', { class: 'ea-kor', text: item.kor }),
      road,
      ...(item.jibun ? [h('p', { class: 'ea-jibun' }, `${COPY.jibun}: `, h('span', { lang: 'en', text: item.jibun }))] : []),
      h('p', { class: 'ea-zip', text: `${COPY.zip} ${item.zip}` }),
      h('div', { class: 'ea-actions' }, use, copyButton('road', `${COPY.copyRoad}: ${item.road}`, () => item.road, () => road)),
    );
    use.addEventListener('click', () => {
      for (const c of Array.from(results.querySelectorAll<HTMLElement>('.ea-card'))) delete c.dataset.picked;
      li.dataset.picked = 'true';
      renderSplit(item);
    });
    return li;
  }

  const hasMore = (): boolean => items.length < total && page < MAX_PAGE;

  /** The first page: count, hint, list and 더 보기. */
  function renderList(): void {
    const parts: Node[] = [h('p', { class: 'ea-count', text: COPY.count(total) })];
    if (total > PER_PAGE) parts.push(h('p', { class: 'ea-hint', text: COPY.narrow }));
    parts.push(h('ol', { class: 'ea-list' }, ...items.map(card)));
    if (hasMore()) {
      const more = h('button', { type: 'button', class: 'btn ghost ea-more', text: COPY.more });
      more.addEventListener('click', () => void run(page + 1));
      parts.push(more);
    }
    results.replaceChildren(...parts);
  }

  /**
   * 더 보기 (review should-fix 3): the new cards are appended to the list, so the picked card keeps its mark, and focus
   * moves to the first new card (the pressed button may go away). Nothing already shown is rebuilt.
   */
  function appendCards(added: AddrItem[]): void {
    const list = results.querySelector('.ea-list');
    if (!list) return renderList();
    const lis = added.map(card);
    list.append(...lis);
    const count = results.querySelector('.ea-count');
    if (count) count.textContent = COPY.count(total);
    if (!hasMore()) results.querySelector('.ea-more')?.remove();
    const firstNew = lis[0];
    if (firstNew) {
      firstNew.tabIndex = -1;
      firstNew.focus();
    }
  }

  function fail(code: string, first: boolean): void {
    say(MESSAGES[messageCode(code)], true);
    const c = failCode(code);
    if (c && first) track({ e: 'fail', t: T, c, p: 'process' });
  }

  async function run(next: number): Promise<void> {
    if (busy) return;
    const first = next === 1;
    setBusy(true);
    let r: SearchResult;
    try {
      r = await searchAddress(query, next);
    } finally {
      setBusy(false);
    }
    if (!r.ok) {
      if (first) {
        results.replaceChildren();
        split.replaceChildren();
      }
      return fail(r.code, first);
    }
    if (first) {
      items = [];
      split.replaceChildren();
    }
    if (first && r.items.length === 0) {
      results.replaceChildren();
      return fail('none', true);
    }
    say('');
    page = next;
    total = r.total;
    items = [...items, ...r.items];
    if (first) {
      renderList();
      track({ e: 'success', t: T });
    } else appendCards(r.items);
  }

  function submit(): void {
    if (busy) return;
    const q = cleanQuery(input.value);
    track({ e: 'start', t: T });
    const problem = lengthProblem(q);
    if (problem) {
      results.replaceChildren();
      split.replaceChildren();
      return fail(problem, true);
    }
    query = q;
    void run(1);
  }

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    submit();
  });
  if (opts.submitNow) submit();
}
