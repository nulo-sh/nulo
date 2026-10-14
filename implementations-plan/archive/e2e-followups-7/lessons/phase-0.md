# Phase 0: planning log

## 2026-10-13: the probe (scratch, never committed)

An uncommitted edit to `snack-placement.test.ts` (patch kept under `~/.cache/nulo-backlog/e2e-followups-7/`) marked the drain's steps and, on a `fillSendForm` failure and at each case's end, dumped to a JSONL on real disk: the service worker's stored trail (the `transaction`, `token-balance` and `incoming-transfer` lines, already retained because the case turns on Developer and Debug Mode), every `nulo:core:txs@*` row (status, `updatedAt`, `awaitingFinality`, block) and the balance row. Runs: `NULO_E2E_RETRY=0 NULO_E2E_PROVERLESS=1 taskset -c 140,141 bun run e2e:agent tests/e2e/network/snack-placement.test.ts`, through `agent.sh`'s claimed ports, host load average about 150.

Round 1, Chrome. The probe's first `afterEach` used a non-destructured argument, which vitest refuses (`FixtureParseError`), so all four cases reported failed; one carried the real timeout (`Send: a send that fails ...`, `Waiting failed: 120000ms exceeded` in `fillSendForm`'s submit wait). Its dump, seconds from the grant's start:

```
marks: grant-seen-mined@8.1 grant-settled@12.3 mint-mined@17.1 mint-settled-idle@60.8 spend-returned@66.2 fill-start@67.8 fill-failed@187.9
tx 0x1005b6e5 status=5 awaitingFinality=- origin=dApp block=9 updated@67.9
balance publicBalance="0" updated@69.9
  67.9 transaction    Tx finality settled [{"outcome":"final"}]
  68.7 token-balance  Syncing 1 token balances
  70.0 token-balance  Token balances synced in 1269ms
```

Reading: the grant's mined commit was at about +8 s; the worker re-read its block 60 s later (+67.9 s), wrote it Finalized, and `TokenBalanceService.onTransactionUpdated` re-projected the account's balance, storing the drained 0 at +69.9 s, 3.7 s after the spend landed. The fill's first poll (+67.8 s) still saw the stale balance, so the input was enabled and the failure moved to the submit wait; CI's failures hit the 60 s enabled wait, the same write landing before the first poll.

Rounds 2 and 3, Chrome, with the hook fixed (`afterEach(async ({ task }) => ...)`):

| Round | Case | Result | Finality commit vs spend | Note |
|---|---|---|---|---|
| 1 | Send: send fails, Details | fail (120 s submit wait) | +1.7 s after | the trail above |
| 1 | the other three | invalid | | the probe's hook error |
| 2 | Send: fee-estimate error | pass | none in the case | the grant's block was not final at the read; no second write |
| 2 | Send: send fails, Details | pass | +2.0 s after | the 0 landed after the form filled |
| 2 | Home: snack and Cancel | fail (120 s submit wait) | +2.3 s after | |
| 3 | Send: fee-estimate error | fail (120 s submit wait) | +3.7 s after | |
| 3 | Send: send fails, Details | fail (120 s submit wait) | +3.0 s after | |
| 3 | Home: snack and Cancel | pass | +3.9 s after | the 0 landed after the form filled |

Chrome: 4 of 7 valid drained-case runs failed; the finality write landed after the spend in 6 of 7. The execute-window control passed in rounds 2 and 3. In every run the receipt wait put the spend 64-66 s after the grant's start, about 56 s after its mined commit, so the first finality read (mined commit + 60 s) lands within 4 s after the spend.

Firefox, three rounds, same command with `NULO_E2E_BROWSER=firefox`: 0 of 9 drained-case runs failed; the finality commit landed after the spend in 6 of 9 (+4.1 to +7.3 s), each time after `fillSendForm` had returned (Firefox finished the fill 0.1-3.3 s after it began). In the other three the grant's block was not final at the first read, so no second write fell inside the case. The control passed in all three rounds. The issue's comment records three Firefox failures under CI-like load, so the window is open on Firefox too; locally the widened copy is the proof there.

## 2026-10-13: the widened red on base (scratch copy, never committed)

`snack-placement.widened.test.ts`, the probed file plus, after the spend: `finalizeThrough` through the grant's block (the moved helper's logic, inlined), a wait for the grant row to read `Finalized` without the marker, a wait for a balance write newer than that commit, `waitForBalanceQueueIdle`, then Send. It classifies the final commit against timestamps taken before `spendPublicAuthwit` is called and after it returns, and records the write's value. Run unpinned at retry 0 (`NULO_E2E_PROVERLESS=1 bun run e2e:agent tests/e2e/network/snack-placement.widened.test.ts`). The copy is kept under `~/.cache/nulo-backlog/e2e-followups-7/` for the head run.

Chrome: the three drained cases red, each at `fillSendForm`'s 60 s enabled wait (CI's fingerprint), each qualifying (final commit after the spend returned, its write `0`); the control green. The chain was already final when the spend returned (the mint and spend had published to L1); the test read the grant Finalized 2.6-3.1 s after the spend returned (its row stamped at the mined commit plus 60 s).

Firefox: the same, three drained cases red at the 60 s enabled wait, each qualifying (write `0`), the control green; the test read the grant Finalized 5.1-7.1 s after the spend returned.



- Codex decision consult (gpt-6.1-sol, high, read-only, `CODEX_ACCOUNT` unset; session `01a136be-157b-7f01-a3b5-1956f96758e4`): `verdict: T`, the sequential barrier before the mint, confidence high. P rejected: the final refresh reads current balances, so removing it changes what a person sees; D30 of the plan that shipped #343 covers journal rows only.
- Codex plan audit (resumed): `conditional approve`; Opus 5.5 Plan lens: `conditional approve`. Every condition accepted; the one split (the Finalized wait, 90 s or two reads) settled at 180 s on the Opus lens's traced path (plan.md D6).
