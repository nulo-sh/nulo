# test-infra-1: phase 8 (the remaining waits)

## Consult: what a drain may become (Codex, gpt-6.1-sol, high, 2026-10-19)

The plan says each `wallet-sdk/background.*` drain moves "to the awaited callback or the reached signal it stands for". Most of those drains follow a `void` callback (`onPendingDiscovery`, `onWalletMessage`, an `EventHandler.invoke`), so the question was what counts as a cause. Verdict: `approve with changes`. Taken:

- Choose a boundary by what it covers, not by a fixed order: a promise the driven path returns (`onSessionEstablished`, `handleWalletMessage` when the test calls it), a pass-through spy on a cross-module export on the real entry path (`handleDiscovery`), or a reached signal on the step that IS the asserted effect, armed before the trigger and matched on its invocation.
- `handleDiscovery`'s promise excludes its detached branches (`autoApproveExistingSession`, `rejectThrottled` return `void`), and an awaited bus dispatch does not await work a listener starts without returning it.
- A "not yet" or "never" assertion needs a boundary that settles after every path that could do the forbidden thing has decided; entry into a wait is not one (a missing-`await` mutation passes it). Without such a boundary the drain stays, with its reason.
- A drain after a synchronous drop guards a delayed-forward regression; a later valid message is a success control, not a completion barrier (the content wrapper has no async FIFO).
- No "settle everything" helper (a renamed guess).

The per-site rules the migration followed are this consult's, applied file by file; every kept drain is listed in the PR body with its reason.

## Result per file (unit drains)

Counted sites are guessed turn loops (`for (…) await Promise.resolve()` and the `flush` / `settle` helpers over them). Boundary kinds follow the consult: (a) a promise the driven path returns, (b) a pass-through spy's result on the real entry path, (c) a reached signal on the step an assertion reads, (d) a watch on the asserted Vue ref.

| file | sites | moved | kept | tests |
|---|---|---|---|---|
| `background.connect-window` | 121 | 56 | 65 | 58 = 58 |
| `background.admission` | 28 | 11 | 17 | 12 = 12 |
| `background.origin-admission` | 5 | 0 | 5 | 6 = 6 |
| `background.reset-wait` | 4 | 0 | 4 | 4 = 4 |
| `background.unserved-chain` | 25 | 5 | 20 | 16 = 16 |
| `background.verify-reservation.pins` | 3 | 1 | 2 | 6 = 6 |
| `background.transport` | 17 | 1 | 16 | 25 = 25 |
| `useArrivals` | 65 | 11 | 54 | 64 = 64 |
| `dapp-send-executor` (the `addTransaction` test) | 2 | 1 | 1 | 161 = 161 |

Of 270 drains, 86 moved and 184 stay. A kept site whose block has a positive read too keeps the awaited boundary before its drain, so the positive is ordered by its cause.

- **The rule that decided most sites.** A discovery run or a send's handling settles when its refusal, queueing or approval is decided, so a "never" read after it misses an effect a regression defers past the decision; the old drain catches a deferral within its turns. The first pass moved such reads onto the run and was wrong there: the fresh cross-arc review demonstrated it in memory (a ten-reaction deferral passed the new reads and failed the old), and a scan of every moved drain put the drain back wherever a negative read (`.not.`, an empty list, `toHaveBeenCalledTimes`, `false`, `undefined`, `0`) follows the boundary: 49 sites, after 2 restored by hand. An exact list is a negative too (nothing else ran): 26 more came back where one, or a negative the scan missed, follows the boundary. Drains deleted before an action, not a read, stay deleted: a deferral past them lands inside the next read's drain or fails the next action.
- **Proofs.** Each file and boundary kind has a production mutation that delays the cause past the old drain (64 to 400 turns): old red, new green; every other moved positive site has a one-line argument why its boundary cannot settle before the cause. Every moved negative site had a mutation firing the forbidden effect one to ten turns after its decision, and the new test failed wherever the old one did; a one-to-ten-turn probe placed at the decision point does not test a deferral past the run's settling, which is why the rule above put 77 drains back. Logs under `~/.cache/nulo-backlog/test-infra-1/arc4/w{1,2,3}/`.
- **Why so many stay.** A drain before a "not yet", a "never" or an exact call count (`toHaveBeenCalledTimes(n)` also says "never again") stays unless a completion covers every path that could break it. In `useArrivals` the reads, claims and snacks run off `void` listeners, so 54 sites have nothing to await; in `background.transport` the content wrapper drops synchronously and nothing completes after the drop. Each kept helper carries one line saying what it guards.
- **Limits of the proof.** The negative probes defer by one to ten turns; a deferral longer than a run's own turns but under the old 20–60 turn drain would have failed the old test and can pass the new one. Three admission and unserved-chain sites now await a run or a fourth notice, so a regression that parks the discovery fails by test timeout instead of at the assertion. Both are recorded here rather than worked around: a longer probe or a deadline is what the rules forbid.
- **Stricter where it moved.** In `background.connect-window`, an extra-close mutation showed that awaiting only a twin discovery's run missed the first discovery's `finally`; those sites await both runs. Deleting a drain after a synchronous `lock` lets the stale-write tests catch a deferred-lock regression the old file passed.
- **One stricter test.** With the state read delayed 80 turns, `useArrivals`' "a state read that started before the snack's claim does not replay that receipt on Home" fails where the old one passed: the old `settle` let the held read catch the wrong call, so under that delay it never tested its scenario.
- **`discoveryRun`.** Six suites await a discovery's run through one reader, `wallet-sdk/discovery-run.harness.ts`. Each suite still declares its own pass-through `vi.mock("./discovery-flow")`, because `vi.mock` is hoisted only within the file that calls it.
- **`deferred` copies.** `FeeSettingsCard.test.ts`, `send.integration.test.ts`, `background.unserved-chain`'s `held()`, `background.reset-wait`'s hand-rolled reset promise and `useArrivals`' `hold()` signal now use `deferred` from `@nulo/wallet-core/utils`.

## e2e loops

No hand-rolled deadline loop had entered the e2e tree since arc 2's inventory (rechecked against this branch and `origin/dev`). The loops arc 2 held back moved to `pollUntil`, each with its interval, budget and terminal failure kept:

- `fixtures/profiles.ts`: `expectNewProfileNamed` (its probe throws on a wrong extra profile, terminal as before) and `waitForProfilePurged` (catches `PollTimeoutError`; its diagnostics stay).
- `fixtures/tokens.ts`: `waitForFreshBalanceRow`, the refresh in `between`, the census after a caught timeout.
- `helpers/legal-drivers.ts`: `waitUntilStill`, a stateful sample counting unchanged reads; on timeout it returns at two unchanged reads, else throws "still moving", as before.
- `network/same-token-concurrent-sends.test.ts`: `waitForAwaitingCard` in two phases (first sighting within 30 s, then the rest of the 10 s hold measured from that sighting), the dApp record's held wait, and `waitForAskOrSent`.
- `network/auto-lock-defers-while-proving.test.ts`: the lock wait, which arc 2's inventory had missed.

`chrome.ts`'s `stopBackground` stays: it is a stop protocol with an outside timer, the shape arc 2 kept for `endObserved`.

## Shared-worktree incidents

- A mutation command's restore copy used a path relative to the repository root after a `cd apps/extension`; it failed silently and three mutations of `incoming-transfer/repository.ts` stacked from 11:08 to 11:13:45 UTC. Every agent's runs in that window were re-run. The command shape now uses absolute paths and ends with a `git status --porcelain <file>` that must print nothing.
- `bun run baseline:complexity` reads the whole tree; run without the lock, it read a production file mid-mutation and wrote "JUSTIFICATION REQUIRED" records. A whole-tree generator takes the exclusive lock, like a mutation.

## Review rounds

- Codex round 1 (`approve with fixes`) and the Opus diff review (`approve with fixes`) found two loosened bounds: a stage card sampled past its 30 s or 10 s bound passed on `pollUntil`'s last read, and one admission "not yet" awaited a run that settles while its reconnect waits in the queue. Both are back to the old strictness; the plan's ledger has each finding and its disposition.
- The fresh cross-arc review (three rounds `approve with fixes`) found the rule above: a refused send's handling and an insecure discovery's run settle at the decision, and a ten-reaction deferral passed the new reads; its third round extended it to exact lists. Every round's fixes are in the plan's ledger.
- The lesson for the next move onto `pollUntil`: a loop that checked its deadline before reading the value refuses a late success, which `pollUntil` accepts on its last read; keep that check in the probe. A discovery's run covers its own decision, never a slot release or an unlock that later approves what it queued.
