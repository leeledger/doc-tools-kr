# Architect Brief — C2-cloud: 배경 지우기를 Cloudflare에서 처리 (on-device stays opt-in)

Date 2026-10-02 · Branch `c2-cloud` (off `c2`) · Status: **design + spike only. Do not build until the owner-only steps in §9 are done.**
Supersedes, for `/remove-background/` only, the C2 brief's "zero network" rule. C2's on-device path, its tests and its flag stay as they are and become the opt-in path.
Standing rules are unchanged for every other tool: CLAUDE.md owner rules, CSP `connect-src 'self'`, no third-party scripts, no-upload e2e, plain Korean copy, brand 문서딱.

---

## 0. Decision summary

| Question | Answer |
|---|---|
| Engine | Cloudflare Images `segment: "foreground"` (BiRefNet through Workers AI), called through the **Images binding in a separate Worker**. |
| Where the endpoint lives | Same origin: `https://docttak.com/api/remove-bg`. A Pages Function forwards to the Worker over a **service binding**. |
| Why not a Pages Function alone | Pages Functions do not offer an Images binding (§1, F5). Without the binding, `cf.image` needs the photo at a URL, which means storing it. Rejected. |
| What leaves the device | Only a downscaled copy, long edge ≤ 1024 px (about 0.75 MP). That is the model's own working size (F2). The original never leaves the device. |
| What comes back | An RGBA image at 1024 px. The page keeps only its alpha, scales it up to the work size, and runs our existing blur-fusion. Full-resolution colour comes from the original on the device. |
| Default and opt-in | Cloud is the default. "사진을 보내지 않고 기기에서 처리" is the opt-in, using C2's on-device engine (≈100 MB once). |
| Out of quota or error | The cloud path fails closed. The page offers the on-device path with a notice. Nothing is ever billed on the Free plan (F8). |
| Cost | $0 on Free plans: 5,000 photos/month (Images), 100,000 requests/day (Workers, shared with Pages Functions). |

---

## 1. Verified facts (official sources, fetched 2026-10-02)

| # | Fact | Source | Exact quote |
|---|---|---|---|
| F1 | What `segment` does | https://developers.cloudflare.com/images/optimization/features/ (section `segment`) | "Automatically isolates the subject of an image by replacing the background with transparent pixels. Accepts `foreground`. The default is none." / "This feature uses an open-source model called BiRefNet through Workers AI." |
| F2 | The parameter list applies to the binding | https://developers.cloudflare.com/images/optimization/binding/ | "`.transform(options)` Applies optimization parameters to the image, such as `width`, `height`, or `blur`. … For the full list of parameters, refer to Features." (`segment` is on that Features list. The binding page never names `segment` itself, so this is **not yet proven on the binding**: §9 spike-2.) |
| F3 | Binding input limit | same | "Creates an optimization handle for an image. Accepts image bytes up to 20 MB from any source, including Images, R2, a `fetch()` response, or a request body." |
| F4 | Binding output and caching | same | "`format` — Encodes the image in a supported format, such as AVIF, WebP, or JPEG. This method is required — there is no default output format." / "Responses from the Images binding are not automatically cached." |
| F5 | Pages Functions bindings | https://developers.cloudflare.com/pages/functions/bindings/ and https://developers.cloudflare.com/pages/functions/wrangler-configuration/ | The bindings page lists KV, Durable Objects, R2, D1, Vectorize, Workers AI, Service bindings, Queue producers, Hyperdrive, Analytics Engine, environment variables and secrets. **No Images binding and no rate-limit binding.** Wrangler config non-inheritable keys for Pages: `vars`, `d1_databases`, `durable_objects`, `hyperdrive`, `kv_namespaces`, `queues.producers`, `r2_buckets`, `vectorize`, `services`, `analytics_engine_datasets`, `ai`. Neither `images` nor `ratelimits` is listed. Spike probe: `env.IMAGES` is `undefined` in the Pages Function (§2). |
| F6 | Service binding from Pages | https://developers.cloudflare.com/pages/functions/bindings/ | "Service bindings enable you to call a Worker from within your Pages Function." Dashboard: "Go to **Settings** > **Bindings** > **Add** > **Service binding**. … Redeploy your project for the binding to take effect." |
| F7 | Wrangler file takes over Pages settings | https://developers.cloudflare.com/pages/functions/wrangler-configuration/ | "When used in your Pages Functions projects, your Wrangler file is the source of truth. You will be able to see, but not edit, the same fields when you log into the Cloudflare dashboard." So we **do not** add a Pages `wrangler.toml`. The service binding is set in the dashboard by the owner. |
| F8 | Free plan at the 5,000 limit | https://developers.cloudflare.com/images/pricing/ | "On the Free plan, you can request up to 5,000 unique transformations each month for free." / "New transformations will return a `9422` error." / "You will not be charged for exceeding the limits in the Free plan." |
| F9 | Binding billing | https://developers.cloudflare.com/images/optimization/binding/ | "Calls to the Images binding are billed as unique transformations: each unique combination of source image and parameters is billed only once per calendar month". Paid plan: "First 5,000 unique transformations included + $0.50 / 1,000 unique transformations / month" (pricing page). |
| F10 | `cf.image` works from any Worker zone | https://developers.cloudflare.com/images/transform-images/transform-via-workers/ | "cf.image is available on any zone that hosts a Worker, including *.workers.dev subdomains. Each transformation is billed to the account that owns the Worker." |
| F11 | Image limits | https://developers.cloudflare.com/images/get-started/limits/ | Remote images: "Image area, excluding animated GIFs \| 100 MP", "Image dimension, excluding WebP and AVIF \| 12,000 pixels". "When optimizing with the Images binding, the maximum input size for `.input()` is 20 MB." Output formats: "PNG, JPEG, GIF …, WebP …, SVG, AVIF". Input formats include HEIC; AVIF input is "Available on an Enterprise plan." |
| F12 | Workers Free limits | https://developers.cloudflare.com/workers/platform/limits/ | "Requests \| 100,000/day", "CPU time \| 10 ms", "Memory \| 128 MB", "Subrequests \| 50/request". Body: "Free \| 100 MB". "Waiting on network requests … does **not** count toward CPU time." |
| F13 | Pages Functions count as Workers | https://developers.cloudflare.com/pages/functions/pricing/ | "Requests to your Pages Functions count towards your quota for the Workers Free plan. … The free plan daily request limit resets at midnight UTC." / "requests to static assets are free and unlimited. A request is considered static when it does not invoke Functions." |
| F14 | Rate-limiting binding (Workers) | https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/ | "Period: the duration of the period, in seconds. Must be either 10 or 60". "Rate limits that you define and enforce in your Worker are local to the Cloudflare location that your Worker runs in." "permissive, eventually consistent, and intentionally designed to not be used as an accurate accounting system." Plan availability is **not stated** on that page. |
| F15 | Workers AI inputs | https://developers.cloudflare.com/workers-ai/platform/data-usage/ | "Your inputs (e.g., text prompts, image submissions, audio files, etc.), outputs … constitute Customer Content." / "Cloudflare does not make your Customer Content available to any other Cloudflare customer." / "Cloudflare does not use your Customer Content to (1) train any AI models made available on Workers AI or (2) improve any Cloudflare or third-party services, and would not do so unless we received your explicit consent." / "Your Customer Content for Workers AI may be stored by Cloudflare if you specifically use a storage service (e.g., R2, KV, DO, Vectorize, etc.) in conjunction with Workers AI." |
| F16 | Cloudflare's role and transfers | https://www.cloudflare.com/privacypolicy/ | "Cloudflare is a data processor for any of the content provided by Customers and End Users through the Services that transits, or in some cases, is stored on, the Cloudflare network." / "Cloudflare is a U.S. based, global company. We primarily store your information in the United States and the European Economic Area. To facilitate our global operations, we may transfer and access such information from around the world". Its transfer section also relies on Global CBPR/PRP certifications. |
| F17 | Responsible AI | https://www.cloudflare.com/trust-hub/responsible-ai/ | "Cloudflare does not use any Customer Content, as defined in our Enterprise and Self-Serve Subscription Agreements, to train Cloudflare products that use machine learning (ML) models without customer consent." |
| F18 | Logs | https://developers.cloudflare.com/workers/observability/logs/workers-logs/ | "All newly created Workers will come with the observability setting enabled by default." / "By default a Worker will emit invocation logs containing details about the request, response and related metadata." / "Any `console.log` statements within your Worker will be visible in Workers Logs." Free retention: "Maximum log retention period \| 7 Days". |

**Not verified, with no official statement found:**
- **U1:** a retention period for Images-transform inputs. No page says the input is kept or deleted. F15 covers Workers AI generally, and Images segment runs "through Workers AI" (F1).
- **U2:** the region of the BiRefNet inference. The Function ran in `colo: ICN` (Seoul) in the spike. Where the GPU inference ran is not exposed.
- **U3:** whether the rate-limit binding is on the Workers Free plan.
- **U4:** the binding's error code at the quota limit. F8's `9422` is documented for transformations in general.
- **U5:** whether `quality: 100` gives lossless WebP through the binding. It is documented for the URL interface.
- **U6:** whether Durable Objects are on the Free plan.

The brief treats every U item as unknown. Every design choice below works whichever way it goes.

---

## 2. Spike result (branch `c2-cloud`, commits e05fe2f, 2fad698)

**What ran:** `functions/api/remove-bg.ts` (Pages Function, no wrangler file, no dashboard change) plus `public/_routes.json` (Functions only on `/api/*`). Test photos were served from `public/spike/` (Wikimedia Commons, CC0 / CC BY-SA). The Function calls `fetch(sameOriginPhoto, { cf: { image: { segment: "foreground", format } } })` (F10).
- The POST path (`env.IMAGES`) answered `501 no-images-binding`. The probe showed `{"images":"undefined","colo":"ICN"}`, which confirms F5.
- Preview: https://c2-cloud.doc-tools-kr.pages.dev/api/remove-bg?src=/spike/s01.jpg&f=webp

**Segment works on our Free-plan account.** Every call returned 200 with `cf-resized: internal=ok …`.

| Photo | Size | Model res (from `f=json`) | Cold wall time (json / webp) | Server `seg` ms | Cached repeat | WebP RGBA | PNG | Cloud vs on-device: IoU / MAE |
|---|---|---|---|---|---|---|---|---|
| s01 shoes | 1600×1201 | 1024×768 | 5.23 / 3.41 s | 4,971 | 0.53 s | 1,151 KB | 1,008 KB (palette) | 0.998 / 0.0046 |
| h01 hair | 1175×1600 | 752×1024 | 6.40 / 3.59 s | 6,326 | 0.79 s | 1,382 KB | 1,065 KB (palette) | 0.992 / 0.0093 |
| a02 cat | 1280×853 | 1024×682 | 5.11 / 4.27 s | 4,950 | 0.44 s | 713 KB | 647 KB (palette) | 0.995 / 0.0062 |

All 19 photos, cold: the server segment step took 3.1–6.3 s (median 4.6 s wall time). Seoul to the preview, from the owner's PC.

**Quality against GT** (16 synthetic GT, spike `export/metrics.py`, means):

| Engine | MAE | IoU | BF | edge MAE |
|---|---|---|---|---|
| Cloud `segment` (alpha of the WebP) | **0.0038** | **0.966** | **0.998** | **0.053** |
| Cloud mask from `f=json`, upscaled bicubic | 0.0038 | 0.966 | 0.998 | 0.053 |
| Ours on-device BiRefNet_lite 512 fp16 (raw mask, no fusion) | 0.0048 | 0.942 | 0.989 | 0.078 |

- The cloud result is better overall and much better on edges: about 32% lower edge MAE.
- On-device is slightly better on 6 of the 16 images (gt03, gt04, gt05, gt09, gt10, gt11), each by ≤ 0.0014 MAE.

**Alpha and format findings (they drive the design):**
1. The model runs at **1024 px long edge** (`f=json` reports a 1024×768 mask, `"upscale_filter":"catrom"`). Sending more than 1024 px adds nothing to the mask; it only adds bytes.
2. With `f=webp&quality=100`, the output is RGBA with 256 alpha levels, at the input size.
3. The default/PNG output is a **palette PNG** (mode `P`, about 36 alpha levels on s01). The header said `warning: cf-images 299 "JPEG vs PNG selection is automatic"`. **Never use PNG output.**
4. There is **no colour decontamination**: RGB inside the soft edge equals the source (mean diff 1.7–4.1 of 255). Our blur-fusion still has a job.
5. `f=json` returns the mask alone as base64 PNG (15–64 KB) plus metadata. This is useful if the binding allows it (§9 spike-2).
6. A `cf.image` result is cached at the edge (`internal=ram`), and the Images team warned `"cache-control is too restrictive"`. The binding path is not auto-cached (F4). That is one more reason to use the binding, not `cf.image`.

**The spike could not prove three things** (all need the owner, §9):
- the binding path with a real POST body;
- quota-exhaustion behaviour;
- latency from a phone on LTE.

**Quota used:** about 60 unique transformations out of 5,000 this month.

---

## 3. Architecture

```
browser (docttak.com/remove-background/)
  pick photo -> decode -> work copy (C2 rules: long edge <= 4096 desktop / 2048 mobile)
  -> send copy: resize to long edge <= 1024, JPEG q0.9, EXIF/GPS dropped by re-encode (~150-300 KB)
  -> POST /api/remove-bg  (same origin; Content-Type image/jpeg; body only, no cookies needed)
        |
        v
Pages Function functions/api/remove-bg.ts   (_routes.json include ["/api/*"] -> static stays free)
  - method POST only; Sec-Fetch-Site must be same-origin (else 403)
  - Content-Length 1..2,000,000 (else 413); Content-Type image/jpeg|image/png|image/webp (else 415)
  - return env.BG.fetch(request)          <- service binding (F6), no body copy, no logging
        |
        v
Worker docttak-bg (separate Worker, own wrangler.toml under workers/bg/, deployed by owner)
  - [images] binding IMAGES; [[ratelimits]] RL_IP (limit 6, period 60), RL_IP10 (limit 3, period 10)
  - observability disabled (or head_sampling_rate 0); no console.* anywhere (lint rule + unit test)
  - key = CF-Connecting-IP hashed in memory only (never stored); limit() -> 429 {"error":"busy"}
  - read first 12 bytes -> magic check JPEG/PNG/WebP (else 415)
  - IMAGES.input(body).transform({ segment: "foreground" }).output({ format: "image/webp", quality: 100 })
  - response: image/webp, Cache-Control: no-store, private; CDN-Cache-Control: no-store; X-Robots-Tag: noindex
  - errors -> 503 {"error":"quota"} when the Images error matches the quota code (U4) else 502 {"error":"engine"}
        |
        v
browser: decode WebP -> take alpha (1024) -> bilinear upsample to work res -> C2 blur-fusion (fusion.worker.ts)
         -> same preview/download states as C2 (transparent PNG / white / blue JPEG)
```

**Why Pages Function + service binding rather than a Worker route on `docttak.com/api/*`:**
- It keeps a single deploy surface for the page and the API path under `_routes.json`.
- The no-upload e2e already runs against the Pages build.
- The Worker has no public route at all: disable `workers_dev` and set no `routes`, so the Worker can be reached only through the binding. That removes direct abuse of the Worker.

If the owner prefers fewer moving parts, the fallback is a Worker route `docttak.com/api/remove-bg` with `workers_dev = false`. Same code, minus the Function.

**Why 1024 px:** the model's working size (spike finding 1). It cuts what leaves the device by roughly 5–10× against a 12 MP original. Quality is unchanged at the mask level, because the cloud mask is upsampled from 1024 either way. On the device, fusion on the full-res original gives better edges than the cloud's own upscale. Arch's call: **send ≤ 1024, never the original.** This is the privacy minimisation we can honestly claim.

**Response format:** WebP `quality: 100`, which is lossless if U5 holds; spike-2 confirms. If the binding gives lossy WebP alpha, use `format: "image/png"` only if spike-2 shows 256 alpha levels through the binding; otherwise lossy WebP is still fine, since only alpha is kept and it is fused. The palette PNG from `cf.image` is banned (finding 3).

---

## 4. Page flow (`/remove-background/`)

States extend C2's reducer:
`empty -> (pick) -> ready -> [cloud] sending -> working -> done | nosubject | error-cloud | quota`
`                         \-> [device] consent -> downloading -> loading-engine -> working -> done …` (C2 unchanged)

- **Above the picker** (always visible), the per-tool notice. Copy in §7.3.
- **Main button:** `배경 지우기`. This is the cloud path; the first press is the consent to send.
- **Secondary link-button:** `사진을 보내지 않고 기기에서 처리 (처음 한 번 약 100 MB 받기)`. It enters C2's consent flow. The choice is remembered in `localStorage` (`docttak-bg-mode=device`; wrapped in try/catch).
- **Progress:** `사진을 보내는 중…` -> `배경을 지우는 중… (보통 5초쯤)` -> fusion `가장자리를 다듬는 중…`. `AbortController` cancel. Client timeout 30 s.
- **Errors:**

| Case | User sees | Next |
|---|---|---|
| 429 busy | "잠시 사용이 많아요. 1분 뒤 다시 해 보세요." | [다시 시도] [기기에서 처리] |
| 503 quota / 9422 | "이번 달 무료 처리량이 다 찼어요. 이 기기에서 처리할 수 있어요." | C2 consent panel opens |
| network / 5xx / timeout | "지금은 처리할 수 없어요. 다시 시도하거나 기기에서 처리해 보세요." | both buttons |
| empty alpha (< 1%) | C2's `nosubject` message | — |

- **Nothing is retried automatically.** Each retry costs quota.
- **ID-photo note** (C2 rule kept): "증명사진은 증명사진 도구에서 규격에 맞추세요". No cross-page hand-off.
- **Initial JS budget unchanged** (≤ 30 KB). The cloud client is about 3 KB, loaded after the pick. ORT and the model load only on the opt-in path.

---

## 5. Abuse and cost control

| Layer | Control | Notes |
|---|---|---|
| Client | Downscale to ≤ 1024 px JPEG, one request per user action, no auto-retry | Honest users cost one transformation per photo |
| Function | POST only, `Sec-Fetch-Site: same-origin`, `Content-Length` ≤ 2 MB, type allowlist | Rejects cross-site form posts and big bodies before the Worker runs |
| Worker | `ratelimits` per IP: 3 / 10 s and 6 / 60 s (F14, per location) | If U3 says it is not on Free: fall back to an in-isolate `Map` token bucket (best effort) and rely on the global cap below |
| Worker | Magic-byte check, `.input()` ≤ 20 MB (F3) | Our cap is 2 MB anyway |
| Global | Free-plan hard stop at 5,000/month: `9422`, no charge (F8) | The account must **stay on Images Free**. Owner rule: never buy Images Paid without re-running this section. If it ever goes Paid, add a Durable Object daily counter (U6) capped at 160/day |
| Workers quota | 100,000 req/day shared (F13); `_routes.json` keeps static off Functions | Only `/api/*` counts |

**Turnstile is not used.** It is a third-party script (challenges.cloudflare.com) and would break CSP and the "no third-party scripts" rule. Re-open only if abuse shows in the weekly report and the IP limits fail. If it is ever added, it is an owner decision with a CSP exception logged.

**Unique-transformation note:** each different photo is one unique transformation (F9). Re-sending the same bytes in the same month is not billed again. Sending the 1024 copy keeps that deterministic.

---

## 6. Privacy implementation rules (build-enforced)

1. No storage: no R2, KV, D1, DO or Cache API writes in `functions/api/` or `workers/bg/`. A unit test greps both trees for `caches.`, `.put(`, `R2`, `KV`, `console.`.
2. No logging of image bytes:
   - Worker `observability.enabled = false`;
   - zero `console.*`;
   - error responses carry no request data.
   - Invocation metadata (URL, status, colo) may still exist in Cloudflare's systems (F18); the privacy text says so plainly.
3. Streamed: `request.body` goes straight to `IMAGES.input()`. The magic check uses a `tee()`/first-chunk read, never a full copy. The response is the binding's `.response()` stream.
4. No cache: `Cache-Control: no-store, private` on the response. POST is not cached by the CDN. The Function never sets `cf.cacheEverything`. The SW must not touch `/api/`: `gen-sw.mjs` passes non-GET requests and `/api/*` to the network untouched (unit test).
5. EXIF: the client re-encodes the copy through canvas, so EXIF/GPS never leaves (unit test on a GPS-tagged fixture).
6. Same origin only: CSP stays `connect-src 'self'`. No CSP change is needed.

---

## 7. Legal and copy changes (개인정보보호법) — owner sign-off required before release

> Arch has not fetched the statute text in this pass. Before any of this copy ships, the builder fetches 개인정보 보호법 제26조 (업무위탁) and 제28조의8 (국외 이전) and the 시행령 from law.go.kr. They go through `check:quotes` like the guides. The items below are the disclosure list that the law requires as Arch understands it. The builder confirms each item against the fetched text and logs it.

### 7.1 Privacy policy v2 (`/privacy/`) — new section only for 배경 지우기
Bump `PRIVACY_REVISED`, keep §1–§5 true for all other tools, and add:

**N. 배경 지우기에서 사진을 보내는 경우** (only when the user presses 배경 지우기 without choosing 기기에서 처리)
- **목적:** 사진의 배경을 지우기 위해서만 써요.
- **항목:** 고른 사진을 긴 변 1024픽셀 이하로 줄인 사본 1장. 사진 속 위치 정보 같은 부가 정보는 빼고 보내요. 이름·연락처 등은 받지 않아요. 사진에 얼굴이 나오면 그 얼굴도 포함돼요.
- **처리와 보관:** 처리하는 동안만 쓰고, 결과를 돌려준 즉시 지워요. 문서딱은 사진을 저장하지 않아요. Cloudflare는 사진을 AI 학습이나 서비스 개선에 쓰지 않는다고 밝히고 있어요 (F15).
  - Do not claim "Cloudflare 즉시 삭제" until U1 is answered. Until then, say: "Cloudflare의 처리 기록 보관은 Cloudflare 개인정보처리방침을 따라요" and give the link.
- **처리 위탁:** Cloudflare, Inc. (사진의 배경 지우기 처리).
- **국외 이전:**
  - 받는 자: Cloudflare, Inc. (미국), privacyquestions@cloudflare.com
  - 국가: 미국 및 Cloudflare 처리 장치가 있는 나라 (F16, U2: 실제 처리 위치는 요청을 받은 Cloudflare 거점에 따라 달라요)
  - 시기·방법: 배경 지우기를 누를 때 암호화된 통신(HTTPS)으로
  - 항목: 위 사본 1장
  - 보유·이용 기간: 처리 직후 삭제 (U1 caveat as above)
  - 거부 방법과 효과: "기기에서 처리"를 고르면 사진을 보내지 않아요. 기능은 같지만 처음 한 번 약 100 MB를 받아요.
- **개인정보 보호책임자:** 이름 `[OWNER MUST SUPPLY]`, 연락처 robotncoding@kakao.com.

**Build gate:**
- the cloud path flag requires `PUBLIC_CONTACT_EMAIL` and `PUBLIC_PRIVACY_OFFICER`;
- `check-dist` fails without them.

This lifts the "no contact / privacy-officer lines" rule for the privacy page **only** when the cloud flag is on. The CLAUDE.md rule needs the owner's OK; log it.

### 7.2 Site-wide promise — stays true for every other tool
| Where | Now | New |
|---|---|---|
| Home hero `index.astro:44` | 사진과 서류는 내 폰·컴퓨터 안에서만 고쳐요. 어디로도 보내지 않아요. | 사진과 서류는 내 폰·컴퓨터 안에서만 고쳐요. 어디로도 보내지 않아요.* — footnote line under it: `* 배경 지우기만 예외예요. 사진을 잠깐 보내 처리하고 바로 지워요. 원하면 보내지 않고 처리할 수도 있어요.` |
| Home bullet `index.astro:105` | 파일은 인터넷으로 어디에도 보내지지 않습니다. | 파일은 인터넷으로 어디에도 보내지지 않습니다. (배경 지우기는 예외, 아래 설명) |
| `/privacy/` §2 title and description | 파일은 어디로도 보내지 않아요 | 파일은 어디로도 보내지 않아요 (배경 지우기만 예외: N항) |
| `/terms/` description | …파일을 어디로도 보내지 않는… | …파일을 기기 안에서 처리하는 (배경 지우기 제외)… |
| `tools.ts:52` description, `:85-86` FAQ for 배경 지우기 | 사진은 내 폰·컴퓨터 밖으로 보내지 않습니다 / 어디로도 보내지 않습니다 | description: `…투명한 PNG나 흰색·파란색 배경으로 저장합니다. 사진은 잠깐 보내 처리하고 바로 지워요(보내지 않고 처리하기도 가능).` FAQ: `기본은 줄인 사진 1장을 Cloudflare(미국 회사)로 보내 배경을 지우고, 결과를 돌려받은 뒤 바로 지워요. "사진을 보내지 않고 기기에서 처리"를 고르면 어디로도 보내지 않아요.` |
| Guides, hubs, `/stamp-signature/` | unchanged | unchanged. They describe other tools and stay true. A dist test asserts the exception wording appears **only** on home, privacy, terms and `/remove-background/`. |

`docs/COPY.md`: add the approved exception sentences; no 업로드/서버/브라우저.

### 7.3 Per-tool notice (above the picker, always visible; read again on the button)
> 배경 지우기를 누르면 사진을 작게 줄인 사본 1장을 Cloudflare(미국 회사)로 보내 배경을 지우고, 결과를 받으면 바로 지워요. 문서딱은 사진을 저장하지 않아요. [자세히](/privacy/#bg)
> 보내고 싶지 않으면 **사진을 보내지 않고 기기에서 처리**를 고르세요 (처음 한 번 약 100 MB).

The first press of 배경 지우기 is the act of consent. No pre-ticked box, no dark pattern. The opt-in path stays one click away in every state.

---

## 8. Ops
- **Free tier:** Workers 100k req/day shared (F13); Images 5,000/month (F8). There is no cost path while on Free plans.
- **Quota monitoring:** fold into the A-5 weekly report.
  - The CF GraphQL Analytics API gives Worker invocations, Function requests, statuses and Images transformations for the month.
  - It needs an **owner-created read-only API token** (Account Analytics: Read). The token goes in env `.env` locally only, never in git or the DB (Guardrails).
  - Report lines: transformations used / 5,000; projected month-end; 429 count; 5xx count; quota-fallback count.
  - Alert thresholds: ≥ 70% used before day 20 → note in the report; ≥ 90% → owner alert (the same channel A-5 uses). At 100% the site degrades by itself to on-device (no action needed).
- **Monthly reset:** calendar month (F9). Nothing to do.
- **Worker deploy:** `workers/bg/wrangler.toml` lives in the repo and is deployed by `wrangler deploy` with an owner token. It is never part of `npm run build`. `.github` stays untouched.

---

## 9. Owner-only steps (agent cannot do these: no Cloudflare login or API token on this PC — `wrangler whoami`: "You are not authenticated")

1. **Create the Worker `docttak-bg`.** Either in the dashboard (Workers & Pages → Create → Worker), or run `npx wrangler login` once on the PC, after which the agent can `wrangler deploy` from `workers/bg/`. Its settings:
   - Bindings → Add → **Images**, variable `IMAGES`.
   - Add **Rate limiting** `RL_IP` and `RL_IP10` if offered on Free (answers U3).
   - `workers_dev` off; no routes.
   - Observability off.
2. **Pages project `doc-tools-kr`** → Settings → Bindings → Add → **Service binding**: variable `BG`, service `docttak-bg`.
   - Set it for **Preview first**.
   - Redeploy `c2-cloud` (F6).
   - Production only after §11 step 5.
3. **Spike-2** (agent, after 1–2): POST the 3 photos to `c2-cloud…/api/remove-bg` through the binding. It confirms:
   - F2/U5: segment and lossless WebP on the binding;
   - `output({format:"image/png"})` alpha depth;
   - whether `application/json` mask output exists;
   - latency from Seoul.
   Log in BUILD-LOG.
4. **Analytics token** (read-only) for the weekly quota line (§8).
5. **Supply the 개인정보 보호책임자 name** and confirm robotncoding@kakao.com as the contact. Approve the §7 copy and the CLAUDE.md rule change ("no file bytes leave the device" → "except 배경 지우기 cloud path").
6. **Phone check** (§11).
7. Ask Cloudflare support or the account team about U1 (Images/Workers AI input retention) and U2 (inference region), if a firmer privacy sentence is wanted. Optional; the §7.1 wording is safe without it.

---

## 10. Tests

| Branch / flow | Test |
|---|---|
| Cloud default path: pick → POST → done; alpha applied; fusion runs | e2e `remove-background.cloud.spec.ts`. Playwright `page.route('**/api/remove-bg', …)` fulfils with a committed RGBA WebP fixture. No real network. 5 projects |
| 429 / 503 quota / 5xx / timeout → messages + device fallback | same spec, one route per status |
| Body sent is ≤ 1024 px JPEG with no EXIF | e2e reads `request.postDataBuffer()`, decodes size and checks for no APP1 GPS; unit on the encoder |
| Opt-in device path unchanged | C2 specs as they are, with the mode stored |
| **No-upload guard** | `tests/e2e/no-upload.ts` gets an explicit allowlist parameter: `allowUpload: [{ method: 'POST', path: '/api/remove-bg' }]`. Only `remove-background.cloud.spec.ts` passes it. Every other spec and every other path stays strict. A unit test of `expectNoUpload` proves: (a) POST to `/api/remove-bg` fails without the allowlist; (b) POST to `/api/remove-bg?x` or `/api/other` fails even with it; (c) GET-only pages still pass |
| CSP unchanged (`connect-src 'self'`) on every page | existing assertion |
| Function: method / type / size / Sec-Fetch-Site guards; forwards to `env.BG` | vitest with a fake `env.BG` |
| Worker: magic bytes, rate-limit 429, quota mapping, no-store headers, no `console.`/storage APIs in source | vitest (Workers Vitest integration uses the low-fidelity Images mock, per the binding docs) + grep test |
| SW ignores `/api/*` and non-GET | gen-sw unit |
| Flag states | `PUBLIC_BG_CLOUD=0`: no `/api` call in the bundle and the exception copy is absent. `=1`: the copy is present on exactly the 4 allowed pages (dist test) |
| Privacy gate | build fails with `PUBLIC_BG_CLOUD=1` and no `PUBLIC_PRIVACY_OFFICER`/`PUBLIC_CONTACT_EMAIL` |
| Quality | `regress:bgremove` gains a `--engine cloud` mode on the owner PC (hits preview; ≈ 66 transformations per run, so run it manually, never in CI). Gate: GT mean MAE ≤ 0.0045, IoU ≥ 0.955 (spike 0.0038 / 0.966, with margin) |

---

## 11. Rollout
1. `PUBLIC_BG_CLOUD` flag, default 0. It is independent of `PUBLIC_BG_REMOVE`; cloud needs both on.
2. Build on `c2-cloud` → Preview env only (`PUBLIC_BG_CLOUD=1` in the Preview env, owner) → spike-2 → full gates (CLOUD-HANDOFF §3) → Richard "clear".
3. Owner phone check on the preview URL:
   - iPhone Safari and a mid-range Android on LTE;
   - 3 own photos;
   - time to result, and edges on hair;
   - the 429 message (tap 7 times in a minute);
   - the device opt-in still works;
   - KakaoTalk in-app browser.
4. Merge order: `c2` ships first, or together. `c2-cloud` rebases on `c2`. Remove the spike files `public/spike/` and the GET `cf.image` handler before merge; a dist test asserts no `/spike/` in dist.
5. Production: owner sets the production service binding + `PUBLIC_BG_CLOUD=1` → push on go-ahead → live smoke:
   - one real photo;
   - check `no-store`;
   - 0 third-party requests;
   - the privacy page shows the officer line.
6. First 4 weeks: weekly quota line (§8). If the 5,000 quota runs out before day 25 twice, Arch re-plans (options: Images Paid with a DO cap, or device-first on desktop).

---

## 12. Out of scope
Batch, 고화질 cloud (> 1024), Turnstile, accounts, any storage, cross-page hand-off, cloud for any other tool.
