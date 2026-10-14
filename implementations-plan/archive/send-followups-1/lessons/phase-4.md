# Phase 4: final gate and the review loop

- 2026-10-14 Phase 4 gate on the Phase 3 head: `test:all` exit 0 (extension 12093 passed), `test:ci-gating` 547 pass, `check:plans` 0 findings, `audit:vue` exit 0. `audit:vue` builds into `dist`, so it waited for the e2e runs to finish.
- Codex round 1 (session `01a13b2a-6cd9-7ea0-842d-f6806fd450b0`): approve, three low comment findings, accepted. It ran on the `alejo-icloud` account: the managed settings set `CODEX_ACCOUNT=best`.
- Opus round 1: no bugs; two stale contract comments and one untested wiring step (`sequence.feeSpender` into the shape), accepted; the new facade case reds when the spender is dropped.
- Codex round 2 (resumed): approve, nothing new. Converged.
- Final gates on 1d321a08 (`origin/dev` still at d3dc4415, nothing to merge): lint, `typecheck:all` exit 0; `test:all` exit 0 (extension 12093 passed); `test:ci-gating` 547 pass; `audit:vue` exit 0. Smoke over the seven touched files: Chrome 30 passed and 1 skipped (a Firefox-only type-role case), Firefox 31 passed. `NET send-amount-exact`: Chrome 32.6 s, Firefox 45.5 s. `NET same-token-concurrent-sends` (proverless) 16/16: Chrome 571 s (re-ask case 37.9 s), Firefox 707 s (51.2 s). Chaos 1095865833: Chrome 210 s, Firefox 196 s; 1960252198: Chrome 168 s, Firefox 196 s; each log names its seed and actions. All at retry 0.
