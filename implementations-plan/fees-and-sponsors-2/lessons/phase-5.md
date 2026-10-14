# Phase 5: final gates

## Static gates (2026-10-14, on 1715cbb0)

`bun run lint` exit 0; `bun run typecheck:all` exit 0; `bun run test:ci-gating` 547 tests, 0 fail; `bun run check:plans` 0 findings.

## Network e2e (retry 0, one run at a time)

Files: `fee-methods`, `selfpay-phase`, `fee-sponsor-funding`, `tx-sendTx-feePayer`, `tx-sendTx-sponsoredFpc`, `sim-from-selfpay`, `tx-sendTx-selfPay` in one call; `tx-sendTx-noFrom` (`@requires-proverless`) in its own call under `NULO_E2E_PROVERLESS=1`. The caller sweep of `feeCapFor`, `applyEmbeddedFpcGasCap`, `TransferFeeEstimate`, `buildGasBreakdown` and the execute window's Confirm adds `tx-sendTx-selfPay` to the plan's list; every other caller is unit- or component-covered.

| Run | Chrome | Firefox |
|---|---|---|
| 7-file batch | 17/17, exit 0, 1060 s | 14/17 (see below), 1684 s |
| `fee-methods` alone, the one rerun | | 7/8, 617 s: only "public gas only" fails |
| base d3dc4415, "public gas only" alone | | fails at the same line |
| `tx-sendTx-noFrom`, proverless | 3/3, exit 0, 168 s | 3/3, exit 0, 181 s |

### Firefox `fee-methods` "public gas only": fails on base too, on this host

All three Firefox failures in the batch timed out on the 60 s "Transaction submitted" toast after a Fee Juice send. The batch ran while the host's 15-minute load average was about 194 on 188 cores; at the rerun (load about 110), "transfer with public Fee Juice" and "transfer with private Fee Juice" passed, and "public gas only" failed again at `fee-methods.test.ts:344` (the first shield, `fillAndSubmit`'s toast wait).

A/B: with `apps/extension/src`, `packages/wallet-bridge/src` and `apps/playground/src` checked out at d3dc4415 (no test file but `fee-sponsor-funding` differs from base), `-t "public gas only"` on Firefox fails identically (line 344, 60 s). The popup Send path carries no app priority (only `operation-planner` reads `maxPriorityFeesPerGas`, from dApp options), and its cap rule is unchanged (`payer: "account"`, no app cap). So the failure predates this arc and depends on this host; CI's Firefox heavy lane passed the file on d3dc4415 at retry 0 (run 38530642576, job 115741549927). This PR's CI Firefox lane is the authority on it. Hypothesis, unverified: Firefox proving a public-to-private shield with a public Fee Juice payment under host load exceeds the toast's 60 s.

## Smoke (armed builds, retry 0)

`type-roles` and `rows`: Chrome 15 passed and 1 skipped (`type-roles`' Firefox-only case), exit 0, 76 s; Firefox 16/16, exit 0, 150 s. The plan's step 3 says `bun run build:<browser>`; the smoke setup refuses an unarmed build, so both ran on the armed build (`lessons/phase-4.md`).

## Gate

Pass, with one recorded exception that is not this arc's: Firefox `fee-methods` "public gas only" fails on base and head alike on this host (above).

## Gotchas

- zsh does not word-split an unquoted `$F`: a file list kept in one variable reaches vitest as a single argument ("No test files found"). Spell the files out.
- Two `e2e:agent` runs in one worktree collide even when the second is refused: the refused run has already rebuilt `dist/<browser>` before setup sees the sandbox owner, so the first run's loaded extension loses its files (`net::ERR_FILE_NOT_FOUND` at `src/popup/index.html`). Results from an overlapped run are void; rerun alone.
