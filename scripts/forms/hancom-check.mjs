// FORM1020 D12: the real-한글 gate for the form builder. For every form spec (src/data/forms), builds the blank form,
// the filled sample and the all-max cases with the real engine in Node (src/lib/form/build.ts, the same code the
// worker runs), passes each through the HWP reload gate (src/lib/hwp/export-hwp.ts), writes the .hwp, then opens it
// in the installed 한글 through COM (./hancom-open.ps1): it must open, be 1 page in 한글, and 한글's own text must
// hold every docLabel, every section label and every value's document text (docText: dates, amounts in 한글). 한글's PDF of each file is saved next to it
// for a visual compare. Output: spikes/forms-hancom/ (git-ignored).
//   npm run forms:hancom                       every spec
//   npm run forms:hancom -- --file a.hwp       open one file (a live download) and report pages + text only
// Without 한글 (no HWPFrame.HwpObject, e.g. CI) it prints 「SKIP: 한글 not installed」 and exits 0. Exit 1 on any failure.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'spikes', 'forms-hancom');
const PS1 = join(ROOT, 'scripts', 'forms', 'hancom-open.ps1');
const flat = (s) => s.replace(/\s+/g, '');
/** Windows PowerShell by its full path (Git Bash and npm do not always have it on PATH). */
const POWERSHELL = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

function hancomInstalled() {
  if (process.platform !== 'win32') return false;
  try {
    const out = execFileSync(POWERSHELL, ['-NoProfile', '-Command', "if ([type]::GetTypeFromProgID('HWPFrame.HwpObject')) { 'yes' } else { 'no' }"], { encoding: 'utf8' });
    return out.trim() === 'yes';
  } catch {
    return false;
  }
}

/**
 * Opens `hwp` in 한글: { open, pages, version, text }. 한글 asks once per file (보안 승인: 「접근 허용」) unless its
 * FilePathCheckerModule is registered (HKCUSOFTWAREHNCHwpAutomationModules, not done here); this script never
 * answers that window: a person at the PC does (up to 10 minutes per file).
 */
function openInHancom(hwp, pdf = '') {
  const pidFile = `${hwp}.pid`;
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1, '-Path', hwp, '-PidFile', pidFile];
  if (pdf) args.push('-Pdf', pdf);
  let r;
  try {
    r = JSON.parse(execFileSync(POWERSHELL, args, { encoding: 'utf8', timeout: 600_000 }).trim().split(/\r?\n/).pop());
  } catch (err) {
    // No answer to 한글's window in time (or 한글 failed): end only the 한글 process this run started. The pid file
    // exists only when exactly one new Hwp process appeared at launch (hancom-open.ps1); never any other 한글.
    try {
      const pid = Number(readFileSync(pidFile, 'utf8').trim());
      if (Number.isInteger(pid) && pid > 0) process.kill(pid);
    } catch {
      // Already gone.
    }
    return { open: false, pages: 0, version: '', text: '', error: err.code === 'ETIMEDOUT' ? 'no answer to 한글 (접근 허용) in 10 minutes' : String(err.message ?? err).slice(0, 200) };
  } finally {
    rmSync(pidFile, { force: true });
  }
  let text = '';
  try {
    text = readFileSync(`${hwp}.txt`, 'utf8');
  } catch {
    // Not opened: no text.
  }
  return { ...r, text };
}

async function loadModules() {
  const bundle = join(ROOT, 'node_modules', '.cache', `forms-hancom-${process.pid}.mjs`);
  await build({
    stdin: {
      contents: [
        "export { buildForm } from './src/lib/form/build.ts';",
        "export { normalizeValues, docText } from './src/lib/form/values.ts';",
        "export { FORM_SPECS } from './src/data/forms/index.ts';",
        "export { exportHwp } from './src/lib/hwp/export-hwp.ts';",
        "export { SAMPLE_VALUES, allMaxValues, allMaxLines } from './tests/helpers/form-samples.ts';",
      ].join('\n'),
      resolveDir: ROOT,
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundle,
    logLevel: 'error',
  });
  const m = await import(pathToFileURL(bundle).href);
  rmSync(bundle, { force: true });
  const rhwp = await import(pathToFileURL(join(ROOT, 'node_modules', '@rhwp', 'core', 'rhwp.js')).href);
  globalThis.measureTextWidth = (font, text) => {
    const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16);
    let w = 0;
    for (const ch of text) {
      const cp = ch.codePointAt(0) ?? 0;
      w += (cp >= 0x1100 && cp <= 0x11ff) || (cp >= 0x3000 && cp <= 0x9fff) || (cp >= 0xac00 && cp <= 0xd7af) || (cp >= 0xff00 && cp <= 0xffef) ? px : px * 0.55;
    }
    return w;
  };
  await rhwp.default({ module_or_path: readFileSync(join(ROOT, 'node_modules', '@rhwp', 'core', 'rhwp_bg.wasm')) });
  return { ...m, Doc: rhwp.HwpDocument };
}

/** What 한글's text must contain for `spec` filled with `values`. */
function expected(m, spec, values) {
  const out = [];
  for (const f of spec.fields) {
    if (f.docLabel) out.push(f.docLabel);
    const d = m.docText(f, values[f.id] ?? '');
    if (d.trim()) out.push(d);
  }
  for (const b of spec.blocks) if (b.type === 'table' && b.docSection) out.push(b.docSection);
  return out;
}

async function main() {
  const fileArg = process.argv.indexOf('--file');
  const installed = hancomInstalled();
  if (fileArg > 0) {
    if (!installed) {
      console.log('SKIP: 한글 not installed');
      return 0;
    }
    const file = resolve(process.argv[fileArg + 1] ?? '');
    const r = openInHancom(file);
    console.log(JSON.stringify({ file, open: r.open, pages: r.pages, version: r.version }));
    console.log(r.text.trim());
    return r.open && r.pages >= 1 ? 0 : 1;
  }
  const m = await loadModules();
  mkdirSync(OUT, { recursive: true });
  const failures = [];
  const files = [];
  for (const spec of Object.values(m.FORM_SPECS)) {
    const cases = [
      ['blank', {}],
      ['sample', m.SAMPLE_VALUES[spec.id] ?? {}],
      ['all-max', m.allMaxValues(spec)],
      ['all-max-lines-25', m.allMaxLines(spec, 25)],
    ];
    for (const [name, raw] of cases) {
      const values = m.normalizeValues(spec, raw);
      const doc = m.Doc.createEmpty();
      const pages = m.buildForm(doc, spec, values);
      const r = m.exportHwp(doc, m.Doc);
      const file = join(OUT, `${spec.id}-${name}.hwp`);
      writeFileSync(file, r.bytes);
      files.push({ spec, name, values, file, pages, losses: r.losses });
      if (pages !== 1) failures.push(`${spec.id} ${name}: rhwp ${pages} pages`);
      if (r.losses) failures.push(`${spec.id} ${name}: rhwp reports ${r.losses} losses`);
    }
  }
  if (!installed) {
    console.log(`SKIP: 한글 not installed (built ${files.length} files in Node${failures.length ? '; ' + failures.join('; ') : ''})`);
    return failures.length ? 1 : 0;
  }
  let version = '';
  for (const f of files) {
    console.log(`opening ${f.file} in 한글 (answer 「접근 허용」 if 한글 asks)`);
    const r = openInHancom(f.file, f.file.replace(/\.hwp$/, '.hancom.pdf'));
    version ||= r.version;
    const text = flat(r.text);
    const missing = expected(m, f.spec, f.values).filter((s) => !text.includes(flat(s)));
    const ok = r.open && r.pages === 1 && !missing.length;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${f.spec.id} ${f.name}:${r.error ? ` ${r.error};` : ''} open=${r.open} 한글 pages=${r.pages} rhwp pages=${f.pages} bytes=${readFileSync(f.file).length}${missing.length ? ` missing: ${missing.map((s) => s.slice(0, 20)).join(' | ')}` : ''}`);
    if (!ok) failures.push(`${f.spec.id} ${f.name}`);
  }
  console.log(`한글 version ${version}; files in ${OUT}`);
  if (failures.length) {
    console.log(`FAIL: ${failures.join('; ')}`);
    return 1;
  }
  console.log('forms:hancom PASS');
  return 0;
}

process.exitCode = await main();
