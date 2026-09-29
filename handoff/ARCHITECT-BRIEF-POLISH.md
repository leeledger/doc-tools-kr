# Architect Brief — Polish P (commercial readiness, from docs/UX-AUDIT-1.md)

Staged. Runs **after Step 3 (사진 용량 줄이기) ships and before Step 4 (여권사진)**. Promote it to ARCHITECT-BRIEF.md at that point. Decisions are logged in BUILD-LOG "Polish P decisions".

## Goal
Every P0 in UX-AUDIT-1 is fixed, and P1 is fixed for the live tools. After this step, an engine or deploy failure never reads as "파일 손상". The site names its operator. Mobile results show the download first, and nothing on the site promises a tool that is not live.

## Preconditions
- Step 3 is committed and live. `photo-compress` is `status: 'live'`.
- **Live tools** here means every `status: 'live'` entry of `src/data/tools.ts`: pdf-merge, pdf-compress and photo-compress. Site-wide items (P.1 engine-load helper, P.7 preload, P.9 header menu, P.10 icons, P.11 SW) apply to photo-compress as well. Photo **layout** is not changed.
- Before writing code, grep Step 3's final tree and BUILD-LOG "Step 3 build notes" for existing helpers: a KB formatter, `src/lib/codecs/wasm-browser.ts`, and any worker-error mapping. **Extend them; do not duplicate them.** List what you reused in REVIEW-REQUEST.

## Scope map
| ID | Audit ref | Section |
|---|---|---|
| P0-1 | 3.1/3.2/7.3, P0-1 | P.1 engine-load error, P.2 asset carry-forward, P.3 smoke:assets |
| P0-2 | 7.7, P0-2, P1-9 | P.4 operator, contact, 이용약관 |
| P0-3 | P0-3 | P.5 compress done order |
| P0-4 | P0-4 | P.6 live-only home/meta/OG/JSON-LD |
| P0-5 | 4, P0-5 | P.12 static weight instances |
| P1 | P1-1…P1-13 | P.7, P.9–P.11, P.13–P.17 |
| Monitoring | 7.10, P1-8 | P.18 beacon stub (off) |
| Domain | 7.9, P1-10 | P.19 runbook + generated HSTS |
| QA | 11.14 | P.20 `npm run qa:visual` |

P.8 is intentionally unused (merged into P.16).

## Build order
Refactors first, then one commit-sized unit per line. Every unit must leave all gates green before the next one starts.
0. **Refactor (no behaviour change):** `formatSize` (P.14, not yet wired), `engine-load.ts` (P.1, not yet wired), `announce.ts` (P.17), and the `PUBLIC_*` config in `site.ts` (P.4). Run the gates.
1. P.1 → P.3 (P0-1)
2. P.4 (P0-2)
3. P.6 (P0-4)
4. P.12 (P0-5)
5. P.5 (P0-3)
6. P.14, P.15, P.17 (small UI fixes)
7. P.16 (merge list)
8. P.13 (target mode)
9. P.9, P.10 (menu, icons)
10. P.7 (preload), then P.11 (SW; last, because it touches every request)
11. P.18, P.19, P.20

---

## P.1 Engine-load error (P0-1 ① and ④)
**New:** `src/lib/ui/engine-load.ts` (framework-free, unit-tested).
- `class EngineLoadError extends Error { code = 'engine' }`.
- `isEngineLoadFailure(err: unknown): boolean` returns true for:
  - dynamic import rejections: `TypeError` whose message matches `/dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to fetch/i`
  - an `EngineLoadError`
  - emscripten aborts matching `/both async and sync fetching of the wasm failed|failed to asynchronously prepare wasm|CompileError/`
  - pdf.js `/Setting up fake worker failed/`
  - It returns false for every `PdfError`, including corrupt.
- `withEngineRetry<T>(load: () => Promise<T>): Promise<T>`: one automatic retry after 800 ms, then a rethrow as `EngineLoadError`. Flag: do not claim in comments that a retried `import()` re-fetches; browsers differ on caching a failed module. The retry is cheap either way.
- `engineErrorCopy(): Promise<{title, body}>`:
  - `navigator.onLine === false`: title **"인터넷 연결이 끊겨 처리 도구를 불러오지 못했습니다."**
  - Otherwise GET `/deploy-manifest.json` (`cache: 'no-store'`, 3 s timeout) and compare its `build` with `<meta name="build-id">`.
    - They differ: **"사이트가 방금 새 버전으로 바뀌었습니다."**
    - They match or the fetch fails: **"처리 도구를 불러오지 못했습니다."**
  - The body in every case: "파일에는 문제가 없습니다. {연결을 확인한 뒤 | 바로 | 잠시 뒤} 새로고침해 주세요. 새로고침하면 파일을 다시 골라야 합니다."
- **UI:** a page-level `role="alert"` panel (not per file) with the title, the body and a **[새로고침]** button (`location.reload()`, ≥ 44 px). It lives in a shared partial `src/components/EngineError.astro`, used by all three tool pages.
- `Base.astro` emits `<meta name="build-id" content={BUILD_ID}>`. `BUILD_ID` is the first 12 characters of `CF_PAGES_COMMIT_SHA`, else `git rev-parse --short=12 HEAD`, else `dev`. It lives in `src/data/build.ts`.

**Wiring (every engine entry point):**
- The merge, compress and photo `import()` calls (`inspect`, `raster-render`, `zip`) are wrapped in `withEngineRetry`.
- A worker `error` event **before the first message from the worker** is an engine-load failure. After the first message, the Step 1/2/3 mapping stays.
- Inside workers, the wasm loaders (`src/lib/codecs/wasm-browser.ts`, `src/lib/pdf/compress/wasm-browser.ts`, qpdf `locateFile` fetch) throw `EngineLoadError` on a fetch failure, `!ok` or a compile error. The worker then posts `{type:'error', code:'engine'}`; add `engine` to the worker message types.
- In the controllers, `engine` never marks a file.
  - Merge: files whose inspection hit `engine` return to the pending state, with no error card.
  - The engine panel is shown.
  - `corrupt` is only mapped when the loader succeeded.

```
file picked ─► withEngineRetry(import inspect) ──ok──► inspect(file) ─► per-file result (corrupt/not-pdf/password…)
                    │ fail twice
                    ▼
              EngineLoadError ─► engineErrorCopy()
                                  ├─ offline ─────────► "인터넷 연결이 끊겨…"
                                  ├─ build differs ───► "사이트가 방금 새 버전으로…"
                                  └─ else ────────────► "처리 도구를 불러오지 못했습니다."
                                  (all: "파일에는 문제가 없습니다" + [새로고침]; files stay un-marked)
worker 'error' before its first message ─► same path
worker posts code 'engine' (wasm fetch/compile) ─► same path
```

## P.2 Deploy carry-forward of hashed assets (P0-1 ②)
**Decision:** at build time, fetch the **live deploy manifest** and download the previous deploys' immutable files into `dist/`. The alternatives were rejected:
- Committing old assets to git would bloat the repo forever.
- A Pages Function 404 fallback is backend code.
- `_redirects` cannot fall back only on a 404.

Carrying forward is zero-backend: it only uses the network at build time on the CF builder, and it fails open.

**New:** `scripts/carry-assets.mjs`. Postbuild order: `check-dist.mjs` (budgets judge the fresh build only) → `gen-headers.mjs` (P.19) → `carry-assets.mjs` → `gen-sw.mjs` (P.11).
- It writes `dist/deploy-manifest.json`: `{ build, gen, generatedAt, files: { "<path>": { sha256, bytes, gen } } }`. It covers every file under `_astro/`, `vendor/` and `fonts/`; all are immutable.
  - A fresh file's `gen` is the manifest's `gen`: the previous `gen` + 1, or 1 if there is none.
  - A carried file keeps its old `gen`.
- **Enabled** only when `CF_PAGES === '1'` or `CARRY_ASSETS === '1'`, so local, CI and e2e builds are unchanged. Without it, the script still writes the manifest (gen 1), so P.1 and P.3 work everywhere.
  - The source is `CARRY_FROM`, else `PUBLIC_SITE_URL`, else `https://doc-tools-kr.pages.dev`.
- **Retention:** a file is carried if it is missing from the fresh build and `currentGen − gen ≤ 2`. That keeps the last two deploys alive.
- **Integrity:**
  - Each downloaded file's SHA-256 must equal the manifest's. On a mismatch, skip the file with a warning.
  - Paths must match `^(_astro|vendor|fonts)/[A-Za-z0-9._@/-]+$`: no `..` and no absolute paths.
  - A carried file never overwrites a fresh one.
- **Caps:** at most 400 files and 60 MB per build; beyond that, skip with a warning. Never exceed CF's 25 MiB per file.
- **Fail open:** a missing manifest, a network error or a 60 s total timeout logs `carry: skipped (<reason>)`, and the build still succeeds. Flag: this is the only place the build may continue after a network error, and it is logged, never silent.
- `_headers`: `/deploy-manifest.json` → `Cache-Control: no-store`.

```
CF build: astro build ─► check-dist ─► gen-headers ─► carry-assets ─► gen-sw ─► deploy
                                                         │ GET live /deploy-manifest.json (fail → log, skip)
                                                         ├─ for each file absent now and gen ≥ cur−2: GET, sha256 ok → dist/
                                                         └─ write the new manifest (fresh gen=cur, carried keep gen)
```

## P.3 Post-deploy asset smoke (P0-1 ③)
**New:** `scripts/smoke-assets.mjs`, run as `npm run smoke:assets -- <baseUrl> [--previous <manifest.json>]`. Node 22 `fetch`, no dependencies.
- **Pages:** the `/sitemap.xml` URLs, `/privacy/`, `/terms/`, `/licenses/` and `/__missing-<random>/` (expect 404).
- **References to collect:**
  - from HTML: `script[src]`, `link[href]` (stylesheet, modulepreload, preload, icon, manifest, apple-touch-icon) and `meta[property="og:image"]`
  - from JS, recursively: `import("…")`, static `import … from "…"`, `new URL("…", import.meta.url)` and `/vendor/…` string literals
  - from CSS: `url(…)`
  - from the manifest: `icons[].src`
  - every entry of `/deploy-manifest.json`
- **Assertions:**
  - every same-origin reference returns 200
  - `.js` and `.mjs` are JavaScript, `.wasm` is `application/wasm`, `.css` is `text/css`, `.webmanifest` is `application/manifest+json` or JSON, `.ico` is an `image/*` type
  - `/_astro/*` is `immutable`, `/sw.js` is `no-cache`, and every HTML response carries the CSP with `connect-src 'self'`
- `--previous`: every file of the previous manifest with `gen ≥ cur − 2` returns 200, which proves carry-forward.
- On failure it exits 1 with a table of failures. The deploy gate uses it.

## P.4 Operator, contact, 이용약관 (P0-2, P1-9)
`src/data/site.ts` gets these fields:
- `OPERATOR = { name: '사이티드', nameEn: 'Cited' }` (a constant).
- `CONTACT_EMAIL = import.meta.env.PUBLIC_CONTACT_EMAIL`. When it is set and does not match `^[^\s@]+@[^\s@]+\.[^\s@]+$`, the build fails (`check-dist.mjs` checks the env var).
- `PRIVACY_OFFICER = import.meta.env.PUBLIC_PRIVACY_OFFICER`. When unset, it renders "사이티드 대표".
- `BIZ_REG_NO = import.meta.env.PUBLIC_BIZ_REG_NO` is optional and rendered only when set.
- `contactLine()`: "문의: <a href="mailto:…">email</a>" when the email is set, otherwise **"문의: 준비 중"**. The footer, privacy and terms pages all use this one function.

**Footer (all pages):**
- line 1: "운영: 사이티드(Cited)" · `contactLine()`, plus "· 사업자등록번호 …" when set
- line 2: 이용약관 · 개인정보 처리방침 · 오픈소스 라이선스
- line 3: ©
- Also fix the 12 px mobile indent (audit 4).

**Privacy §5 becomes "5. 운영자와 문의처":**
- 운영자: 사이티드(Cited)
- 개인정보 보호책임자: {PRIVACY_OFFICER}
- 문의: {email | "준비 중입니다. 연락처가 정해지면 이 페이지와 모든 페이지 하단에 표시합니다."}
- "문의 메일은 답변에만 쓰고, 문의가 끝나면 지웁니다."

**Privacy §6 변경 이력:** add "{date} 운영자·문의처 항목 추가, 이용약관 신설". Arch sets the date at the deploy gate.

**New page `/terms/` (이용약관).** Add it to the sitemap, with a canonical URL, a footer link and the Base layout. Ship this text as written; only COPY.md wording fixes are allowed.
1. **목적** — 이 약관은 사이티드(Cited, 이하 "운영자")가 제공하는 안올림(이하 "서비스")의 이용 조건을 정합니다.
2. **서비스 내용** — 서비스는 PDF·사진 등 파일을 이용자의 브라우저 안에서 처리하는 무료 도구입니다. 파일은 운영자의 서버로 전송되지 않으며, 회원가입이 필요 없습니다.
3. **요금과 광고** — 모든 기능은 무료입니다. 운영비를 충당하기 위해 광고를 게재할 수 있으며, 광고를 도입할 때는 개인정보 처리방침을 먼저 개정해 알립니다.
4. **이용자의 책임** — 이용자는 처리할 권리가 있는 파일만 사용해야 합니다. 타인의 문서를 무단으로 처리하거나 법령을 위반하는 목적으로 서비스를 이용해서는 안 됩니다.
5. **금지 행위** — 서비스의 정상 운영을 방해하는 행위(자동화된 과도한 접속 등)와 서비스를 운영자가 아닌 다른 사람이 제공하는 것처럼 오인하게 하는 재배포를 금지합니다. 오픈소스 구성요소는 각 라이선스에 따라 쓸 수 있습니다.
6. **결과물과 제출처 수용** — 서비스는 결과 파일이 특정 기관·회사·사이트의 제출 규격을 통과하거나 접수된다는 것을 보장하지 않습니다. 제출하기 전에 제출처의 최신 안내(용량·크기·형식)와 결과 파일을 직접 대조해 확인해 주세요. 서비스는 원본 파일을 바꾸지 않지만, 원본은 이용자가 따로 보관해 주세요.
7. **책임의 제한** — 서비스는 무료로 있는 그대로 제공됩니다. 운영자는 결과물의 품질, 제출 거절, 이용자의 기기나 브라우저 환경 때문에 생긴 손해를 책임지지 않습니다. 다만 운영자의 고의 또는 중대한 과실로 생긴 손해는 예외입니다.
8. **서비스의 변경과 중단** — 운영자는 기능을 바꾸거나 서비스를 중단할 수 있으며, 중요한 변경은 이 페이지에 알립니다.
9. **약관의 변경** — 약관을 바꿀 때는 시행일과 변경 내용을 시행 7일 전부터 이 페이지에 게시합니다.
10. **준거법과 관할** — 이 약관은 대한민국 법을 따르며, 분쟁은 민사소송법에 따른 관할 법원에서 해결합니다.
11. **문의** — {contactLine()}
- 시행일: set by Arch at the deploy gate.

## P.5 PDF 용량 줄이기 done order on mobile (P0-3)
- **DOM order of the done panel (every viewport):**
  1. headline "{before} → {after}" + "{n}% 줄었습니다"
  2. target chip (P.13, target mode only)
  3. **[내려받기]** + [다른 파일 처리하기]
  4. "저장될 이름: {name}"
  5. notes and warnings (signature, owner restriction, target miss)
  6. previews
  7. the photo cross-link
- **Previews:** at ≤ 640 px, two columns side by side, each ≤ 45 vw, inside `<details open>` with the summary "미리보기". Desktop looks the same as today.
- **On done:** focus the headline (`tabindex="-1"`), then `scrollIntoView({block:'start'})`. The Step 2 76 px scroll-margin-top stays. The download button is no longer auto-focused. The kept panel follows the same rule.
- **Test:** on both mobile projects and on chromium at 360×740, after done the headline and the whole download button box are inside the viewport, and `document.activeElement` is the headline.

## P.6 Live-only home, meta, OG, JSON-LD (P0-4)
- `src/data/site.ts`: `defaultDescription` and `ogDescription` become functions of `LIVE_TOOLS`. No tool name is written as a literal outside `tools.ts`.
  - Pattern: "{live names joined with ·}. 파일 업로드 없이 내 브라우저 안에서 바로 처리하고, 파일은 서버로 전송되지 않습니다. 회원가입 없이 무료."
  - The wording must not depend on a particle after a variable name. Record the pattern in COPY.md.
  - Length is 80–120 characters, enforced by a test.
- **Home lead:** "지금 쓸 수 있는 도구: {live names}." plus the existing no-upload sentence. The section lead "…가장 많이 찾는 작업부터 준비하고 있습니다." stays.
- **Tool grid:** live cards only. Below them, `<h3>준비 중</h3>` and a compact `<ul>` of soon tool names only.
  - It has no summaries and no links.
  - Muted colour, contrast ≥ 4.5:1.
  - No "곧 공개" and no dates.
- The JSON-LD WebSite and Organization `description` use the same function. Organization `logo` becomes `/brand/icon-512.png` (P.10).
- FAQ "무료인가요?": "모든 기능을 무료로 쓸 수 있습니다. 운영비는 광고로 충당할 예정입니다."
- `docs/COPY.md` release checklist: "도구를 공개하거나 내릴 때는 tools.ts status만 바꾼다. 홈·메타·OG·JSON-LD·404·메뉴가 따라 바뀌고 테스트가 확인한다."
- `404.astro` lists links to the live tools (audit 2; the same data).

## P.7 Engine preload (P1-2)
- **Trigger:** the first user signal on the page (`pointerdown`, `pointermove`, `touchstart`, `keydown`, `scroll`, or `focusin` inside the tool) → `requestIdleCallback` (fallback `setTimeout` 1 s) → preload. A `pointerdown` on the picker or a `dragenter` on the drop zone starts the preload at once.
  - **Decision:** never preload on idle alone. Lighthouse never interacts, so gate 8 (initial JS ≤ 30 KB, engines not loaded at page load) is measured exactly as before, and real users almost always move or touch first.
  - Gate 8's wording becomes "engines load only after a file is picked, or after the first interaction plus idle" (logged).
- **Skip** when `navigator.connection?.saveData` is set or `effectiveType` is `slow-2g` or `2g`.
- **What preloads:**
  - `withEngineRetry(import(inspect))` on merge and compress
  - a warm worker: the tool's worker is created and receives `{type:'warm'}`
    - it imports its lazy modules and fetches and compiles its wasm, then posts `{type:'warm-done'}`
    - the main thread then terminates it; the HTTP cache and the SW cache (P.11) keep the bytes
  - photo: its worker without WebP
- A preload failure is silent, with no panel. The real load shows P.1 if it fails again.
- If a file is picked before the preload finishes, the status line reads **"처리 도구를 준비하는 중입니다(처음 한 번만)."**, and the real load awaits the same promise. Nothing is fetched twice.
- Module `src/lib/ui/preload.ts`: `schedulePreload(fn)`, unit-tested with fake timers and a fake `navigator.connection`.

## P.9 Header tools menu (P1-6)
- `Base.astro` header nav gets a disclosure button **"도구"** (`aria-expanded`, `aria-controls`).
  - Its panel lists every `LIVE_TOOLS` link (icon + name), then 보안 and 자주 묻는 질문 (home anchors).
  - The current page has `aria-current="page"`.
- ≥ 641 px: a dropdown under the button. ≤ 640 px: a full-width sheet under the sticky header, items ≥ 48 px tall.
- JS (in the shared site script, ≤ 1.5 KB gzip):
  - toggle
  - Escape closes the panel and returns focus to the button
  - a click outside closes it
  - Tab past the last item closes it
- Without JS the control is a plain link to `/#tools`, so it degrades to today's behaviour.
- At ≥ 641 px the desktop 보안 and FAQ links stay visible, as now.

## P.10 Icons, manifest, OG (P1-7 part; audit 7.4, 7.6)
- **New prebuild script** `scripts/gen-brand.mjs`. It replaces the one-off `gen-og.mjs`; delete that script and the committed `public/og.png`.
- `@napi-rs/canvas@1.0.9` (MIT) becomes an explicit devDependency. It is already installed as pdfjs' optional dependency; log it.
- Fonts: `node_modules/pretendard/dist/public/static/Pretendard-{Bold,ExtraBold}.otf` (OFL, same package; the files exist).
- The logo is drawn from the existing favicon SVG in `Base.astro`: a rounded rect with the document-check path.
- **Outputs** (git-ignored, written into `public/`):
  - `favicon.ico`: 16, 32 and 48 px PNG entries in an ICO container written by the script (about 40 lines, no dependency)
  - `brand/apple-touch-icon.png` (180), `brand/icon-192.png`, `brand/icon-512.png`
  - `brand/icon-maskable-512.png`: the logo inside the 80 % safe zone on `#0f766e`
  - `brand/og.png`, 1200×630: logo, "안올림" and "파일을 올리지 않는 서류 도구", the same design as today
- The output is deterministic (fixed canvas, no timestamps). A unit test compares the hashes of two runs.
- A canvas load failure fails the build loudly. The site never ships without icons.
- **`src/pages/manifest.webmanifest.ts`:**
  - `name` "안올림 — 파일을 올리지 않는 서류 도구", `short_name` "안올림"
  - `start_url` "/", `scope` "/", `display` "standalone"
  - `background_color` "#ffffff", `theme_color` "#0f766e", `lang` "ko"
  - the icons above
- **`Base.astro` head:**
  - the SVG icon first, then `/favicon.ico` (sizes 48x48)
  - `apple-touch-icon`, `manifest` and `theme-color`
  - `og:image` → the absolute `/brand/og.png`
  - `og:image:alt` "안올림 — 파일을 올리지 않는 서류 도구"
  - `twitter:card` `summary_large_image`
- `_headers`: `/brand/*` and `/favicon.ico` → `Cache-Control: public, max-age=86400`. The names are not hashed, so they are not immutable.

## P.11 Service worker (P1-7)
**Rule: the SW never sees or stores file bytes.**
- User files never go through `fetch`. They are `File` objects read locally, and results go out through `blob:` URLs, which a SW does not intercept.
- The SW enforces the rule anyway: it answers only allowlisted same-origin GETs.

**Source:** `src/sw/sw.ts`, built by `scripts/gen-sw.mjs` to `dist/sw.js` after carry-assets. It uses `typescript.transpileModule` (TS is already a dev dependency; no new dependency). The script injects:
- `BUILD_ID`
- `PRECACHE`:
  - the HTML of `/`, every live tool page, `/privacy/`, `/terms/`, `/licenses/` and `/404.html`
  - every `_astro/*.css`, entry `_astro/*.js` and UI font file those pages reference
  - **no** worker, wasm or vendor file
  - the build fails if the precache is over 450 KB raw
- `RUNTIME_PREFIXES = ['/_astro/', '/vendor/', '/fonts/', '/brand/']`

**Fetch handler, in this order:**
```
request ─► method !== 'GET' ──────────────────────────────► return (no respondWith → browser default)
        ─► url.origin !== self.location.origin ────────────► return
        ─► path is /sw.js, /deploy-manifest.json or /api/* ─► return
        ─► request.mode === 'navigate' ─────────────────────► network-first (3 s timeout)
                                                              ├─ ok → return it (and refresh the cache if the path is in PRECACHE)
                                                              └─ fail → cache(path) → else cache('/404.html')
        ─► path starts with a RUNTIME_PREFIX ───────────────► cache-first; on a miss fetch, and put a clone only if res.ok && res.type === 'basic'
        ─► else ─────────────────────────────────────────────► return
```
- `blob:` and `data:` never reach a SW fetch handler. The origin check covers the rest.
- The SW never calls `request.body`, `request.formData()`, `request.arrayBuffer()`, `request.text()`, `request.blob()`, `request.json()` or `request.clone()`. A static unit test greps `src/sw/sw.ts` for them and fails if any appears.
- `install`: precache into `anolim-${BUILD_ID}`. **No `skipWaiting()`.**
- `activate`:
  - delete every `anolim-*` cache except the current one and the single most recent previous one, which keeps one generation for open old tabs, alongside P.2
  - `clients.claim()` only when there was no previous controller (first install)
- The message `{type:'SKIP_WAITING'}` calls `skipWaiting()`.

**Registration:** `src/lib/ui/sw-register.ts`, in the shared site script.
- Only when `import.meta.env.PROD` and `'serviceWorker' in navigator`, after `load` plus idle: `register('/sw.js', {scope:'/'})`.
- When a waiting worker exists and the page is **not** busy (tools set `document.body.dataset.busy` while working), show a small `role="status"` bar: "새 버전이 있습니다. [새로고침]". The button posts SKIP_WAITING and reloads on `controllerchange`.
- **Kill switch:** with `PUBLIC_SW=0`, `gen-sw.mjs` emits the self-unregistering worker below. Registration still runs, so installed SWs remove themselves.
```js
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
})()));
```
- `_headers`: `/sw.js` → `Cache-Control: no-cache`. The existing CSP `worker-src 'self' blob:` already allows it.
- **Home "안전한 이유" item 3** adds: "한 번 사용한 도구는 인터넷을 끊어도 동작합니다. 비행기 모드에서 직접 확인해 보세요." It is only true after one use or a finished preload; the offline e2e test proves it.
- **e2e:** `playwright.config` sets `serviceWorkers: 'block'` for every existing spec, so their behaviour and no-upload recordings do not change. The new `tests/e2e/sw.spec.ts` uses `serviceWorkers: 'allow'`.

## P.12 WebKit font weights (P0-5)
**Decision:** replace the UI variable face with **static instances** at the weights the CSS uses. A grep of `src/` today finds 400, 600, 700 and 800.
- `check-dist.mjs` fails on any `font-weight` in the built CSS outside {400, 600, 700, 800}.
- `scripts/gen-ui-font.mjs`: subset-font `variationAxes: { wght: N }` per weight (full instancing; subset-font README line 71). `font-rename.mjs` runs on each instance.
  - Output: `src/generated/anolim-ui-{400,600,700,800}.woff2`.
  - CSS: 4 `@font-face` rules, each with a **single** `font-weight` value and `format('woff2')`.
- Flag: if instancing errors, paste the verbatim error in REVIEW-REQUEST and escalate. Never fall back to the variable face silently.
- Preload only 400 and 800. Check with a grep that 800 is the H1 (LCP) weight.
  - 600 and 700 load on demand with `font-display: swap`.
  - CLS must stay ≤ 0.01 (gate 8). If 700 shifts anything above the fold, preload it too and re-measure (then 3 preloads; update the budget line and log it).
- **Budget** (`check-dist.mjs`): the 4 files total ≤ 170 KB, and each ≤ 50 KB.
- The Pretendard Variable dynamic fallback (for file names) stays variable. Its WebKit caveat goes to Known Gaps.
- **Tests:**
  - unit (Node): decompress each woff2 with `fontverter`. It has **no `fvar` table**, OS/2 `usWeightClass` equals N, and the name guard still passes.
  - e2e (all 5 projects): after `await document.fonts.load()` for both weights, measure "서류 파일 안올림" in a canvas with `800 32px "Anolim UI Sans"` and with `400 32px "Anolim UI Sans"`.
    - The two widths differ by ≥ 3 %.
    - `document.fonts.check('800 16px "Anolim UI Sans"')` is true.
    - This reproduces the audit's WebKit symptom.
  - The real iPhone check stays in Gate 11 (Richard, or the owner).

## P.13 목표 용량 mode for PDF 용량 줄이기 (P1-1)
- **UI:** a radio pair above the levels: "품질 단계로 줄이기" (the default; Step 2 unchanged) and "목표 용량으로 줄이기".
  - Target mode shows chips as a radiogroup: 3 MB, 5 MB, **10 MB (default)**, 20 MB and 직접 입력.
  - 직접 입력 takes MB from 0.5 to 100, step 0.1, validated inline: "0.5~100 MB 사이로 입력해 주세요."
  - The level radios are hidden in target mode. "이미지로 변환" stays opt-in inside its `details`, and it is **not** part of the search.
- **Units:** target bytes = MB × **1,000,000**, which is safe under both conventions (the same rule as Step 3's KB × 1000). Logged.
- **Already under the target** (`input.size ≤ target`): no run. A kept-style panel: "이미 {target} 이하입니다({size}). 원본을 그대로 제출하면 됩니다." No download.
- **Ladder,** tried in order until a result is ≤ target. The first hit is the highest-quality pass.
  1. `high`
  2. `recommended`
  3. `strong`
  4. `target-1` {trigger 110, target 96, q 50, minSsim 0.82}
  5. `target-2` {trigger 96, target 96, q 45, minSsim 0.80}
  - `target-*` are new `TARGET_LADDER` entries in `levels.ts`, reachable only from target mode. They share `COMMON` (minBytes, minPixels, minGain).
  - Floors: ≥ 96 ppi, q ≥ 45, minSsim ≥ 0.80, never lower. This is the readability floor for scanned text.
  - **Skip-ahead:** when a plain level's output is > 2 × target, skip the next plain level (it cannot plausibly reach the target). The target rungs are never skipped. This is a speed-up only; it is unit-tested.
- **Every Step 2 guarantee holds for the chosen output:**
  - each rung runs the same engine: the SSIM gate with its retry, minGain, placements and limits
  - the keep-original rule: ≥ 0.99 × the input is not offered
  - the main-thread pdf.js verify runs on the **chosen** result; a mismatch is a `verify` error as in Step 2, and no other rung is tried
  - the signature and owner-restriction warnings
  - raster stays opt-in only
- **Worker:** one worker runs the whole search.
  - New message: `{type:'compress-target', targetBytes}`.
  - Progress `{rung, of}` shows "목표 용량에 맞추는 중… ({rung}/5단계)".
  - Cancel works between and inside rungs, as in Step 2.
  - Only the best-so-far bytes are retained; only the final result is transferred.
- **Outcomes:**
  - hit: the headline plus the chip **"✓ {target} 이하"**
  - miss: the smallest valid result is offered, if it passes keep-original, with the warning **"{target} 이하로는 줄이지 못했습니다. 가장 작게 줄인 결과는 {size}입니다."** No chip. Add "이미지로 변환을 켜거나 파일을 나눠 제출해 보세요." when raster was not tried.
  - no valid result: the kept panel
- **Pure search:** `src/lib/pdf/compress/target.ts` exports `searchTarget(runRung, ladder, targetBytes, inputBytes)`. It is framework-free and unit-tested with a fake `runRung`.

```
input ≤ target? ─yes─► "이미 N MB 이하" (no run)
   │ no
   ▼
for rung in [high, recommended, strong, target-1, target-2]   (skip-ahead when out > 2×target)
   out = engine(rung); best = smaller(best, out)
   out ≤ target ─► stop (hit)
end ─► best? ─► keep-original check ─► main-thread verify ─► done (hit | miss) | kept | verify error
```

## P.14 Size display (P1-5)
- `src/lib/ui/format.ts` gets `formatSize(bytes)`. If Step 3 already added a KB formatter, extend that one instead of adding a second.
  - `0` → "0 KB"
  - `< 1,048,576`: KB = bytes / 1024 rounded **up** (Step 3 rule). One decimal below 10 KB ("1.2 KB", minimum "0.1 KB"); an integer from 10 KB ("94 KB", "1,023 KB")
  - `≥ 1 MiB`: the existing `formatMB` rule
- Every file-size display in merge, compress and photo uses it. `formatMB` stays for limit messages only.
- Percent everywhere, photo included, is "{n}% 줄었습니다", with no space.

## P.15 Non-PDF rejected before the list (P1-4)
- Merge (multi) and compress (single): on add, read `blob.slice(0, 1024)` and test it with `hasPdfHeader` on the main thread. The check is tiny and needs no engine.
  - Non-PDF files never enter the list or the card.
  - One `role="alert"` summary, with file names:
    - one file: "{name}은(는) PDF 파일이 아니어서 넣지 않았습니다. PDF 파일만 넣을 수 있습니다."
    - several: "파일 {n}개는 PDF가 아니어서 넣지 않았습니다: {up to 3 names}{ 외 k개}"
  - The two tools use the same wording.
- Merge: when ≥ 2 error cards exist (corrupt, oom or unknown; a password prompt is not an error card), show **"문제 파일 모두 빼기"**. It removes them and announces the count.

## P.16 Merge list: compact rows, sticky mobile bar, drag reorder (P1-3)
- **Row:**
  - ≤ 76 px tall on desktop and mobile
  - thumbnail 48×64
  - line 1: the name (ellipsis; the full name in `title`); line 2: "{pages}쪽 · {size}"
  - right side: ↑, ↓ and 삭제 as 44×44 icon buttons (the existing aria-labels with the file name)
  - status icons (잠김, 오류) with SR text
  - password and error content expands the row as needed
- **Drag reorder:**
  - A handle (⋮⋮, 44×44) at the start of the row. Pointer Events cover mouse and touch: `setPointerCapture`, `touch-action: none` on the handle only.
  - A placeholder gap follows the pointer. Auto-scroll within 48 px of the viewport edges.
  - The drop commits through the **same** reorder function as the buttons, with the same live announcement ("{name}: {n}개 중 {k}번째로 옮겼습니다").
  - The handle is `aria-hidden="true"` and `tabindex="-1"`: pointer-only. The keyboard uses the existing ↑↓ buttons, which stay.
  - Escape during a drag cancels it and restores the order.
  - `prefers-reduced-motion`: no transitions.
- **Sticky action bar at ≤ 640 px** while listing:
  - The existing actions container itself becomes `position: sticky; bottom: 0` (same DOM, no duplicate buttons). It holds **"PDF {n}개 합치기"** (primary) and "파일 추가".
  - It gets `padding-bottom: env(safe-area-inset-bottom)`, and the page gets `scroll-padding-bottom` equal to the bar height, so a focused row is never covered (WCAG 2.4.11).
  - It is hidden while merging and when done.
- All Step 1 behaviour stays: the soft-limit panel, the password flow, error cards and the run token.

## P.17 Copy and screen-reader fixes (P1-11, P1-12, P1-13)
**Copy.** Add these rules to `docs/COPY.md`: 보조용언 띄어쓰기, `n%` without a space, jargon in brackets, and buttons that name their action.
| Where | New copy |
|---|---|
| corrupt (merge, compress) | "…원본을 다시 받아 주세요." |
| percent (all 3 tools) | "88% 줄었습니다" |
| compress level descriptions | 고화질 "인쇄용 선명도 (약 200 ppi)", 권장 "제출용 선명도 (약 150 ppi)", 강력 "화면용 선명도 (약 110 ppi)"; 이미지로 변환 "…(약 150 ppi)". Every "dpi" becomes "ppi" |
| compress progress | "구조 정리 중…" → "파일 분석 중…"; "결과 확인 중…" → "마무리하는 중…" |
| done button (merge, compress) | "처음부터" → "다른 파일 처리하기" |
| drop zone on touch (all 3 tools; CSS only) | `@media (pointer: coarse)` hides "또는 여기에 파일을 끌어다 놓으세요" and shows "휴대폰의 「파일」 앱이나 다운로드 폴더에서 고를 수 있습니다." |
| merge done | "저장될 이름: {name}" under the headline (renaming is P2) |
| FAQ 무료 | see P.6 |

**Screen reader:**
- `src/lib/ui/announce.ts` exports `announce(kind: 'status' | 'alert', text)`, used by all 3 tools.
  - Showing an alert clears the polite status region (`textContent = ''`).
  - A new file or run clears the alert.
- **Password field** (both PDF tools):
  - `<label for>비밀번호</label>`
  - the state sentence "이 파일은 비밀번호로 보호되어 있습니다." becomes `aria-describedby`
  - `autocomplete="off"` stays
  - a show/hide toggle, 44×44, `aria-pressed`, aria-label "비밀번호 보기", switches `type`

## P.18 Error beacon stub (P1-8, disabled)
- `src/lib/ui/beacon.ts` exports `reportError({tool, phase, code})`.
  - `tool` is a live slug; `phase` is `load`, `parse`, `process` or `save`; `code` is `PdfErrorCode` plus `engine` plus the photo codes.
  - It adds `browser` (family + major version), `device` (`mobile` or `desktop`) and `build` (BUILD_ID). **Nothing else.**
  - The payload is built field by field, never spread from an input. 1-in-10 sampling. `navigator.sendBeacon`.
- **Off by default.** It is active only when `PUBLIC_ERROR_BEACON_PATH` is set **and** starts with `/`, which keeps it same-origin and inside `connect-src 'self'`.
  - When unset, a constant `false` lets Vite drop the call. `check-dist.mjs` asserts there is no `sendBeacon` in `dist/`.
  - The no-upload static test allowlists `sendBeacon` in `beacon.ts` only.
- Controllers call it only for `engine`, `oom`, `unknown` and `verify`, not for user-caused codes.
- The privacy page renders an "익명 오류 통계" section **only** when the beacon is enabled, so the policy and the code cannot drift apart.
- The SW never handles `/api/*`.
- **Known Gap:** an endpoint (a Pages Function or other) and a retention policy are needed before it can be enabled.

## P.19 Custom domain (P1-10)
- `PUBLIC_SITE_URL` already drives canonical, og, JSON-LD, sitemap and robots.
  - New unit test: build with `PUBLIC_SITE_URL=https://example.kr` and assert **zero** `pages.dev` occurrences in `dist/**/*.html`, `sitemap.xml`, `robots.txt` and `manifest.webmanifest`.
- `scripts/gen-headers.mjs` (postbuild) appends to `dist/_headers` only when the `PUBLIC_SITE_URL` host is not `*.pages.dev`:
  - `https://HOST/*` → `Strict-Transport-Security: max-age=31536000`. **No** `includeSubDomains` or `preload` yet, because preload is hard to undo; that is a later owner decision.
  - `https://doc-tools-kr.pages.dev/*` → `X-Robots-Tag: noindex`
  - Both host cases are unit-tested.
- **New doc `docs/DOMAIN-RUNBOOK.md`** (Korean; numbered; one action per line, each followed by a check):
  1. Choose an ASCII domain. IDN is secondary.
  2. Add it as a custom domain in CF Pages.
  3. Set `PUBLIC_SITE_URL` for Production (Preview keeps pages.dev) and redeploy.
  4. Add a Bulk Redirect from `doc-tools-kr.pages.dev` to the domain: 301, keeping the path and query.
  5. Check it with `curl -I`.
  6. Confirm the HSTS header on the domain.
  7. Set `PUBLIC_NAVER_SITE_VERIFICATION` and `PUBLIC_GOOGLE_SITE_VERIFICATION`, redeploy, verify in 서치어드바이저 and Search Console, and submit the sitemap.
  8. Reset the cache in the 카카오 share debugger.
  9. Run `npm run smoke:assets -- https://DOMAIN`.
  10. Later, optionally: HSTS `includeSubDomains; preload`, with the warning that it is hard to undo.
  11. Rollback: remove the Bulk Redirect first, then unset `PUBLIC_SITE_URL`.

## P.20 `npm run qa:visual` (reproduces the audit)
- `scripts/qa/visual.mjs --url BASE [--out DIR] [--only static|tools|net]`.
  - The default output is `os.tmpdir()/visual-qa/YYYY-MM-DD-qa/`, never inside the repo.
- **Browsers:** Playwright chromium, firefox and webkit, plus the `chrome` and `msedge` channels when installed. When a channel is absent, print "skipped:" with the verbatim launch error.
- **Static matrix** (the audit's):
  - Pages: `/`, the 3 tool pages, `/privacy/`, `/terms/`, `/licenses/` and a 404 path.
  - Chromium: 1440×900, 1280×800, 768×1024, 360×740 and 390×844, light and dark.
  - The other browsers: the 3 main pages at d1440 and m390.
  - `fold-*` shots, 200 % zoom (720 CSS px at DPR 2) and a 320 px reflow.
  - File names follow the audit: `BROWSER-VIEWPORT-SCHEME-PAGE.png`.
- **Tool states** (named like the audit's `merge-d-NN-STATE.png` and `cmp-m-NN-STATE.png`):
  - merge: empty, dragging, nonpdf, files, pw-wrong, done, stale-chunk (route-abort one `_astro` chunk), offline (`context.setOffline`)
  - compress: nonpdf, damaged, locked, ready, working, done, done-viewport, kept, target-hit, target-miss, stale-chunk, offline
  - Inputs come only from `tests/fixtures/`. `locked.pdf`, `damaged.pdf`, `notes.txt` and `이력서_홍길동 (최종).pdf` are generated into the output folder at run time, with the e2e helpers' recipes.
- **`static.json`** records:
  - horizontal overflow
  - CLS (PerformanceObserver)
  - console errors
  - targets under 24 px
  - the P.12 weight probe
  - the mobile done-state download-in-viewport check
  - Slow 4G + CPU×4 first-use timings (chromium CDP only)
- The no-upload recorder runs on every tool run.
- **Exit 1** on a hard failure: overflow > 0, a console error, a mobile download outside the viewport, a failed weight probe, a no-upload violation, or an engine failure shown with the corrupt copy.
- It does not run in CI. The deploy gate runs it against the live site.

---

## Failure modes
| Path | Realistic failure | Handling and test | User sees |
|---|---|---|---|
| P.1 import fails (tab open across a deploy) | old chunk 404 | retry → EngineLoadError → build-id compare; e2e route-abort | "사이트가 방금 새 버전으로…" + 새로고침 |
| P.1 offline | `onLine` false | copy branch; e2e `setOffline` | "인터넷 연결이 끊겨…" |
| P.1 worker script 404 | `error` before the first message | mapped to engine; e2e route-abort of the worker URL | engine panel, never corrupt |
| P.1 wasm 404 or wrong MIME inside a worker | fetch !ok or compile error | `EngineLoadError` posted as `engine`; unit + e2e route-abort `*.wasm` | engine panel |
| P.1 manifest fetch hangs | 3 s timeout | generic copy; unit | generic engine copy |
| P.2 live site unreachable during the CF build | manifest GET fails | fail open, logged `carry: skipped`; unit with a local server | nothing new; old tabs get the P.1 panel |
| P.2 partial or tampered download | sha mismatch | that file is skipped with a warning; unit | only that asset 404s → P.1 panel |
| P.2 dist bloat | many deploys | gen window 2 + caps 400 files / 60 MB; unit | none |
| P.3 smoke misses a reference | a new import form | recursive JS scan + every manifest entry; unit on a fixture dist | n/a (ops) |
| P.4 bad email env | typo | build fails in check-dist; unit | never shipped |
| P.5 previews tall on a small phone | 320–360 px | 2 columns ≤ 45 vw inside `details`; e2e at 360 | download visible first |
| P.6 tool status flips, copy goes stale | new tool goes live | derived text; test asserts live names present and soon names absent | n/a |
| P.7 preload on metered data | 2G or saveData | skipped; unit | none |
| P.7 preload fails | network blip | silent; the real load shows P.1; unit | only on real use |
| P.10 canvas binary missing on the CF builder | optional dep not installed | explicit devDependency; build fails loudly | never ships without icons |
| P.11 SW serves stale HTML | users stuck on an old deploy | network-first navigation; e2e: new build HTML served online | fresh page |
| P.11 SW caches user bytes | a future handler change | method/origin/prefix allowlist + static grep + e2e cache audit | n/a |
| P.11 buggy SW shipped | fetch-handler bug | `PUBLIC_SW=0` kill switch + deploy-gate rollback | one reload |
| P.11 update mid-task | activation during work | no skipWaiting; bar hidden while busy | "새 버전이 있습니다" afterwards |
| P.12 an instance renders regular | instancing bug | unit: no fvar, weight class; e2e width probe | n/a |
| P.12 extra font bytes hurt LCP | 4 files | 2 preloads, 170 KB budget, LH LCP ≤ 2.0 s gate | none |
| P.13 no rung reaches the target | dense scan | smallest result + miss copy; unit fake runRung | "{target} 이하로는 줄이지 못했습니다…" |
| P.13 chosen output fails verify | engine bug | `verify` error as in Step 2; unit + e2e forced verify | Step 2 verify copy |
| P.13 memory across 5 rungs | 50 MB input on mobile | one worker, best-so-far only, Step 2 limits; unit asserts one retained buffer | oom copy if hit |
| P.15 junk before `%PDF-` | header after byte 0 | `hasPdfHeader` scans 1024 bytes like the engine; unit | accepted |
| P.16 touch drag scrolls the page | touch-action | `touch-action:none` on the handle only; e2e mobile drag | reorder works |
| P.16 sticky bar covers focus | keyboard on mobile | scroll-padding-bottom; e2e focus-not-obscured | focused row visible |
| P.18 beacon leaks data | a field gets added | explicit payload + unit key snapshot; off build has no `sendBeacon` | n/a |
| P.19 HSTS on the wrong host | env typo | only for a non-pages.dev host, no preload, max-age 1 year; unit | reversible by removing the header, bounded by max-age |

No row is "no test, no handling and silent".

## Test map
The status is against today's tests. Every `[GAP]` row is added in this step.
| Area | Branch or flow | Status |
|---|---|---|
| engine-load | `isEngineLoadFailure` table: each message family, and non-matches such as a corrupt PdfError | [GAP] unit |
| engine-load | retry once then throw; `engineErrorCopy` for offline, build differs, same build, fetch failure | [GAP] unit (fake fetch and onLine) |
| engine-load | merge: route-abort `inspect*.js` → engine panel, no error cards, files pending; 새로고침 reloads | [GAP] e2e ×5 |
| engine-load | compress: abort the worker URL; abort `qpdf.wasm`; `setOffline` → offline copy | [GAP] e2e ×5 (wasm abort on the 3 desktop projects) |
| engine-load | photo: abort the worker → engine panel | [GAP] e2e ×5 |
| engine-load | regression: a real damaged file still shows the corrupt copy | [TESTED] Step 1/2 e2e; keep |
| carry | gen math, window 2, sha-mismatch skip, path regex, caps, fail-open, off outside CF, never overwrites fresh | [GAP] unit (local http server) |
| carry | check-dist runs before carry (postbuild order) | [GAP] unit |
| smoke | collects HTML/JS/CSS/manifest refs; fails on 404 or wrong MIME; `--previous` | [GAP] unit on a fixture dist via serve.mjs |
| operator | footer on every page: operator + "문의: 준비 중" when unset; mailto when set | [GAP] e2e site.spec + build-with-env unit |
| operator | an invalid `PUBLIC_CONTACT_EMAIL` fails the build | [GAP] unit |
| terms | `/terms/` 200, in sitemap, canonical, footer link, axe clean | [GAP] e2e + axe |
| P0-3 | mobile done: headline and download inside the viewport, focus on the headline; kept panel too | [GAP] e2e mobile ×2 + chromium 360 |
| P0-3 | desktop done still shows both previews | [TESTED] Step 2; keep |
| P0-4 | meta, og, JSON-LD and lead contain every live name and no soon name; 80–120 chars; the soon list has no links | [GAP] unit (incl. a flipped-status fixture) + e2e |
| P0-5 | no fvar, weight class per file, single-weight CSS, weight lint | [GAP] unit |
| P0-5 | canvas width probe 800 vs 400 | [GAP] e2e ×5 |
| target | `searchTarget`: hit at each rung, skip-ahead, miss → smallest, none valid, input ≤ target, keep-original on the chosen result | [GAP] unit |
| target | `TARGET_LADDER` floors (≥ 96 ppi, q ≥ 45, SSIM ≥ 0.80) | [GAP] unit |
| target | e2e gen_scan_a6 with a custom target that needs rung ≥ 2 → chip, download ≤ target (parsed in Node); a miss target → miss copy; cancel during the search; input already under target → no run | [GAP] e2e ×3 desktop + mobile-chrome |
| target | Step 2 level mode unchanged | [TESTED] Step 2 e2e; keep + regress:compress 122/122 |
| preload | first-interaction trigger only; skip on saveData/2g; one shared promise; warm worker terminated | [GAP] unit |
| preload | no worker or wasm request before interaction; after mousemove + idle the worker URL is requested; picking a file afterwards triggers no second wasm fetch | [GAP] e2e chromium |
| format | `formatSize` table: 0, 5 B, 1023, 1024, 10239, 10240, 1,048,575, 1 MiB, 12.4 MB | [GAP] unit |
| non-PDF | merge: txt + jpg + pdf → only the PDF listed, one alert naming both; compress: txt → alert with the name, no card | [GAP] e2e ×5 |
| non-PDF | "문제 파일 모두 빼기" appears at ≥ 2 error cards and removes them | [GAP] e2e chromium |
| merge list | ↑↓ keyboard reorder | [TESTED] Step 1 (desktop); keep |
| merge list | row height ≤ 76 px, buttons ≥ 44 px | [GAP] e2e ×5 |
| merge list | pointer drag reorders and announces; Escape cancels; touch drag on mobile | [GAP] e2e chromium, firefox, webkit, mobile-chrome (a skip needs the verbatim reason) |
| merge list | sticky bar visible with the list scrolled on mobile; the focused row is not covered | [GAP] e2e mobile ×2 |
| menu | toggle, Escape returns focus, outside click, aria-current, works at 360, link fallback href | [GAP] e2e ×5 + axe (menu open) |
| brand | favicon.ico parses with 3 entries; PNG sizes; deterministic hash; manifest fields; head tags | [GAP] unit + e2e 200s |
| SW | fake-event unit: POST, cross-origin, /api/, /sw.js → no respondWith; `_astro` → cache-first; navigate → network-first with fallback | [GAP] unit |
| SW | static grep: no request-body reads in sw.ts | [GAP] unit |
| SW | first visit + one merge → offline → reload → merge works offline; the cache audit lists only URLs that are files in `dist/` (no blob:, no fixture-sized entry) | [GAP] e2e chromium, firefox, webkit, mobile-chrome (a skip needs the verbatim reason) |
| SW | the update bar appears for a waiting worker, is hidden while busy; SKIP_WAITING reloads | [GAP] e2e chromium (two builds with different BUILD_ID) |
| SW | a `PUBLIC_SW=0` build unregisters the SW and empties the caches | [GAP] e2e chromium |
| SW | existing specs unaffected (`serviceWorkers: 'block'`) | [TESTED] existing suites; keep |
| copy | the new strings present; no "dpi", "구조 정리", "처음부터", "받아주세요" or a digit-space-% in dist HTML/JS | [GAP] unit grep on dist |
| a11y | status cleared on error (compress nonpdf, damaged); alert cleared on a new file; `getByLabel('비밀번호')`; the toggle switches type | [GAP] e2e ×5 + unit for announce |
| beacon | payload keys exactly the whitelist; sampling; disabled → no-op; the off dist has no sendBeacon | [GAP] unit + check-dist |
| domain | `PUBLIC_SITE_URL=https://example.kr` → no pages.dev in dist; the HSTS/noindex block per host | [GAP] unit |
| qa:visual | against `npm run preview`: ≥ 150 PNGs + static.json, 0 hard failures | [GAP] one run; summary in REVIEW-REQUEST |
| no-upload | every new e2e calls `tests/e2e/no-upload.ts`; the static src allowlist adds engine-load.ts (manifest GET), preload.ts and beacon.ts | [TESTED] helper; [GAP] allowlist entries |

## Budgets (added to `check-dist.mjs`, gzip -9)
- The shared site script (menu, SW register, announce, preload scheduler) is ≤ 4 KB.
- Each tool page's initial JS stays ≤ 30 KB (gate 8). Report the before and after sizes.
- `sw.js` ≤ 6 KB; the precache ≤ 450 KB raw.
- UI fonts: 4 files, ≤ 170 KB total, ≤ 50 KB each; exactly 2 preloads.
- `brand/og.png` ≤ 150 KB; `favicon.ico` ≤ 20 KB.
- No `sendBeacon` in dist while the beacon is off.

## Gates
The gates are identical to Step 2 (§3 gates 1–11), with the same thresholds.
- `lighthouserc.json` adds `/terms/` to the URL list with the same assertions.
- e2e runs on all 5 projects, and every tool spec calls the no-upload helper.
- axe finds 0 serious or critical issues on every page, including `/terms/`, the open menu, target mode and the engine panel.
- `regress:merge` is unchanged, and `regress:compress` stays at 122/122.
- New: `npm run qa:visual -- --url http://127.0.0.1:4173` finishes with 0 hard failures.

## Deploy gate (identical to Step 2, plus this step's smoke checks)
1. Richard writes "Polish P is clear".
2. Arch sets the 시행일 and change-history dates on the privacy and terms pages, commits locally (`[Polish P] 상용 준비: 엔진 오류 분리, 운영자·약관, 모바일 결과, SW·아이콘, 목표 용량`), and updates BUILD-LOG and the checkpoint.
3. Before the push, save the live `/deploy-manifest.json` as `regress-out/prev-manifest.json`. It returns 404 before the first Polish deploy, which is expected.
4. The orchestrator pushes `main` (standing instruction) and then checks https://doc-tools-kr.pages.dev:
   - `npm run smoke:assets -- https://doc-tools-kr.pages.dev` is green (with `--previous regress-out/prev-manifest.json` when that file exists)
   - `/terms/` returns 200, and the footer shows "운영: 사이티드(Cited)" and "문의: 준비 중" (or the email)
   - `/favicon.ico`, `/manifest.webmanifest` and `/brand/og.png` return 200 with the right types, and `/sw.js` is `no-cache`
   - in real Chrome: merging two fixtures works; compressing `gen_scan_a6.pdf` on 권장 is ≥ 70 % smaller; target mode at 1 MB shows the chip and the download is ≤ 1,000,000 B; there is no non-GET or cross-origin request
   - in a 390 px emulated viewport, the compress done state shows 내려받기 without scrolling
   - a Step 2 text PDF gives a result or the kept message, never a larger file
   - after one use, DevTools offline → reload → merge still works
   - `npm run qa:visual -- --url https://doc-tools-kr.pages.dev --only static` has 0 hard failures
5. **If the smoke test fails:** revert the Polish commit, **and add the kill-switch `public/sw.js` from P.11 in the same revert commit**, because visitors may already have the SW installed. Push, log it and reopen the step. The next successful deploy removes the kill-switch file.
6. The next deploy after Polish P (whichever step it is) verifies carry-forward: `smoke:assets --previous` against the Polish manifest must be green.

## Out of Scope (→ BUILD-LOG Known Gaps)
- Per-tool OG images, a hero visual or home drop zone, success micro-animations, a rename-download field, zoom compare (audit P2-1 to P2-4)
- The error-beacon endpoint, its retention policy and turning it on (P.18 is a stub)
- Analytics counters (audit 7.11)
- Ad slots, a CMP, and the CSP changes ads need (audit 8, P2-8)
- HSTS `includeSubDomains` and `preload`; the IDN domain
- A Kakao share check on a real device
- 13 px secondary text raised to 14–15 px, 44 px hit areas for the logo and footer (P2-9), and a mobile card table on `/licenses/` (P2-6)
- The photo-compress layout (only the shared items touch photo)
- WebKit weights for the Pretendard fallback glyphs (file names)
- The "N MB 이하 제출처에 올릴 수 있습니다" hint in level mode (target mode covers the task)
- Multi-file compression and the merge → compress hand-off (existing gaps)

## Acceptance
- Every `[GAP]` row of the Test map has a passing test, and the existing suites are green and unchanged.
- All gates are green, including Lighthouse on /, the 3 tools and /terms/ at unchanged thresholds.
- REVIEW-REQUEST contains:
  - the qa:visual summary
  - initial JS per page, before and after
  - font bytes per file
  - a carry-forward dry run: build, serve it, change a source file, build again with `CARRY_ASSETS=1 CARRY_FROM=http://127.0.0.1:4173`, then show that the second dist contains the first build's changed hashes and that `smoke:assets --previous` is green
- The audit's P0 rows in its section 9 flip to PASS. The real-iPhone check is logged under Gate 11 (Richard or the owner).
