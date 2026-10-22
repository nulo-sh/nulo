---
plan: pxe-cost-1
tier: mid
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 5711a1bc3
trunk: dev
issues: "#1038 (Closes, A1); #1033 (no arc: upstream, blocked:external); #1034 (no arc: OA-1)"
post_implementation_hardening: not scheduled
---

# pxe-cost-1: the wallet's PXE cost levers (#1038, #1033, #1034)

pxe-limits-1 (#1042, [archive](../archive/pxe-limits-1/plan.md)) measured three places where the wallet's own choices multiply the PXE's work. This plan takes each one:

- **#1038, A1 (one PR against `dev`):** the public scans start through a small bounded gate, not all at once, and the scan-health record keeps at most one write waiting instead of one full copy per failed scan. A1 edits `incoming-transfer/service.ts`, which encryption-at-rest-1 A3 seals, so A1 branches from `dev` only after A3 is on `dev`.
- **#1033, no arc:** the slow balance read is a PXE algorithm; the panel rejected a wallet-side copy of the contract's balance (D3). Step U drafts the upstream issue and marks #1033 `blocked:external`, with no PR.
- **#1034, no arc:** a product trade-off. [OWNER-ASKS.md](OWNER-ASKS.md) OA-1 gives the options with their measured cost; nothing ships before the owner picks.

Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Status: [STATUS.md](STATUS.md). Line numbers are at the base; after A3 lands, find each site by its code.

## The issues and what did not hold

- **#1038 holds**, with three additions (recon § #1038):
  - The burst recurs on every new checkpoint, every fourth tick and every rebuild, and Retry fans out the same way; it is not only an unlock event.
  - The unlock RPC awaits no scan. The probe's "unlock" is `ensureUnlocked` plus `waitForHash(HOME)` (`~/.cache/nulo-backlog/pxe-limits-1/patches/_probe-ceilings.test.ts:216-227`): from `unlockAt`, taken before `ensureUnlocked` types the password, until the popup sees the session record and reaches Home. What grows is the popup's way to Home.
  - The probe's tokens have no contract, so every scan fails at its class gate (`aztec-runtime/src/pxe/public-events.ts:459-462` → `incoming-transfer/service.ts:2020`), and each failure rewrites the whole scan-episode map to `chrome.storage.session` (`scan-episodes.ts:100-109, 170-176`), the area `ensureUnlocked` polls. A wave of N failures writes about N²/2 entries. So #1038's numbers measure a failure wave (demonstrated by trace; its share of the 19.8 s is unmeasured). Real cases of such a wave: a node outage, or watched tokens missing after a Testnet reset.
- **#1038's "no token's first poll lost"** fails in one case today: `pollPublic` returns on `publicPolling.has(key)` before its epoch check (`service.ts:1195`), so a rebuild during that key's scan drops the new kick until the next tick (traced; plausible but unverified as a visible delay). Retry during a running scan of a key also does nothing for that key (same line).
- **`pollPublic`'s epoch fence has a gap** (Codex r1, demonstrated by trace): it checks the install epoch (`:1197`), awaits `isQuarantined` (`:1203`), then `scanAndRecord` captures the epoch current at that moment (`:1225`). A token delete or a lock during that await lets the old scan write a cursor under the new epoch. A1 carries the install epoch instead (D7).
- **#1033 holds** (recon § #1033). The lane brief's "proven by a composition test" cannot hold for any wallet-side read: `apps/extension/tests/COMPOSITION-TESTS.md` D2 and D4 forbid it. Moot after D3.
- **#1034 holds.** One correction: an unregistered sender loses notes only when its wallet tags with address-derived secrets; the default handshake delivery needs no registration (recon § #1034, `network/receive-unregistered.test.ts`).
- **All three are `enhancement`.** The lane brief is the recorded decision that admits #1038 and the #1033 disposition; #1034 waits for OA-1.

## Outcome & Quality Bar

- **For whom:** a person with many watched tokens who unlocks the wallet, whose wallet ticks while they use it, or whose node is down; the maintainer who next touches the scan schedulers.
- **Excellent:**
  1. At 1,000 watched tokens the popup reaches Home, and answers every heartbeat RPC during the scan wave, within 1 s of what it does at 10 tokens, in all three confirmation runs (14-20 s today).
  2. Every watched token still gets its first scan after each install, and Retry gets a fresh forced scan of every token of the network; tests that fail on today's code prove both.
  3. A wave of failed scans never queues more than one write of the scan-episode record; the write count and bytes are recorded beside the base's.
  4. The gate is one small file beside its one caller, with no option or setting.
- **Good enough:** the scans take about as long in total as before; 5,000 tokens and the note arm are out of scope; times are from a shared host with load1 beside each number.

## UI impact

None. A1 changes when background scans run and how often a background record is written, not what any screen shows. OA-1 lists the visible changes each #1034 option would bring; none ships here.

## Assumptions

**Facts** (recon.md has the lines):
- F1 The unlock RPC awaits no scan; `hydrateSchedulers` waits for the facade lock the unlock holds, so scans start after the session write (`profile/service.ts:598-605, 747-814`; `session-manager.ts:324-337`). PBKDF2 (about 1 s) runs before that write (`profile/service.ts:753-756`).
- F2 Every public target installs and kicks at once (`incoming-transfer/service.ts:1097-1121, 1152`); intervals stay in phase; rebuilds and Retry fan out (`:1308-1318`). `startPublicScheduler` has one caller (`:1119`), `stopPublicScheduler` one (`:1405`), always followed by a rebuild; `pollPublic` has two (`:1164, :1315`).
- F3 `retryIncomingScan`'s popup caller ends its spinner and refetches health on a timeout (`composables/useIncomingSyncHealth.ts:113-127`); the RPC limit is 60 s.
- F4 `ScanEpisodeStore.persist` queues one full-snapshot write per change on a serial queue (`scan-episodes.ts:60, 170-176`); `settled()` is that queue's tail.
- F5 No concurrency gate exists in the tree; `Queue<K,V>` cannot upgrade an entry in place (recon reuse map).
- F6 The pxe-limits-1 probe, instruments and A/B export script are scratch under `~/.cache/nulo-backlog/pxe-limits-1/{patches,tools}/`.

**Inferences** (each tested by a gate):
- I1 The gate plus coalesced episode writes keep the popup within 1 s of its 10-token figures at 1,000 tokens, on the failure wave and with deployed tokens. Phase 3 falsifies it.
- I2 Some K in {1, 2, 4} qualifies under phase 3's rule. If none does, the plan stops.
- I3 A3's sealing leaves the burst in place. Phase 1 checks it.

**Asks** (working assumption in force; the orchestrator may overrule):
- A1 *Posting upstream (step U).* The lane brief says the lane "files the pagination upstream and marks #1033 `blocked:external` with its reopening condition". Posting under the owner's account is an outward action, so step U posts only if the orchestrator's approval of this plan names step U. Otherwise step U stops at the draft, which goes into #1033's body.
- A2 *Measurement method.* "One probe, three brackets, balanced order" is read as the pxe-limits-1 holdings probe measuring 10, 100 and 1,000 tokens in each run, base and head in the order A B B A A B.
- A3 *The log line at `service.ts:1209`* puts the scan key in a finished string and passes the error bare, against the logging policy's shape. A1 rewrites it to a fixed message with `{ error }`; the error text itself is unchanged.

## Architecture & Implementation

### The gate

`apps/extension/src/wallet/services/incoming-transfer/scan-gate.ts`, about 60 lines, one caller:

```ts
export type ScanIntent = { force: boolean; retry: boolean }
export class ScanGate {
  constructor(limit: number, run: (key: string, intent: ScanIntent) => Promise<void>)
  request(key: string, intent: ScanIntent): void            // ticks and kicks: no waiter is kept
  requestAndWait(key: string, intent: ScanIntent): Promise<void> // Retry: settles when this key's admitted run ends, or on clear()
  clear(): void // settles and removes every pending entry; running scans keep their slots
}
```

- **State:** `pending: Map<string, { intent: ScanIntent; waiters: (() => void)[] }>` (insertion order is the queue), `running: Set<string>`.
- **Request:** a pending key ORs `force` and `retry` into its entry, in place; otherwise a new entry goes to the end. `requestAndWait` adds one waiter; `request` adds none, so repeated ticks keep nothing alive. Then `pump()`.
- **Pump:** walk `pending` in order; stop when `running.size === limit`; skip a key in `running`, so a successor waits behind its predecessor while other keys pass it; otherwise move the key to `running` and start `run`. When the run settles, either way, remove the key from `running`, call the entry's waiters, and pump again. A free slot is taken in the same synchronous call as the request.
- **Service wiring** (`PUBLIC_SCAN_CONCURRENCY` beside `DEFAULT_POLL_INTERVAL_MS`, `service.ts:53`; its value from phase 3; one comment line on why it is bounded):
  - the runner is `(key, { force, retry }) => { if (retry && the key's target is installed at the current epoch) clear that key's retry gate; return this.pollPublic(key, force || retry) }`, so Retry's intent is used at admission, after any earlier run of the key has recorded its outcome, and never on a target a rebuild replaced;
  - `startPublicScheduler` passes `(force) => { this.publicScans.request(key, { force, retry: false }); return Promise.resolve() }` to `startPollScheduler`; the interval keeps its `bornAtEpoch` fence. Its `.catch` labels now cover only the enqueue: a scan's failure is logged once by `pollPublic`, and the gate frees the slot and settles waiters on either outcome;
  - `retryIncomingScan` keeps today's up-front clear of the network's retry gate (so a commit that drops pending intent still leaves the fresh kicks past backoff), then awaits `requestAndWait(key, { force: true, retry: true })` for each target of the network;
  - `commitSchedulers` calls `publicScans.clear()` before it installs, so no stale intent survives a lock, a profile switch or a token change; every installed target then gets a fresh kick;
  - `pollPublic` keeps its `publicPolling` guard; `scanAndRecord` takes the target's install epoch, not `this.serviceEpoch` (D7). The note arm does not change.

### Coalesced episode writes

`ScanEpisodeStore.persist()` (`scan-episodes.ts:170-176`) today takes a full snapshot at every change and queues it, so a fast wave of N failures holds up to N snapshots of up to N entries in memory and writes them all. After the change:

- `persist()` sets a `queued` flag and calls `writes.run` only when the flag is clear; both happen synchronously;
- the write clears the flag when it starts, then takes the snapshot and decides between `set` and `remove` at that moment;
- a change made while a write is in flight therefore queues exactly one successor, and no change is lost;
- `settled()` stays the queue's tail: it resolves after a write that started after every change made before the call; `hydrate()`'s repair write is that tail;
- a failed write goes to `onPersistError` as today; the next change queues a fresh write.

This bounds the backlog (one write waiting) and its memory, not the number of writes: changes spaced wider than one write still write once each. The stored shape and key do not change. A per-row store would cut the bytes per write but changes a stored shape: its own plan.

### Flow at unlock with N tokens

Session write → `onActiveProfileChanged` → `hydrateSchedulers` → `commitSchedulers` clears the gate and installs N intervals and N kicks → K scans run, the rest wait in order → each finished scan admits the next. The wave ends when every installed target's first `pollPublic` has returned. Each tick only enqueues; a pending key coalesces, so the queue never holds a key twice and never exceeds N entries.

### Step U (#1033, no PR)

Dedupe found no upstream issue (searched `AztecProtocol/aztec-packages` for `getNotes`, `view_notes`, `pick_notes`, `MAX_NOTES_PER_PAGE`, note pagination and slow balances, 2026-10-22).

- **Title:** `PXE: each view_notes page of a utility re-reads every note of the contract, so a note-summing utility is O(N²)`.
- **Body:** the version (6.0.0-rc.3); the mechanism with its source lines (`utility_execution_oracle.ts:476-511`, `note_store.ts:105-196` walking `notesByContractAddress`, `pick_notes.ts:153-160`); the reproduction (one account receives 900 notes of the aztec-standards Token, 4 a block, then `executeUtility(balance_of_private)`); #1033's table with its host caveat; the ask (reuse the contract's note set within one utility execution, or index notes by owner and slot; upstream picks); a link to nulo-sh/nulo#1033. No local path, log, instrument or endpoint.
- **On #1033:** edit the body's `## Possible fix` to name the upstream issue (or carry the draft, per A1) and the reopening condition: an Aztec release on the wallet's line that fixes the per-page walk (re-measure with #1033's method, then close), or an approved plan for a dependency patch of that same cause. Add `blocked:external`; #1033 stays open.

### File-level change map (A1)

| File | Change |
|---|---|
| `apps/extension/src/wallet/services/incoming-transfer/scan-gate.ts` | new: the gate |
| `apps/extension/src/wallet/services/incoming-transfer/scan-gate.test.ts` | new: unit tests |
| `apps/extension/src/wallet/services/incoming-transfer/scan-episodes.ts` (+ `.test.ts`) | coalesced `persist()`; one ordering test; the serialization test adjusted |
| `apps/extension/src/wallet/services/incoming-transfer/service.ts` | the constant, the gate field and runner; `startPublicScheduler`, `retryIncomingScan`, `commitSchedulers`; the install epoch in `scanAndRecord`; the `:1209` line |
| `apps/extension/src/wallet/services/incoming-transfer/service.scenarios.test.ts` | four scenario tests; existing tests advance the queue where they must, no assertion loosened |
| `implementations-plan/pxe-cost-1/**`, `implementations-plan/index.md` | plan, lessons, close-out |

## Security & Adversarial Considerations

- **Threat model.** The schedule is internal; no dApp or page reaches it. Watched tokens come from the default list, the person's own adds and a dApp's `registerToken`, which the person confirms. The gate bounds how many scans run, not how many tokens are watched; no registration policy changes.
- **Fairness.** FIFO with coalescing: no key is overtaken forever, and no key is queued twice. A slow token (a hostile contract or node; an offscreen request may take up to 90 s, `packages/extension-messaging/src/offscreen/client.ts:22`) holds one slot; K slow tokens hold them all and delay every other scan. That is an availability limit: phase 3 prefers K ≥ 2, and the close-out files it as a closed `known-limit` issue (reopening condition: a user report of delayed receipts behind a slow token, or a node shown to answer some contracts slowly). Cancellation or per-network queues would grow the design.
- **Fences.** A pending entry carries no epoch. `pollPublic` checks the install epoch at run time, and with D7 every write of that scan is fenced by the install epoch. `clear()` drops every stale intent on each commit.
- **Logging.** The gate logs nothing. The rewritten `:1209` line has a fixed message and `{ error }` (CLAUDE.md § Logging policy).
- **Persistence, crypto, supply chain.** No stored shape changes (the episode blob keeps its key and shape), no new dependency, no key material.
- **Step U.** The upstream issue carries public facts only: source lines of a public package, a public contract's shape, and timings already public on #1033.

## Phases

Every local run goes through `apps/extension/scripts/e2e/agent.sh` at `NULO_E2E_RETRY=0`, one at a time in this worktree, never while deps-audit-1's soak runs (check `agent-worktree list` first). Record load1 at the start and end of each run. The stall watchdog stays as it is.

### Phase 1 — Instruments and the base measurement (A1; about 1.5 h)

1. Merge `origin/dev` into the branch after encryption-at-rest-1 A3 is on `dev`.
2. Copy the pxe-limits-1 probe, instruments and export script (F6) to `~/.cache/nulo-backlog/pxe-cost-1/`. Rebase the instruments onto the base. Fix the copied helpers' provenance: `run-tree.sh` prints a hard-coded HEAD and `measure-branch.sh` pushes a branch; record each run's real HEAD and push nothing. Record the exact invocation in `lessons/phase-1.md`. Do not commit the scratch files.
3. Add these records to the holdings family. Keep the issue's clock: `unlockAt` taken before `ensureUnlocked` (`_probe-ceilings.test.ts:223-225`). Record the submit as its own offset, and give every other record as an offset from `unlockAt`:
   - the submit; session record visible; Home reached (the issue's "unlock"); rows visible;
   - a popup heartbeat: one `profile.getActiveProfile` RPC scheduled every second from the submit until 30 s after the wave ends; per sample, its lateness plus its round trip;
   - the wave: the moment every installed target's first `pollPublic` has returned (the wave end); class outcomes by kind and the last class read, as diagnostics; the count, total bytes and total time of episode writes;
   - Retry: `retryIncomingScan`'s duration, started 10 s after the wave ends.
4. Before each measured unlock, restart the worker and unlock once, so A3's conversion of seeded rows is done, and wait until that unlock's scans have drained. Record the conversion's time apart.
5. Run the probe once on a base export: 10, 100 and 1,000 seeded tokens, then 64 deployed token contracts (the pxe-limits-1 tokens-axis seeding).

**Gate.** Pass: every record is present at every point; the base's 1,000-token Home time is at least 5 s (I3). If it is under 5 s, stop and report: the arc's premise moved. Write the episode writes observed during the wave (count, bytes, time) into `lessons/phase-1.md`, as activity beside the timings, not as a share of the delay. Layers: e2e-live-network (scratch probe).

### Phase 2 — The gate, the coalesced writes, their tests (A1; about 2.5 h)

1. Write `scan-gate.ts` and wire the service (Architecture), with `PUBLIC_SCAN_CONCURRENCY = 4` until phase 3.
2. Coalesce `ScanEpisodeStore.persist()`. Carry the install epoch into `scanAndRecord` (D7). Rewrite the `:1209` line (A3).
3. Add `scan-gate.test.ts`. Hold every run on an explicit deferred promise. Cover:
   - at most `limit` runs at once, and every requested key runs exactly once (the success control);
   - a request for a pending key coalesces into one run, with `force` and `retry` ORed, and its waiters settle after that run;
   - a request for a running key queues one successor, started only after the run ends while other keys are admitted; the old run's end does not settle the successor's waiters;
   - a run that rejects frees its slot and settles its waiters;
   - `clear()` settles every pending waiter and starts none; a running key keeps its slot, and a new request for it waits behind it.
4. In `scan-episodes.test.ts`: hold the first write; record and delete episodes while it is in flight; call `settled()`; release the writes one at a time. Assert that `settled()` waits for the successor, at most one write is ever queued, and the stored blob equals memory at the end. Keep the hydration-repair test and the set-then-remove pin (`:75-82`). In the serialization test, wait for the first write to start before the delete; no assertion is loosened.
5. Add four scenario tests in `service.scenarios.test.ts`. Use the real service and `makePublicReader` (`:2609`) with class reads held on deferred promises:
   - with 2K + 1 tokens, at most K class reads are in flight, and every token's first scan runs once (head only: it reads `PUBLIC_SCAN_CONCURRENCY`);
   - a rebuild (a token add) while a key's install scan is held before it fills the class cache: after release, that key scans again with no interval tick (count class reads per contract);
   - Retry while a key's scan is held: release it with a failure (it records backoff); a fresh forced scan of that key still runs, and Retry settles only after it;
   - a token delete while a scan is held in `isChainQuarantined` (not `getNetworksRaw`, which the delete path also reads): no cursor is written for that token afterwards (D7).
6. Prove the last three red on the base `service.ts`, taken from the base SHA, never HEAD; run them alone with `-t`. For that scratch run, drop the first test and its import of the constant, so the file loads on base and the three fail by assertion.
7. Keep every existing scheduler pin green (`:2332`, `:2375`, `:6493`, `:6502` and the rest). Run the incoming-transfer suite once more with the constant at 1 (scratch, not committed). A test that assumed every kick ends in one flush advances the queue instead; no assertion is loosened.

**Gate.** Commands: `bun run --cwd apps/extension test -- src/wallet/services/incoming-transfer/`, then `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`. Pass: all exit 0, at K = 4 and at the scratch K = 1; the three tests named in step 6 are red on base. Layers: lint, typecheck, unit, scenario.

### Phase 3 — Choose K, then confirm (A1; about 3 h)

1. Build exports of the phase 2 head with the constant at 1, 2 and 4 (scratch edits). Run the probe once on the base export and once on each: 10 and 1,000 seeded tokens, and 64 deployed tokens.
2. Pick K by this rule, fixed before the runs. Three constraints apply at 1,000 seeded tokens and at 64 deployed tokens:
   - responsiveness: Home and the heartbeat's worst sample are each within 1 s of that run's 10-token values;
   - the wave: it ends no later than in this screen's base run;
   - Retry: it ends under 60 s.
3. Choose in this order:
   - If at least one value meets all three, take the largest such K ≥ 2, else K = 1 (that set's only member).
   - If none meets all three, take the largest value that meets responsiveness and the wave, and file a closed `known-limit` issue for Retry at that size.
   - If none meets responsiveness and the wave, stop and report: I2 is rejected for {1, 2, 4}.
   - A chosen K = 1 also files a closed `known-limit` issue: one slow token delays every other.
4. Set the constant, commit it, and re-run phase 2's gate.
5. Confirm: base export (A) and head (B) in the order A B B A A B, each at 10, 100 and 1,000 seeded tokens. Then one run of each at 64 deployed tokens. Each head run's wave is compared with the base run next to it in that order (B2 with A1, B3 with A4, B6 with A5); the deployed head run with its own base run.
6. Record every table in `lessons/phase-3.md`: run ids, HEAD, arm, load1, each record per point.

**Gate.** Pass: in all three head runs, the responsiveness and wave constraints hold at 1,000 seeded tokens, and in the deployed-token run too; Retry ends under 60 s in each of those runs, unless step 3 took the Retry known-limit branch; every seeded token's first scan completed; the episode write count and bytes are recorded beside the base's (diagnostic, no threshold); phase 2's gate is green at the chosen K. Layers: e2e-live-network, unit.

### Phase 4 — The incoming files on both browsers (A1; about 1 h)

1. Run at retry 0, Chrome then Firefox: `cd <worktree> && NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/incoming-arrival.test.ts tests/e2e/network/incoming-public-transfers.test.ts tests/e2e/network/incoming-transfers.test.ts tests/e2e/network/balance-row-reconciliation.test.ts`, then the same with `NULO_E2E_BROWSER=firefox`.
2. Read a red honestly: one rerun for a named known flake; a fix for real breakage.

**Gate.** Pass: all four files green on both browsers at retry 0, including `incoming-public-transfers.test.ts:122-152` (a receipt sent while locked shows within one interval of the unlock). No e2e scenario is added. Layers: e2e-live-network on Chrome and Firefox.

## Delivery

- **Step U** (#1033): first, any time after approval; no branch, no PR. Log it in `lessons/phase-0.md`.
- **A1** (#1038): one PR from `worktree-pxe-cost-1` against `dev` after phases 1-4 and the review loop: `perf(incoming): scan watched tokens through a bounded queue, not all at once` (76 characters). Body: the phase 1 and 3 tables, the e2e outcomes, the known limits filed, `Closes #1038`; no label at creation. The close-out lands as its final commits. Not stacked (the orchestrator's D-orch-1). `code_review: off`.
- **Parallelism.** None: each phase needs the one before it.

## Decision ledger

| Id | Decision | Why | Rejected |
|---|---|---|---|
| D1 | A bounded FIFO gate with per-key coalescing, beside its one caller | bounds every burst source (unlock, ticks, rebuilds, Retry) and adapts to scan time (Codex r0) | a staggered start (outline B: a slow wave still overlaps; ticks re-phase after a rebuild; Retry still fans out); one scan per network over its contracts (a Retry or rebuild at network grain re-runs all; one slow token blocks the network); a shared utility in `wallet-core` (one caller) |
| D2 | The gate never runs a key twice at once; `clear()` drops pending, never running | else the gate feeds `pollPublic`'s early return and loses the kick, as today (Codex r0) | dropping a request for a running key |
| D3 | #1033: upstream issue and `blocked:external`; no wallet-side sum | the cause is the PXE's per-page walk; a wallet sum copies the contract's balance semantics, the note-schema map is a rendering aid, and a registered instance's class does not prove the executing class (`packages/aztec-runtime/src/pxe/effective-class.ts`) (Codex r0; Opus r1 agrees) | a pinned-class wallet sum; a skip-if-unchanged cache (no signal; does not cut a read's cost); a `bun patch` of `@aztec-labs/pxe` (a maintained fork: its own plan) |
| D4 | K from {1, 2, 4} by a rule fixed before the runs, on the failure wave and on deployed tokens; prefer K ≥ 2 | the right K depends on scan time; the probe's wave is a failure wave (Codex r0, Opus r1) | K = 4 by argument; a setting |
| D4a | Amends D4: K from {4, 8, 16}, the smallest that meets all three rules (K = 4 if it does), screened at 10 and 1,000 seeded tokens once a slot holds only its scan; the 64 deployed tokens and the balanced runs then qualify that K | no K in {1, 2, 4} met the wave rule (base 30.7 s, K = 4 52.7 s and 45.1 s), while responsiveness held at every K, so a wider bound costs nothing that rule guards; a slot held 208 ms, of which the class read runs 13-18 ms in the PXE (`lessons/phase-3.md`); the orchestrator's call, made with no rule moved, and recorded before the runs (Codex, design consult) | relaxing a rule (the owner's decision, only after this fails); an unbounded K; the largest qualifying K (D4's preference for a small bound stands) |
| D5 | Retry keeps the up-front network clear and also carries its intent into the gate, clearing the key's retry gate at admission when its target is current | a Retry queued behind a running scan that then fails would meet fresh backoff (Codex r1); a commit that drops pending intent would leave the fresh kick in backoff (Opus r2) | the up-front clear alone; making forced ticks bypass backoff; raising the 60 s RPC limit |
| D6 | No e2e scenario added; the probe stays scratch | the probe measures; the scenario tests prove the scheduling | committing the probe |
| D7 | `scanAndRecord` uses the target's install epoch | closes the await gap after `isQuarantined` (Codex r1) | re-checking the epoch after each await |
| D8 | Coalesce episode writes in `persist()`: one write waiting, snapshot at its start | the measured wave is a failure wave; today's eager snapshots hold up to N copies of an N-entry map; the change keeps key, shape and `settled()` (Opus r1; Codex r2 restated the bound) | a write-count threshold (the gate spaces failures, so the count is a noisy proxy; the heartbeat is the criterion; Opus r2 over Codex r2); a debounce timer (a new lifecycle); per-row storage (a shape change) |
| D9 | No `drop()`; ticks keep no waiter | `stopPublicScheduler` is always followed by a rebuild's `clear()`; a waiter per tick keeps closures alive while a key waits (Opus r1, Codex r1) | a per-key drop; one promise per request |

## Audit verdicts

- **Implementation review, round 1** (on `941c2620a`): **Codex** (gpt-6.1-sol, high; session `01a163ba`) **approve**; **Opus** (general-purpose agent) **approve**. Neither found a production defect. Taken as local test changes (`629b69ccc`): the reset test checks the re-sealed cursor stays an envelope of its profile and opens to a defined value (both); a merged key keeps its queue position, and a runner that throws frees its slot (Codex); Retry scans past a fresh tip mark, proven red by mutation (Codex); `settled()`'s wording (Opus). Recorded, not changed: a `clear()` can settle Retry before its scans run (by design, D2/D5); a tick during a running scan now queues one successor (the steady-state cost is bounded by K, the lost kick was the defect); a throwing `onPersistError` would stop persistence (the callback is `logDebug`); the admission clear matches by prefix (contract addresses are fixed-length).
- **Codex final** (fresh session `01a162bd`): **approve**, after two verification resumes; the first verdict was *conditional approve* (keep the issue's start-to-Home clock beside the submit; Retry and the base comparison enforced in confirmation). Both applied, with its clarifications: episode writes recorded as activity, not a share; the K rule's first branch made conditional; the scratch helpers' provenance; the slow-token availability limit filed at close-out; a stale clock phrase in the issue notes. D8's rejected threshold should stay rejected.
- **Codex r2** (resumed `01a162a3`): *conditional approve* (D8's bound is backlog, not writes; an ordering test for `persist()`; a total K rule; the wave measured as each target's first `pollPublic`). All accepted, except a numeric write-count threshold (D8).
- **Opus r2** (resumed): *conditional approve* (R2-1 the write criterion; R2-2 a commit drops Retry intent → keep the up-front clear; R2-3 a base run inside the screen and the wave-only branch; R2-4 test details; R2-5 option F's omissions). All accepted.
- **Codex r1** (resumed `01a162a3`): *reject* (stale-epoch admission, the Retry and backoff race, incomplete acceptance conditions). Accepted: D5, D7, D9; the probe's "unlock" is Home, not the session record; the threat model's token path; scheduling delay in the heartbeat; sharper unit and scenario tests with held promises and the red-on-base recipe; numeric wave and Retry rules; the A3 ask reworded; step U's authorization (A1); OA-1's corrections (per-sender cost 84 × (tokens + 1) per scope; B leaves existing senders; C misses address-derived receipts before the first send; D needs ordering and enforcement on every path; E's cost can be shown).
- **Opus r1** (Plan agent): *conditional approve* (findings 1-6). Accepted: the failure wave and its episode writes (D8, phase 1 records); a wave rule against the base; the heartbeat replacing a single sample; A3's conversion done before each measured unlock; the suite at K = 1 and the gate re-run after K; step U's authorization quoted (A1) and the condition in #1033's body; K ≥ 2 preferred; `drop()` removed (D9); the Retry test made red on base; D1's reasons restated; OA-1's wording and its missing option F (a total across every path, refused past N, counted from the PXE). Rejected: removing `clear()` (it drops stale Retry intent at each commit, D2).
- **Codex r0, the direction consult** (gpt-6.1-sol, high; session `01a162a3`): #1033 → upstream, `blocked:external`; #1038 → a service-local bounded gate, K by measurement. All conditions adopted: D1-D5.

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `5711a1bc3`, with:

- **Review loop** (step 2) once over A1's whole diff after phase 4: Codex by `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, the standard's two rules verbatim, the adversarial ask, and "can any token lose its first scan, can a key run twice at once, can the queue or its waiters grow without bound, can a scan write under a scheduler set that is gone, can a coalesced write lose a change". Resume until a round has nothing material; three rounds at most, then stop and report.
- **Delivery and close-out** (steps 3-4) as Delivery says; `gh pr checks <n> --watch`. File the slow-token known limit (Security § Fairness) and any phase 3 known limit; list them on the Outcome's `Known limits:` line. Comment on #1034 that OA-1 holds it, and add `owner-decision` while it is unanswered.
- **Teardown** (step 5): slug `pxe-cost-1`, trunk `dev`.

## Seeds (drafts, not run)

- `/goal` implementations-plan/pxe-cost-1 complete: step U done and logged; phases 1-4 ✓ in plan.md with each gate's pass in the transcript; the Codex loop converged on A1; the A1 PR open against `dev` with `Closes #1038` and its archive-move commit.
- `/loop 20m` Drive implementations-plan/pxe-cost-1: read plan.md and lessons/; start a probe or e2e run only when none is in flight and deps-audit-1's soak is not; poll it in a bounded loop; record it in its phase's lessons file.
