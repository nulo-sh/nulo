# quality-profile-1: arc 2 (phases 4-6) log

## Before building

- #1439 was closed when arc 1 merged: arc 1's squash body said, in prose, "Arc 2 … closes #1439", and GitHub reads a closing keyword wherever it stands in a PR body. Reopened with a comment saying why. An arc that is only part of an issue writes `Part of #N` and never the phrase.
- Arc 1 had squash-merged, so arc 2 and the close-out ship as one PR off `dev` (D14), not a stack.

## Phase 4: the frame

- The codec test passed at its first run; with the frame returning `body(opened)` un-awaited it failed on the pending-body assertion (`expected [ true, true, true ] to strictly equal [ false, false, false ]`).
- Biome's formatter will not hug a trailing callback when another argument is also an arrow, so `withOpenedSlots(row, key, () => new X(), async (o) => {…})` breaks into four argument lines. Two module-level refusal factories avoid that and merge the two "Invalid profile old password" literals the code kept "in lockstep" (D15).
- Every existing pin passed unedited at each group's commit: 623 pass, 1 skip pre-existing at the base.

## Phase 5: the small copies

- The literal count after the helper and the verify merge: 18 sites (26 at the base, less the verify copy, less eight absorbed by `liveRowHoldingLock`, plus its own).

## Phase 6 and the chaos citations

- The PXE suite: 442 pass, 2 skips (the env-gated real-data test).
- The chaos model's citations moved again: 30 of 31 shifted, seven with new text, since the refusals now pass to the frame. Re-cited by a line diff from the base, as in arc 1. A later comment-only commit (one line removed) left them stale for one commit; the citation test belongs in the fast gate of any commit that edits `service.ts` or the codec.
- zsh: `$r:apps/...` applies the `:a` modifier to `$r` (write `${r}:`), and an unquoted `$P` holding several paths stays one word.

## Reviews

- Codex r1 (gpt-6.1-sol, high, the arc diff): approve. Accepted: the wrong-key arm proves the passed refusal is the one thrown (a sentinel matched by identity); the frame's TSDoc states the slots are lent; three comments that restated their code. Rejected: none.
- Opus (general-purpose, the arc diff), beside r1: no behaviour drift at any site. Accepted: the unlock comment's `auth.vue:65-74` (stale since before this plan) cites the file alone; two wipe comments keep only their reason; `captureRowFence` drops the sentence `liveRowHoldingLock` now carries; one sentence for `INVALID_PROFILE_ID`. Its test finding was Codex's #1. Noted, not acted on: the password-change and phrase-export citations name the calls that pass `invalidOldPassword`, so the literal's own line is cited by nothing; `service.integration.test.ts` pins its text on both paths (Codex r2 checked).
- Codex r2 (resumed, the fix diff): approve; every fix verified, no regression.
- Codex net pass (fresh session, both arcs' diff): approve; one comment nit on `logPublicEvent`, accepted. No cross-arc duplication, no unrecorded drift; the five arc-1 seams still observe the frame.

## Gates on the final head

- lint, typecheck:all, test:all (156 s), audit:vue (153 s): green at retry 0.
- Smoke set, armed builds: Chrome 22/22 (160 s), Firefox 22/22 (239 s); arc 1's were 159 s and 227 s. No e2e scenario added or changed.
- `incoming-public-transfers` on Chrome: 2/2, none skipped (186 s).
- `audit:dup` from `git archive` exports: production 175 / 8,751 at `origin/dev` → 173 / 8,725; `profile/service.ts` internal 4 / 46 → 2 / 20.
