# Phase 2 — the gate, the coalesced writes, their tests

## What landed

- `scan-gate.ts` as planned (D2, D9): FIFO with in-place OR coalescing, a running key's successor
  waits behind it, no waiter on `request`, `clear()` settles waiting entries only. A runner that
  throws synchronously is treated as a rejection.
- `service.ts`: `PUBLIC_SCAN_CONCURRENCY = 4` (until phase 3), the gate field and its runner (a
  retried request clears its key's backoff only when the target is installed at the current
  epoch), `startPublicScheduler` enqueues, `retryIncomingScan` keeps the up-front network clear and
  awaits `requestAndWait` per target, `commitSchedulers` clears the gate before it installs,
  `scanAndRecord` fences by `target.epoch` (D7), and the scan-failure warning is a fixed message
  with `{ error }`.
- `scan-episodes.ts`: `persist()` queues a write only when none waits; the write clears the flag,
  then snapshots and picks `set` or `remove` (D8).

## Tests

- `scan-gate.test.ts`: the five planned cases, every run held on its own deferred promise.
- `scan-episodes.test.ts`: the ordering test (first write held; four mutations in flight; one
  successor; `settled()` waits for it; storage ends equal to memory). The serialization test now
  waits for the first write to start before the delete; its assertions are unchanged. The
  hydration-repair test and the set-then-remove pin are untouched.
- `service.scenarios.test.ts`, "bounded public scans": the four planned scenarios.
- **Red on base.** A scratch export of `b9c5586a6` (its `service.ts` checked identical to the base
  SHA's) with the scenario file minus the first test and its import of the constant; each of the
  three run alone with `-t`, each fails by assertion:
  - rebuild during a held install scan: `expected 1 to be 2` (class reads of the token);
  - Retry while held: `expected true to be false` (Retry settled before the held scan ended);
  - delete during the quarantine read: `expected { cursor: null, …(3) } to be undefined`.
- Scratch K = 1 (constant edited, run, restored): the incoming-transfer suite, 12 files, 478 tests,
  green.

## One existing test changed: the network reset composition test

`network-reset/service.composition.test.ts` asserted the other chain's rows byte-identical across a
stale-network reset. It failed deterministically at K = 4. Traced with a file log of every
`pollPublic` and every cursor write, on the base `service.ts` and on the head:

- **Base:** the reset's last rebuild (epoch 17) kicks the other chain's token while an earlier
  rebuild's scan of it is still running; `pollPublic` returns on `publicPolling` and the kick is
  lost. Every scan of that token that did run was fenced by a later epoch, so nothing was written.
- **Head:** the gate holds that kick behind the running scan and runs it at epoch 17 (the lost kick
  fixed); it writes the token's public cursor.
- The written cursor opens to the same value (`{ cursor: null, lastSyncedBlockHash: null,
  lastScanFinalized: 1, startBlock: 0 }` before and after); only the seal's IV differs, since
  #1043 seals cursors.

The byte-identity held only because the defect dropped that scan. The test now opens the one
`incoming-public-cursors` row of the other chain and compares its content (asserting there is
exactly one), and compares every other row of that chain by bytes as before; its title says
"leaves the other chain's rows as they were". A skip-identical-cursor write would keep byte-identity
but changes the scan's persistence, outside this plan.

## Gate

At K = 4: the incoming-transfer suite, `bun run lint`, `bun run typecheck:all`, `bun run test`
(908 files, 15,033 tests) and `bun run test:all` exit 0. The three controls are red on base.
