# 문서딱 (docttak.com)

Free Korean document tools that run 100% in the visitor's browser: PDF 합치기, PDF 용량 줄이기, 사진 용량 줄이기, 여권·증명사진 규격 맞추기, HWP→PDF. Astro static site on Cloudflare Pages (Free plan; Pages Functions only for `/api/remove-bg`, `/api/usage` and `/admin/`). GitHub `leeledger/doc-tools-kr`; push to `main` deploys production.

**Start here:** `handoff/CLOUD-HANDOFF.md` (current state, open branches, next steps, owner-only items).

## Owner rules (non-negotiable)
- **#1 goal is traffic.** SEO, share previews and useful guide pages first.
- **Quality first.** Every step: Arch brief → Bob build → Richard review → deploy → live smoke. Never lower a threshold to pass.
- **Never stop, never ask.** Decide yourself and log the decision in `handoff/BUILD-LOG.md`. Only the owner can do logins, captchas, payments and real-phone tests.
- **Brand:** "문서딱" in all Korean copy. `docttak` only as the domain. Never 안올림/독딱/Docttak as a name.
- **Plain language:** users don't know 업로드/서버/브라우저/네트워크/EXIF/dpi. Say what the tool does (용량, 규격, 가입 없이 무료); do not lead with "files never leave" (owner 2026-10-05; docs/COPY.md; enforced by dist tests).
- **Privacy/runtime:** no file bytes ever leave the device (e2e no-upload fixture on every test), except the 배경 지우기 cloud path: a ≤1024 px copy to `/api/remove-bg` (same origin, behind `PUBLIC_BG_CLOUD`; owner-approved 2026-10-02; only `remove-background.cloud.spec.ts` allows that one POST). The second allowed POST is the anonymous usage beacon to `/api/usage` (same origin, `navigator.sendBeacon`, whitelisted fields only, never file data; behind `PUBLIC_USAGE_STATS=1`; scripts/lib/usage.mjs; only the cloud e2e specs allow it). No AI/LLM calls. The only third-party script is the cookieless Cloudflare Web Analytics beacon, behind `PUBLIC_CF_ANALYTICS_TOKEN` (scripts/lib/analytics.mjs; CSP widened only then); otherwise CSP `script-src`/`connect-src 'self'`. Permissive licenses only (no GPL/AGPL/LGPL; MPL only via the logged exception).
- **No contact/operator/privacy-officer lines** until ads; build fails if ads or usage statistics (`PUBLIC_USAGE_STATS=1`; the old error beacon is retired) are on without `PUBLIC_CONTACT_EMAIL`. Exception: the cloud build (`PUBLIC_BG_CLOUD=1`) shows the 개인정보 보호책임자 and the contact on /privacy/ as the law requires (개인정보 보호법 제30조; build fails without `PUBLIC_PRIVACY_OFFICER` and `PUBLIC_CONTACT_EMAIL`), and the 배경 지우기 exception is named only on /privacy/, /terms/ and /remove-background/; no other page makes a site-wide "files never leave" claim (check-dist).
- Never invent specs: every number on a guide page cites an official source with a fetch date.

## Commands
`npm ci` · `npm run check` · `npm test` · `PUBLIC_SITE_URL=https://docttak.com npm run build` · `npx playwright test --project=chromium` · `npm run check:licenses` · `npm run regress:<merge|compress|photo|idphoto|hwp> -- --fixtures-only` (large corpora are local-only on the owner's PC).

## Team
Agents in `.claude/agents/` (architect/builder/reviewer), `/sprint` in `.claude/commands/`. Handoff files in `handoff/`.
