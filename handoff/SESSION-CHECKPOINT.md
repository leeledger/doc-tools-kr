# SESSION-CHECKPOINT
- **Where:** Step 1 is live (44af82c, https://doc-tools-kr.pages.dev). Step 2 (PDF 용량 줄이기) is fully briefed in handoff/ARCHITECT-BRIEF.md (the "Step 2 — Build spec" section at the end). No Step 2 code yet.
- **Next:**
  1. Bob builds Step 2 in the brief's order: step 0 refactors and Richard's two Step 1 items first, then deps/licences, wasm loading, engine, worker, page, wiring, budgets, tests. He writes REVIEW-REQUEST, including the regress:compress table.
  2. Richard reviews → "Step 2 is clear".
  3. Arch commits locally; the orchestrator pushes main and runs the live smoke test (brief, Deploy gate).
  4. Then Step 3 (사진 용량 줄이기) brief.
- **Decided this session:** "이미지로 변환" is in Step 2 (owner). Keep-original below a 1 % gain. Runtime pdf.js result check. Signature warning on the result. qpdf vendored as an ESM shim. Limits per brief 5.4. See BUILD-LOG "Step 2 decisions".
- **Open (owner):** privacy 문의처; 목표 용량 mode (Known Gap); Step 1b placement; Gate 11 on real browsers and a phone.
- **Resume prompt:** "Arch, resume doc-tools-kr: read handoff/SESSION-CHECKPOINT.md, then continue Step 2 at whatever stage REVIEW-REQUEST/REVIEW-FEEDBACK show."
