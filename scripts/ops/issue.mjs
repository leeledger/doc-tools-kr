// Opens/updates or closes the ops issue of a label from a workflow step (docs/OPS-RUNBOOK.md).
//   node scripts/ops/issue.mjs open  --label ops:deploy --title "…" --body-file body.md [--dry-run]
//   node scripts/ops/issue.mjs close --label ops:deploy --body-file comment.md [--dry-run]
// `open` updates the open issue of the label if there is one (body replaced, comment added), else opens one.
// `close` comments on and closes every open issue of the label (recovery).
import { readFileSync } from 'node:fs';
import { isMain, parseArgs } from './lib/common.mjs';
import { createGitHub } from './lib/github.mjs';

export async function run(argv, io = {}) {
  const { positional, opts, dryRun } = parseArgs(argv);
  const error = io.error ?? console.error;
  const [cmd] = positional;
  if (!['open', 'close'].includes(cmd) || !opts.label || !opts['body-file'] || (cmd === 'open' && !opts.title)) {
    error('usage: issue.mjs open|close --label <label> [--title <title>] --body-file <file> [--dry-run]');
    return 2;
  }
  const body = readFileSync(opts['body-file'], 'utf8');
  const gh = io.github ?? createGitHub({ dryRun, log: io.log });
  if (cmd === 'open') await gh.upsert({ label: opts.label, title: opts.title, body, comment: body.length > 1500 ? '다시 실패했습니다. 본문을 갱신했습니다.' : body });
  else await gh.closeAll(opts.label, body);
  return 0;
}

if (isMain(import.meta)) process.exitCode = await run(process.argv.slice(2));
