// The /admin/ visits trend (brief handoff/ARCHITECT-BRIEF-ADMIN-VISITS.md, step 3): one series (visits) as columns
// in a server-rendered inline SVG, with the numbers also as a table under "표로 보기". No script, no external
// reference, no data in style attributes: geometry is in SVG attributes, colours come from the page's CSS variables
// (currentColor). The SVG stretches to the container (preserveAspectRatio none, so nothing is wider than 360 px);
// its labels are HTML around it so text never scales with the drawing. Every string goes through esc.
import { escapeHtml as esc } from './usage.mjs';

const count = (n) => Math.round(Number.isFinite(n) ? n : 0).toLocaleString('en-US');
const SLOT = 10; // viewBox units per bucket
const BAR = 8; // column width; the 2-unit gap shows the surface between columns
const H = 100;

/** The table under the chart: 기간 | 방문 | 페이지뷰. */
function table(trend, title) {
  const rows = trend.map((b) => `<tr><td>${esc(b.label)}</td><td class="num">${count(b.visits)}</td><td class="num">${count(b.pageViews)}</td></tr>`).join('\n');
  return `<details class="chart-table">
<summary>표로 보기</summary>
<div class="scroll" role="region" aria-label="${esc(title)} 표" tabindex="0">
<table>
<thead><tr><th scope="col">기간</th><th scope="col" class="num">방문</th><th scope="col" class="num">페이지뷰</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</div>
</details>`;
}

/**
 * trend: [{ label, visits, pageViews }] -> HTML: the chart (role="img" with title and desc: total, busiest bucket and
 * its value) and the table. All zero -> the empty sentence instead of the SVG, the table stays.
 * @param {{ label: string, visits: number, pageViews: number }[]} trend
 * @param {{ title: string, desc?: string, id?: string }} opts
 */
export function trendSvg(trend, { title, desc, id = 'visits-trend' }) {
  const values = trend.map((b) => Math.max(0, Math.round(Number.isFinite(b.visits) ? b.visits : 0)));
  const max = Math.max(0, ...values);
  if (!trend.length || max === 0) return `<p class="muted">이 기간에는 방문 기록이 없어요.</p>\n${table(trend, title)}`;
  const total = values.reduce((a, b) => a + b, 0);
  const top = values.indexOf(max);
  const description = desc ?? `모두 약 ${count(total)}회. 가장 많은 때는 ${trend[top].label}, 약 ${count(max)}회.`;
  const w = trend.length * SLOT;
  const cols = values
    .map((v, i) => {
      const x = i * SLOT;
      const tip = `<title>${esc(trend[i].label)}: 방문 약 ${count(v)}회</title>`;
      const h = v === 0 ? 0 : Math.max(1, (v / max) * (H - 2));
      const bar = h ? `<rect class="col" x="${x + 1}" y="${(H - h).toFixed(2)}" width="${BAR}" height="${h.toFixed(2)}"/>` : '';
      return `<g>${tip}<rect class="hit" x="${x}" y="0" width="${SLOT}" height="${H}"/>${bar}</g>`;
    })
    .join('');
  const mid = Math.floor((trend.length - 1) / 2);
  const xLabels = [...new Set([0, mid, trend.length - 1])].map((i) => `<span>${esc(trend[i].label)}</span>`).join('');
  return `<figure class="chart">
<p class="chart-max" aria-hidden="true">최대 ${count(max)}회</p>
<svg role="img" aria-labelledby="${id}-t ${id}-d" viewBox="0 0 ${w} ${H}" preserveAspectRatio="none" focusable="false">
<title id="${id}-t">${esc(title)}</title>
<desc id="${id}-d">${esc(description)}</desc>
<line class="grid" x1="0" y1="2" x2="${w}" y2="2" vector-effect="non-scaling-stroke"/>
${cols}
<line class="base" x1="0" y1="${H}" x2="${w}" y2="${H}" vector-effect="non-scaling-stroke"/>
</svg>
<p class="chart-x" aria-hidden="true">${xLabels}</p>
</figure>
${table(trend, title)}`;
}
