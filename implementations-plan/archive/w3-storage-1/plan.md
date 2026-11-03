---
plan: w3-storage-1
tier: light
status: completed
issues: "#1462 #1463 #1464 #1465"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex gpt-6.1-sol high audit round trip + Opus Plan leg; final fresh Codex pass
base: origin/dev at 2575c86c4
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date**: 2026-11-02
- **Status**: completed, one arc as #1576.
- **Shipped**: #1576 closes #1462 (D2: a poll or finality verdict commits a copy, so a rejected write is retried), #1463 (D3: the quarantine drops only after the purge), #1464 (D4-D7: `ValueDecodeError` tells a bad value from a failed read, and config, the seeder and the token list never write after a failed read) and #1465 (D8: the log import lands first and retention waits for it), each proven by a test red on `dev` first.
- **Known limits**: #1577 (the price cache treats a failed read as empty), #1578 (a token-list refresh whose read fails schedules no next attempt), #1579 (after a failed config boot read, the worker honours default privacy settings until it restarts).
- **Dispositions**: rejected, D5's `loaded` flag, adopting every stored prop at `set()`, a rejecting `load()` and refusing `set()` until the next boot (D5); a "retention settled" flag and a wait in `index.ts` (D8); a repeated `discarded` warn on a `verify-unsupported` envelope, kept (fix loop round 1).
- **Lessons**: "only `ValueDecodeError` resets" joined the rejected-read line of `lessons.md`; a second passkey-unlock-1 link there merged into its plan's ledger to stay in budget.
- **Open items**: none.
- **Seeds retired**: the `/goal` and `/loop` seeds below are not to be run.

# w3-storage-1: writes that outrun their persistence: the poller, a failed deletion, a failed read, the log boot

Four `/harden bugs high` findings the owner promoted on 2026-11-01 (decision page 94, P94-03), each a change of state that runs before, or without, the storage step it depends on. One arc, one PR. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are under `apps/extension/src/` unless they name a package.

## The issues, checked

- **#1462, demonstrated by trace.** `updateTx` runs `applyReceipt(tx)` on the watched object, then `commit(tx)` (`wallet/services/transaction/service.ts:622-624`). If `txs.set` rejects, the object keeps the new status but stays under `pending`, so the equality return (`:607`) ends every later poll and `arm()` (`:170-175`) skips the key. `waitForTx` polls `pending.has(key)` (`:374`) and times out. The finality branch (`:641-646`) is worse: after `clearInclusion` the object has no `block`, so `checkFinality` returns at `:636` on every read. Both hold until the worker restarts.
- **#1463, demonstrated by trace.** `deleteNetwork` deletes the journal and the stale entry (`wallet/services/network/service.ts:635-640`) before `purgeChain` (`:642`); a rejected subscriber or PXE clear skips the row delete (`:643`), so the row and its stale accounts survive with no quarantine. The claim holds as written.
- **#1464, demonstrated by trace, one claim narrowed.** Config (`wallet/config/store.ts:19-32`, `:64`), the seeder (`wallet/services/token/seeder.ts:772-778`, every write re-reads through it) and the token list (`wallet/services/token-list/service.ts:221-229`, `:170-180`) behave as reported. Narrowed: a corrupt config value is not kept "for diagnosis" as the comment at `store.ts:28-30` says; the next write replaces it. The issue's Expected accepts that reset, so only the comment changes.
- **#1465, demonstrated by trace.** `wallet/index.ts:78` logs id 1 before `rehydrate()` appends the saved ids 1..M (`wallet/logger/store.ts:92-105`); the ring is sized 1000 at construction (`:31`) and grows to 10 000 only when the loaded `debugMode` fires (`:177`); `applyRetentionPolicy` clears the whole ring (`:153`). Recon found one more path: the alarm shim (`index.ts:103-111`) can start the boot before the import lands, so a retention-off worker can import the old lines after retention settled.

## Outcome & Quality Bar

- **For whom:** a person whose browser storage fails once (a busy disk, a quota hit), and a developer reading the log viewer or exporting logs for a bug report.
- **Excellent:** after a failed read or write, nothing stored is lost: the next attempt succeeds once storage recovers, and every write is built on what is stored, never on a default that stood in for a failed read. The log viewer shows the previous lifetime's lines first, then this lifetime's, with unique, increasing ids and the boot's own failure lines kept.
- **Good enough:** a refusal under a storage fault uses an error path that a failed write reaches today; no new copy or screen.

## Assumptions

**Facts** (verified at `2575c86c4`; recon.md lists the line evidence)
1. `ValueStorage.get` lets an `area.get` rejection out raw and throws an untyped error on a decode failure; no caller inspects the type (`packages/wallet-core/src/storage/value-storage.ts:29-36`).
2. The seeder's marker root is a `SealedEntityStorage`, whose `get` reads every undecodable, MAC-refused or foreign row as `undefined`; it rejects only when `area.get` does.
3. `applyReceipt` and `clearInclusion` assign fields only, so a shallow copy is a full copy; `commit` re-files the object it gets.
4. No chain-purge subscriber reads the stale-network record or journal.
5. A rejected `config.load()` vetoes the boot; only the alarm shim retries it in that lifetime. A throw out of `TokenListService.start` fails the boot for the lifetime.
6. A failed `ConfigStore.set` already reaches a toast; `deleteToken` already rejects when the tombstone write fails (`token/seeder.test.ts:374`).

**Inferences**
- I1. A real `chrome.storage` rejection is never an instance of the new decode error, since the wrapper covers only the parse after `await area.get`, so the type alone tells the two cases apart.
- I2. Once `applyRetentionPolicy()` waits for the import in flight (D8), no reader can hold a log id before `rehydrate()` lands: the only `onLog` listener is built in `registerServices`, which the config leg holds back through its `.finally()`. So renumbering this lifetime's early lines changes no id a reader holds. (Round 1 showed it false without that wait: the alarm shim starts the boot on its own.)

**Asks:** none. Every behaviour follows the issues' Expected lines, which the owner promoted; no screen, copy or format changes.

## Decisions

- **D1. One arc** (the lane brief groups the four by the files they touch); the close-out is the PR's last commits.
- **D2 (#1462). Copy, then commit.** Under the tx lock and after the identity check, `updateTx` and `checkFinality` build `next = { ...tx }`, apply the receipt or verdict to `next`, and call `commit(next)`, which re-files `next` under its watch. A rejected write leaves the watched `tx` as it was, so the next poll or finality read sees the change again and retries; a stale poll still holding `tx` then fails the identity fence.
- **D3 (#1463). Purge, then drop the quarantine.** The `staleNetworks.withLock` block moves after `purgeChain` resolves and before `storage.delete(id)`, unchanged inside (journal first, then the entry). A failed purge keeps the journal, the entry and the row, so the chain stays quarantined and the delete can run again. If the block itself fails after a good purge, the row stays with its chain purged and the delete retries.
- **D4 (#1464). One typed error.** `ValueStorage.get` wraps a JSON or codec failure in `ValueDecodeError` (new, exported from `@nulo/wallet-core/storage`), whose message is fixed and carries no stored text; the original is its `cause`, which `trim` never logs (it projects `name` and `message`). A rejected `area.get` propagates as is. The rule for every store below: a read that failed never feeds a write; a value that was read and does not decode resets as today.
- **D5. Config: read, modify, write.** `set()`, under its lock, reads the stored config and decodes it with `decodeStoredConfig` (an undecodable value decodes to defaults). When the stored value of the key differs from the new one, it writes the decoded config with the key applied; when memory's value differs, memory then takes the key and fires `onUpdate` for it alone (persist first, as today). A failed read rejects `set()` and writes nothing. Memory adopts no other prop: an adopted prop's `onUpdate` can run a screen's action (Display settings opens the side panel and closes the popup on `sidePanel`, `display.vue:81-94`), so after a failed boot read memory stays on defaults until the next worker start, as today (a known limit). `load()` and `reset()` keep their behaviour. Rejected: `load()` rejecting (a one-off fault vetoes the boot, Fact 5); a `loaded` flag with one re-read (a recovery state with its own event order); adopting every stored prop at `set()` (final round: its events run screen actions, a UI-flow change); refusing every `set()` until the next boot (a transient fault blocks every preference for the worker's life). Cost: one storage read per preference change.
- **D6. Seeder: writers read strictly.** `readMarkerState` loses its catch, so only a failed read rejects (Fact 2). Writers fail closed: `deleteToken` refuses before it deletes; `onChainPurged` rejects, so `purgeChain` reports a partial purge and its caller retries (its "no partial purge counts as done" rule); a pass that cannot read aborts, and the next trigger (a list change, a network switch, an unlock, the next worker start) runs it again. `commitSeedResult`'s first read guards the token write; its second read follows it, so a failure there leaves the token stored without its `seeded` mark, as a failed marker write does today. The two read-only answers, `statusFor` and `verifiedSeeds`, keep today's empty fallback (a failed read answers as if no marker were stored, and verifies nothing), so no screen or dApp answer changes under a fault.
- **D7. Token list.** `readState` resets only on `ValueDecodeError`; a failed read rejects. `loadStored` returns no list on a failed read (it writes only after a read that found an envelope). `refreshIfDue` propagates (its callers log it). `doRefresh` reads the state before the fetch, so a failed read fetches and writes nothing and `refresh()` logs it. When no list is held, it first verifies and adopts the envelope in that same state, with no second read, through the verification `loadStored` uses (shared, not copied), so the stored sequence is the floor a fetched list must exceed and a replayed older list is refused. A list adopted there fires `onListChanged`; a stored envelope that no longer verifies is dropped as `loadStored` drops it today. Known limit: a refresh whose read fails creates no next alarm, so the next attempt waits for the next worker start or Terms acceptance; filed at close-out.
- **D8 (#1465). Import first, in place.** `rehydrate()` reads once per worker (memoized promise). It reads this lifetime's lines after its await, puts the saved entries first and those lines after them, renumbered after the saved maximum; the ring grows to hold both, and `nextId` follows. It records the highest imported id. `applyRetentionPolicy()` first awaits the import in flight, so retention never settles before the import and no reader exists before it lands (I2). It then resizes the ring to the loaded level's size; with retention off it drops only the entries up to the recorded id and purges the stored copy. Rejected: a "retention settled" flag that makes a late import add nothing (both legs: it works around the order); awaiting the import in `index.ts` or `bootRuntime` (untestable at module scope, or a second file for the same order).
- **D9. Comments and logs.** The config comment says an undecodable value is replaced at the next write; the seeder's doc names the two cases. Each file keeps its logging form (`{ error }`; the seeder's `{ category }`); the config store's positional `err` moves under `{ error }`.
- **D10. Tests** (each new failure-mode assertion red on the base and green after; each "never happens" check sits beside a success control in the same test):
  - T1 `transaction/service.finality.test.ts`: a first receipt Finalized and Success with the tx write rejected once; the next tick stores it, fires `onTransactionUpdated` once, and `waitForTx` resolves. T2, beside "a proven prune": the prune's write rejected once; past the next finality read, Pending is stored and the pending poll takes the row.
  - T3 `network/service.test.ts` beside `:2680`: a rejected PXE clear keeps the journal, the entry, the row and `isChainQuarantined`; the retry removes all three.
  - T4 `packages/wallet-core/src/storage/value-storage.test.ts`: bad JSON and a codec throw each reject with the decode error's name and fixed message (asserted by name, so the file loads on the base); a rejected `area.get` comes out as the same error object.
  - T5 `config/store.test.ts`: a failed boot read, then `set(theme)` with storage back, keeps every other stored prop in storage and fires `onUpdate` for `theme` alone; a `set()` of the value memory holds over a different stored value writes it; a `set()` of a value storage already holds while memory differs writes nothing, and memory takes the key with one `onUpdate`; a failed read inside `set()` rejects and writes nothing, and the next `set()` writes; controls: an undecodable value still resets, `reset()` after a failed boot read writes defaults.
  - T6 `token/seeder.test.ts`: a marker read rejected once makes `markDeletedByUser` and `onChainPurged` reject with the tombstones intact, and the retry lands; the commit's first read rejected once persists no token (the tombstone kept), and with an unrelated tombstone the next pass persists once; `statusFor` and `verifiedSeeds` on a failed read answer as today (controls); the corrupt-blob tests stay green.
  - T7 `token-list/service.composition.test.ts`: a failed read on an `unchanged` refresh keeps the stored envelope and fetches nothing, and the next refresh fetches; after a failed boot read, a refresh with storage back reads once, adopts the stored list, refuses an older signed list, and neither the stored envelope's nor the snapshot's sequence goes down; control: a failed boot read still starts.
  - T8 `logger/store.test.ts`: saved entries then live ones with unique increasing ids; retention off keeps this lifetime's lines and drops the imported ones; 2000 saved entries survive a debug load; two `rehydrate()` calls read once; with the read pending, `applyRetentionPolicy()` waits and then drops the imported lines.
- **D11. E2E: no new scenario.** A browser is no witness to a storage fault; units and compositions prove every path. The touched surfaces' files run as regression gates (Phase 2).

## Architecture & Implementation

| Files | Change |
|---|---|
| `wallet/services/transaction/service.ts` (+ tests) | D2 |
| `wallet/services/network/service.ts` (+ test) | D3 |
| `packages/wallet-core/src/storage/value-storage.ts`, `index.ts` (+ test) | D4 |
| `wallet/config/store.ts`, `wallet/services/token/seeder.ts`, `wallet/services/token-list/service.ts` (+ tests) | D5-D7, D9 |
| `wallet/logger/store.ts` (+ test) | D8 |

Simpler alternative considered for D4: callers test `instanceof SyntaxError`. Rejected: it reads a codec failure as an I/O fault the day a codec is added. No stored shape, message, permission or dependency changes, so no migration and no snapshot stamp.

## UI impact

None. No screen, copy, row or format changes, and no `onUpdate` fires that does not fire today. Under a storage fault, a preference change, a token deletion or a network deletion can now fail through the error path a failed write already reaches, where before it overwrote stored data (the issues' Expected lines). After a failed boot read the settings screens read defaults until the next worker start, as today; a change there no longer overwrites the other stored preferences. Seed rows and dApp answers keep today's fallback (D6).

## Security & Adversarial Considerations

- **Threat model:** stored values are written only by the extension's trusted contexts (`restrictToTrustedContexts`); a hostile or corrupt value still decodes as before (reset, never a throw on the boot path). The change removes writes; it adds none. No new value enters a log line; errors stay under `{ error }`, which `trim` projects to name and message.
- **Quarantine (#1463):** the account-address freeze rule holds through a failed delete: the chain stays quarantined until its purge completes.
- **Fail closed:** a persistent read fault now refuses writes instead of resetting tombstones, preferences or the list. A failed config read still settles log retention off (the privacy default) and purges the saved logs, as today. No permission, CSP, storage shape or dependency change. Known limits, filed at close-out: the price cache (recon.md), D7's unscheduled refresh, and the config readers that run on defaults for the rest of a worker whose boot read failed (privacy mode reads off meanwhile; already in the code).

## Phase 1: reproduce, then fix ✓

1. Add T1-T8; run them on the base code; require each new failure-mode assertion red and every control green. Commit (`test: …`).
2. Make D2-D9. Require T1-T8 green. Commit per issue.

**Gate:** `bun run lint`; `bun run typecheck:all`; `(cd apps/extension && bun --bun vitest run src/wallet/services/transaction src/wallet/services/network src/wallet/config src/wallet/services/token src/wallet/services/token-list src/wallet/logger --retry=0)`; `bun run --cwd packages/wallet-core test`; `bun run test:all`. Pass: every command exits 0; T1-T8's failure-mode assertions red before, green after.

## Phase 2: e2e regression and delivery ✓

Warning: `e2e:agent` writes its own build into `dist/<browser>`, so the network runs come first and the armed build follows them.

1. Network, Chrome then `NULO_E2E_BROWSER=firefox`: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/authwit-lifecycle.test.ts tests/e2e/network/default-token-seeding.test.ts --retry=0`.
2. Build armed: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`, then `build:firefox` with the same variables.
3. Smoke, from `apps/extension` with `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1`, Chrome then Firefox: `bun run test:e2e -- tests/e2e/stale-network.test.ts tests/e2e/settings-crud.test.ts tests/e2e/token-list.test.ts tests/e2e/viewers-csp.test.ts tests/e2e/sw-resilience.test.ts --retry=0`; record each browser's wall-clock (no scenario is added or changed, so no base timing is owed).

**Gate:** Phase 1's gate on the final head; steps 1 and 3 green at retry 0 on both browsers; `bun run check:plans` after staging. Pass: all green.

## Delivery

- Branch `w3-storage-1-a1` off this plan's commit. PR `fix(storage): a failed read or write never overwrites, strands or wipes what is stored` (82), base `dev`, ready, no label at creation, `Closes #1462 #1463 #1464 #1465`. Close-out as its last commits (single arc; no stack).
- Body: what changed and why, per issue; #1464's narrowed claim; runs and outcomes with each browser's wall-clock; ending `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Commits conventional, lower case, signed, ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Parallelism: one arc, no lanes.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../../README.md#post-implementation-standard) at `2575c86c4`. Specific here:
- Step 1 is absent (`code_review: off`). Step 2 runs once over `git diff <plan commit>...HEAD`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; one Opus 5.5 diff review (`general-purpose`) beside round 1. Prompts under `~/.cache/nulo-backlog/w3-storage-1/`. Hard stop at three rounds; each round in `lessons/phase-1.md` and the table below.
- Approval boundary (a plan change; stop): a retry loop, a timer, an alarm created on a failed read, or any read beyond D5's one inside `set()` and D7's adoption; a change to what any screen shows; a stored shape change; a fix to the price cache.
- Close-out: the Outcome; the three known limits filed and closed; the lessons line on rejected reads extended within the 8 KiB budget; `STATUS.md` deleted; `git mv` into `archive/`, index line moved. Teardown after the merge: `agent-worktree done w3-storage-1 --merged`, trunk `dev`; the archived plan is `implementations-plan/archive/w3-storage-1/plan.md`.

## Audit verdicts

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| plan 1 | Codex, gpt-6.1-sol (session 01a19e50) | reject | D7's rollback floor (a failed boot read left the floor at 0; adopt the stored list first); I2 false (the alarm shim starts the boot alone), so D8 orders retention after the import; D5's flag replaced by read, modify, write; D4's fixed message, codec and identity tests; D6's liveness wording narrowed; D7's unscheduled refresh as a known limit; "controls green on the base" | none |
| plan 1 | Opus 5.5 (Plan) | conditional approve | the same rollback; D8's wait inside `applyRetentionPolicy()` (testable in the store) over a flag or a module-scope wait; D5's no-op check against storage (a restore of a default value was lost); D6's purge rejection stated as intended and the seeder's log form; config readers on defaults as a known limit; T4 asserts by name; success controls beside each "never happens" check | D5's `loaded` flag (kept read, modify, write: no recovery state, one read per change); D5 and the fault-path screens as owner asks: D5 adds no state, and the read-only seeder answers keep today's fallback, so no screen reads differently |
| final 1 | Codex, gpt-6.1-sol, fresh (session 01a19e5d) | reject | round 1's three blockers verified resolved (D5's read-modify-write is the fix, not a recovery policy; I2 holds through the config leg's `.finally()`); new: adopting stored props at `set()` fires `onUpdate`, and `sidePanel`'s handler opens the side panel and closes the popup, so D5 now adopts only the key; D7 adopts from the same read, never a second one; T6 and T7 controls; Phase 2 runs the network files before the armed build | none |
| final 2 | Codex, resumed | **approve** | A and B verified resolved; the T5 case where storage holds the value and memory differs | none |
| arc 1 round 1 | Codex, gpt-6.1-sol (session 01a19e82) | conditional approve | T6's recovery control (the tombstone test cannot show the next pass persisting); the config log literal restored, D9 moving only the error under `{ error }` | none |
| arc 1 round 1 | Opus 5.5 (`general-purpose`) | conditional approve | the boot-order comment in `runtime.ts` made stale by D8; retention's wait swallows a failed import, as the entry point does, so a malformed saved run cannot veto the boot; the tombstone test proves its fault was consumed | a repeated `discarded` warn per refresh on `verify-unsupported` (at most daily, the outcome only) |
| arc 1 round 2 | Codex, resumed | **approve** | all five folds verified; non-blocking: the `runtime.ts` comment still said a rejected load leaves defaults, false when the write-back fails after the stored values are assigned (`config/store.test.ts`), rewritten | none |

## Seeds (not run; orchestrator-owned)

```
/goal Phases 1 and 2 of implementations-plan/w3-storage-1/plan.md marked ✓ with their gates passing in the transcript; the Codex loop (gpt-6.1-sol, high) converged; one ready PR against dev closing #1462 #1463 #1464 #1465; bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/w3-storage-1 per its plan.md and the README § Post-implementation standard at 2575c86c4: run the gates, decide open questions with Codex (gpt-6.1-sol, high), open the PR, never merge; stop once its checks are green and report.
```
