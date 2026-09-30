---
description: Run a Three-Man-Team sprint (Architect → Builder → Reviewer → Deploy gate) on a non-trivial task. Usage - /sprint <task description>
---

# /sprint

Three-Man-Team sprint orchestrator. Use this for **non-trivial work** — features, refactors, multi-file changes, anything risky. Skip for one-line bug fixes or trivial edits.

The Project Owner's task: $ARGUMENTS

## Your role here

You are the **orchestrator**, not any of the three personas. You spawn the right subagent at each phase and pass the right context. The personas live in their subagent prompts; you do not channel them.

## Phase 0 — Bootstrap

If the current working directory does not have a `handoff/` directory, create it. The agents will populate it.

If `handoff/SESSION-CHECKPOINT.md` exists, read it first — there may be an in-flight sprint to resume rather than start fresh.

## Phase 1 — Architect

Spawn the `architect` subagent with this prompt:

> Project Owner's task: <the task verbatim>
>
> Read your role definition. Then assess the situation: read the checkpoint and BUILD-LOG if they exist, and any code you actually need to make decisions (grep first). Produce `handoff/ARCHITECT-BRIEF.md` for this step. If the task itself is genuinely trivial, say so and stop — do not write a brief for trivial work.
>
> Return: a one-paragraph status summary for the Project Owner — what you are about to brief Bob to do, what decisions you locked, what you are escalating (if anything).

Wait for Architect to return. Show the user Architect's status paragraph and the brief path.

If Architect escalated something (decision needed) — stop here, surface the question to the user, do not proceed to Builder until the user answers.

## Phase 2 — Builder

Spawn the `builder` subagent:

> Read your role definition. Read handoff/ARCHITECT-BRIEF.md. Build exactly what the brief specifies. When done, write handoff/REVIEW-REQUEST.md and BUILD-LOG.md.
>
> Return: one paragraph — what you built, what files changed, anything you escalated.

Wait. If Builder escalated — surface to the user, stop.

## Phase 3 — Reviewer

Spawn the `reviewer` subagent:

> Read your role definition. Read handoff/REVIEW-REQUEST.md and only the files Bob listed, only the line ranges he cited. Write findings to handoff/REVIEW-FEEDBACK.md.
>
> Return: one line — "Step N is clear" if no Must Fix items, otherwise list the count of Must Fix items.

If Reviewer returns Must Fix items — surface the feedback file path to the user. Loop back to Phase 2 with the updated brief if the user wants the build to continue. Otherwise stop and let the user decide.

## Phase 4 — Deploy gate

If Reviewer cleared the step:
1. Summarize for the user: what was built, what Reviewer found, how it was resolved (or "clean" if nothing).
2. **Ask the user explicitly for go-ahead before any commit/push.** The deploy gate is the point of this whole workflow — do not skip the explicit confirmation.
3. On go-ahead: commit with a message like "[Step N] 한 줄 요약" plus a body of bullets. Push only if the user asked you to.
4. Update `handoff/BUILD-LOG.md` (mark step complete + date) and `handoff/SESSION-CHECKPOINT.md` (next-session resume note).

## Token discipline (orchestrator)

- You do not need to read source code yourself. The subagents do that.
- Do not summarize what the subagents already returned. Pass through.
- The personas' system prompts live with the subagents. Do not paste their content into your prompt to them — they already have it.
- Each subagent invocation is a fresh context. Do not include unnecessary history.
