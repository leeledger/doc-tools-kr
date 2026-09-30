# 문서딱 (docttak.com)

Free Korean document tools that run 100% in the visitor's browser: PDF 합치기, PDF 용량 줄이기, 사진 용량 줄이기, 여권·증명사진 규격 맞추기, HWP→PDF. Astro static site on Cloudflare Pages (Free plan, no Functions). GitHub `leeledger/doc-tools-kr`; push to `main` deploys production.

**Start here:** `handoff/CLOUD-HANDOFF.md` (current state, open branches, next steps, owner-only items).

## Owner rules (non-negotiable)
- **#1 goal is traffic.** SEO, share previews and useful guide pages first.
- **Quality first.** Every step: Arch brief → Bob build → Richard review → deploy → live smoke. Never lower a threshold to pass.
- **Never stop, never ask.** Decide yourself and log the decision in `handoff/BUILD-LOG.md`. Only the owner can do logins, captchas, payments and real-phone tests.
- **Brand:** "문서딱" in all Korean copy. `docttak` only as the domain. Never 안올림/독딱/Docttak as a name.
- **Plain language:** users don't know 업로드/서버/브라우저/네트워크/EXIF/dpi. Say e.g. "내 폰·컴퓨터 안에서만 고쳐요. 어디로도 보내지 않아요." (docs/COPY.md; enforced by dist tests).
- **Privacy/runtime:** no file bytes ever leave the device (e2e no-upload fixture on every test), no AI/LLM calls, no third-party scripts, CSP `connect-src 'self'`. Permissive licenses only (no GPL/AGPL/LGPL; MPL only via the logged exception).
- **No contact/operator/privacy-officer lines** until ads; build fails if ads or the error beacon are on without `PUBLIC_CONTACT_EMAIL`.
- Never invent specs: every number on a guide page cites an official source with a fetch date.

## Commands
`npm ci` · `npm run check` · `npm test` · `PUBLIC_SITE_URL=https://docttak.com npm run build` · `npx playwright test --project=chromium` · `npm run check:licenses` · `npm run regress:<merge|compress|photo|idphoto|hwp> -- --fixtures-only` (large corpora are local-only on the owner's PC).

## Team
Agents in `.claude/agents/` (architect/builder/reviewer), `/sprint` in `.claude/commands/`. Handoff files in `handoff/`.
