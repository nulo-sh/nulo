# fee-claim-build-1: status

- 2026-11-15: plan written at `a763870d4`; no plan audit round (lane brief, Proportion).
- 2026-11-15: arc 1 on `fee-claim-build-1-a1`; Phase 1 built (`1f3d05319`); lint green, typecheck:all green, test red (type-roles inventory digest, D10), fixed, rerunning.
- 2026-11-15: test rerun red (config.test.ts gate test timed out: the shipped fixture's wallet-bridge import); D7 revised, fixtures out of the tree.
- 2026-11-15: Phase 1 static gates green at `5f9b30b14` (lint, typecheck:all, test 1041 files, test:components 104 files, check:plans); the e2e run refused a prover-ON run holding `tx-sendTx-noFrom` (`@requires-proverless`), rerun proverless for all four.
- 2026-11-15: Phase 1 e2e green at `5f9b30b14`: `e2e:agent` proverless, Chrome, retry 0, the four fee-row specs 4/4 files, 9/9 tests, about 4.6 min wall. Phase 1 gate passed.
- 2026-11-15: Codex round 1 (session 01a1e124): changes requested; R1-1 to OWNER-ASKS A1 (what ships now: W1 as signed), R1-2 two test comments removed; OperationCard.fee.test.ts 45/45, biome clean.
- 2026-11-15: Codex round 2: changes requested on A1's text (R2-1..3), corrected.
- 2026-11-15: Codex round 3: changes requested on A1's tolerance wording (R3-1), applied as worded; loop stopped at three rounds, code settled since round 1.
