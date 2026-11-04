# rpc-fallback-1 status

- 2026-11-03: spec issue #1624 filed (enhancement; #1607 and #1609 as context).
- 2026-11-03: research phase: six read-only explorers mapped the node client, the PXE's node use, the network service and its UI, execution and pending checks, the background readers and the test and CI tooling (`research/`).
- 2026-11-03: plan, recon and owner asks drafted from three independent designs; #1622 merged on dev as `3b845ef02`, the worktree fast-forwarded to it and the plan's base moved there.
- 2026-11-03: audit round 1 running (Codex gpt-6.1-sol high; Opus 5.5 Plan).
- 2026-11-03: audit round 1: Codex revise (2 blockers), Opus revise (1 blocker); plan, owner asks and ledger revised (D3, D6, D8-D11, D13, D18-D20).
- 2026-11-03: audit round 2: Codex (resumed) revise, fresh Opus revise (3 blockers); plan revised (D3, D6, D9-D11, D21-D23), composition test dropped, S3b and S7b added.
- 2026-11-03: audit round 3: fresh Codex revise (3 majors), Opus approve with changes; plan revised (D21, D24, D25; store open split from the stamp check; E1's second transfer). Round 4: the round-3 Codex session verifies.
- 2026-11-03: audit rounds 4 and 5: Codex approve at round 5. Plan approved; nothing implemented. Waiting on the owner's read, OA-1 to OA-8, and the orchestrator's word to start arc 1.
- 2026-11-04: Phase 1 gate pass (lint, typecheck:all, src/utils 55/55, test:all green on its second run; the first run's one red was a load timeout in copy-dash-ban, unrelated).
- 2026-11-04: Phase 2 gate pass (lint, typecheck:all, utils+routing+adapters 161/161, test:all green, no production caller of createRoutedNode). Deviations D26, D27 in the ledger.
- 2026-11-04: arc 1 review round 1: Codex revise (5), Opus approve with changes; all folded, routing/adapters/utils 170/170, lint 0, aztec-runtime typecheck 0
- 2026-11-04: arc 1 review round 2: Codex revise (2, one root cause: an await between the last check and the dispatch); fixed, routing/adapters/utils 174/174, lint 0, typecheck 0
- 2026-11-04: arc 1 review round 3: Codex revise (1 major), fixed after the round; the loop stopped at its three-round cap
- 2026-11-04: arc 1 final gates on 9d1691aad: lint 0, typecheck:all 0, test:all 0 (aztec-runtime 535, extension 17452), check:plans 0
- 2026-11-04: Phase 3 gate pass (lint, typecheck:all, scripts/e2e/rpc-relay 11/11). Deviation D29 in the ledger.
