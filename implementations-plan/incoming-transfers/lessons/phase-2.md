# Phase 2 (Arc 2) — implementation log

## Phase 2.1: baseline count

- Setup: the sandbox from `e2e:agent`, `tokenReadyExtension` (one watched token, the sandbox Token),
  a second account, session TTL one hour, every popup closed. A scratch probe (never committed)
  redirects the extension's node requests through a counting proxy and counts JSON-RPC methods for
  ten minutes per phase. The sandbox (`SEQ_MIN_TX_PER_BLOCK=0`) builds no block without a
  transaction, so the quiet phase sees no block; the busy phase drives one public mint to the minter
  about every 30 s (no receipt for the wallet), which builds one block per mint.
- Deviation from step 1: one watched token, not the default token list. The sandbox has one deployed
  token; the defaults are testnet addresses the sandbox node has no contract for. The public arm's
  cost is per token, so the table scales by token count.
- Base code `d3dc4415` (the build was made from the base sources; the tree was restored after the
  build). `git diff --stat` showed no product file.

| Method | Quiet, run 1 (10 min) | Quiet, run 2 (10 min) | Busy (10 min, 20 blocks) |
|---|---:|---:|---:|
| `getChainTips` | 40 | 43 | 42 |
| `getBlockNumber` | 40 | 41 | 40 |
| `getPublicLogsByTags` | 20 | 21 | 20 |
| `getBlockData` | 20 | 20 | 20 |
| `getPrivateLogsByTags` | 0 | 5 | 200 |
| `getContract` | 0 | 0 | 80 |
| `getBlock` | 0 | 0 | 40 |
| `getBlockHashMembershipWitness` | 0 | 0 | 20 |
| other (`getNodeInfo`, `getCurrentMinFees`, `simulatePublicCalls`) | 0 | 6 | 6 |
| **Total** | **120 (12.0/min)** | **136 (13.6/min)** | **468 (46.8/min)** |

Call sites behind the three largest quiet counts:

1. `getChainTips`: the PXE's block synchronizer (`L2BlockStream` over the node) runs inside every
   `getNotes` call, so each note scan (`NoteService.getNotesRaw`, one per account a tick) reads the
   node's tips once: 2 accounts × 20 ticks.
2. `getBlockNumber`: two per public tick. `getPublicScanTips` read `getBlockNumber("finalized")`
   beside `getBlockData("checkpointed")`, and every log page in `fetchPublicTokenTransferEvents`
   reads `getBlockNumber("checkpointed")` for its bound check.
3. `getPublicLogsByTags` and `getBlockData`: one each per public tick (the forward page, and the
   checkpointed tip's hash in `getPublicScanTips`).

On a busy chain the PXE's per-block sync dominates (`getPrivateLogsByTags`, `getContract`,
`getBlock`); the scheduler gate cannot remove it, since every tick then has a new block.

## Phase 2.2: block-gated ticks

- `getPublicScanTips` reads one `getChainTips` and refuses a non-safe-integer tip number, a hash that
  is not 32-byte hex, and tips out of order (finalized ≤ checkpointed ≤ proposed). `PublicScanTips`
  gained `proposedBlockHash`, and `checkpointedBlockHash` is no longer nullable: the two tests of a
  null checkpoint hash were deleted, as the type makes them unreachable.
- One tips read per network serves a tick's targets: a pending read is shared whatever its age, and a
  settled success for 5 s. Note targets key their mark on the proposed hash (the PXE syncs to
  `proposed` by default), public targets on the checkpointed hash.
- Deviation D-A (tree wins): a failed shared tips read fails each public tick without a second
  per-target read; note targets run ungated. The plan said each target reads its own tips. A second
  read in the same tick hits the same node and only adds calls during an outage or a 429; episodes
  and the stalled banner see the same `failed`. A failed read is shared only while in flight, so a
  user Retry reads again.
- A run that does not reach the tips deletes its mark (the plan said "keeps"), so a forced run that
  fails at an unchanged hash cannot leave a mark that skips the next tick.
- Codex's design consult found the target's epoch captured after the tips await (a deletion during
  the read let a stale run write); fixed by capturing it before and passing it into both scans. Two
  regression tests fail with the fix reverted, once `advanceTimersByTimeAsync(0)` lets the deletion
  finish before the held read is released (without it the rebuild's second bump hid the bug).
- After-count, same setup on `af2b76fd` (Phases 2.2 and 2.3; back-fill of the sandbox's short history
  finishes during setup, before counting starts):

| Method | Quiet, base (2 runs) | Quiet, after | Busy, base | Busy, after |
|---|---:|---:|---:|---:|
| `getChainTips` | 40, 43 | 32 | 42 | 60 |
| `getBlockNumber` | 40, 41 | 5 | 40 | 20 |
| `getPublicLogsByTags` | 20, 21 | 5 | 20 | 20 |
| `getBlockData` | 20, 20 | 0 | 20 | 0 |
| `getPrivateLogsByTags` | 0, 5 | 0 | 200 | 200 |
| `getContract` / `getBlock` / `getBlockHashMembershipWitness` | 0 | 0 | 80 / 40 / 20 | 80 / 40 / 20 |
| other | 0, 6 | 6 | 6 | 0 |
| **Calls per minute** | **12.0, 13.6** | **4.8** | **46.8** | **44.0** |

  Quiet: the shared tips read is one `getChainTips` a tick (20), the public page and its bound check
  run only on the five fallback ticks, and each fallback's two note scans add the PXE's own tips read.
  Busy: one block a tick, so every target runs every tick; `getChainTips` replaces `getBlockData` and
  `getBlockNumber("finalized")`, one call for two. Gate: fewer on a quiet chain, no more on a busy one.

## Phase 2.3: newest-first public scan

- `W = 100` blocks: the forward scan's budget is five pages of 20 logs (`MAX_LOGS_PER_TAG`), so at
  one transfer a block a window fits one tick.
- The tick's five-page budget is shared: the forward pass reports the pages it fetched, and back-fill
  gets the rest, reading as many windows as fit. An empty window costs one page. Doubling windows (to
  cut the cost of empty deep history) was rejected in the design consult: inside a window pages go
  oldest first, so larger windows weaken newest-first ordering, which is the owner's call (OA-5).
- Cost of an empty history: `ceil(F0 / 100)` pages, at most four a tick after a one-page forward
  pass: about 125 ticks (an hour) for a 50,000-block chain, on each token add and each account add.
- Deviation D-C (tree wins): a forward scan with no cursor starts at `lastScanFinalized + 1`, not at
  `startBlock`, so the seed needs no new field. The reconciliation's stranded-cursor reset now
  re-covers from the finalized floor; every block at or below it was read or is left to back-fill.
- Back-fill runs only after a forward pass that committed; a revoked commit or a dropped page keeps
  `position` and makes the tick `no-progress`. The tick reaches the tips only once no back-fill is
  left, so a target with history left runs every tick until it is read.
- Mutation checks, each failing the scenarios named: no seed (7), no shared budget (7), no position
  resume (the busy-block test), revoked commit ignored (the revoked test), `atTip` ignoring back-fill
  (the ticking test), reconciliation reaching `startBlock` (the reconciliation pair; it first passed
  with a node serving the back-filled receipt, so the pair now serves none).

## Phase 2.4: liveness proofs

- Three fake-time proofs drive `bootTicking`'s real 30 s ticks (forced on every fourth). Each places
  its event so that a target the block rule missed could only land on a fallback 120 s or more later:
  - gap: the tip jumps just after a fallback; 250 logs ahead of the receipt need three budget-limited
    passes; the note lands on the first tick. Reverting `atTip` to ignore `hasMore` lands it at 240 s.
  - reorg: a same-height re-mine just after a fallback; 150 logs make the reconciliation two steps;
    the forward scan resumes from the reconciled cursor with no new block. Keying the public mark on
    the checkpoint number lands it at 150 s.
  - retry: the checkpoint catches up with an already-proposed block and the PXE delivers a note late,
    just before a fallback that fails both reads. The failing class read takes a second, so its backoff
    outlasts the next tick, as on a live node: the note lands on that tick, the public receipt at 90 s.
    Keeping the old mark on a failed run, or marking the tips on one, misses the next tick (the public
    receipt alone would land at 150 s).
- Quiet chain: a planted outbox row is anchored and deleted on two ticks with no block; a note the PXE
  delivers late lands on the fallback.

- Network e2e, two install-run scenarios (D-orch-6), each: open the popup, lock, receive while
  locked, unlock, and require the row sooner than one 30 s scan interval after the unlock starts.
  - Failure mode: the unlock does not scan at once (a rebuild that leaves the install run out, or a
    mark that survives the lock), so receipts that arrived while locked wait for a tick or the
    fallback. The rows also prove both arms end to end against a real node and PXE after a session
    restore.
  - Why not cheaper: unit and composition tests boot the service directly; only a real unlock runs
    the session restore, the profile event, the scheduler rebuild, the offscreen PXE's sync of blocks
    built while locked and the History feed, and only a real node delivers the logs.
  - `incoming-public-transfers.test.ts`: a public mint to the minter, then a public transfer while
    locked. Estimated 75 s (two public txs about 25 s each, lock and unlock 10 s, row under 30 s).
  - `incoming-transfers.test.ts`: a private mint to the minter, then a private transfer while
    locked. Estimated 100 s (two private txs about 35 s each, plus the PXE's note sync).
  - Measured (Chrome, proverless, on `ef6f484d`): public 14.1 s, row 2.2 s after the unlock began;
    private 38.5 s, row 1.7 s after. Under estimate: proverless sandbox transactions settle in a few
    seconds. Nothing scans while locked (the lock closes the session, whose change event rebuilds an
    empty scheduler set), so a row inside 30 s can only come from the unlock's install run.
- Network gate (Phase 2.4's seven files, Chrome, `NULO_E2E_RETRY=0`) needs `NULO_E2E_PROVERLESS=1`,
  as Arc 1's did: `incoming-arrival` and `account-switch-isolation` are proverless-gated and the
  runner refuses without it. On `ef6f484d`: 7 files, 19 tests passed, 13 min.

## Arc 2 review, round 1

- Codex (gpt-6.1-sol, high, read-only, default login, fresh session on `d3dc4415..ef6f484d`):
  `reject (with blocking findings: retry proof does not establish mark deletion)`. Accepted, all four:
  - Medium: the retry event changed both hashes, so a failed run that kept its old mark would also be
    rerun. Reworked so the note hash stays the one its target reached; both mutations now fail it.
  - Low: the backoff-restart test had loosened `tips not called` to `called once` (the note target's
    read). It now boots without accounts and asserts no call; reading tips before the backoff gate
    fails it.
  - Low: the back-fill doc said a dropped page keeps the position; it keeps its valid prefix. Fixed.
  - Low: five comments restated their code; removed or corrected.

- Opus review of the final diff (general-purpose agent, run beside round 1): `holds; no High or
  Medium; eight Low`. Folded:
  - the replay test now counts the trusted token's Added emit (re-inserting an existing record fails
    it); the account-add test asserts the forward read starts at 1001 and back-fill at `[901, 1000]`
    (keeping the old window fails it);
  - the retry proof's failing read takes a second, so the public backoff outlasts the next tick as in
    production (the old name claimed the next tick for both arms; with zero-time scans it was true
    only under fake time);
  - one orphaned doc block merged; stale comments on `no-progress`, the tips client, the
    account-reset lock and `F0`'s reason fixed; the public tick's doc names the back-fill step.
  - Recorded, not changed: a back-fill page a hostile node drops forever opens a failure episode, so
    backoff slows the whole target and the stalled banner shows. Before this arc the same page stopped
    the forward scan outright (ledger D20).
  - Its "missing gate evidence" was the after-count table and the revert record, written above.

## Arc 2 review, round 2

- Codex (same session, resumed, on `ef6f484d..a28e64d1`): `approve`. Every round-1 finding fixed,
  no new finding, no weakened assertion. The loop converged at two rounds.
