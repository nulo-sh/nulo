# wallet-bugs-2: phase 8 (arc gate and review)

## First pass at the arc gate (head 3590504e, then 59cf3f9b)

- `audit:vue` passed in 263 s, with 13887 unit and component tests passing. `test:all` passed in 247 s. `check:plans` reported 0 findings.
- Smoke on Chrome and Firefox: `rows`, `navigation` and `type-roles` were green. `viewers-csp`'s plain-follow case was red in both browsers, run alone too. The four hold cases passed.
  - Cause: a latent test bug that Phase 5 exposed. `logLines` measures a batch's growth from `scrollHeight`, which floors at the window's height while the log is shorter than the window. Phase 5 removed the boot-time warnings of the retried tip read, so a fresh log holds about 29 lines, under the 700 px window. Sixty lines then measured 983 px against the 1,091 expected.
  - Fix: `filledLogs` waits for its last probe line to render, then checks that the scroller overflows and rests at the end. The trim case's `cappedLogs` shares the same `lastLineShown` wait.

## Review

- Codex, round 1 (gpt-6.1-sol, high, read-only): **approve**, one nit. The new height case selected by `aria-busy`. It now uses `data-status` through a shared `SEED_WORKING` constant.
- Opus 5.5 review, alongside round 1: **conditional approve**.
  - Should-fix: the store sentence's only citation backed "by network and address" alone. Fixed by adding citations, wording unchanged: `index.ts:41`, `token-flag.ts:1-17`, and the flagged-token e2e.
  - Nits applied: the burst comment is now conditional, and the height case compares to a tenth of a pixel.
  - Recorded, not changed:
    - The tip read mirrors the PXE client's quarantine refusal, not its recovery-mode one. No encrypted state is touched and the consequence is nil (KL-2).
    - A follow left off after content shrinks with no scroll. This is the plan's UI-impact behaviour: the button or the 30 s timer resumes it.
    - The trim case waits for exact heights, so a background line logged mid-case would turn it red falsely. It has passed every run.
  - One item was outside this arc and was routed under the repository's open-work rules.
- Codex, round 2 (resumed): **approve, no new material finding**. The loop converged in two rounds.

## Final gate (merged head)

`origin/dev` merged at 6266a8e4: #772 and #778, which share no file with this arc except the network-reset composition test, auto-merged. Typecheck is clean.

Final gates on the merged code:
- Smoke after fresh armed builds of `rows`, `viewers-csp`, `navigation`, `type-roles` and `shipped-token-list`:
  - Chrome: 35 passed, 2 skipped, run 205 s. Per file: `rows` 72.5 s, `viewers-csp` 20.0 s, `navigation` 24.6 s, `type-roles` 72.7 s.
  - Firefox: 36 passed, 1 skipped, run 287 s. Per file: `rows` 107.0 s, `viewers-csp` 27.8 s, `navigation` 38.9 s, `type-roles` 109.0 s.
- `e2e:agent` on Chrome: `incoming-arrival` 7/7 (file 408 s, with `NULO_E2E_PROVERLESS=1`); `incoming-transfers` 3/3 (73 s).
- Lint, typecheck:all, `audit:vue`, `test:all` and `check:plans` ran again on the close-out head, which differs from the merged code only in plan files.

Close-out filed:
- #784: KL-1, closed `known-limit`.
- #785: KL-2, closed `known-limit`.
- #786: OA-2, the ghost rows, open for the owner.

No lessons are promoted, because `lessons.md` is at its 8 KiB budget.

## Second `dev` merge (a1661600)

The PR opened conflicting: #783 (ci-e2e-hygiene-1) had rewritten `viewers-csp.test.ts` for the wallet's own lines, which land in the window at any time. It brought three things:
- `logLines` tags its lines with a nonce and waits for its own last line to render.
- `gapToEnd` reads after two frames with no line change.
- The follow check is armed before the step that should stop the follow.

Resolution:
- Dev's helpers and its follow case.
- This arc's hold and trim cases.
- The trim case keeps its exact cap, because it must trim on the first line after the selection to prove the end-band re-arm. It now fails with its own message if a wallet line trims during the fill, and a trim's landing tolerates three wallet lines.

Against the base `LogsViewer.vue` (Chrome), the three hold cases are red: the view moved 38, 36 and 19.75 px.

#783's OA-3 (ci-e2e-hygiene-1) is #616 itself, and this PR ships its option A.
