# lessons-1: recon

Base: `origin/dev` at `cef87d9de`. Three read-only explorers (sonnet) read every file of the nine archived plans the lane brief names, plus `index-union-1`, and re-checked each `lessons.md` entry at HEAD; the planner checked the GitHub evidence (issues, PRs, runs) directly.

## Reuse map

| Capability | Existing | Verdict |
|---|---|---|
| The curated layer and its rules | `implementations-plan/lessons.md` (8152 of 8192 B); README § Portable rules 8 | reuse-as-is |
| The budget and entry-shape gate | `scripts/ci-cd/plans/structure.ts:37,240-305`: file over `LESSONS_BUDGET` = 8192 B fails; each entry is one line linking at least one plans-tree path or allowlisted permalink; issue links allowed beside it | reuse-as-is |
| Anchor checking | none: `links.ts:160` classifies `#…` but no rule resolves a fragment against the target's headings (searched `anchor`, `slug`, `fragment` in `scripts/ci-cd/plans/`) | manual check in the phase gate |
| Home for e2e harness know-how | `.claude/skills/e2e-testing/SKILL.md` (CLAUDE.md § Skills own their domains) | dedupe target |
| Home for release and Actions know-how | `.claude/skills/release/SKILL.md`, `CI.md` | dedupe target |

## The brief's candidates against their evidence

| # | Candidate | Evidence | Verdict |
|---|---|---|---|
| C1 | GitHub ignores `merge=union` on the archive index | #957 comment: PR #978 read CONFLICTING once `dev` carried another archive row; `git merge-tree` clean with `-c attr.tree=origin/dev`, conflicting without. A local merge reads the working tree's attributes (index-union-1 F5), and `scripts/ci-cd/plans/structure.test.ts:226` merges two appends clean under the repo's `.gitattributes`. index-union-1's plan records the question as unverified (I1). | holds; "keep both sides by hand" does not: a local `git merge origin/dev` unions the two lines with no edit. Owner P78-10 A keeps that merge. |
| C2 | Soak `mode=full` can never pass; a branch soak is `nightly.yml` with `dry_run=true force=true` on that branch | Run 39642793500: iterations cancelled at 30:20 and 30:18, `_extension-network-e2e.yml:115` `timeout-minutes: 30`. Run 39652968832 (`nightly`, branch `encryption-at-rest-1-a1`) failed at `resolve` in 10 s: `nightly.yml:109-110` refuses any ref but `refs/heads/dev`; also `archive/ci-dedupe-1/plan.md` F5, which says so. No archived plan holds either run. | first half holds, second half false; no plans-tree evidence; lane soak-mode-1 changes the workflow |
| C3 | Host load above ~150 turns vitest's 5 s default into timeouts and stretches smoke 50 %; A/B timing belongs on CI | `archive/e2e-harness-gaps/plan.md:839-840`: a test with no timing assertion hit vitest's 5 s timeout with `STACK_TRACE_ERROR` in its stack at load 120-200, clean 30/30 on a quiet re-run. `archive/firefox-files-1/lessons/phase-6.md:49-51`: two source-scan tests at the 5 s limit beside two armed builds, green alone. `archive/block-time-1/lessons/phase-3.md:144`: interleaved arms still drifted with load (+27 s / +25 s). No source for "smoke 50 %". `archive/e2e-fixed-cost-1/plan.md` § Validation: CI's whole-minute envelopes could not resolve a few seconds, so attribution came from paired local runs. | timeouts and drift hold; "50 %" and "A/B belongs on CI" do not |
| C4 | `onInstalled` reason `install` on every launch | `archive/e2e-fixed-cost-1/plan.md` F4 (4 of 4 relaunches per browser); PR #1003 | holds; already stated at `.claude/skills/e2e-testing/SKILL.md:556-564` |
| C5 | A stored onboarded profile saves ~1 s on smoke, collides on network; the lever is the kept registration popup | `archive/e2e-fixed-cost-1/plan.md` D1 (0.7 s / 1.1 s; `tokenReadyExtension` waits for exactly 1000); #1006 probe comment (kept popup: −1147 ms Chrome, −2000 ms Firefox; injected profile nil over it) | holds; D1 already at `.claude/skills/e2e-testing/SKILL.md:283-288`; the kept-popup lever is open lane warm-stack-1's, CI numbers pending |
| C6 | `CODEX_ACCOUNT=best` routes to another roster home than the one named | `archive/heavy-pool-1/lessons/phase-0.md:11`: the variable was unset, the managed routing picked a home, the consult worked | does not hold as worded (nothing was named, nothing failed); the routing is the owner's personal tooling, outside this repo |

## Other gotchas the sweep found (this week's plans)

| Gotcha | Evidence | Verdict |
|---|---|---|
| No code unmounts a popup window: closing it runs no Vue unmount hook | `archive/fee-estimate-cancel-1/recon.md` § Facts the plan rests on; at HEAD `apps/extension/src/utils/close-current-window.ts:2-6` calls `chrome.windows.remove`, and no `.unmount()`, `pagehide` or `unload` handler exists under `apps/extension/src` outside tests | promote (no home states it; CLAUDE.md § Cleanup order assumes the hooks run) |
| An environment secret a reusable-workflow caller does not pass resolves empty; a rerun keeps its workflow revision | `archive/release-pipeline-2/plan.md` F3 | already `.claude/skills/release/SKILL.md:192-193`, `CI.md:106` |
| Two smoke runs on one `dist/chrome` kill each other's browsers | `archive/firefox-files-1/lessons/phase-4.md:25-29` | already in the e2e-testing skill |
| Firefox closes its toolbar panel when another window takes focus | `archive/firefox-files-1/plan.md` | already `apps/extension/tests/e2e/FIREFOX.md` |
| `workflow_dispatch` checks out the branch, not a SHA; dispatch concurrency cancels a twin | `archive/heavy-pool-1/plan.md` F3 | not promoted: heavy-pool-1's Outcome kept it in its lessons log |
| Aztec 6.0.0-rc.3 block-time knobs (boot-only pool age, automine, slot 1/1) | `archive/block-time-1/lessons/phase-2.md`, `phase-3.md` | not promoted: block-time-1's Outcome kept them in its logs |
| GitHub's PR list pages newest first; the contents API reads a closed PR's head | `archive/floor-superseded-1/lessons/phase-3.md:5`, plan F3-F4 | not promoted: one script's concern, covered by its tests |
| `chrome.downloads.download` reports the start, not the save | `archive/firefox-files-1/plan.md` | not promoted: one flow, recorded in its plan |

## Collisions

- Lanes soak-mode-1, warm-stack-1 and e2e-clocks-1 are in flight; each close-out may edit `lessons.md`. No open PR touches it today (`gh pr list` over open PRs' files). The arc merges `origin/dev` and re-reads `lessons.md` right before its PR and again before close-out.
- Open issues: none for this lane. #957 is closed (owner P78-10 A). #1006 is open and owned by warm-stack-1.

## Retirement sweep (every `lessons.md` entry at HEAD)

One explorer checked each of the 33 entries against the code or config it names and against the homes CLAUDE.md routes a reader to; the planner re-read each "retire" verdict.

| Line | Holds at HEAD | Stated by a routed home | Verdict |
|---|---|---|---|
| 5, 10, 12, 13, 18, 24-26, 29-31, 34, 35, 37, 41-46, 50-52 | yes, or external behaviour not checkable in-repo | no (partial overlaps only: line 18's pattern in `CI.md:122` without the rule; line 30's `{ error }` rule in the logging-policy skill without the message-text hazard) | keep |
| 9 | yes (`package.json:16`, `apps/extension/vitest.config.ts`) | explorer said yes (`CI.md:31` names `test:all`); the planner disagrees: no home says root `test` covers only the extension | keep |
| 11 | yes; its version stamp is current (`vue ^3.5.42`, VTU `^2.4.11`) | no | keep, stamp kept (it dates the advice) |
| 17 | yes | partly, in domain skills (`e2e-testing/SKILL.md:850,898`, `aztec-update/SKILL.md:231`); a non-e2e PR's author is not routed there | keep |
| 19 | not checkable in-repo (git behaviour) | no | keep: every close-out moves its plan and repairs links, so R100 is routine evidence (plan I1, D7) |
| 20 | not checkable (process) | parts in README rule 10 and step 4 | keep |
| 27 | yes: `viaPxe` names `RecoveryModeError` and turns the rest into `SessionEndedError` or a bare `Error` (`account-state/service.ts:172-182`), which is the line's rule | no | keep |
| 28 | yes (`entity_storage.ts:203-212`) | code comments at its two users (`id-allocators.ts:17-18`, `purge-rows.ts:28-31`) | keep (a new store author is not routed there) |
| 32 | partly checkable | no | keep |
| 33 | not checkable in-repo (CodeMirror behaviour) | yes, at the site: `apps/extension/src/components/JsonViewer/creator.js:98-99` (the theme is marked dark for both app themes) and `:116` (the base theme's pressed rule is one class more specific) | **retire** (its home is the code that needs it, plan D7) |
| 36 | yes; `ARCHITECTURE.md:197` states the `leave(ticket)` half, not the displaced writer | partly | keep |
