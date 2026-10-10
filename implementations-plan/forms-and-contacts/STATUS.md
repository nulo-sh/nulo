# Status: forms-and-contacts

- 2026-10-10: worktree adopted and registered (base ed59711); twelve issues read with comments; no open PRs on the repo; recon started (3 sonnet explorers).
- 2026-10-10: recon.md, plan.md, OWNER-ASKS.md (FA-1..FA-6) drafted; dual audit round 1 started (Codex gpt-6.1-sol high, Opus Plan).
- 2026-10-10: round 1 verdicts: Codex reject (4 blockers, 10 findings), Opus conditional approve (15 findings). 24 accepted, 1 in part; plan.md rewritten (D2, D4, D5, D7, D8, D10, D11, D14, D15 revised); OWNER-ASKS.md now FA-1..FA-10, four blocking.
- 2026-10-10: round 2 started: Codex resume on the rewritten plan.
- 2026-10-10: round 2 verdict: Codex conditional approve (7 findings, all accepted: FA-7 blocks 3.2 outright, per-token progress, narrowed fence guarantee, re-run reselects a registered row, empty-key rule, flock slot, Icon.vue a pulse). Final fresh Codex pass started.
- 2026-10-10: final pass verdict: Codex (fresh session) reject, 6 findings: 4 accepted (re-check after the sender, lock seal clears import entries, `fieldAddressKey` swap dropped, B branches re-planned before code), 1 partly (FPC saves unchanged; arc 1 waits on the orchestrator's record for #205/#212/#214), 1 rejected with owner tie-break FA-11 (contacts after a failed sender). Confirmation pass started (same session).
- 2026-10-10: confirmation verdict: Codex conditional approve (FA-11's reporting claim, arc 2's stale clause); both applied. check:plans 0 findings. Plan committed as draft, awaiting orchestrator approval.
- 2026-10-10: orchestrator approval; D-orch-1 to D-orch-3 recorded; merged origin/dev 643c0c9; arc 1 started.
- 2026-10-10: gate 1.1 pass: lint, typecheck:all, JsonViewer 42/42; the first-document test fails on the base LogsViewer.vue.
- 2026-10-10: gate 1.2 pass: lint, typecheck:all, config+privacy+config service+logger store+session-manager 141/141; the new set and reset tests fail on the base store.ts.
- 2026-10-10: gate 1.3 pass: lint, typecheck:all, stack pins+PopupCard+popup store+FormPopup+11 form popups 178/178, build-storybook exit 0.
- 2026-10-10: gate 1.4 pass: lint, typecheck:all, account-name+NewAccount+NewFpc+EditFpc 27/27; the three popup duplicate tests fail on the base popups.
- 2026-10-10: gate 1.5 pass: lint, typecheck:all, test (extension 10780 passed), test:all exit 0; the Info control fails on the base client; the real-pair test fails with the onLevel emit removed.
- 2026-10-10: arc gate: smoke Chrome (armed build at 7ac5d04) 47 files passed, 3 skipped, 198 tests passed, retry 0. Codex loop converged in 3 rounds (approve; approve 2 Lows; Medium fixed; clean); Opus approve, 1 Low fixed.
