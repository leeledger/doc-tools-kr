// Show/hide toggle for a password field (brief Polish P.17): 44×44, aria-pressed, switches the input type.
const EYE = '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>';

export function passwordToggle(field: HTMLInputElement): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn small ghost icon-btn pw-toggle';
  btn.setAttribute('aria-label', '비밀번호 보기');
  btn.setAttribute('aria-pressed', 'false');
  btn.dataset.role = 'pw-toggle';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'ico');
  svg.innerHTML = EYE;
  btn.append(svg);
  bindPasswordToggle(btn, field);
  return btn;
}

/** Wires a server-rendered toggle button (the compress page) to its field. */
export function bindPasswordToggle(btn: HTMLButtonElement, field: HTMLInputElement): void {
  btn.addEventListener('click', () => {
    const show = field.type === 'password';
    field.type = show ? 'text' : 'password';
    btn.setAttribute('aria-pressed', String(show));
  });
}
