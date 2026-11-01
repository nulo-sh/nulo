# exec-send-1: phase 1 (#1426, arc 1)

- Both new `claim-helper.test.ts` cases ran red against the base's `claim-helper.ts`: the claim resolved with `fresh-id` and an un-aborted controller. Green after the fix (26 of 26).
- `bun run lint` refused the first version: the try/catch raised `claimOrCreateDappExecuteJournal`'s cognitive complexity to 18 (cap 15). The read moved into `readQueuedRow`; no suppression.
- Gates: lint, typecheck:all, the execution and journal suites (`src/wallet/services/execution src/wallet/services/operation-journal`, 86 files, 1742 tests, retry 0) and `test:all` (17 workspaces) green.
- Codex fix R1 (gpt-6.1-sol, high, read-only): approve with two comment points; the doc of `readQueuedRow` corrected, the helper comment in the test dropped; a pre-existing comment outside the diff left. Opus fix R1 (general-purpose): approve; the same doc point and the header's wording; its traced residual (a racing cancel can surface the storage error instead of 4001, nothing broadcast) recorded as D7. Codex fix R2 (resumed): approve.
- Network gate: `cancel-mid-prove.test.ts` on Chrome passed under the config's default retry of 2 (test 61 s), then again with `NULO_E2E_RETRY=0` (test 53 s, run 140 s with the build and sandbox). `e2e:agent` takes the retry count from `NULO_E2E_RETRY`, not a `--retry` flag.
