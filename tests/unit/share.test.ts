// @vitest-environment jsdom
// Growth G.7 (T2): the share payload is exactly title, text and url, never a file; the fallbacks.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initShare, sharePayload, shareUrl } from '../../src/lib/ui/share';

const markup = (url?: string): string => `
<div class="share" data-share data-title="PDF 합치기 | 문서딱" data-text="여러 PDF를 한 파일로 묶어요."${url ? ` data-url="${url}"` : ''}>
  <button type="button" data-share-send hidden>링크 보내기</button>
  <button type="button" data-share-copy>링크 복사</button>
  <div data-share-fallback hidden><input data-share-field readonly></div>
  <p data-share-status></p>
</div>`;

const loc = (search = '') => ({ origin: 'https://docttak.com', pathname: '/photo-compress/', search });
const flush = () => new Promise((r) => setTimeout(r, 5));

let el: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = markup();
  el = document.querySelector<HTMLElement>('[data-share]')!;
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => setTimeout(cb, 0));
});

describe('share (T2)', () => {
  it('the payload keys are exactly title, text, url; the title says 문서딱; no blob or file name', () => {
    const p = sharePayload(el, loc('?target=200'));
    expect(Object.keys(p).sort()).toEqual(['text', 'title', 'url']);
    expect(p.title).toContain('문서딱');
    expect(p.url).toBe('https://docttak.com/photo-compress/?target=200');
    expect(p.url).not.toMatch(/blob:|\.(jpe?g|png|pdf)/i);
  });

  it('only a whitelisted query is shared; a guide shares its canonical', () => {
    expect(shareUrl(el, loc('?name=my-photo.jpg'))).toBe('https://docttak.com/photo-compress/');
    expect(shareUrl(el, loc('?target=200&file=x.pdf'))).toBe('https://docttak.com/photo-compress/');
    expect(shareUrl(el, loc('?preset=blob:https://x'))).toBe('https://docttak.com/photo-compress/');
    document.body.innerHTML = markup('https://docttak.com/guide/pdf-merge/');
    const g = document.querySelector<HTMLElement>('[data-share]')!;
    expect(shareUrl(g, loc('?target=200'))).toBe('https://docttak.com/guide/pdf-merge/');
  });

  it('"링크 보내기" stays hidden without navigator.share', () => {
    initShare(el, { navigator: {} as Navigator, location: loc() });
    expect(el.querySelector<HTMLButtonElement>('[data-share-send]')!.hidden).toBe(true);
  });

  it('share() gets exactly one argument with title, text, url; AbortError is silent', async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    initShare(el, { navigator: { share, clipboard: { writeText } } as unknown as Navigator, location: loc('?target=200') });
    const send = el.querySelector<HTMLButtonElement>('[data-share-send]')!;
    expect(send.hidden).toBe(false);
    send.click();
    await flush();
    expect(share).toHaveBeenCalledTimes(1);
    expect(share.mock.calls[0]!.length).toBe(1);
    expect(Object.keys(share.mock.calls[0]![0]).sort()).toEqual(['text', 'title', 'url']);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('any other share error falls back to copy', async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    initShare(el, { navigator: { share, clipboard: { writeText } } as unknown as Navigator, location: loc() });
    el.querySelector<HTMLButtonElement>('[data-share-send]')!.click();
    await flush();
    await flush();
    expect(writeText).toHaveBeenCalledWith('https://docttak.com/photo-compress/');
    expect(el.querySelector('[data-share-copy]')!.textContent).toBe('복사했어요');
    expect(el.querySelector('[data-share-status]')!.textContent).toBe('링크를 복사했어요');
  });

  it('a clipboard reject shows the read-only field with the URL', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    initShare(el, { navigator: { clipboard: { writeText } } as unknown as Navigator, location: loc('?target=200') });
    el.querySelector<HTMLButtonElement>('[data-share-copy]')!.click();
    await flush();
    expect(el.querySelector<HTMLElement>('[data-share-fallback]')!.hidden).toBe(false);
    expect(el.querySelector<HTMLInputElement>('[data-share-field]')!.value).toBe('https://docttak.com/photo-compress/?target=200');
  });

  it('no navigator at all: the field too', async () => {
    initShare(el, { navigator: undefined, location: loc() });
    el.querySelector<HTMLButtonElement>('[data-share-copy]')!.click();
    await flush();
    expect(el.querySelector<HTMLElement>('[data-share-fallback]')!.hidden).toBe(false);
  });
});
