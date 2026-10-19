# ui-picks-1 status

- 2026-10-19: worktree adopted at `60fde7e7` (`origin/dev`); recon done (one Sonnet sweep); plan drafted, tier light.
- 2026-10-19: plan audit converged: Codex r1 conditional approve, Opus conditional approve, both folded; Codex r2 approve. OA-1 to OA-5 ship in their what-ships-now form.
- 2026-10-19: Phase 1 gate green: the phase's vitest files 421 passed; new tests red on base; the account-switch step red with D3 reverted; lint 0; typecheck:all 0.
- 2026-10-19: Phase 2 gate green: send.test, send.integration.test, useFeeEstimation.test 177 passed; the flipped and new tests red on base; :680 and integration :897 unchanged and green; lint 0; typecheck:all 0.
- 2026-10-19: Phase 3 gate green: import tests and copy-dash-ban 71 passed; the seven strings red on base; lint 0.
- 2026-10-19: review round 1: Codex approve, Opus approve with changes; fixes applied (the synced-row gate, test nits); vitest 385 passed, lint 0.
- 2026-10-19: review loop converged (Codex round 2 approve).
- 2026-10-19: Phase 4: audit:vue 0 (194 s), test:all 0, check:plans 0; smoke retry 0 Chrome 12/12 (194 s), Firefox 12/12 (272 s).
- 2026-10-19: network retry 0 Chrome: send-amount-clamp, send-amount-exact, fiat-send, transfers 4/4 green (run 619 s); captures: Send 5 frames and restore one-held taken; the two-held scratch spec timed out at the export's readiness wait in the network harness (plan fallback: armed smoke).
- 2026-10-19: Phase 4 green: network Firefox 2/2 (224 s); pictures committed (13), the two-held restore via the smoke fallback.
