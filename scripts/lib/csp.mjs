// The site-wide Content-Security-Policy line of a _headers file (REV5 Decision 4): the one in the `/*` block. Other
// blocks may carry their own policy (/embed/id-photo/* allows framing and ships no third-party script), and those
// lines are never touched by the GA or Web Analytics extensions.

/**
 * `headers` with `transform` applied to the Content-Security-Policy line of the `/*` block, or null unless that block
 * has exactly one such line. Every other line, the other blocks' policies included, stays byte for byte.
 * @param {string} headers
 * @param {(line: string) => string} transform
 */
export function extendSiteCsp(headers, transform) {
  const lines = headers.split('\n');
  const start = lines.findIndex((l) => l.trimEnd() === '/*');
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && (lines[end].trim() === '' || /^\s/.test(lines[end]))) end++;
  const at = [];
  for (let i = start + 1; i < end; i++) if (/^\s+Content-Security-Policy:/.test(lines[i])) at.push(i);
  if (at.length !== 1) return null;
  lines[at[0]] = transform(lines[at[0]]);
  return lines.join('\n');
}
