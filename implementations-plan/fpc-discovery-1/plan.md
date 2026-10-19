---
plan: fpc-discovery-1
tier: mid
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev @ 19399c82
standard: implementations-plan/README.md § Post-implementation standard, read at 19399c82
---

# fpc-discovery-1: a reset never waits on protocol FPC discovery

One issue, one arc, one PR against `dev`, not stacked (D-orch-1). Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Gate log: `STATUS.md`.

| Arc | Issue | PR line | Phases |
|---|---|---|---|
| 1 | #553 | `Closes #553` | 1, 2, then the close-out |

#553 keeps its `known-limit` label until the owner removes it (lane brief); the PR closes it.

## Outcome & Quality Bar

- **For whom**: a person who resets the wallet or deletes a profile while the node is down, refused or silent, often seconds after opening Home, which starts discovery while the two protocol FPC rows are missing.
- **Excellent**:
  1. No FPC locked section awaits the node: the purge's FPC step, a network delete's or reset's FPC sweep and every other FPC write wait only for storage writes.
  2. The fences keep their guarantees: no protocol row survives for a deleted profile, none lands across a chain purge it did not see, and a racing discovery stores at most one row per protocol FPC.
  3. Measured, not asserted: with discovery retrying against a refused node at submit, the reset drops from 10.2-10.6 s to the seeded case's 0.5-2.3 s, on Chrome and Firefox.
- **Good enough**: against a node that accepts connections and never answers, each PXE call already queued on the chain ahead of the purge's drain still makes its first attempt, up to 60 s each (#551, KL-3, unchanged).

## UI impact

None. No copy, layout, row or format changes; `getFpcs` returns the same rows. The reset finishes sooner. An `addFpc` whose network is being deleted or reset at entry now fails at once with the existing "network deleted" error, as one whose write overlaps the reservation already does, instead of storing a row whose registration the purge wiped (D9).

## Assumptions

**Facts** (verified at `19399c82`; recon has the paths):
- F1 Discovery awaits `pxe.registerContract` under `this.lock` (`fpc/service.ts:148,215`); `purgeForProfile` and `clearChainState` take the same lock (`:442`, `:79`).
- F2 A cold runtime's registration awaits `getL1ContractAddresses` with 4 attempts, 1/2/3 s sleeps and 60 s per attempt; a failed boot is not cached (`chain-runtime.ts:190,380`, `utils/fetch.ts:19,152`).
- F3 The purge's first retry stop is `networks.purgeForProfile` → `purgeChain` → `clearChainState`; `clearProfileState` comes last (`coordinator.ts:130-136`, `network/service.ts:1110`).
- F4 After `beginDeletion` a new PXE request fails at the SW stamp ("no current incarnation"); one in flight is drained by `clearChainState` with retries stopped; one arriving after `clearProfileState` is refused by the dead generation (`pxe/client.ts:263`, `pxe/service.ts:695,750,878`).
- F5 Upstream re-registration is a keyed overwrite, and the offscreen serialises registrations on `chainGuard.write` (recon, Reuse map).
- F6 `deleteNetwork` and `resetChainInPlace` reserve the network before the chain-purge subscribers and release it after `clearChainState` and `afterPurge`. `isNetworkLive` refuses only a reservation open during its own read or begun during it (`network/service.ts:579-625,1012-1020`); a same-chain reset keeps the network id and chain id (`:1027-1031`).
- F7 `addFpc` registers outside the lock and writes under it with the same fence (`fpc/service.ts:251-308`).
- F8 `security-reset.test.ts` is a smoke spec (`vitest.e2e.config.ts`, armed build from `global-setup-smoke.ts`), not a network spec.
- F9 `NetworkService.reservations` counts every reservation per network and never decrements (`network/service.ts:603-610`): a chain-purge version that already exists.
- F10 A PXE op that reaches the offscreen after its chain's `clearChainState` finished captures the final purge epoch and may re-create that chain's runtime and store (`pxe/service.ts` `withPxeRead`, `withPxeWrite`); this holds for every service's ops at `19399c82`. `resetChainInPlace` releases its reservation before `onPurged` and the chain-id rewrite (`network/service.ts:1020-1024`), so work admitted in that gap still sees the old chain id.

**Inferences** (attacked; see Audit verdicts):
- I1 Refused node: once discovery holds the lock only for storage, the purge reaches `clearChainState` at once and its drain waits at most one backoff sleep (≤ 3 s) per queued registration. Silent node: each PXE call queued on the chain ahead of the drain makes its first attempt, up to 60 s each; Home's two legs (`stores/balances.store.ts:573-574`) queue two registrations, so about 2 × 60 s there. That is KL-3's documented multiple of 60 s, not a bound for any number of callers; the base waits up to the 90 s RPC timeout per registration under the lock, or the 5-minute watchdog.
- I2 Concurrent discoveries repeat idempotent registrations (F5). Today a holder queued on the lock skips a finished discovery; Outline A repeats the registration in that window. Cost only: no row, state or screen differs.

**Asks** (none to the owner; the panel settled each):
- A1 The lane brief asks for a composition test; `COMPOSITION-TESTS.md` names `FpcService` its counter-example. Settled: D5.
- A2 The lane brief asks for the security-reset spec through `agent.sh`; it is a smoke spec. Settled: D6.

## Architecture & Implementation

**Shape (Outline A, chosen).** Discovery takes the shape `addFpc` has (F7): PXE work outside the lock, a short fenced write under it, plus a fence on chain purges that both callers share. After resolving the network, discovery takes a liveness mark: `since = await networkService.captureLiveness(network.id)`; `undefined` (the network is missing or reserved) ends discovery before any registration. Then, per missing protocol FPC, in the current order (Sponsored, then Private):

1. Detect the type and validate the bundled artifact (pure; today this runs after the registration).
2. If `!(await networkService.isNetworkLive(network.id, since))`, stop: the network is being purged or was purged since the mark.
3. `await pxe.registerContract({ instance, artifact })`, with no lock held.
4. `await this.lock.withLock(() => this.storeProtocolFpc(...))`: re-read this profile's rows on the chain; if a row of that type at the protocol address exists, return (a concurrent discovery stored it); otherwise allocate the id and call `writeFencedRow`.
5. A throw from 1-4 is caught per item and logged, as today.

`getFpcs` returns a fresh read of the profile's rows on the chain, decorated, so a row swept meanwhile is not returned. The sentinel shape (`early`) goes.

**Interfaces.**
- `NetworkService.captureLiveness(networkId: string): Promise<number | undefined>` (new): the reservation count when the network is live now, else `undefined`. A mark can therefore never be taken during an open reservation, which `reservedSince` could not see once it closed.
  It reads the count before its storage read and returns it only if `isNetworkLive(networkId, count)` holds, so a reservation that overlaps the capture refuses it.
- `NetworkService.isNetworkLive(networkId: string, since?: number)`: with `since`, false also when a reservation began after the mark. Without it, unchanged for every current caller.
- `FpcService.writeFencedRow(id, row, networkId, since, fence, deletion)` (private): `assertCurrent` → `isNetworkLive(networkId, since)` → `set` → `isCurrent` → compensating delete and `profileDeletedError`. `addFpc` takes its mark at entry, next to its fence, throws the existing "network deleted" on `undefined` before any PXE work, and calls `writeFencedRow` inside its locked section; its emit stays after it.

**Fence invariants (the brief's four races):**
- **R1, a purge between the registration and the write.** `deleteProfile` bumps the epoch, the purge sweeps (the lock is free), then the write's `assertCurrent` throws. An epoch bump during `set` is compensated before the lock is released; one after the re-check leaves a row that the purge's sweep, queued on the lock, deletes. Pinned by the two existing discovery tests and T1.
- **R2, a discovery after the purge.** Its registration fails at the SW stamp, or is drained with retries stopped (F4); its write fails the epoch fence. No row lands, and no PXE store is re-created for the deleted incarnation (`clearProfileState` erases the profile tree last). Pinned by T1 (row side); F4 is the runtime's own tested guard.
- **R3, two concurrent `getFpcs`.** Both may register (F5); each write re-reads under the lock, so each protocol FPC gets one row. Pinned by T2.
- **R4, a chain purge mid-discovery.** No chain switch purges anything; `deleteNetwork` and `resetChainInPlace` do, under a reservation (F6). A reservation open at the mark refuses the mark; one begun after it refuses the next registration (step 2) and every later write. So a row whose registration a purge wiped never lands, the same-chain reset included. Pinned by T3, T4 and T5. Left is F10's class, not new and not FPC-specific: a registration that reaches the offscreen after its chain's clear re-creates an empty store; and work admitted between a reset's reservation release and its chain-id rewrite (discovery or `addFpc`) can store a row on the old chain id, which no network then serves (D9). The close-out files both as one known limit.

**File-level change map:**

| File | Change |
|---|---|
| `apps/extension/src/wallet/services/fpc/service.ts` | `getFpcs` discovers per item as above; `registerAndStoreProtocolFpc` becomes `storeProtocolFpc` (locked, storage only); new private `writeFencedRow`, used by it and by `addFpc`, which also takes a mark at entry; the comments on the old lock span are rewritten to the new invariant |
| `apps/extension/src/wallet/services/network/service.ts` | `captureLiveness`; the optional `since` on `isNetworkLive` |
| `apps/extension/src/wallet/services/network/service.test.ts` | one case in "liveness reads overlapped by a reservation": a mark taken before a reservation that began and ended answers false; one taken after answers true; none is taken while a reservation is open |
| `apps/extension/src/wallet/services/fpc/service-create.test.ts` | T0-T5; the harness's network stub gains a reservation count and an open flag |
| `apps/extension/tests/e2e/security-reset.test.ts` | the second test's comment: drop the claim that discovery holds the lock the purge takes; say why the rows are seeded (D6) |

**Alternatives not taken.**
- **Outline B, a second lock for discovery.** It keeps one discovery at a time (no repeated registration, I2), but adds a lock and an ordering rule, pins queued callers behind a wedged registration up to the watchdog, and still needs every fence of Outline A, since the sweep runs between the registration and the write. Rejected (D1).
- **Outline C, a retry stop at deletion start.** Rejected in wallet-followups-8 D2: a new worker-to-offscreen begin/end protocol that still misses network-service nodes.
- **Batch: register both, then one locked write.** The first row's write would wait out the second registration, which widens R4's window to a whole registration. Rejected for per item.
- **An FPC-local purge counter** (Codex's first fix). It needs the reservation check anyway, for a discovery that starts after the FPC sweep and before the PXE wipe, and it copies a version `NetworkService` already keeps (F9). Rejected for the mark (D2).

## Security & Adversarial Considerations

- **Threat model.** The node is untrusted. Today a node that refuses or never answers holds a person's reset or profile deletion for seconds to minutes. After the change a refused node costs the drain a backoff sleep; a silent one costs it the first attempt of each PXE call already queued on the chain (KL-3). No new trust boundary; no dApp-reachable surface changes (`getFpcs` is a popup and service RPC; `isNetworkLive` is not an RPC method).
- **Data integrity.** Writes keep the epoch fence, and the liveness check now spans the whole discovery, under the same lock the sweeps take (R1, R4). A post-purge registration cannot re-create a deleted profile's store (R2, F4).
- **Lock watchdog.** The FPC lock is no longer held across a node wait, so the 5-minute watchdog can no longer displace a discovery that keeps writing (`lessons.md`, the `Lock` watchdog line).
- **Logging.** No new log values. The per-item warn and error lines, and the protocol addresses (public constants) they carry, stay as today.
- **Least privilege, crypto, supply chain.** No change: no dependency, workflow, permission or key touched.

## Phases

### Phase 1: discovery registers outside the FPC lock ✓

Steps:
1. Add `captureLiveness` and the `since` parameter to `NetworkService`, with the network test case.
2. Restructure `getFpcs` and `registerAndStoreProtocolFpc` as Architecture says. Keep `collectMissingProtocolInstances` and the log lines.
3. Extract `writeFencedRow`; call it from `addFpc` (mark taken at entry) and `storeProtocolFpc`.
4. Add the tests below to `service-create.test.ts`. Release every gate in a `finally`. A purge "settles while parked" means: a flag set when it resolves is true after one macrotask (`FakeBrowserApi` storage settles on microtasks).
   - **T0** (control): with no deletion or reservation, a discovery stores one Sponsored and one Private row, and `getFpcs` returns both as protocol rows.
   - **T1** (extends the existing park test): park the registration, begin the deletion, run `purgeForProfile("p1")`; it settles while parked. Release: no row, and `recordWrites` logs no write.
   - **T2**: two `getFpcs` calls share one parked gate. Release: exactly two rows, one per type, and both calls return both.
   - **T3** (a reset that completes during the registration): let the Sponsored row land; park the Private registration on a gate. From the test, open a reservation, start `clearChainState("p1", 1)`, assert it settles while parked (it removes the Sponsored row), close the reservation. Release the gate in `finally` and join both: no row is left, and `getFpcs` returns no Sponsored row.
   - **T4** (admitted after the FPC sweep): with a reservation open, `getFpcs` sends no registration and stores no row. Close it: the next `getFpcs` discovers both (T0's result).
   - **T5** (`addFpc` admitted mid-purge): with a reservation open, `addFpc` rejects with "network deleted" before any PXE call and stores no row.
5. Prove red on the base: copy `service.ts` from `git show 19399c82:apps/extension/src/wallet/services/fpc/service.ts`, run the file, expect T1, T3, T4 and T5 red by assertion, restore the head copy.

**Validation gate:**
- Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/wallet/services/fpc/ src/wallet/services/network/service.test.ts`; `bun run test`.
- Pass: exit 0 each; T0-T5 and the network case green on the head; T1, T3, T4 and T5 red by assertion on the base copy; no new `biome-ignore`.
- Layers: lint, typecheck, unit.

### Phase 2: the reset in a browser, before and after ✗

Steps:
1. Edit the comment of the second test in `security-reset.test.ts` (map row 5).
2. Build the armed smoke build per browser (`global-setup-smoke.ts`, `ARMED_BUILD`). Before each e2e run, check `cat /proc/loadavg`: wait while load1 is 150 or more.
3. Measure with an uncommitted overlay of the second test, as #630 did (`archive/ci-e2e-hygiene-1/lessons/phase-2.md`). Drop `seedProtocolFpcs` and its assertion, so Home's discovery runs against the refused node. Turn on Developer and Debug Mode, and read `readSwLogTrail` for lock, FPC, purge and PXE lines. Before the reset, wait until the trail shows `Discovering missing protocol FPCs` and a later `[pxe] foundation:retry` line (the witness). Keep the patch under `~/.cache/nulo-backlog/fpc-discovery-1/`; apply it with `git apply`; remove it with `git checkout --`.
4. Run the overlay 5 times per browser at `--retry=0`, on a checkout of `19399c82` (before) and on the arc head (after). Record per run, in `lessons/phase-2.md`: the witness, the purge (submit to tombstone gone), the FPC `Lock: acquired (waited …)` line or its absence, and the refused hits. Record the overlay patch there too, so the run can be repeated.
5. Run the committed file once per browser, on the base and on the head, and record each wall-clock.
6. Run the network specs that store and pay through the protocol FPCs, on Chrome: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/tx-sendTx-sponsoredFpc.test.ts tests/e2e/network/fee-methods.test.ts`.

**Validation gate:**
- Commands: `cd apps/extension && bun run test:e2e -- tests/e2e/security-reset.test.ts --retry=0`, then the same with `NULO_E2E_BROWSER=firefox`; the overlay runs of step 4; step 6; `git status --porcelain` shows no overlay.
- Pass: the committed file green on both browsers; every overlay run shows the witness; every "after" run purges in under 5 s with no FPC lock wait over 1 s; the "before" runs show the wait (expect about 9 s); step 6 green; the tree clean.
- Layers: smoke e2e (both browsers), network e2e (Chrome; CI runs both).

## Decision ledger

- D1 Outline A over B and C (Architecture): the shape `addFpc` has, no new lock or lifecycle.
- D2 R4 is fenced with `NetworkService`'s own reservation count (F9), taken as a mark (refused while a reservation is open) before the first registration and checked before each registration and in each write. It adds an optional parameter and one method on an internal service, no state and no RPC, and it closes `addFpc`'s identical window through the shared write. The first draft called the window unreachable; both auditors rejected that (a same-chain reset keeps the row and the network live, and a wiped PrivateFPC registration is not in the known bundle).
- D3 No single-flight for concurrent discovery (I2). A shared promise would add a lifecycle and an epoch rule to save idempotent PXE work; it would not shorten the silent-node drain either, since Home's gas leg queues its own PXE calls there.
- D4 One `writeFencedRow` for the two copies in this service (the arc rewrites one of them). The token service's ticket-aware variant stays its own.
- D5 No composition test. `COMPOSITION-TESTS.md` (normative) names `FpcService` bb-bound, "Fpc has NONE". A test would need new `pxeClientFactory` seams on `FpcService` and the coordinator and an exception to the doc. The race lives in one service and its lock, which the unit harness drives for real; `coordinator.test.ts` pins the purge order; Phase 2 measures the browser timing.
- D6 No new e2e scenario; the committed spec stays narrow (lane brief). The committed 15 s budget passes on the base too (10.2-10.6 s), so an unseeded committed variant could not go red without a tighter budget. The unit layer pins the cause; the witnessed overlay measures the effect; the committed file guards the PXE drain, its seeded rows isolating it from discovery.
- D7 Unchanged: KL-4 (#552, the token lock, which this reorder does not reach) and KL-3 (#551).
- D8 Rejected: a test of the offscreen queue for I1's silent-node bound (Codex). Nothing here changes that queue; I1 is reworded instead.
- D9 F10's two gaps stay a known limit (one closed issue at close-out). Closing the chain-id one means holding the reservation through `onPurged` and the rewrite, and checking the expected chain id: a change to the reset's lifecycle in another service, beyond #553, for an invisible row on a chain no network serves. `addFpc` adopts the mark because `writeFencedRow` needs one, and its admission check is what makes the mark sound.
- D-orch-1 One PR against `dev`, not stacked.

## Audit verdicts

| Round | Reviewer | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| 1 | Codex `gpt-6.1-sol` high | reject | R4 not fenced (D2); I1's aggregate bound and I2's cost reworded; T3 replaced by a completed-reset interleaving, T4 added; gates released in `finally`; the overlay's witness | a dedupe of discovery admission (D3); a queued-drain test (D8); an FPC-local counter (Alternatives) |
| 1 | Opus 5.5 (Plan) | conditional approve | R4 relabelled and fenced with the reservation count; R4's second-registration path closed by step 2; I1 wording; T1 folded into the existing park test; red by assertion, not timeout; T3 asserts the return; "no FPC lock wait over 1 s" | none |
| final | Codex `gpt-6.1-sol` high, fresh | reject, then **approve** on resume | `addFpc` admission check (now in `captureLiveness`, T5); T3 rebuilt so the base fails by assertion, not deadlock; F10 widened to the chain-id gap, kept a known limit (D9); I1 no longer claims an aggregate bound | none |

## Delivery

- Branch `fpc-discovery-1-a1` off a fresh `origin/dev`, with this plan's commit cherry-picked. One PR, ready, no label at creation; `gh pr create --base dev`. Add a label afterwards only if a path filter would skip a suite the change needs.
- Title: `fix(fpc): register protocol fpcs outside the fpc lock so a reset never waits` (76 characters; commitlint wants a lower-case subject).
- Body: what changed and why; the Phase 1 and 2 gates with outcomes; the before and after purge times and the committed file's wall-clock per browser; `Closes #553`; the footer line.
- `/code-review`: off. Parallel lanes: none (two serial phases, one PR).

## Post-implementation

The steps of `implementations-plan/README.md` § Post-implementation standard, read at `19399c82`, with:

- **Review loop**: single arc, over `git diff origin/dev...HEAD` after Phase 2 is green. Codex: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh` and the same codex dir. One Opus 5.5 review of the same diff (`Agent`, `model: "opus"`, `general-purpose`) runs beside the first Codex round. Each prompt carries the plan, the decision ledger, the adversarial ask on R1-R4, and the two verbatim rules of the standard. Hard stop at three rounds, then report.
- **Gates on the final head**: `bun run lint`, `bun run typecheck:all`, `bun run test:all`, the Phase 2 committed-file runs on both browsers, `bun run check:plans` after staging.
- **Delivery**: as above; then `gh pr checks <n> --watch` once. A known flake gets one rerun; real breakage gets a fix and the loop again. Do not merge.
- **Close-out** (the PR's final commits): merge `origin/dev` and read what moved in `index.md` and `lessons.md`; file F10's class as a closed `known-limit` issue after `gh issue list --state all --search` dedupe; the Outcome block (`Known limits:` that issue; `Open items:`; the seeds retired); promote any generalizable lesson; delete `STATUS.md`; `git mv implementations-plan/fpc-discovery-1 implementations-plan/archive/fpc-discovery-1` in its own commit, links repaired, the index line moved to `archive/index.md`; `check:plans` green.
- **Teardown after the merge**: once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/fpc-discovery-1/plan.md` succeeds, run `agent-worktree done fpc-discovery-1 --merged`; relay a refusal, never force. This session started inside the worktree, so it has nothing to exit; the orchestrator's next session notices the merge.

## Seeds

Not produced as an ELI5 (orchestrator-owned); the lead session implements arc 1 itself.

```
/goal Phases 1 and 2 marked ✓ in implementations-plan/fpc-discovery-1/plan.md, each gate reported passing in the transcript; the Codex fix loop converged on the arc diff (a resumed pass with no new material finding, quoted); a PR against dev with `Closes #553` opened after the loop, its body carrying the before and after purge times; the close-out commit archived the plan (`git show --stat` quoted); `bun run test:all` and `bun run lint` exit 0.
```

```
/loop 15m Drive implementations-plan/fpc-discovery-1 forward from plan.md and STATUS.md: run the next phase's gate, never idle, decide open questions with Codex (gpt-6.1-sol, high) and record them in the ledger, stop at three fix-loop rounds; once the PR is open, babysit checks only; never merge.
```
