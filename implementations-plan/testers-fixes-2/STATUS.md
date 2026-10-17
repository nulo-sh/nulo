# Status: testers-fixes-2

- 2026-10-16: worktree adopted at 493ff497 and registered; #583 and #592 read with their decision blocks (P31-01 A', P29-02 A / P31-02 A, P29-03 A); recon done (2 sonnet explorers) and the row layout measured in Chrome; three lane-brief claims did not hold (empty-state centring, hero overflow, the title's flex value).
- 2026-10-16: plan.md, recon.md and OWNER-ASKS.md (OA-1 two-chip row, OA-2 journal App row) drafted; Codex audit and Opus Plan leg started.
- 2026-10-16: round 1: Codex reject (8), Opus conditional approve (8). Send rows must not change: the title cut is limited to rows that name an app (measured); `tabindex` and a hero known limit rejected on measurement; OA-1's ship-now reworked, N-1 added; Codex resumed for round 2.
- 2026-10-17: round 2: Codex conditional approve (4 conditions), all accepted; phases renumbered 1-3; Codex round 3 started.
- 2026-10-17: round 3: Codex approve. Plan committed; awaiting the orchestrator's approval.
- 2026-10-16: arc started; merged origin/dev at 3dc5a06a (no file of this arc touched).
- 2026-10-16: Phase 1 red proof: the new rows.test.ts case fails on the base build (Home's scroller 454>360).
- 2026-10-16: Phase 1 gate pass: lint, typecheck:all, test (13217 passed); armed Chrome rows + type-roles 17 passed (started at load1 176, above the rule); armed Firefox rows + type-roles 18 passed (load1 140).
- 2026-10-17: Phase 2 gate: lint, typecheck:all, test pass; armed Chrome rows+type-roles+navigation+snackbar 33 passed (load1 137); armed Firefox 34 passed (load1 145); network snack-placement Chrome FAILED (Home case: the end step scrolls the Cancel out of the middle under the fixed hero), test step changed to the middle's top (D9), rerun pending.
- 2026-10-17: snack-placement Firefox FAILED too, on the closing [76, 76] at "centre" (181: the centred row now sits in the snack's band and lifts it, as designed); check rewritten to the snack's rule; both browsers rerunning.
- 2026-10-17: Phase 2 gate pass: snack-placement network Chrome 4/4 (load1 145) and Firefox 4/4 (load1 150 at start, 149.6); store-captures Chrome 1/1, Home fits by 31 px scroll; captures restored, uncommitted.
- 2026-10-17: Phase 3: merged origin/dev at 98d51e89 (conflicts in activity-seeds.ts and index.md resolved, dev's seeds kept); testers-fixes-1 not landed, so #582's restore check does not apply; audit:vue, test:all, build-storybook exit 0. Codex r1 (session 01a1476b): approve with changes, 2 low; Opus review running.
- 2026-10-17: review round 1 fixes: scrim probe red on the isolation build, green after; Chrome rows scenarios 2/2.
