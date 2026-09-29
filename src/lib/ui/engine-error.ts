// Engine load failure (a worker script, chunk or wasm that did not arrive: offline, a tab left open across
// a deploy, a network hiccup). It is never the file's fault, so it never uses a file-error message
// (UX-AUDIT-1 P0-1 and §11.1). Written for every tool; 사진 용량 줄이기 is the first user, the PDF tools
// adopt it in the polish step after Step 3.

export const ENGINE_ERROR = {
  message: '처리 도구를 불러오지 못했습니다. 파일에는 문제가 없으니 새로고침한 뒤 다시 시도해 주세요.',
  offline: '인터넷 연결이 끊겨 처리 도구를 불러오지 못했습니다. 파일에는 문제가 없으니 연결을 확인한 뒤 새로고침해 주세요.',
  reload: '새로고침',
} as const;

export function engineErrorMessage(): string {
  return typeof navigator !== 'undefined' && navigator.onLine === false ? ENGINE_ERROR.offline : ENGINE_ERROR.message;
}

/** Fills `box` (a role="alert" element) with the message and a reload button, shows it, and returns the message. */
export function showEngineError(box: HTMLElement, reload: () => void = () => location.reload()): string {
  const msg = engineErrorMessage();
  const p = document.createElement('p');
  p.textContent = msg;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn primary';
  btn.textContent = ENGINE_ERROR.reload;
  btn.addEventListener('click', reload);
  box.replaceChildren(p, btn);
  box.hidden = false;
  return msg;
}

export function hideEngineError(box: HTMLElement): void {
  box.hidden = true;
  box.replaceChildren();
}
