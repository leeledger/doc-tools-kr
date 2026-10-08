// The /admin/ visits trend (brief handoff/ARCHITECT-BRIEF-ADMIN-VISITS.md, step 3): one series (visits) as columns
// in a server-rendered inline SVG, with the numbers also as a table under "표로 보기". No script, no external
// reference, no data in style attributes: geometry is in SVG attributes, colours come from the page's CSS variables
// (currentColor). The SVG stretches to the container (preserveAspectRatio none, so nothing is wider than 360 px);
// its labels are HTML around it so text never scales with the drawing. Every string goes through esc.
// The y-axis (ADMIN-CHART-AXIS): "nice" integer ticks from niceTicks, columns scaled to the top tick (not the max),
// gridlines drawn before the columns. The tick labels are an HTML column beside the SVG; the ticks are evenly
// spaced, so the CSS spreads them with space-between over the plot height (no per-label position in markup).
import { escapeHtml as esc } from './usage.mjs';

const count = (n) => Math.round(Number.isFinite(n) ? n : 0).toLocaleString('en-US');
const SLOT = 10; // viewBox units per bucket
const BAR = 8; // column width; the 2-unit gap shows the surface between columns
const H = 100;

/**
 * Integer y-axis ticks from 0 with a 1/2/5 x 10^n step: 3-5 ticks, the top tick >= max. The step is the smallest one
 * that covers max in at most 4 intervals; at least 2 intervals are drawn. max <= 0 (or not a number) counts as 1.
 * @param {number} max
 * @returns {number[]} ascending, starting at 0
 */
export function niceTicks(max) {
  const m = Number.isFinite(max) && max > 0 ? Math.ceil(max) : 1;
  let step = 1;
  for (let mag = 1; ; mag *= 10) {
    const s = [1, 2, 5].map((k) => k * mag).find((k) => Math.ceil(m / k) <= 4);
    if (s) {
      step = s;
      break;
    }
  }
  const n = Math.max(2, Math.ceil(m / step));
  return Array.from({ length: n + 1 }, (_, i) => i * step);
}

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
 * its value, the y-axis range) and the table. All zero -> the empty sentence instead of the SVG, the table stays.
 * @param {{ label: string, visits: number, pageViews: number }[]} trend
 * @param {{ title: string, desc?: string, id?: string }} opts
 */
export function trendSvg(trend, { title, desc, id = 'visits-trend' }) {
  const values = trend.map((b) => Math.max(0, Math.round(Number.isFinite(b.visits) ? b.visits : 0)));
  const max = Math.max(0, ...values);
  if (!trend.length || max === 0) return `<p class="muted">이 기간에는 방문 기록이 없어요.</p>\n${table(trend, title)}`;
  const total = values.reduce((a, b) => a + b, 0);
  const top = values.indexOf(max);
  const ticks = niceTicks(max);
  const scale = ticks[ticks.length - 1];
  const description = desc ?? `모두 약 ${count(total)}회. 가장 많은 때는 ${trend[top].label}, 약 ${count(max)}회. 세로 눈금은 0회부터 ${count(scale)}회까지.`;
  const w = trend.length * SLOT;
  const cols = values
    .map((v, i) => {
      const x = i * SLOT;
      const tip = `<title>${esc(trend[i].label)}: 방문 약 ${count(v)}회</title>`;
      const h = v === 0 ? 0 : Math.max(1, (v / scale) * H);
      const bar = h ? `<rect class="col" x="${x + 1}" y="${(H - h).toFixed(2)}" width="${BAR}" height="${h.toFixed(2)}"/>` : '';
      return `<g>${tip}<rect class="hit" x="${x}" y="0" width="${SLOT}" height="${H}"/>${bar}</g>`;
    })
    .join('');
  const y = (t) => (H - (t / scale) * H).toFixed(2);
  const grid = ticks
    .slice(1)
    .map((t) => `<line class="grid" x1="0" y1="${y(t)}" x2="${w}" y2="${y(t)}" vector-effect="non-scaling-stroke"/>`)
    .join('');
  const yLabels = [...ticks].reverse().map((t) => `<span>${count(t)}</span>`).join('');
  const mid = Math.floor((trend.length - 1) / 2);
  const xLabels = [...new Set([0, mid, trend.length - 1])].map((i) => `<span>${esc(trend[i].label)}</span>`).join('');
  return `<figure class="chart">
<p class="chart-unit" aria-hidden="true">(회)</p>
<p class="chart-y" aria-hidden="true">${yLabels}</p>
<svg role="img" aria-labelledby="${id}-t ${id}-d" viewBox="0 0 ${w} ${H}" preserveAspectRatio="none" focusable="false">
<title id="${id}-t">${esc(title)}</title>
<desc id="${id}-d">${esc(description)}</desc>
${grid}
${cols}
<line class="base" x1="0" y1="${H}" x2="${w}" y2="${H}" vector-effect="non-scaling-stroke"/>
</svg>
<p class="chart-x" aria-hidden="true">${xLabels}</p>
</figure>
${table(trend, title)}`;
}
