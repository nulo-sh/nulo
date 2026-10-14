# Phase 1: the drain waits for the grant's final write

## 2026-10-13: implementation

- Merged `origin/dev` at dd922823 (#356, the error-array assertions in snack-placement's test bodies) before the first edit; the one conflict was `implementations-plan/index.md` (wallet-followups-6's line left dev, this plan's line kept).
- `finalizeThrough` and `mineL1Blocks` moved into `fixtures/aztec.ts` (`timeoutMs = 180_000` default, `aztec.ts`'s own `ANVIL_URL`, the `[${SPEC}]` prefix dropped); failed-send-check imports it and drops its local copy, its `ANVIL_URL` and the `Node` type.
- snack-placement: `settledGrantFinality` between the grant's settle and the mint, as planned. `grantSpender`'s `status !== 0` now reads `TxStatus.Pending`, since the file imports the enum.
- `lint`, `typecheck:all`, `test`: exit 0.

## 2026-10-13: review round 1

- Codex (gpt-6.1-sol, high, read-only; session `01a1370b-868e-7410-90fe-4b75536177fc`) over `git diff 7ab2d3b8 HEAD`: `conditional approve`. (1) The mined write can impersonate the final write if the final commit lands before the mined projection's write, plausible but unverified (needs a mined projection over a minute): accepted as a fail-closed precondition, the sole grant must still carry `awaitingFinality` once its mined write settled, so the final commit follows that write. Cost: a first worker answer already Finalized also fails closed, unreachable before the drive here (anvil mines only on an L1 transaction and nothing sends one between the grant and the drive, F5). (2) Headroom unmeasured: left to the measured gate. (3) Comments: the decoding line deleted; deleting the step line `The grant read final refreshes them again.` rejected (each drain step carries its write count; together they are the model).
- Opus 5.5 diff lens: `conditional approve`, no false green found, the move keeps failed-send-check's behaviour bar the error prefix. Nits accepted: the token import named as a refresh cause, "refreshes balances" (a UI-origin tx narrows to its parties), the README row's read timing, the decoding line. Held: ledger row 56's "green on the fix" until the head copy is in.

## 2026-10-13: review round 2

- Codex, resumed on `git diff 0fcecdae 91353f1c`: "No new material findings." The ordering fix verified, the false-red boundary as accepted, no regression in the move, comments acceptable. `verdict: conditional approve (conditions: complete the approved amplified headroom, per-browser runtime, red/green and moved-caller validation gates)`: the gates below.

## 2026-10-13: red then green (the widened copy, uncommitted)

The copy is the planner's base copy rebuilt on the head file at 91353f1c: the probe dump and marks, then after the spend `finalizeThrough` through the grant's block, the grant read `Finalized` without the marker, a balance write newer than that commit, the idle queue, then Send; on the head it also asserts the final commit's `updatedAt` precedes a timestamp taken before `spendPublicAuthwit` is called. Unpinned, retry 0, `NULO_E2E_PROVERLESS=1`.

| Run | Drained cases | Control | Qualifying | Reading |
|---|---|---|---|---|
| base, Chrome (planning) | 0/3, each at the 60 s enabled wait | green | 3 of 3 (final commit after the spend returned, its write `0`) | non-qualifying: none |
| base, Firefox (planning) | 0/3, each at the 60 s enabled wait | green | 3 of 3 | non-qualifying: none |
| head, Chrome | 3/3 | green | each final commit before the spend was sent; the write after it the mint's `10000000000000000000` | file 574.6 s |
| head, Firefox | 3/3 | green | the same | file 609.7 s |

The barrier's own log on the head: chain final 2.0 s after the drive started in all six drained cases, the wallet's Finalized commit 53.7-56.2 s after that (the worker's next once-a-minute read), so the barrier costs about 58 s per drained case. Copy deleted from the tree; kept under `~/.cache/nulo-backlog/e2e-followups-7/`.

## 2026-10-13: runtime, unpinned, retry 0

Base is `snack-placement.test.ts` at 7ab2d3b8 run as an uncommitted copy beside the head fixtures (deleted after); head is the file at 91353f1c. One run each, host load average 90-140.

| Browser | Base file (vitest) | Head file (vitest) | Drained cases, base → head | Control, base → head |
|---|---|---|---|---|
| Chrome | 390.6 s, 4/4 | 542.8 s, 4/4 | 86.9 / 89.8 / 90.0 s → 143.8 / 145.3 / 152.5 s | 16.9 → 16.9 s |
| Firefox | 469.6 s, 4/4 | 605.9 s, 4/4 | 110.2 / 106.5 / 111.4 s → 164.1 / 161.3 / 165.4 s | 41.1 → 30.9 s |

The file grows 152 s on Chrome and 136 s on Firefox, about 55 s per drained case: the worker's next once-a-minute read after the mined commit, less the drain's own time since it. Chain final 2.0 s after each drive began; the wallet's Finalized commit 54.1-56.4 s after that. The idle barrier after the final write read 5-6 lines between the tick's end and its marker (the trail holds 10,000 in Debug Mode). Headroom: the slowest 420 s case took 164.1 s (39%) and the Home case 165.4 s of 480 s (34%), under the 75% bound; the amplified rounds below are the load check.

## 2026-10-13: amplified rounds (the gate)

`NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_RETRY=0 NULO_E2E_PROVERLESS=1 taskset -c <two idlest allowed cores> bun run e2e:agent tests/e2e/network/snack-placement.test.ts --retry=0`, then with `NULO_E2E_BROWSER=firefox`, alternating, on the head at 91353f1c (after the merge of #356). The first attempt of rounds 1-3 died at `taskset` (the picker chose CPUs outside the session's affinity set; no test ran) and was rerun with the picker restricted to `sched_getaffinity`.

| Browser | Rounds | Drained | Control | Slowest drained case | Wallet Finalized after chain final |
|---|---|---|---|---|---|
| Chrome | 5 | 15/15 | 5/5 | 172.2 s of 480 s (36%); 168.4 s of 420 s (40%) | 54.0-56.4 s |
| Firefox | 5 | 15/15 | 5/5 | 183.4 s of 420 s (44%); 183.0 s of 480 s (38%) | 53.9-56.8 s |

Base under the same amplifier failed 4 of 7 valid Chrome drained runs (`lessons/phase-0.md`). Every head run's file wall-clock: Chrome 564-675 s, Firefox 599-749 s.

## 2026-10-13: the moved helper's caller

`tests/e2e/network/failed-send-check.test.ts`, `NULO_E2E_PROVERLESS=1`, retry 0, unpinned: Chrome 2/2 (372.1 s), Firefox 2/2 (337.5 s); its finality case drives `finalizeThrough` from `fixtures/aztec.ts`.

## 2026-10-14: arc gate (final head, after merging `origin/dev` at 1823144f)

The merge brought Send's `AmountCard.vue` and `send.vue` changes (#373), the path the drained cases drive, so snack-placement ran once more per browser on the merged head, unpinned, retry 0: Chrome 4/4 (537.1 s), Firefox 4/4 (596.7 s). `test:all`, `test:ci-gating` (535 pass), `lint`, `typecheck:all`, `check:plans`, `lint:actions`: exit 0.
