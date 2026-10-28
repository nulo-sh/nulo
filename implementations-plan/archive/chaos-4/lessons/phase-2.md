# Phase 2: the scenario list

Every run at retry 0, `T` = `cd apps/extension && bun --bun vitest run --retry=0`. Loads are the host's 1-minute average.

## Runs

- `T` scenarios file, first run: 30/33. Three break fixtures failed, none a product fault. Two were red at the right step and oracle, but their pattern named another message than the checker's ("reports <id> active"). The third installed its MAC spy before the method change ran, so the spy caught the change's own MAC check (`envelope MAC does not cover the DEK slot`) instead of the restore's. Fix: the spy is installed once the change is parked, before the restart.
- Second run: 32/33; the lenient stop's break fixture is red with "the service's active profile is none", and its pattern now says so.
- Third run: 33/33, 0.77 s of tests.
- Plan digest (seeds 1, 1001, 3001, 7001-7030, 7101-7105, 7201-7205 under three caps and three starts, plus a hand list through `planFromList`): identical at `origin/dev` and the head.
- `T` model test and both composition files, load 104: the model test's "the counter moves by one exactly at a mint … on Chrome" timed out at 5529 ms. Planning alone measures 3.07 s outside vitest at load 106 (3,000 plans, 75,000 steps). Filed #1327 (`flake`); Codex consult: give it the sibling's 180 s budget (option A), and the citation and surface cases too (4.7 s and 4.9 s outside vitest at load ~380). D22.
- The same three files after the budget, load 354: 339 passed, 1 skipped.

## What the scenarios found

No product fault. Every scenario ran as recon.md § Scenario map traced it. One reading to keep: a reveal held at its answer returns the words after a lock, by design (D15). A row transplanted from a live row's slots opens to the live row's master with no trusted DEK and no bearer, because the envelope MAC binds the row id.

## Harness notes

- A one-shot spy on `crypto.subtle.verify` catches the first HMAC verify after it is installed, whichever call makes it. Install it at the instruction the scenario names, not at the step's start.
- `ConfigStore` does not watch storage, so strict mode turned on for a booting worker goes through that worker's own config (`StepHooks.onBoot`), not a storage write.
- A row planted around the log holds needles (a slot, a salt) in a place no wallet write put them. `plant` records them, so O7 reads only what the wallet writes.

## Review, round 1

Codex (`gpt-6.1-sol`, high, read-only): reject, 5 findings. Opus beside it: conditional approve, 6 findings and a latent note. Each was checked against the tree; all accepted.

- O7: the `planted` filter also hid the wallet's own writes of a planted needle (Codex 1, Opus 5). It now exempts storage hits only. Fixture: the transplant's row rewritten by a logged write that keeps P1's salt. Before the fix it reds on O2 alone; after, on O7 too.
- The reveal's "nothing is written" rested on nothing: the catalog lets a reveal write its profile (Codex 2). A span's `silent` drops the named step's writes. Fixture: a logged write and restore of the row during the hold reds on O3.
- The retired-row break threw in the page's parameter read, before the unlock (Codex 3, Opus 2). The answer now comes first, and the fixture checks the spy ran.
- The swapped-salt "break" removed the fault instead of a guard (Codex 4, Opus 3). It is now the control. The break is an `openSlots` that falls back to the other row on the credential, at the answered salt; it opens P2's slots for P1.
- Two break patterns matched any failure on their step (Opus 1). A spy that throws a `TypeError` passed them. They now name their exact message, and the four `|expects` alternatives are gone.
- The DEK-trusted break patched the first worker too, so its run diverged from step 3 (Opus 4). It now patches only the restarted worker.
- Docs overclaimed controls and breaks (Opus 3). Added controls for the reveal hold, the strict-mode unlock hold and the change hold. The README and the plan now say which items have a control, and that a break either spies a guard away or forces the opposite outcome.
- Comments (Codex 5, Opus 6): header cut to one sentence; `flipLast`'s doc deleted; `onMacVerify`, `parkAfterWrite`, `plantP2` and `planFrom` docs corrected; `sessionManagerOf`'s dead branch removed.
- Not changed: a span's `before` patch reaches planning only. The driver and the checkers get the previous step's world, so the drivers bind P2 and K2 by hand (Opus, latent). This is harmless in these sequences, and changing it would change `runPlan`.
- Run after the fixes: 39/39 at retry 0, 0.65 s of tests; typecheck exit 0.

## Review, round 2

Codex, resumed over `955a2f7fd..d2439bb67`: approve, no new finding. It reran both composition files: 81 passed, 1 skipped, 13.8 s together. The loop converged in two rounds.

- `resume-codex.sh`'s third argument is the codex directory (round 1's `CODEX_DIR`), not the working directory. Given the worktree, a first resume wrote its files into the worktree root and fell back to the default model. It was stopped, and those files were removed.

## Final gates

At retry 0 on the head rebased onto `dev` (0a659726c), loads 70-190:
- `bun run test:all`: 3/3 exit 0, wall 199, 189 and 166 s.
- Extension unit suite with a JSON report: 3/3, 16,257 passed, 0 failed. Composition files: 17.1 + 1.4, 16.8 + 1.2 and 13.8 + 0.8 s. The model test took 47-79 s.
- `bun run lint` and `bun run typecheck:all`: exit 0.
- Smoke e2e on Chrome: 6/6 shards green, 274-354 s each. These ran on 955a2f7fd, before the rebase and before review round 1. The later commits change no file a smoke test imports except a doc comment in `model.ts`, and `dev`'s #1326 was green on its own CI.
- Smoke e2e on Firefox: 8/8 shards green, 292-495 s each, on the rebased head 872f2cf99.
