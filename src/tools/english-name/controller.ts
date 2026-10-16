// 영문 이름 변환기 (ROMANIZE1016 D4): the page controller. Updates on input / compositionend (150 ms), builds the surname
// and syllable choices, the three rows, warnings and the owner's note (all late copy). Stores nothing (no Web Storage,
// no IndexedDB, no URL state): the name lives in the two inputs only.
import { composeGiven, customSurname, formatName, inSurnameList, SHAPES, surnameChoices, syllableChoices, warningsFor, type Case, type Choice, type Shape } from './options';
import { GIVEN_MAX, normalizeName, SURNAME_MAX, validPart } from './romanize';
import { PASSPORT_BASIC_URL, PASSPORT_CHANGE_URL, PASSPORT_SEARCH_URL } from './sources';

const T = {
  invalid: '한글 이름만 바꿀 수 있어요. 받침까지 다 쓴 글자로 넣어 주세요.',
  split: '성과 이름을 나눠 넣었어요. 성이 두 글자면 고쳐 주세요.',
  rule: '표기법대로',
  ruleSyllable: '표기법',
  custom: '직접 쓰기',
  customLabel: '직접 쓴 성 영문 표기',
  customHint: '부모님이나 형제 여권의 성 표기를 영문 알파벳으로 써 주세요. 빈칸과 붙임표(-)도 쓸 수 있어요.',
  surCaption: '외교부 여권 통계 예시(2024년 10월 31일 기준)에서 이 성을 가진 사람 중 이 표기를 쓰는 비율',
  surNotListed: '이 성은 외교부 통계 예시에 없어요.',
  sylCaption: '외교부 여권 통계 예시(2024년 10월 31일 기준)에서 이 음절을 이름에 쓰는 사람 중 이 표기를 쓰는 비율',
  sylLegend: (s: string): string => `이름 「${s}」 표기`,
  negative: '영어로 읽으면 좋지 않은 뜻이 될 수 있는 철자예요(외교부 예시). 다른 표기를 고를 수 있어요.',
  single: '한 글자 영문 이름은 항공권 예약이나 출입국 때 불편할 수 있다고 외교부가 안내해요.',
  copied: '복사했어요',
  copyRefused: '길게 눌러 복사해 주세요',
  owner: '여권 영문 이름은 한 번 정하면 바꾸기 어려워요. 기존 여권·가족 표기와 맞추고, 최종 확인은 외교부 안내를 따르세요.',
  newTab: ' (새 창)',
  links: [
    [PASSPORT_BASIC_URL, '외교부: 로마자성명 표기의 기본방법'],
    [PASSPORT_CHANGE_URL, '외교부: 로마자성명 표기의 변경 허용 요건'],
    [PASSPORT_SEARCH_URL, '외교부: 추천 로마자 성명 검색'],
  ] as const,
};

const pct = (n: number): string => `${n.toFixed(2)}%`;

export interface EnglishNameHooks {
  /** The first valid result of this page view. */
  onResult?: () => void;
  /** A row was copied to the clipboard. */
  onCopy?: (shape: Shape) => void;
}

export function initEnglishName(hooks: EnglishNameHooks = {}): void {
  const byId = <E extends HTMLElement>(id: string): E => document.getElementById(id) as E;
  const form = byId<HTMLFormElement>('en-form');
  if (!form) return;
  const sur = byId<HTMLInputElement>('en-sur');
  const given = byId<HTMLInputElement>('en-given');
  const error = byId<HTMLElement>('en-error');
  const hint = byId<HTMLElement>('en-hint');
  const result = byId<HTMLElement>('en-result');
  const rowsBox = byId<HTMLElement>('en-rows');
  const status = byId<HTMLElement>('en-status');
  const live = byId<HTMLElement>('en-live');
  const warnBox = byId<HTMLElement>('en-warn');
  const surChoices = byId<HTMLElement>('en-sur-choices');
  const surCaption = byId<HTMLElement>('en-sur-caption');
  const sylBox = byId<HTMLElement>('en-syl');
  const noteBox = byId<HTMLElement>('en-note');
  const out: Record<Shape, HTMLElement> = { joined: byId('en-joined'), hyphen: byId('en-hyphen'), space: byId('en-space') };

  let shownSur = '';
  let shownGiven = '';
  let choices: Choice[] = [];
  /** Index into `choices`, or -1 for 직접 쓰기. */
  let surPick = 0;
  let customInput: HTMLInputElement | null = null;
  let picks: (string | undefined)[] = [];
  let composing = false;
  let timer = 0;
  let announce = false;
  let lastAnnounce = 0;
  let announceTimer = 0;
  let resulted = false;

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const chip = (group: string, value: string, label: string, checked: boolean): HTMLLabelElement => {
    const l = el('label', 'chip');
    const input = el('input');
    input.type = 'radio';
    input.name = group;
    input.value = value;
    input.checked = checked;
    l.append(input, el('span', undefined, label));
    return l;
  };
  const label = (c: Choice, ruleWord: string): string => [c.spelling, c.pct === undefined ? '' : pct(c.pct), c.rule ? ruleWord : ''].filter(Boolean).join(' ');

  const buildSurname = (s: string): void => {
    choices = surnameChoices(s);
    surPick = 0;
    surChoices.replaceChildren(...choices.map((c, i) => chip('en-sur', String(i), label(c, T.rule), i === 0)), chip('en-sur', 'custom', T.custom, false));
    customInput = el('input', 'num-input en-custom');
    customInput.type = 'text';
    customInput.maxLength = 30;
    customInput.autocomplete = 'off';
    customInput.spellcheck = false;
    customInput.setAttribute('autocapitalize', 'characters');
    customInput.setAttribute('aria-label', T.customLabel);
    customInput.setAttribute('lang', 'en');
    customInput.hidden = true;
    customInput.addEventListener('input', renderRows);
    const customHint = el('p', 'en-caption en-custom-hint', T.customHint);
    customHint.hidden = true;
    customHint.id = 'en-custom-hint';
    customInput.setAttribute('aria-describedby', customHint.id);
    surChoices.append(customInput, customHint);
    surCaption.textContent = inSurnameList(s) ? T.surCaption : T.surNotListed;
  };

  const buildGiven = (g: string): void => {
    picks = [...g].map(() => undefined);
    const rows: HTMLElement[] = [];
    [...g].forEach((syl, i) => {
      const cs = syllableChoices(syl);
      if (!cs) return;
      const box = el('fieldset', 'levels en-pick');
      box.append(el('legend', undefined, T.sylLegend(syl)));
      const group = el('div', 'chips');
      cs.forEach((c, k) => group.append(chip(`en-syl-${i}`, c.rule ? '' : c.spelling, label(c, T.ruleSyllable), k === 0)));
      box.append(group);
      box.dataset.index = String(i);
      rows.push(box);
    });
    if (rows.length) rows.push(el('p', 'en-caption', T.sylCaption));
    sylBox.replaceChildren(...rows);
  };

  const buildNote = (): void => {
    const list = el('ul', 'en-links');
    for (const [href, text] of T.links) {
      const a = el('a', undefined, text);
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener';
      a.append(el('span', 'visually-hidden', T.newTab));
      const li = el('li');
      li.append(a);
      list.append(li);
    }
    noteBox.replaceChildren(el('p', 'en-owner', T.owner), list);
  };

  const surnameSpelling = (): string | null => {
    if (surPick >= 0) return choices[surPick]?.spelling ?? null;
    return customSurname(customInput?.value ?? '');
  };

  const say = (text: string): void => {
    if (!announce) return;
    window.clearTimeout(announceTimer);
    const wait = lastAnnounce + 1000 - Date.now();
    const put = (): void => {
      lastAnnounce = Date.now();
      live.textContent = text;
    };
    if (wait <= 0) put();
    else announceTimer = window.setTimeout(put, wait);
  };

  function renderRows(): void {
    const letterCase: Case = (document.querySelector<HTMLInputElement>('input[name="en-case"]:checked')?.value as Case) === 'title' ? 'title' : 'upper';
    const custom = surPick < 0;
    if (customInput) customInput.hidden = !custom;
    const customHint = document.getElementById('en-custom-hint');
    if (customHint) customHint.hidden = !custom;
    const s = surnameSpelling();
    status.textContent = '';
    if (s === null) {
      rowsBox.hidden = true;
      warnBox.replaceChildren();
      return;
    }
    rowsBox.hidden = false;
    const g = composeGiven(shownGiven, picks);
    for (const shape of SHAPES) out[shape].textContent = formatName(s, g, shape, letterCase);
    const w = warningsFor(s, g);
    warnBox.replaceChildren(...(w.negative ? [el('p', 'warn-box', T.negative)] : []), ...(w.single ? [el('p', 'warn-box', T.single)] : []));
    say(out.joined.textContent ?? '');
  }

  const hideResult = (): void => {
    result.hidden = true;
    shownSur = '';
    shownGiven = '';
  };

  /** Reads both inputs; shows the error, or the result for a valid name. Returns whether a result is shown. */
  const update = (): boolean => {
    window.clearTimeout(timer);
    timer = 0;
    const s = normalizeName(sur.value);
    const g = normalizeName(given.value);
    const badS = s !== '' && !validPart(s, 1, SURNAME_MAX);
    const badG = g !== '' && !validPart(g, 1, GIVEN_MAX);
    if (badS || badG) {
      // Mid-composition text (a lone jamo before the syllable is done) is not an error yet.
      if (composing) return !result.hidden;
      error.textContent = T.invalid;
      sur.setAttribute('aria-invalid', String(badS));
      given.setAttribute('aria-invalid', String(badG));
      hideResult();
      return false;
    }
    error.textContent = '';
    sur.removeAttribute('aria-invalid');
    given.removeAttribute('aria-invalid');
    if (!s || !g) {
      hideResult();
      return false;
    }
    if (s !== shownSur) buildSurname(s);
    if (g !== shownGiven) buildGiven(g);
    shownSur = s;
    shownGiven = g;
    if (!noteBox.firstChild) buildNote();
    result.hidden = false;
    renderRows();
    if (!resulted) {
      resulted = true;
      hooks.onResult?.();
    }
    return true;
  };

  const schedule = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(update, 150);
  };

  for (const input of [sur, given]) {
    input.addEventListener('input', (e) => {
      composing = (e as InputEvent).isComposing === true;
      hint.textContent = '';
      schedule();
    });
    input.addEventListener('compositionstart', () => {
      composing = true;
    });
    input.addEventListener('compositionend', () => {
      composing = false;
      schedule();
    });
  }

  // A full name pasted into 성 (3+ syllables) would be cut by maxlength: syllable 1 → 성, the rest → 이름.
  sur.addEventListener('paste', (e) => {
    const text = normalizeName(e.clipboardData?.getData('text/plain') ?? '');
    const chars = [...text];
    if (chars.length < 3 || !validPart(text, 3, 1 + GIVEN_MAX)) return;
    e.preventDefault();
    sur.value = chars[0]!;
    given.value = chars.slice(1).join('');
    hint.textContent = T.split;
    update();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (update()) result.focus();
    else (sur.getAttribute('aria-invalid') === 'true' || !normalizeName(sur.value) ? sur : given).focus();
  });

  result.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'en-sur') {
      surPick = t.value === 'custom' ? -1 : Number(t.value);
      if (surPick < 0) {
        renderRows();
        customInput?.focus();
        return;
      }
    } else if (t.name.startsWith('en-syl-')) {
      picks[Number(t.name.slice('en-syl-'.length))] = t.value || undefined;
    } else if (t.name !== 'en-case') return;
    renderRows();
  });

  rowsBox.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-copy]');
    if (!btn) return;
    const shape = btn.dataset.copy as Shape;
    const node = out[shape];
    const text = node.textContent ?? '';
    if (!text) return;
    const refused = (): void => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      status.textContent = T.copyRefused;
    };
    if (!navigator.clipboard?.writeText) return refused();
    navigator.clipboard.writeText(text).then(() => {
      status.textContent = T.copied;
      hooks.onCopy?.(shape);
    }, refused);
  });

  // Values the browser restored (back/forward) are shown silently: now, and again on pageshow.
  const silent = (): void => {
    announce = false;
    update();
    announce = true;
  };
  silent();
  window.addEventListener('pageshow', silent);
}
