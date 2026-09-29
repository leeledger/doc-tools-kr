import { version as pretendardVersion } from 'pretendard/package.json';

/** File names can contain characters outside the preloaded UI font subset; load the full dynamic subset once. */
export function loadDynamicFont(): void {
  if (document.getElementById('font-dynamic')) return;
  const link = document.createElement('link');
  link.id = 'font-dynamic';
  link.rel = 'stylesheet';
  link.href = `/fonts/pretendard/${pretendardVersion}/pretendardvariable-dynamic-subset.css`;
  document.head.append(link);
}
