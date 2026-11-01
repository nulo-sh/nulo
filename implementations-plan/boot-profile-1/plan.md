---
plan: boot-profile-1
tier: light
status: closed (2026-11-01)
issues: "#1430, #1433"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex gpt-6.1-sol high review round trip + Opus Plan leg
base: origin/dev at 51ea220b1
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-11-01.
- **Status:** closed. One PR to `dev` closes #1430 and #1433; the orchestrator merges it.
- **Shipped:** `EventHandler.invoke` calls each callback subscribed when the dispatch starts and still subscribed at its turn (#1433), with three unit tests and a composition test of two unattended reset waiters. The boot resume finishes only the tombstones `init` found, taken once, and deletes only a row of the tombstone's `pxeGeneration` (#1430), with four tests. 29 chaos-model citations into the profile service renumbered, the model unchanged.
- **Gates:** lint, `typecheck:all`, `test`, `test:all` green; the chaos model test 30 consecutive runs at retry 0; smoke `wallet-lock`, `extension-restart`, `stale-network` at retry 0 on Chrome (75 s) and Firefox (111 s); no e2e scenario added.
- **Known limits:** none.
- **Open items:** none.
- **Lessons:** none promoted; `lessons.md` is at its 8 KiB budget, and the citation test names each stale line itself.
- **Seeds retired:** the `/goal` and `/loop` below.

# boot-profile-1: a deletion resume that can erase a restored profile, and an event bus that skips a listener

Two bugs from the bugs harden at `51ea220b1`, approved on decision page 94 (P94-01). #1430: the boot resume of pending profile deletions acts on a stale list and can erase a profile restored under a freed id. #1433: `EventHandler.invoke` skips the next subscriber when one removes itself, which can hang login on a never-opened stale network. One arc, one PR. Recon: [recon.md](recon.md). Every line both issues cite holds at the base.

## Outcome & Quality Bar

- **For whom**: a person who deletes a profile while the wallet starts and restores it from its backup; a person who logs in while the active network is stale and was never opened.
- **Excellent**: (1) the boot resume finishes only the deletions an earlier worker left, and never erases a row that is not the incarnation the deletion began on; (2) every subscriber present when a dispatch starts and still subscribed at its turn is called once, so both reset waiters end and login completes.

## Assumptions

**Facts**
- F1. The resume reads `validPayloads()` once (`profile/service.ts:1915`) and deletes the row under each id with no tombstone re-read (`:1919-1928`), then purges (`:1930`) and clears (`:1936`).
- F2. A live `deleteProfile` clears its tombstone and releases the id (`:1868`); a restore that keeps the backup's id refuses only a stored or reserved id (`:2494-2497`).
- F3. Only `clearTombstoneAndRelease` removes a tombstone (`:1945-1947`). Its callers are `deleteProfile` phase 3 and the resume. `deleteProfile` (and the torn-import reap through it) refuses a reserved id (`:1813`); restore and create skip one (`:2495`, `:1683`). The one other release, in `writeTombstoneHoldingLock` (`:1728-1736`), frees only the id that call just reserved, never a reserved one. Backup slices never write the tombstone root, and the sealed-root purge skips it (both legs checked). So a tombstone present at `init` is cleared by the resume alone.
- F4. `pxeGeneration` is minted fresh at every row creation, a same-id restore included (`profile/spec.ts:66-71`), and the tombstone carries the generation it erases (`tombstone-repository.ts:22-24`).
- F5. `init` already reads `validPayloads()` to hydrate deletion epochs (`service.ts:626-628`), before any session is restored; `deleteProfile` waits for `init` first (`awaitDeletionDelegate`, `:1553-1555`), so that read holds exactly the deletions a dead worker left.
- F6. `remove` splices the array `invoke` iterates (`packages/wallet-core/src/utils/event-handler.ts:40-48`); `runResetToEnd`'s `settle` removes its own `onChanged` from inside the dispatch (`composables/useStaleNetwork.ts:56-62`).
- F7. The popup has one `NetworkResetServiceClient` and so one client-side `onStaleNetworkChanged` (`utils/core.ts:106,121`; `network-reset/client.ts:19`); the worker joins a second `resetStaleNetwork` for the same network to the running flight (`network-reset/service.ts:264-268`).

**Inferences**
- I1. The login wedge in #1433 needs both stale reads (bootstrap and switch watcher) to land before either reset's admission. Plausible but unverified in a browser; the primitive is demonstrated by a unit test.
- I2. With the bus fixed, the bootstrap's and the switch's double run is correct as designed: the worker joins them and both waiters end on one event.
- I3. No subscriber in the tree depends on receiving an event that was in flight when it subscribed, or on running after its own removal (recon: no add-during-dispatch site).

**Asks**: none. Neither fix changes a screen.

## Architecture & Implementation

**#1430 (`apps/extension/src/wallet/services/profile/service.ts`).**
- Cause: the resume treats every tombstone at enumeration time as orphaned, including one a live `deleteProfile` in this worker owns, and acts on that read after other work ran.
- D1. `init` keeps the valid tombstones it hydrates as the resume's work list: a private field, which `resumeTombstonedDeletions` takes (reads and empties, before its first await) in place of a second `validPayloads()` read. A second call finds nothing, and the worker drops the deleted profiles' ids and addresses after one use. A deletion begun in this worker is finished by its own `deleteProfile`, or by the next boot's resume when its purge fails. This removes the issue's path and its twin, which D2 cannot stop: the resume's phase 1 queues on the facade lock before the live phase 3, the live purge ends (its single-flight entry leaves, `coordinator.ts:114`), the resume validates the still-current tombstone and starts a second purge, the live phase 3 frees the id, a same-id restore writes, and the second purge erases it (Codex R1 reproduced the order with the real `Lock`). The issue's own fix, a tombstone re-read under the lock, cannot stop the twin and, with D1, never fires: not taken.
- D2. Phase 1 deletes a row under the id only when its `pxeGeneration` is the tombstone's; another generation throws before any cleanup, so the catch logs it and the row, the tombstone and the reservation stay (fail closed). Defense in depth: under F3 only planted or corrupt storage reaches it. It states the invariant at the destructive step, as the torn-import reap's generation pin does (`:1696-1707`), at the cost of a hidden profile in that state.
- Unchanged: the tombstone shape (no stored-shape stamp), `clearIfSame`, the coordinator, the torn-import sweep, the integrity barrier and quarantine.

**#1433 (`packages/wallet-core/src/utils/event-handler.ts`).**
- D3. `invoke` iterates a copy of the subscriber array taken when the dispatch starts, and skips a callback that is no longer subscribed at its turn (`includes`). A subscriber added during a dispatch gets the next event, not this one. Membership is by function: a callback removed and re-added during the dispatch still runs at its old turn (DOM `EventTarget` would skip it; no caller does this). It also ends the same skip on `onDisconnected`, where `settle` removes `onGone`. `add`, `remove` and the error isolation are unchanged. The class doc states the rule in one sentence.

**Not taken** (ledger): the tombstone re-read (the issue's fix), which leaves the twin open and never fires beside D1; the Node `EventEmitter` rule (call a subscriber removed mid-dispatch), which runs a removed waiter; iterating a live `Set`, which still delivers to a subscriber added mid-dispatch; extending the chaos model (D5).

## UI impact

None. No copy, layout or row changes; login on a stale never-opened network ends as designed instead of hanging. Owner sign-off for the lane: P94-01 (signed 2026-11-01), under the owner's rule of 2026-10-30: "if they are bugs, work on them. all of them sound very worth fixing. Merge those on green, I review the captures if needed."

## Security & Adversarial Considerations

- **Threat model.** Stored rows are a trust boundary: a tombstone or profile row can be stale, misfiled or planted. A backup file is hostile input to restore; this plan does not widen what restore accepts. The change narrows what the resume may erase: only under a tombstone a dead worker left, and only a row of that tombstone's incarnation. A hostile backup may pick a generated-shaped id; restore still refuses a stored or reserved id, and after D1 nothing acts on an id once the resume frees it. Storage tampering is outside what this fix defends. Every refusal keeps the tombstone and the reservation (a hidden profile, never a lost one).
- **Ordering.** The generation check and the row delete sit in one locked section, the check right after the row read.
- **EventHandler.** No new input. The copy costs one array per dispatch.
- **Logging.** The refusal reuses the resume's existing `logError`; any new error text is fixed, with no profile data. Crypto, supply chain, permissions: no change.

## Phase 1: the event bus calls every live subscriber (#1433) ✓

- Change `invoke` as in D3.
- **Tests.**
  - Unit, `packages/wallet-core/src/utils/event-handler.test.ts`: (a) a subscriber that removes itself, the next one still runs (red at the base); (b) a subscriber removed by an earlier sibling in the same dispatch is not called, and its earlier siblings are (control); (c) a subscriber added during a dispatch gets the next event only. (a) and (c) are red at the base.
  - Composition, `apps/extension/src/wallet/services/network-reset/service.composition.test.ts`: a stale Testnet with no account row (never opened; `runsUnattended(view)` holds). Two `runUnattended` waiters, started without awaiting either, on a client whose `resetStaleNetwork` calls the real service and whose `onStaleNetworkChanged` is the service's own handler. The second call joins the flight; when the reset completes, both waiters resolve `true` before a bounded race (never a raised timeout), and the stale row is gone (real state). Red at the base: the second waiter never resolves.
- **Validation gate.**
  - `bun run lint`, `bun run typecheck:all`: exit 0.
  - `cd packages/wallet-core && bun --bun vitest run src/utils/event-handler.test.ts --retry=0`: green; (a) red with `event-handler.ts` from `51ea220b1`.
  - `cd apps/extension && bun --bun vitest run src/wallet/services/network-reset/ src/composables/useStaleNetwork.test.ts src/composables/useProfileBootstrap.test.ts --retry=0`: green; the composition case red with `event-handler.ts` from `51ea220b1`.

## Phase 2: the boot resume finishes only what it inherited (#1430) ✓

- Change `init` and `resumeTombstonedDeletions` as in D1 and D2; update both docs (the resume's doc names its work list and why).
- **Tests** (unit, `profile/service.integration.test.ts`, on `makeServiceFromExistingApi` and a delegate gated per id):
  - T1, two schedules on one setup: worker 1 leaves A's deletion pending; worker 2 restores B under `abc12345`, starts `deleteProfile(B)` and holds its purge, then starts the resume.
    - T1a, the issue's path: the resume holds on A's purge (asserted to be its first, since the base lists in insertion order); B's deletion finishes; B's backup is restored under the freed id; A's purge goes. B's restored row and its restore-pending marker remain. Red at the base.
    - T1b, D1's contract, which closes the twin: B's live purge stays held until the resume has finished A. The resume never runs a purge for B; B's own deletion then completes. Red at the base and without D1. The purge count is asserted before the gate opens; cleanup opens every gate.
    - Both: B's purge ran once, from `deleteProfile`; A's tombstone is cleared and A purged (control).
  - T2: an inherited tombstone over a planted row of another generation: the row stays, the tombstone stays, the id stays reserved, no purge ran; a second inherited tombstone in the same boot completes (control).
  - T3: the resume called twice with nothing between: the second call runs no purge (the purge count is unchanged). It passes at the base, which re-reads storage; it pins D1's take-once and fails with a list kept after use. No restore between the calls: a restored row would let D2's throw mask a kept list.
- **Validation gate.**
  - `bun run lint`, `bun run typecheck:all`: exit 0.
  - `cd apps/extension && bun --bun vitest run src/wallet/services/profile/ src/wallet/services/profile-deletion/ --retry=0`: green; T1a, T1b and T2 red with `service.ts` from `51ea220b1`; T3 red with the list kept after use.

## Arc gate (after phase 2)

- `bun run test`, `bun run test:all`: exit 0 at retry 0.
- From `apps/extension`: `bun run test:e2e -- tests/e2e/wallet-lock.test.ts tests/e2e/extension-restart.test.ts tests/e2e/stale-network.test.ts --retry=0`, then the same with `NULO_E2E_BROWSER=firefox`: pass. No e2e scenario is added.
- `bun run check:plans` after staging: exit 0.

## Decision ledger

- D1-D3 as above; D2 settled in the Panel verdicts below. D6, as built: the profile service's moved lines shift 29 line citations in the chaos model (`tests/e2e/helpers/profile-chaos/model.ts`); each is renumbered through the diff with its fragment re-checked, no clause changed. D4: the login hang is pinned by a composition test on the real reset graph, not by `useProfileBootstrap.test.ts`, whose `managers` are mocks. D5: the chaos model is not extended; the unit tests hold the race deterministically, and a model change costs a 30-run gate for no failure mode they miss.

## Panel verdicts

| Round | Verdict | Accepted | Rejected |
|---|---|---|---|
| Codex R1 | conditional approve | T3 is green at the base, so its gate changes; D1's twin is real (reproduced with the real `Lock`), so T1 gains a schedule only D1 passes and D2 stops claiming it; D3's membership is by function, not DOM-exact | none |
| Opus R1 | conditional approve | D1 takes its list once; T1b pins D1's contract; T1a asserts its listing order; F3 names the second release site; the `Set` wording; (c) red at the base; the waiters start unawaited and the wait is a race | dropping D2's row check (see D2 below) |
| Codex R2 (resumed, final) | conditional approve | T3 runs its two calls back to back (D2 masked a kept list); the take happens before the first await; T1b asserts the count before the gate opens; recon's reuse map updated | none |
| Codex R3 (resumed) | approve | none | none |
| Codex fix R1 (arc 1) | approve | `twoChains`' doc back on `twoChains`; `staleTestnet`'s doc says "no account rows" | none |
| Opus fix R1 (arc 1) | approve | the same two docs; `invoke`'s doc names which removals a dispatch honours | none |
| Codex fix R2 (arc 1, resumed) | approve | none (verified the 29 renumbered chaos-model citations leave the model identical) | none |

D2, argued: Opus held that both of D2's checks are unreachable beside D1 and that the row check adds a hidden-profile state with no recovery; Codex held the row check is justified at the destructive step. Taken: the tombstone re-read goes (unreachable beside a take-once D1, and it never stopped the twin); the row check stays, labelled defense in depth. It is one comparison, it mirrors the torn-import reap's existing generation pin, and the lane brief asks that a resume prove the row it erases is the deleted incarnation. The hidden state it can leave needs planted storage, and the base behaviour there is erasing a row of an unknown incarnation.

## Delivery

- One arc: branch `worktree-boot-profile-1`, one PR to `dev` with `gh pr create`, opened ready after the Codex loop converges and the gates pass, with no labels.
  - Title: `fix(profiles): a boot resume erases only its own deletions, and no listener is skipped` (86 characters).
  - Body: both changes and their guarantees, the gates with outcomes, the owner's sign-off quote, `Closes #1430`, `Closes #1433`.
- Close-out as the PR's final commits: the Outcome block, lessons promotion, `STATUS.md` deleted, `git mv` into `archive/boot-profile-1/` in its own commit, the index line moved.

## Post-implementation

Execution contract: `implementations-plan/README.md` § Post-implementation standard at `51ea220b1`, with these values:

- Step 1 is absent (`code_review: off`).
- Step 2, once over the arc's diff from `51ea220b1`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`. Both verbatim rules and the adversarial ask in every prompt. One Opus `general-purpose` review beside round 1. Hard stop at three rounds.
- Steps 3 and 4 as written, with the close-out per Delivery.
- Step 5: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/boot-profile-1/plan.md`, then `agent-worktree done boot-profile-1 --merged`. The orchestrator's session notices the merge.
- Three failures on one step end the arc as `ARC_FAILED`.

## Seeds (not run; orchestrator-owned)

- `/goal` Phases 1 and 2 ✓ in implementations-plan/boot-profile-1/plan.md, each gate and the arc gate passing in the transcript; the Codex loop converged (a resumed pass with no new material point, quoted); a ready PR to dev closing #1430 and #1433; `bun run test` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/boot-profile-1 from plan.md and lessons/: the next unchecked phase, its gate, the Codex loop, delivery, close-out; never merge.
