# Phase 0: planning consults

Every consult of the planning panel, in order, with its verdict. Paths are repo-relative.

## Round 1 (2026-10-16)

- **Codex** `gpt-6.1-sol` high, read-only, via `run-codex.sh` (the run landed on the `alejo-icloud` roster home). Verdict: **reject**, 8 findings (C1-C8): committed wording, the grant rows against the signed picture, a press before the figure, payer classification, the compare's rounding, the restore tail's budget and session timing, the fee reproducer, the comment edit. All verified and accepted; dispositions in plan.md § Audit verdicts.
- **Opus 5.5** Plan lens (`Agent`, `model: opus`). Verdict: **conditional approve**, 11 findings (O1-O11), five overlapping Codex's. New: a third synthetic-backup caller and the real export's cost, the wallet-crypto tests outside the root gate, the re-read's pin, OA-F1's obligations, the grant's spender row and `approve()` guard, two candidate known limits. All verified and accepted.
- Verified by reading: the embedded `fjwc` route charges the sender (`fee/embedded-strategy.ts:18-38`); the session opens before the tail (`useFullBackupImport.ts:455-471`); `AddressDisplay` has no hover title and puts a known name first; `passkey-retry.test.ts:37` also builds the synthetic file.

## Final fresh pass (2026-10-16)

- **Codex** `gpt-6.1-sol` high, read-only, a fresh session. Verdict: **reject**, 4 findings (F1-F4): an open Send page keeps its token snapshot after the re-read updates a row (only add and delete are events); a read started near the deadline is not bounded by it; the fee e2e accepts the card's default payer, Nulo's sponsor; the network command omits `--retry=0` (the network config retries twice). All verified and accepted: D19's `onTokenUpdated`, a read raced at the remainder with a commit-time deadline check, `selectFeeMethod(execPopup, "public")` in phase 6, `--retry=0`. Its ask, that the `/loop` seed keep owner-visible choices with the owner, is folded.
- Verified by reading: `send.vue:154` computes the active token from its list and `:490` sends its decimals; `token/spec.ts:277-283` lists only add, delete and seed-status events; `FeeSettingsCard.vue` settles on Nulo's sponsor by default; `vitest.e2e.network.config.ts:40` defaults to two retries and `agent.sh` passes its arguments to vitest.
- **Codex**, resumed on the revised plan: **approve**, no new blocking issues.
