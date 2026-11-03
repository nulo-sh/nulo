# rpc-proxy-1 status

- 2026-11-03: recon done (3 Sonnet explorers + driver reads); base `ff395c3d0`.
- 2026-11-03: three brief claims did not hold: the wire prefix is `aztec_`, the adapter has three client builders, no infra Worker has its own workflow.
- 2026-11-03: plan drafted (two arcs + close-out); competing outline written; dual audit next.
- 2026-11-03: round 1 done (Codex conditional, Opus conditional); fixes folded in; final fresh Codex pass next.
- 2026-11-03: final fresh Codex pass: conditional approve, then approve on resume; plan committed; arc 1 starts (auto-continue).
- 2026-11-03: arc 1 Phase 1 gate green (lint, typecheck:all, adapter + network + seed-identity tests, test, test:all); committed 95a51bdfd. Deviation: the Testnet constant edit moved into Phase 1 (the cap test pins both seeds); scripts/e2e/egress-guard.test.ts and the e2e egress test now derive the Testnet host.
- 2026-11-03: arc 1 Phase 2 gate green: lint, typecheck:all, the adapter + network + seed-identity tests, test:all (175 s), the constant's `grep -c` at 0, the two network e2e files on Chrome (209 s; tx-sendTx-default 107.1 s, endpoint-refused-recovery 13.5 s) and on Firefox (tx-sendTx-default 234.6 s, endpoint-refused-recovery 22.7 s), the armed egress-guard smoke 9/9 on Chrome (10.3 s) and Firefox (19.4 s), check:seeds live OK, test:ci-gating 747/747, audit:vue (213 s). Both bundles hold no `drpc.live`.
- 2026-11-03: arc 1 review loop: Codex r1 (3 low) and Opus (4 low), all accepted in f24eb499d; Codex r2 clean.
