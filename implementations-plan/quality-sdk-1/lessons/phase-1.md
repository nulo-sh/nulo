# quality-sdk-1 arc 1: background.ts in three modules, the edge headers test

- The content-admission block moved byte for byte; `diff` against the base block, with the added `export` normalised, is empty. The request pipeline moved verbatim modulo three renames (`state.late.handler!` → `deps.handler`, `state.sessions` → `deps.sessions`, `state.late.switchEpoch!` → `deps.switchEpoch`), checked by a normalised block comparison.
- A comment edit in `packages/wallet-bridge/src/dispatcher.ts` moved its content digests in `apps/extension/scripts/type-roles/identifier-sites.expected.json`; `scripts/type-roles/inventory.test.ts` failed on the first `test:all`. The hits and evidence were unchanged, so the three digests were re-pinned.
- `inflight-call-background-death.test.ts` refuses a prover-on run. CI's network shard pool runs proverless, so the phase 2 e2e runs with `NULO_E2E_PROVERLESS=1` (decision ledger).
- Splitting `disagreements` was needed to keep its cognitive complexity at most 15 once the null-agreement report was added. No suppression was used.
- Arc review: Codex r1 approve; Opus conditional approve, four findings all accepted; Codex r2 (resumed) approve.
