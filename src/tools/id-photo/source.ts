// The source line under the 제출처 select ("기준일 … · 출처: …"). Shared by the page script (a deep link picks a
// preset before the controller loads) and the controller.
import type { IdPreset } from '../../data/id-photo-presets';

export function renderSource(source: HTMLElement, p: IdPreset): void {
  source.replaceChildren();
  if (p.status === 'user') {
    source.textContent = '직접 입력한 크기와 용량으로 맞춥니다.';
    return;
  }
  if (p.status === 'arithmetic') {
    source.textContent = `기관 규격이 아닌 일반 크기입니다. ${p.note ?? ''}`.trim();
    return;
  }
  source.append(`기준일 ${p.retrieved} · 출처: `);
  const a = document.createElement('a');
  a.href = p.sourceUrls[0]!;
  a.rel = 'noopener noreferrer';
  a.target = '_blank';
  a.textContent = `${p.source} (새 창)`;
  source.append(a);
  if (p.note) source.append(` · ${p.note}`);
}
