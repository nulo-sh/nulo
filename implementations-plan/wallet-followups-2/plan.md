---
plan: wallet-followups-2
tier: mid
status: arc-1 in progress (orchestrator approved the plan at 79217e4)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 Explore agents (sonnet) plus the driver's own reads; dual audit (Codex gpt-6.1-sol high + Opus Plan); one final fresh Codex pass
base: origin/dev at 29d9e49
trunk: dev
issues: [283, 288, 289, 291]
---

Live progress: [STATUS.md](STATUS.md). Owner questions: [OWNER-ASKS.md](OWNER-ASKS.md). Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Tier and budget

`mid`, set by the orchestrator. Rubric: blast radius moderate (Send's token card, the logs window, the fee card's notice and the balances store's retry loop), security sensitivity low (no keys, no signing path, logging policy unchanged), novelty low, irreversibility low, migration cost none, external coupling low. No HIGH: `mid`. One arc, one PR against `dev` (the orchestrator's standing D-orch-1: no stack). Post-implementation hardening is not scheduled.

## Issue map (the arc that closes each issue)

| Issue | Arc | Closes when |
|---|---|---|
| #283 Send: deleting the selected token | arc-1 (Phase 1) | arc-1 merges |
| #288 logs from five services leave the logs window | arc-1 (Phase 2) | arc-1 merges: every registered service is listed and kept. The sources that are not registered service names (the price service's own `"PriceService"` helper among them) are a separate issue the implementer opens (OA-1) |
| #289 a failed Clear logs stops the window | arc-1 (Phase 3) | arc-1 merges |
| #291 fee card claims a gas retry that is not running | arc-1 (Phase 4) | arc-1 merges |
| #262 lockless chain sweep can delete reused token ids | no arc | waits on tokens-and-balances arc 1 (#271) |
| #277 reset or delete stalls while the node is unreachable | no arc | waits on page 7 P7-09 |
| #290 account import accepts a duplicate name | no arc | labelled `owner-decision` |

## Scope

In:
- Phase 0: curate `implementations-plan/lessons.md` (8,164 of 8,192 bytes) so later close-outs can promote lessons.
- #283, #288 (every registered service listed, with a fail-closed drift pin), #289, #291.

Out, each with its reason:
- ~~The sources that are not registered service names~~: moved into the arc as Phase 2b by the orchestrator's D-orch-3 (OA-1 option (a), lines only).
- Coordinator log lines that pass `String(error)` (`account-integrity/coordinator.ts:83,176`), a form the logging policy's redactor cannot see into: an existing line, already in the window at open and in the CSV export; the fix (pass `{ error }`) is a logging-policy change outside these issues. The implementer opens one issue for it at delivery (dedupe first).
- The dead filter rows (`faucet`, `rpc`, `wallet-sdk-client`): removing a row is a visible change nobody asked for. The `owner-decision` issue opened at delivery carries only that question (D-orch-3).
- The other `(BUG PIN)` in `send.test.ts` (a delete during the identity fetch's contacts read, `:1094`): a different defect, outside this lane's issues.
- `IMPORTED_KEYS_SERVICE_NAME`'s misleading name: it is a backup slice key, and the backup code belongs to the backup-import-export lane.

## Outcome & Quality Bar

For whom:
- A person on Send who deletes the selected token in another window (a second popup, the side panel).
- A person, or the owner triaging a bug report, reading the logs window after changing a filter or clearing it.
- Any surface that puts a `retry` and a `txRefresh` subscriber on one balances key. No production surface does today (I2); the shared-key composition test reproduces the stuck notice, so this is a store-invariant fix.
- The next lane that closes a plan and needs room in `lessons.md`.

What excellent looks like:
1. Send never sits on an empty token card after a delete: it moves to the first remaining token, the same token the page picks when its saved token is gone at open; with no token left it shows the existing toast and leaves.
2. Every line a registered service writes stays in the logs window through every rebuild and arrives live; a new service that is not listed fails CI before it ships.
3. A failed Clear logs leaves the window receiving logs as before the click. Lines written while the failed clear was in flight stay in the buffer and show at the next open (and in that window's CSV export).
4. A retry-capable subscriber never sits on a degraded gas slice with no retry: the fee card's "Retrying in the background." is true whenever it shows, and clears when the retry lands.
5. `lessons.md` loses no reachable dead end and gains room for one promotion of average length.

Good enough: no new words, rows beyond the registered services, states or screens; no new e2e (the component and store layers reach every changed branch, and no e2e opens the logs window or deletes a token under an open Send).

## Architecture & Implementation

### Phase 0: lessons curation

Shorten the ten entries whose evidence carries a clause they repeat, and fix one stale figure; leave the other 24 untouched. Keep every entry, every link, the six sections and their order. The exact edits are the table in Phase 0. Measured on the base file: 8,164 → 7,926 bytes (−238), which leaves room for one promotion of average length. The 7 KiB target (7,168) is out of reach without loss: a first draft that reworded 20 entries reached 7,647 B and still dropped three claims (Codex round 1), and no entry passes the retirement rule: each dead end is still reachable, including the one entry `CI.md` § Concurrency restates whole (recon § Lessons file). Reaching 7 KiB would take a decision this lane cannot make: retire reachable entries, or raise the 8 KiB budget the plans gate enforces (D1).

### #283: Send keeps a selection after a delete

`onTokenDeleted` (`apps/extension/src/popup/pages/send.vue:116-131`) reads `wasActive = activeToken.value?.id === token.id` before the splice and branches on it:

```js
function onTokenDeleted(token) {
	const idx = tokens.value.findIndex((t) => t.id === token.id)
	if (idx === -1) return
	const wasActive = activeToken.value?.id === token.id
	tokens.value.splice(idx, 1)
	if (!wasActive) return
	if (tokens.value.length) {
		cacheStore.activeTokenIdx = tokens.value[0].id
		return
	}
	openToast({ kind: "success", label: "The last token has just been deleted" })
	leaveSend()
}
```

"Next token" is `tokens.value[0]`, the rule the handler was written with and the rule the identity fetch uses when the saved token is gone (`send.vue:604-606`). The `activeTokenIdx` watcher (`:488-496`) already closes the review sheet and re-validates the send and receiver types.

### #288: every registered service in the source filter

The cause: `LOG_SOURCES` (`apps/extension/src/components/JsonViewer/useLogFilters.ts:5-31`) is a list of string literals that nothing ties to the services the worker registers, and `isLogInclude` refuses any source without a row. The fix is the missing rows plus a pin that derives the required set from the registrations, so CI refuses any registered name the list lacks:

1. **The missing rows.** `LOG_SOURCES` stays a literal list in today's order. `price`, `incoming-transfer`, `operation-journal` and `legal-acceptance` join the `flatMap` list after `passkey`, the place the last added service went, so each gets its `-client` row. `account-integrity-coordinator` and `profile-deletion-coordinator` join the `.concat` list ahead of `wallet` and `ui`, with no `-client` form, since neither has a popup client. `faucet`, `rpc`, `wallet-sdk`, `wallet` and `ui` stay.

The drift pin, `apps/extension/src/components/JsonViewer/useLogFilters.scan.test.ts`, starts from the registration sites, not from declarations, so it fails closed: a registration it cannot resolve to a name is a failure, never a skip.
- **Registration sites.** `apps/extension/src/wallet/runtime.ts` (`registerServices`) and `packages/aztec-runtime/src/offscreen/entry.ts` (`createPxeOffscreen`). For each `services.add(<arg>)` (the argument may span lines), the class is `<X>` when the argument is `new <X>(…`, or the class of `const <arg> = new <X>(` in the same file when it is an identifier. Any other argument shape fails the test, naming the line.
- **Class to name.** The scan roots are `apps/extension/src` and every `packages/*/src`, enumerated the way `apps/extension/src/utils/log-payload-ban.test.ts:35-48` does, non-test `.ts` files only. Each class must have exactly one `export class <X>` declaration, holding a `static (readonly )?name = <CONSTANT>` member (all 26 do today), and must log under the same constant: its file passes `<CONSTANT>` as the first argument to `super(` (24 services, `base-service.ts:48-49`) or assigns it to its instance `name` (the two coordinators). The constant must have exactly one `export const <CONSTANT> = "<value>"`. A missing or duplicate declaration, a disagreeing log name, or a non-literal value fails the test.
- **Client rows.** A service has a `-client` row when some client file calls `super(<CONSTANT>, …)` (the client's source is `<value>-client`, `packages/extension-messaging/src/core/base-client.ts:98`). A client constructed with a custom `name` (every client forwards one, `price/client.ts:15`; none is passed today, F4) is a new source the pin cannot see; OA-1 covers such sources.
- **The assertion.** Every resolved service name, and every client name, is in `LOG_SOURCES`; the failure lists the missing ones.
- **Success control.** In each registration file, the number of `services.add(` openers (a plain substring count) equals the number the scan resolved or refused (25 in `runtime.ts`, among them identifier arguments and the multiline `IncomingTransferService`; 1 in `entry.ts`), so a call the parser skips fails instead of passing. The refusal branch has no real instance, so one inline source string with an unsupported argument goes through the same resolver and must fail.

A new `services.add` of an unlisted service fails CI; a renamed service fails it until its row follows; an unusual registration shape fails loudly until the scan learns it.

### OA-1 (a): every line under the service that owns it (Phase 2b)

The cause is the one #288 has: a source is a free string nothing ties to the row list. Recon found it wider than the five services, and the 2b inventory (an Explore sweep, re-checked by both auditors) found 20 sources that reach the logger with no row. The rule, in three clauses:

1. Code in a service's directory logs under that service's exported name constant (`*_SERVICE_NAME`), whoever calls it.
2. A generic primitive outside any service directory logs under a source its constructor's caller must pass; no primitive keeps a default source.
3. Code only the composition root builds logs under `wallet`; the dApp handler's code under `wallet-sdk`.

| Source today | Lines (sites) | Files under | Mechanism |
|---|---|---|---|
| `PriceService` | 4 | Price | the private `log()` helper and its constant go; the service calls the base's `logWarn`/`logDebug` (CLAUDE.md § Logging policy: services call `this.log*`) |
| `SendCheck`, `JournalGC`, `JournalReaper` | 12 | Operation Journal | `const LOG_SOURCE = OPERATION_JOURNAL_SERVICE_NAME` |
| `operation-journal:transition` (Lock) | Lock lines | Operation Journal | the Lock is named `OPERATION_JOURNAL_SERVICE_NAME` |
| `ContractResolver`, `TxRequestBuilder`, `batched-view-simulation` | 13 (+19 via a helper) | Execution | `LOG_SOURCE = EXECUTION_SERVICE_NAME` (directory owner; Token and Token Balance also call two of them) |
| `SessionManager`, `session-artifacts` (Lock) | 28 + Lock lines | Profile | `LOG_SOURCE = PROFILE_SERVICE_NAME`; the Lock takes `LOG_SOURCE` |
| `TokenSeeder` | 6 | Token | `LOG_SOURCE = TOKEN_SERVICE_NAME` |
| `balance-job-queue`, `balance-projector` | 6 | Token Balance | the unused `logSource` parameter goes; module constant `TOKEN_BALANCE_SERVICE_NAME` |
| `background-ticker` | 1 | Token Balance | `ClockTickerAdapter` takes a required logger and source; `TokenBalanceService` passes `TOKEN_BALANCE_SERVICE_NAME` (a constant: the default parameter runs before `super()`) |
| `wallet-sdk-bg` | 18 | Wallet Sdk | the literal `"wallet-sdk"`, as its 41 sibling sites already log |
| `window-manager` | 5 | Wallet | the literal `"wallet"`; `createPlaced` keeps its source parameter (two callers, two sources) |
| `offscreen-telemetry` | 1 | Pxe Client | `LoggingTelemetrySink` takes a required source; `BaseServiceClient.clientName` becomes `protected` and the client base passes it |
| `nulo-v1` | 3 | Account | `NuloAccount.new`/`fromSigningKey` (and the private `fromKeys` and constructor) take a required `logSource` after the logger; the logging-only `name` field goes; `AccountService` passes `this.name`, the integrity coordinator its own constant |
| `pxe[<profile>:<chain>]`, `pxe-barrier[<profile>]` (guards) | 1 | Pxe | both guards are named `PXE_SERVICE_NAME` |
| `artifact-registry` (dead default) | 0 in prod | Pxe | the `logSource` option goes; the registry logs under `PXE_SERVICE_NAME` |

Silent and left alone: `new Lock("wallet-sdk-bg:queued-creation")` and `new Lock("token-balance", undefined, null)` pass no logger; both `KeyedLock`s pass neither name nor logger. What a person sees: no new row, no new label; the lines of these sources stay in the window through every rebuild and append live under the rows above; the CSV source column carries the owner's name (accepted with OA-1 (a)). Two labels leave the record: the Lock labels `session-artifacts` and `:transition` (each owner has one logging Lock) and the guard key on one Error line written after a reader is stuck 90 minutes (D13).

**The pin.** `useLogFilters.scan.test.ts` gains a source scan over the same roots (`.ts` and `.vue`, tests excluded):
- Every `logger.log(` / `logger?.log(` call (receiver ending in `logger`, so a class's private `log` helper or the logger client's `shared.log` is not read as one), and every `this.log{Debug,Info,Warn,Error}(` in a file that declares a `static name`, resolves its source: a string literal; an identifier through a same-file `const` to a literal or to an exported constant (`constantValue`); `this.name` through the file's `static name` constant; a base class's own name (`BaseService`'s `this.name`, `BaseServiceClient`'s `this.clientName`), which the registration pin proves; or one of the primitives' parameters (`Lock`, `KeyedLock`, `ReadWriteGuard`, `createPlaced`, `LoggingTelemetrySink`, `ClockTickerAdapter`, `NuloAccount`), resolved at every site that supplies it, in the supplying file. A site that passes no logger never logs and is skipped; a site that passes a logger and no source, a template literal, or any other shape is refused with its `file:line`.
- **A.** Every resolved source is a `LOG_SOURCES` row and nothing is refused.
- **B.** One row per mapped source class (`test.each`): the file that writes it (or supplies its source) resolves to exactly `{owner}`. Each row is red on base.
- **C.** The resolver refuses a template-literal source, an unknown identifier and a logger-passing site with no source.
- Behavioural pins, updated in place and red on base: `queued-journal.test.ts` (`wallet-sdk`), `seeder.status.test.ts` (`token`), `offscreen/client.test.ts` (the default sink logs under the client's own name).
- What it cannot see: aliasing (`logger.log.bind`, `logger["log"]`, a logger stored under another name), sources from files outside the roots, and whether a future helper's row is the RIGHT owner (A proves "a row", B pins today's owners).

### #289: Clear logs keeps the window live on failure

`handleClearLogs` (`apps/extension/src/components/JsonViewer/LogsViewer.vue:149-161`) re-adds the listener in a `finally` around the `clearLogs()` call only, so the success path keeps its order (listener back before `logs.value = []` and the `nextTick`) and a rejection re-adds it too. `EventHandler.add` ignores a callback it already holds.

```js
async function handleClearLogs() {
	logViewerService.onLog.remove(onLogAdded)
	try {
		await logViewerService.clearLogs()
	} catch (err) {
		openToast({ kind: "error", label: "Failed to clear logs" })
		console.error(err)
		return
	} finally {
		logViewerService.onLog.add(onLogAdded)
	}
	logs.value = []
	await nextTick()
	updateEditorContent()
}
```

### #291: a forced gas failure under a retry-capable subscriber starts the retry

The cause: the store has one rule, stated at `adoptGasRetryDebt` (`apps/extension/src/stores/balances.store.ts:578-589`), that debt follows the observing cause: a forced (tx-settle) failure creates no debt by itself (D11), and an ensure that observes the failure with a retry stake adopts the debt and arms the loop. The tx-settle path (`onTransactionSettled`, `:651-660`) has an observer with a retry stake whenever a retry-capable subscriber holds the key (a fee card sharing it with a gas card), but it never applies the rule. So the slice stays degraded with no debt and no timer while the fee card, woken by its FPC leg's recovery, says a retry is running.

The fix applies the same rule at the other place a forced failure lands. After the tx-settle forced fetch settles, if the key's subscriber union still has `retry` and the epoch is unchanged, the store calls `adoptGasRetryDebt(key, entry, union.legs)` and then `scheduleRetry(key, scope)`:

```ts
private readonly onTransactionSettled = (tx: { account: string; status: unknown }): void => {
	if (tx.status === TxStatus.Pending) return
	for (const [key, subs] of this.subscribers) {
		// ...unchanged guards...
		const epoch = this.epochOf(scope.profileId)
		void this.fetchGas(key, scope, epoch, { cause: "forced", forceRefresh: true }).then(() => this.adoptForRetrySubscribers(key, scope, epoch))
	}
}

/** The tx-settle path's observer: a retry-capable subscriber on the key has a stake in a forced failure. */
private adoptForRetrySubscribers(key: string, scope: BalanceScope, epoch: number): void {
	if (this.epochOf(scope.profileId) !== epoch) return
	const union = this.capsUnion(key)
	const entry = this.entries.value[key]
	if (!union.retry || !entry) return
	this.adoptGasRetryDebt(key, entry, union.legs)
	this.scheduleRetry(key, scope)
}
```

`gasFailureEntry` and its D11 comment stay; the comment on `adoptGasRetryDebt` names both observers. A key with only `txRefresh` subscribers (the gas card alone) is unchanged: no debt, the D11 pin at `balances.store.test.ts:387` stays green. `scheduleRetry` is a no-op when a timer is already armed, so an FPC retry in flight picks up the gas leg on its next run (`retryLegsFor` reads debt per leg).

What a person would see on a surface with both subscribers: the notice keeps its words and is backed by a running retry (5 s, 10 s, 20 s, then every 30 s while the fee card is mounted) and clears when it lands; the gas card shows its existing refresh dot during each retry read and leaves its dimmed state when one lands; a fee card re-commits on the fresh figure. All are existing states. No production surface mounts both today (I2), so nobody sees this now; OA-2 asks the owner to confirm the reading.

The shared key stays (D4). `FeeSettingsCard.vue:465-470` asks that no subscriber on its key refresh on tx-settle while it is mounted, because a settle can outrank its own forced mount read. Where its mount read is not forced (F10), its ensure commits whatever gas read it observes, settle or no settle, and a forced read by another subscriber changes only the store, never the card's committed snapshot (`retryVersion` alone wakes it). So with or without a `txRefresh` subscriber on the key, the card commits the same figure; splitting the key buys it no freshness. The fix adds one: a gas retry that lands bumps `retryVersion` and re-commits the card on a fresh figure. The continuation reads the key's caps union, as the retry loop already does (`retryLegsFor`, `scheduleRetry`).

### File-level change map

| File | Change |
|---|---|
| `implementations-plan/lessons.md` | Phase 0 edits |
| `apps/extension/src/popup/pages/send.vue` | `onTokenDeleted` reads `wasActive` before the splice |
| `apps/extension/src/popup/pages/send.test.ts` | the active-token `(BUG PIN)` becomes the fixed behaviour; one last-token case |
| `apps/extension/src/components/JsonViewer/useLogFilters.ts` | ten new `LOG_SOURCES` rows |
| `apps/extension/src/components/JsonViewer/useLogFilters.scan.test.ts` | new: the drift pin |
| Phase 2b: `price/service.ts`, `operation-journal/{send-check,gc,reaper,service}.ts`, `execution/{contract-resolver,tx-request-builder}.ts`, `execution/helpers/batched-view-simulation.ts`, `profile/session-manager.ts`, `token/seeder.ts`, `token-balance/{balance-job-queue,balance-projector,service}.ts`, `core/adapters/clock-ticker-adapter.ts`, `wallet-sdk/{background,session-established,session-revocation,profile-switch-teardown,queued-journal}.ts`, `window-manager/window-manager.ts`, `account/service.ts`, `account-integrity/coordinator.ts` (all under `apps/extension/src/wallet/services/` but the adapter); `packages/extension-messaging/src/{core/base-client,offscreen/client,offscreen/telemetry}.ts`; `packages/aztec-runtime/src/account/nulo-account.ts`, `packages/aztec-runtime/src/pxe/{service,artifact-registry}.ts` | the per-source mechanisms in § OA-1 (a) |
| Phase 2b tests: `useLogFilters.scan.test.ts` (source scan A, B, C); `queued-journal.test.ts`, `seeder.status.test.ts`, `offscreen/client.test.ts` (sources flipped); every `NuloAccount.new`/`fromSigningKey`, `ClockTickerAdapter`, `LoggingTelemetrySink` and `BalanceProjector` construction in tests and e2e fixtures (the new argument, or the dropped one) | as left |
| `apps/extension/src/components/JsonViewer/LogsViewer.vue` | `handleClearLogs` re-adds in a `finally` |
| `apps/extension/src/components/JsonViewer/LogsViewer.test.ts` | a Clear-logs describe on a real `EventHandler` |
| `apps/extension/src/stores/balances.store.ts` | `adoptForRetrySubscribers` after the tx-settle forced fetch; `adoptGasRetryDebt`'s comment |
| `apps/extension/src/stores/balances.store.test.ts` | two co-subscriber cases (present at settle, arriving mid-flight) and a release control; the D11 pin's name says it has no retry-capable subscriber |
| `apps/extension/src/stores/balances.store.fuzz.test.ts` | the model's `expectGasReady` set for tx-settles under retry cover; C1 reads status; the C1 control and the pinned tape's comment follow the narrowed D11 |
| `apps/extension/src/popup/components/modules/fee-cards.comount.test.ts` | the stuck-notice sequence |


### Trade-offs and alternatives not taken

- **#291, change `gasFailureEntry` itself** (a forced failure takes debt when a retry-capable subscriber holds the key at the commit). Same outcome, but it writes the rule a second time in a second shape next to `adoptGasRetryDebt`, which already states it. Rejected in favour of applying the existing rule at the second observer (D3).
- **#291, keep the two cards off one key while both are mounted** (the issue's other option, and `FeeSettingsCard.vue:465-470`'s own rule that `txRefresh` stays off on its key). No production surface mounts both (I2), so this is a design rule for a shape that does not exist yet, not a fix. Where the card's mount read is not forced (`FeeSettingsCard.vue:601-602`, F10) the rule's hazard, an outranked forced mount read, cannot occur, and splitting a key doubles the gas reads (D4).
- **#291, make the notice read debt** (show the existing "Couldn't load fee data. Close and reopen to try again." when no retry is owed). It keeps the store's hole and makes the person reopen a popup the store could recover by itself; it stays as OA-2's fallback (D4).
- **#288, build the list from the imported name constants.** A rename would propagate without a test failure, but the scan already refuses a missing name, so the imports add nothing it does not check. They cost two constant moves (each coordinator's name lives in `coordinator.ts`, which imports every leaf service) and `PXE_SERVICE_NAME`, exported only through the `@nulo/aztec-runtime/pxe` barrel with `ChainRuntime` and the production PXE factory, which the popup never imports (it uses `pxe/public-events`) (D5, Opus round 1).
- **#288, sort the list** (one rule, no order to maintain). It moves Passkey and Passkey Client from the end into alphabetical place: a layout change outside the record (D5).
- **#288, ask the worker for its registered names at run time** (a log-viewer RPC). Exact, but a new RPC and an asynchronous filter for a list that changes only when the code does (D5).
- **#288, scan spec files for `*_SERVICE_NAME`** (the issue's suggestion). It counts `IMPORTED_KEYS_SERVICE_NAME`, a backup slice key, as a service, and misses the coordinators (D6).
- **#289, `finally` around the whole handler.** The listener would come back after the `nextTick`, dropping a log that lands during it on the success path (D7).

### Competing outline (cheapest first)

One commit per issue with the narrowest patch:
- #283 as above.
- #288: append the four missing names to the literal list and add the issue's test (every `*_SERVICE_NAME` in a spec file is in `LOG_SOURCES`), with `imported-account-keys` added too so the test passes.
- #289 as above.
- #291: the fee card shows `FEE_INIT_FAILED` instead of `FEE_DATA_UNAVAILABLE` when the degraded leg has no debt.
- Lessons: shorten the three longest entries only.

Why the main plan wins: the outline lists a row for a source nothing writes, leaves the coordinators out, its spec scan misses any service whose constant breaks the naming pattern, and it fixes #291's words while the store keeps a retry-capable key with no retry. Its lessons pass frees about 150 bytes, too little for the next close-outs.

## Phases

Every phase commits on `worktree-wallet-followups-2`, signed, with a conventional lower-case subject and the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Run commands from the worktree root unless a step says otherwise.

### Phase 0: lessons curation ✓

Warning: another lane may land lessons first. Before the edit, run `git fetch origin dev` and apply the table to `origin/dev`'s `lessons.md`; carry any new entry over unchanged.

1. Apply each edit below to `implementations-plan/lessons.md`. Change nothing else.
2. Log each edit and its reason in `lessons/phase-0.md`.
3. Commit: `docs(plans): curate lessons to make room for promotions`.

| Entry (opens with) | Edit | Why it loses nothing |
|---|---|---|
| When one `bun run --parallel` leg fails | "Bun SIGINTs the rest, so `audit:vue` can exit 130:" → "Bun SIGINTs the rest (exit 130):" | the exit code stays; `audit:vue` is one of its callers, named in the evidence |
| `bun run lint` prints only | ", so a new error can hide: rerun" → ": rerun" | the consequence follows from "only the first 20" |
| `vue-tsc` skips an SFC | "(149 of the extension's 205)" → "(most of the extension's)" | stale count: 150 of 207 today |
| Never skip required aggregators. | " (list runs, read the head, re-read per cancel); a cancelled run" → ", re-reading the head before each cancel; a cancelled run" | the re-read stays; the listing order is in the evidence and `CI.md` § Concurrency |
| `PopupManager` mounts every popup | "at start, never unmounting: setup waits for `show` or sits behind `v-if`; a profile switch elsewhere updates open pages in place too: reset" → "at start and never unmounts it: gate setup on `show` or a `v-if`. A profile switch elsewhere updates open pages in place: reset" | same two rules, fewer words |
| `EventHandler.invoke` drops | "awaiting it waits for nothing, a rejection escapes, event-chained cleanup is fire-and-forget." → "awaiting it waits for nothing, and a rejection escapes." | fire-and-forget cleanup is what a dropped promise means; the evidence shows the case |
| An error message carries text | "log a fixed category, never the message." → "log a fixed category." | the fixed category is the instead |
| A MAC binds only what it names | text before the links → "A MAC binds only what it names: key it on the storage key (a stored `id` moves with its row) and refuse on failure, never self-heal; an address binds its original class id, not `currentContractClassId`: check an artifact against it." | every rule kept |
| `pgrep -f` matches | "the agent's `zsh -c` wrapper, so a teardown can kill itself: signal" → "the agent's own `zsh -c` wrapper: signal" | "own" carries the self-kill; the `$$`/`$PPID` rule stays |
| Under Puppeteer mobile emulation | "grows to the content, so `scrollWidth > innerWidth` never flags a sideways scroll: compare against the viewport width you set" → "grows to the content: compare `scrollWidth` with the viewport width you set" | same check, stated once |

**Validation gate.**
- Commands: `wc -c implementations-plan/lessons.md`; `diff <(git show origin/dev:implementations-plan/lessons.md | grep -o '](.*)' | sort) <(grep -o '](.*)' implementations-plan/lessons.md | sort)`; `git diff --stat origin/dev -- implementations-plan/lessons.md`; `git add implementations-plan && bun run check:plans`.
- Pass criteria: on the base file the result is 7,926 bytes (a lane that landed entries first adds their bytes); the link `diff` prints nothing; the stat shows 10 lines changed; `check:plans` exits 0.
- Layers: plans gate.

### Phase 1: #283, Send keeps a selection after a delete ✓

1. Change `onTokenDeleted` in `apps/extension/src/popup/pages/send.vue` as in § Architecture.
2. In `send.test.ts`, replace `(BUG PIN) deleting the active token selects no token, not the next one` with `deleting the active token selects the first remaining token`: mount on `[TOKEN, OTHER]`, delete `TOKEN`, expect `listed` `["OTH"]`, `cacheStore.activeTokenIdx` `OTHER.id`, the card on `OTH`, no toast, no `routerBack`/`routerReplace`.
3. Add `deleting the last token toasts once and leaves Send`: mount on `[TOKEN]`, delete it, expect `openToast` called once with `{ kind: "success", label: "The last token has just been deleted" }` and one call to `routerBack` or `routerReplace`.
4. Add the control `deleting another token keeps the selection`, on its own mount: `[TOKEN, OTHER]` with `TOKEN` active, delete `OTHER`, expect `listed` `["TST"]`, the card on `TST`, `activeTokenIdx` unchanged, no toast, no navigation.
5. Commit: `fix(send): select the next token when the selected one is deleted`.

**Validation gate.**
- Commands: `cd apps/extension && bun --bun vitest run src/popup/pages/send.test.ts`; `bun run lint`; `bun run typecheck:all`.
- Pass criteria: all three exit 0. Proof of red: run the active-delete case, the last-token case and the control against the base `send.vue` (`git show origin/dev:apps/extension/src/popup/pages/send.vue`, restored after) and see both selected-token cases fail (after the splice `activeToken` is undefined, so the base handler returns before selecting, toasting or leaving, `send.vue:120-122`) and the control pass.
- Layers: lint, typecheck, unit.

### Phase 2: #288, every registered service in the source filter ✓

1. Add the ten rows to `LOG_SOURCES` in `useLogFilters.ts` (§ Architecture). Keep `LogsToolbar.vue` unchanged.
2. Add `useLogFilters.scan.test.ts` as described in § Architecture, with its success control.
3. Commit: `fix(logs): list every registered service in the log source filter`.

**Validation gate.**
- Commands: `cd apps/extension && bun --bun vitest run src/components/JsonViewer`; `bun run lint`; `bun run typecheck:all`.
- Pass criteria: all exit 0. Proof of red: with the base `useLogFilters.ts`, the scan test fails and names `price`, `price-client`, `incoming-transfer`, `incoming-transfer-client`, `operation-journal`, `operation-journal-client`, `legal-acceptance`, `legal-acceptance-client`, `account-integrity-coordinator` and `profile-deletion-coordinator`, and nothing else.
- Layers: lint, typecheck, unit.

### Phase 2b: OA-1 (a), every line under the service that owns it ✓

Added by the orchestrator's D-orch-3 after Phase 2; built after Phases 3 and 4, while its inventory ran (the phases are independent).

1. Write the source scan (A, B, C) in `useLogFilters.scan.test.ts` and run it on the tree before any source change: A and every B row must fail, C must pass.
2. Apply the per-source mechanisms in § OA-1 (a); update the three behavioural pins and every construction the signatures change.
3. Commit: `fix(logs): file every log line under the service that owns it`.

**Validation gate.**
- Commands: `cd apps/extension && bun --bun vitest run src/components/JsonViewer src/wallet/services/wallet-sdk/queued-journal.test.ts src/wallet/services/token src/wallet/services/token-balance src/wallet/services/price src/wallet/services/operation-journal src/wallet/services/profile src/core/adapters`; `bun run test:all` (it runs `packages/aztec-runtime`'s account freeze suites and `packages/extension-messaging`'s client tests with the new arguments); `bun run lint`; `bun run typecheck:all`.
- Pass criteria: all exit 0; A and each B row seen red on the tree before step 2; the three behavioural pins seen red against the base sources; the account KAT and freeze tests green with no vector or pin edit.
- Layers: lint, typecheck, unit, scan.

### Phase 3: #289, Clear logs keeps the window live ✓

1. Change `handleClearLogs` in `LogsViewer.vue` as in § Architecture.
2. In `LogsViewer.test.ts`, give the log-viewer client stub a real `EventHandler` for `onLog`, spied with `vi.spyOn(handler, "add")` so `mountOn` still reads the callback, and a `clearLogs` handle in `H`.
3. Add `a failed clear keeps the window live`: `clearLogs` rejects; emit `clearLogs` from the `LogsToolbar` stub; expect the "Failed to clear logs" toast; then `invoke` a live log on the handler and expect it in the document.
4. Add the success control `a log that lands while a clear finishes is kept`: `clearLogs` resolves, and a log is delivered after the listener is back and before `updateEditorContent` runs (for example from a `.then` the `clearLogs` mock chains twice onto the promise it returns, so it lands during the handler's `nextTick`). Expect the document to hold exactly that log. This is the ordering the scoped `finally` protects: the case must fail with the `finally` around the whole handler (D7).
5. Commit: `fix(logs): keep receiving logs after a failed clear`.

**Validation gate.**
- Commands: `cd apps/extension && bun --bun vitest run src/components/JsonViewer`; `bun run lint`; `bun run typecheck:all`.
- Pass criteria: all exit 0. Proof of red: the failed-clear case fails against the base `LogsViewer.vue`; the success control fails against a `finally` around the whole handler and passes on the base file.
- Layers: lint, typecheck, unit (component).

### Phase 4: #291, the gas retry runs when the notice says so ✓

1. Write the co-mount case first, in `fee-cards.comount.test.ts`: `a failed tx-settle refresh under the fee card retries gas, and the notice clears when it lands`. Sequence: `getFpcs` rejects once, then resolves; `mountBoth()`; the notice shows (the FPC retry is armed); `getGasBalances` rejects from now on; fire `onTransactionUpdated` with `Proven`; advance 5,050 ms (the FPC retry lands, the notice re-commits on gas). Then expect a gas read issued by the retry, make `getGasBalances` resolve `FJ(43n)`, advance one more backoff step, and expect the notice gone and the gas card on `43 FJ`, undimmed. Run it on the base store: it fails (no gas read; the notice stays after 70 s).
2. Add `adoptForRetrySubscribers` and the `.then` call in `balances.store.ts` as in § Architecture. Update the comment on `adoptGasRetryDebt` to name both observers in one sentence.
3. In `balances.store.test.ts`:
   - Add `a tx-refresh failure under a retry-capable subscriber takes the debt and arms the retry` (`CAPS_FEE` + `CAPS_CARD`, forced failure, debt `true`, one backoff later a retry success clears it and bumps `retryVersion`).
   - Add `a retry subscriber that arrives during the tx-refresh takes the debt`: `CAPS_CARD` alone, the forced read in flight, subscribe `CAPS_FEE` with no ensure, fail the read; expect debt `true` and a gas read one backoff later. The observer is whoever holds a retry stake when the failure lands, which the oracle does not require (it owes only from a tx-settle under cover), so this case pins it.
   - Add the control `a retry subscriber released during the tx-refresh owes nothing`: the same two subscribers, the forced read in flight, release the `CAPS_FEE` lease, fail the read; expect debt `false` and no gas read across 35 s.
   - Keep `a tx-refresh FAILURE creates no retry debt` (`CAPS_CARD` only) as it is; rename it `… with no retry-capable subscriber`.
4. In `balances.store.fuzz.test.ts`:
   - Add the tx-settle observer to the model (D9). When `opTxSettled` targets a key that has a live `txRefresh` subscriber (so the store issues the forced read, `balances.store.ts:650-659`) while `retryCoves` holds, the model adds the key to a new `expectGasReady` set; `opRelease` drops it when the key loses retry cover and `opFence` drops the fenced profile's keys, as they do for `expectGasRecovery`. C1 then also requires every key in `expectGasReady` to end the clean drain with gas `ready`. Under continuous cover every later gas failure has an observer that adopts it (an ensure, a retry, or the new continuation), so the fixed store ends `ready`; the base store leaves a failed forced read degraded with no retry. The rule reads status only, never debt, so the stranded-debt shape the final Codex pass found (a gas-only ensure succeeding while a two-leg ensure's failed gas leg awaits its FPC leg) does not trip it, and it owes nothing for a failure that landed before cover existed.
   - C1 reads status: an owed key ends `ready` after the clean drain. Delete the doc comment's "Status is not read" exception, which existed only for the state this arc removes, and say the comment's rule in one sentence.
   - Change the control `passes a retry success that a failed tx-settle refresh then re-degrades` to the narrowed rule: after the failed tx-settle refresh the slice is degraded WITH debt and the key is in `expectGasReady`, and C1 fails; one backoff and a successful settle later, `retryVersion` is 2, debt is false, status is `ready`, and C1 passes.
   - The first pinned tape (`:586-591`) is the red proof: with the new set it fails C1 on the base store. Rewrite its comment to say what it now pins: a failed tx-settle refresh under retry cover must recover. Leave the other invariants and every tape number unchanged.
5. Commit: `fix(balances): retry gas after a failed tx-settle refresh under a fee card`.

**Validation gate.**
- Commands: `cd apps/extension && bun --bun vitest run src/stores src/popup/components/modules`; `cd apps/extension && NULO_FUZZ_RUNS=2000 bun --bun vitest run src/stores/balances.store.fuzz.test.ts`; `bun run lint`; `bun run typecheck:all`.
- Pass criteria: all exit 0; the fuzz run at 2,000 runs finds no counterexample; the co-mount case, the two new store cases and the pinned tape under the new set were each seen red on the base store; the release control passes on both.
- Layers: lint, typecheck, unit, component, property.

### Phase 5: final gate ✗

1. Merge `origin/dev` into the branch if it moved, and read what changed in `implementations-plan/index.md` and `lessons.md`.
2. Run every command below on the final head.
3. Take the screenshots for the PR body (§ UI impact).

**Validation gate.**
- Commands:
  - `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run test:all`; `git add implementations-plan && bun run check:plans`.
  - Network first, since `e2e:agent` builds its own `dist/`: `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/token-management.test.ts tests/e2e/network/fee-methods.test.ts tests/e2e/network/fee-sponsor-funding.test.ts` (none carries `@requires-proverless`; check again before the run).
  - Smoke, each run straight after its own armed build from the final head, so no earlier `dist/` can satisfy it: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`, then `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- --retry=0`; the same with `build:firefox` and `NULO_E2E_BROWSER=firefox`.
- Pass criteria: every command exits 0 at retry 0. A failure is first matched against a known flake (the `e2e-testing` skill's flake ledger, or an open issue); only then is one rerun allowed, and `lessons/phase-5.md` keeps the original failure's log and the match. Real breakage is fixed, never skipped.
- Layers: lint, typecheck, unit, smoke e2e (Chrome, Firefox), network e2e.

## UI impact

The orchestrator's no-ask records, quoted, are the whole visible budget:

- **Send, after the selected token is deleted elsewhere** (#283). Record: "the handler does what it was written to do, read whether the deleted token was active before the splice, then select the next token, or with none left run the existing last-token path (its toast and leave); the `(BUG PIN)` in `send.test.ts` flips to the fixed behaviour. No new words." Before: an empty token card. After: the first remaining token is selected; with none left, the existing toast "The last token has just been deleted" and Send closes.
- **Logs window, source filter and rows** (#288). Record: "the window shows every service's lines and the source filter lists every service, as it does for the others today; derive the list from the registered service names (the panel's call on the exact mechanism) so it cannot drift again, with the test the issue names. No new words beyond the service names the filter already uses as labels." Before: 48 rows; Price, Incoming Transfer, Operation Journal, Legal Acceptance and the two coordinators' lines vanish at the first rebuild. After: the 48 rows keep their order; Price, Price Client, Incoming Transfer, Incoming Transfer Client, Operation Journal, Operation Journal Client, Legal Acceptance and Legal Acceptance Client follow Passkey Client, then Account Integrity Coordinator and Profile Deletion Coordinator, then Wallet and Ui as today. Their lines stay. Lines written under a source that is not a registered service name (the price service's own `"PriceService"` helper, `SendCheck`, …) are filed under the service that owns them (Phase 2b, D-orch-3): no new row or label, and they stay through every rebuild.
- **Logs window, Clear logs** (#289). Record: re-add the listener in a `finally`. Before: after a failed clear the window stops updating. After: it keeps updating; the toast is unchanged.
- **Fee card notice beside a gas card on one key** (#291). Record: "the notice stops claiming a retry that is not running; the existing states and words only, nothing new." No production surface mounts both today (I2). Before: "Couldn't load fee data. Retrying in the background." with no retry running, until another fetch succeeds. After: the same words, backed by a running gas retry; the notice clears when it lands. The gas card's existing refresh dot and un-dim follow the retry; OA-2 asks the owner to confirm they sit inside the record, and names the fallback that ships if not.
- `lessons.md`: no UI.

The PR body carries before/after screenshots of Send after a delete and of the logs window's source filter.

## Security & Adversarial Considerations

- **Threat model.** No change crosses a trust boundary: no dApp input, backup file or stored row is parsed differently. The attack surface is the logs window (what a bug report contains) and the balances store's network traffic.
- **Logging policy.** #288 adds filter rows; it adds no log line and changes no source string. A source name is not sensitive. #289: lines logged while a failed clear was in flight are missing from the open window and its CSV export until it is reopened; they stay in the buffer.
- **More lines visible in a shared bug report.** Lines from the four services and two coordinators now survive a rebuild. They were already in the CSV export and in the window at open, so nothing new leaves the device. Two account-integrity lines pass `String(error)` (`account-integrity/coordinator.ts:83,176`), which the redactor cannot see into; the errors come from address re-derivation and a storage write, and the profile-mismatch line carries a profile id, chain id and account index, none on the policy's never-log list. The arc does not touch them (Scope, Out); the implementer opens an issue to pass `{ error }` instead.
- **Retry traffic.** #291 adds gas reads only while a retry-capable subscriber shares the key with a `txRefresh` one, and only until one succeeds, on the existing backoff (5, 10, 20, then 30 s). Each retry read passes `forceRefresh: true` and skips the worker's reader cache (`balances.store.ts:643`), so each such document polls on its own while the node is down: bounded, and stopped when the fee card is released (`release` → `stopRetry`).
- **Gating.** A degraded gas slice keeps `verified` empty, so self-paid methods stay closed until a read succeeds (`FeeSettingsCard.vue:559`); the fix changes when a fresh figure arrives, not how the gate reads it.
- **Send.** The new selection is the first token in storage order, which a dApp can influence through `registerToken` (a lookalike token added first). The mount path already picks the same token when the saved one is gone (`send.vue:604-606`), nothing is sent by a selection change, the amount clears and the review sheet closes on it (`send.vue:488-496`), and the card names the token.
- **Least privilege, supply chain, cryptography.** No dependency, workflow, permission or key changes. No new package. Frozen lockfile untouched.
- **Static scans in tests.** The drift pin and the source scan read source files from the repository; they write nothing and run no code they read.
- **Phase 2b and the logging policy.** No log line gains a field and no message changes; only the source string moves to the owner's name, which is not sensitive. The guards' old source carried a profile id and a chain id; the new one carries neither. Lines that were already in the CSV export and in the window at open now also survive a rebuild, so nothing new leaves the device.

## Assumptions

### Facts

- F1. `onTokenDeleted` splices before it reads `activeToken`, a computed over `tokens` (`send.vue:116-131,139`); the mount path picks `t[0]` when the saved token is gone (`:604-606`).
- F2. 26 registered classes declare `static name = <CONSTANT>`; 24 constants end in `_SERVICE_NAME`, 2 in `_COORDINATOR_NAME`; no other class declares one (recon § Reuse map). The name a service logs under is the one its constructor passes to `super(` (`base-service.ts:48-49,215-228`); all 24 pass the same constant, and both coordinators assign it to their instance `name`.
- F3. `IMPORTED_KEYS_SERVICE_NAME` names a backup slice; no class is registered under it and nothing logs under it.
- F4. Client log sources are `${service}-client`; every client forwards an optional custom `name` (`price/client.ts:15`), and no caller passes one today (`base-client.ts:98`; recon § #288).
- F5. The price service's helper logs under `"PriceService"` (`price/service.ts:39,427-429`), not under its service name; the arc leaves it to OA-1.
- F6. `EventHandler.add` skips a callback it already holds (`event-handler.ts:34-38`).
- F7. `onTransactionSettled` never calls `scheduleRetry`; `adoptGasRetryDebt` runs only inside `ensure` (`balances.store.ts:566-575,651-660`).
- F8. The D11 pin (`balances.store.test.ts:387`) subscribes only `CAPS_CARD` (`retry: false`).
- F9. The fuzz control at `balances.store.fuzz.test.ts:650-662` subscribes one subscriber with `retry` and `txRefresh` both on and asserts a debt-free re-degradation.
- F10. The authwit popups mount `FeeSettingsCard` with no `lockedMethod` and no `originPrivacy` (`RevokeAuthwitsPopup.vue:205-214`, `ChangeAuthwitsRegistryPopup.vue:107-111`), so their mount read is not forced (`FeeSettingsCard.vue:601-602`).
- F11. `lessons.md` is 8,164 bytes; the gate's budget is 8,192 (`scripts/ci-cd/plans/structure.ts:37`).

### Inferences

- I1. No e2e opens the logs window, deletes a token under an open Send, or fails a tx-settle refresh under a mounted fee card (searched `tests/e2e` for the testids and routes); the component, store and property tests are the layer that reaches these branches.
- I2. No production surface puts a `txRefresh` and a `retry` subscriber on one key. `GasBalanceCard` mounts only in Home's `BalanceView`; `FeeSettingsCard` mounts in Send, the execute window and the two authwit popups, which open only from Settings → Advanced → Account state → Authwits (`authwits/index.vue:96-102`). `RouterView` has no `KeepAlive` (`app.vue:489-491`) and `Popup` renders its slot under `v-if="show"`, so Home is not mounted under an open authwit popup unless the route changes beneath it, and no such path was found. The issue's "Home behind an authwit popup" did not hold as a reachable path; the shared-key composition test (`fee-cards.comount.test.ts`) reproduces the state, and the fix keeps the store's invariant for any surface that mounts both.
- I3. `useLogFilters.ts` gains string literals and no import, so the popup bundle does not change shape.
- I4. Today's `LOG_SOURCES` order (alphabetical, then `passkey`, then `wallet` and `ui`) shows the last service was appended to the service list rather than sorted in; the four services follow it the same way.

### Asks (each has a working assumption; none blocks the arc)

- A1. The non-service log sources and the dead rows: OA-1 in `OWNER-ASKS.md`. Working assumption: unchanged in this arc.
- A2. OA-2 in `OWNER-ASKS.md`: on a surface with both subscribers, the gas card's refresh dot during each retry read and its un-dim when one lands are existing states, so the plan reads them as inside the #291 record. Working assumption: the store fix ships; the in-record fallback is named there.

## Decision ledger

| # | Decision | Chosen | Rejected and why | Source |
|---|---|---|---|---|
| D1 | Lessons budget | Shorten 10 entries losslessly, retire none: 7,926 B | Reword 20 entries to 7,647 B (dropped three claims, Codex round 1); retire to reach 7 KiB (no dead end is unreachable) | driver, Codex round 1 |
| D2 | #283 "next token" | `tokens.value[0]`, as written and as the mount picks | The picker's `orderTokenRows` order: the page's selection has never used it, and changing it is a visible choice | driver |
| D3 | #291 where the rule lives | Apply `adoptGasRetryDebt` after the tx-settle forced fetch | A second debt rule in `gasFailureEntry` | driver |
| D4 | #291 store vs composition vs card | Store; the shared key stays | Separate keys (the fee card commits the same figure either way, F10; doubles reads); card reads debt (leaves the store's invariant broken; OA-2's fallback only) | driver; Codex round 1 finding 1 rebutted; Opus round 1 agrees on the store |
| D5 | #288 list mechanism | Literal rows in today's order; the scan derives the required set from the registrations | Imported constants (nothing the scan does not check; two constant moves; `PXE_SERVICE_NAME` only through a barrel the popup must not import, Opus round 1); sorted list (moves Passkey); worker RPC (new surface) | Opus round 1 |
| D6 | #288 drift-pin source | The registration sites, resolved fail-closed to each class's `static name` constant, checked against the name it logs under | Every `static name =` declaration (not tied to what is registered, Codex round 1); `*_SERVICE_NAME` declarations (slice-key false positive, misses coordinators) | Codex and Opus round 1 |
| D7 | #289 `finally` scope | Around `clearLogs()` only | Around the whole handler (drops a log during the tick) | driver |
| D8 | Price service's `"PriceService"` helper | Left to OA-1 | `this.name` in the arc: changes the CSV source column, past the record (Codex round 1) | Codex round 1 |
| D9 | Fuzz model of the new observer | A tx-settle under retry cover adds the key to `expectGasReady`, which must end the drain `ready`; C1 reads status | Ensure-only (no random-tape requirement after a tx-only failure, Codex round 1); owe on a failed read keyed on `forceRefresh` (retry reads pass it too), on mock rejections (owes for a late rejection, misses timeouts) or on a `fetching` → `degraded` transition (owes before an ensure's observer adopts, final Codex pass) | Codex and Opus round 1; final Codex pass, two rounds |
| D10 | Coordinator lines passing `String(error)` | Out of the arc; an issue at delivery | Fix in the arc (a logging-policy change outside these issues) | Codex round 1 |
| D-orch-2 | OA-2 | (a): the store retries. The gas card's refresh dot over the dimmed figure and its un-dim when a read lands are states the card already has, inside the #291 record | (b), the card-only fallback: not built | orchestrator, 2026-10-11 |
| D-orch-3 | OA-1 | Its option (a) ships in arc-1 for the lines only: each line from a source that is not a registered service is filed under the service that owns it (Phase 2b), inside the #288 record (every line visible under existing rows, no new row or label). The five rows that match nothing stay; their removal is the owner's call, carried by the `owner-decision` issue opened at delivery | (b) new rows and (c) always-shown sources: new labels or a filter that cannot hide; (d) as today: lines keep vanishing | orchestrator, 2026-10-11 |
| D-orch-4 | Phase 0 result | The lossless 7,926 B with no retirement stands; the 7 KiB target is withdrawn | Retiring a reachable dead end to make room | orchestrator, 2026-10-11 |
| D9a | Fuzz model: when a tx-settle owes `ready` | Only when the key has a store entry at the settle, besides a live `txRefresh` subscriber and retry cover: the store's forced read returns at once on a fenced key, so nothing fails and nothing is owed | The plan's rule without the entry condition: its first fuzz run owed `ready` for a key a fence had cleared (lessons/phase-4.md) | implementation |
| D12 | Phase 2b ownership rule | A file in a service's directory logs under that service's constant; a primitive outside one takes a required source from its caller; composition-root code logs under `wallet`, the dApp handler under `wallet-sdk`. Ticker → Token Balance and telemetry → Pxe Client deviate from the owner's mapping ("worker-level → Wallet", "the offscreen one → Pxe"): the tree shows Token Balance builds the ticker and the sink lives in the client in the worker. NuloAccount, unmapped by the owner, → Account | Inject the caller's name into shared helpers (`ContractResolver`, `batched-view-simulation`): a source parameter on each and per-call-site resolution, for lines that already name their operation | Codex and Opus, 2b consult |
| D13 | PXE guard labels | Both guards named `PXE_SERVICE_NAME`; the profile/chain key leaves one Error line written after a reader is stuck 90 minutes (the barrier and chain guards nest and fire together). If the owner wants the key back, the change is `ReadWriteGuard` alone: a separate source, the label moved into the message | Codex: keep the label as a third constructor argument in the message (rarity makes it more valuable). Rejected: a new option for one caller, for a line whose surrounding lines already place the prove; the old source also put profile ids in the source column | Opus, 2b consult; Codex dissent recorded |
| D14 | Phase 2b pin | A general source scan (A) plus one row per mapped class (B) and a resolver self-test (C), with the primitives' parameters resolved at their sites; behavioural pins where a test already asserts a source | Per-class rows only (Codex: the general scan's resolver costs more than membership): B needs the same resolver for injection sites, so A adds only the refusal path, and A is what stops the next free-string source | Opus, 2b consult; Codex dissent recorded |
| D15 | Price service's helper | Deleted; the service calls the base's `logWarn`/`logDebug` | `this.name` inside the helper (Codex): keeps a second logging path in a service, which CLAUDE.md § Logging policy routes through `this.log*` | Opus, 2b consult |

## Audit verdicts

### Round 1, Codex (gpt-6.1-sol, high, read-only)

Verdict: reject (with blocking findings: unsafe D4 rationale, incomplete drift protection, unresolved UI authorization, lossy lessons curation).

1. High, D4: an ordinary ensure's gas read can commit `verified` while a tx-settle forced read is still pending, and the forced read's success does not wake the card. **Rejected, rationale rewritten.** The interleaving is real, but it is the same without the gas card: with no `txRefresh` subscriber there is no forced read at all, and the card commits the same ensure figure. Splitting the key buys the card no freshness; the fix adds one (a landed retry bumps `retryVersion`). § #291 and D4 now say so.
2. High, drift pin from declarations: not tied to what is registered. **Accepted.** The pin starts from the two registration sites, resolves each `services.add` fail-closed, scans every `packages/*/src`, and has a non-empty control (§ #288, D6).
3. High, A2 and the price helper's CSV column past the record. **Accepted in part.** The price helper's switch to `this.name` left the arc (D8, OA-1). The Home gas un-dim is a state the card already reaches (A2); it stays and the report names it for the orchestrator.
4. Medium, lessons curation lossy and broad (20 entries; three claims dropped). **Accepted.** Ten edits, 7,870 B; the final pass restored two more clauses, 7,926 B (D1, Phase 0).
5. Medium, coordinator lines passing `String(error)`. **Accepted as a disposition.** Out of the arc, an issue at delivery (Scope Out, D10, Security).
6. Medium, fuzz owe rule ensure-only; no released-lease control. **Accepted.** D9 widens the owe rule; Phase 4 adds the release control. Codex found the continuation's epoch and union checks sound and the control change a contract change, not a loosened assertion.
7. Medium, smoke needs fresh armed builds; I3's guard misnamed; flake rerun. **Accepted.** Phase 5 builds before each smoke run, I3 names no guard, a rerun keeps the original failure.
8. Low, Phase 1 control contradicts its case; #289 success control should exercise the tick. **Accepted.** Separate mount; the control delivers a log during the `nextTick`.

### Round 1, Opus Plan agent (claude-opus, read-only; audited draft v1, in parallel with Codex)

Verdict: conditional approve (with conditions: keep `"pxe"` a literal and build in Phase 2's gate; prove the co-mount is reachable and move A2 and the retry-time refresh dot to OWNER-ASKS.md; make the smoke command runnable; redo Phase 0 as one retirement plus lossless cuts).

1. Low, #289 overclaim: lines logged while a failed clear was in flight never reach the window or its CSV export. **Accepted as a correction** (quality bar 3, Security); re-reading the buffer in the catch is past the record and rejected.
2. Low, #283 selection is storage order, which a dApp can seed. **Accepted**: stated in Security; the rule stays (the mount path's).
3. Low, every retry read skips the reader cache (`forceRefresh: true`). **Accepted**: stated in Security.
4. Medium, recon said no entry is restated whole; `CI.md` § Concurrency restates the never-skip entry, so it is retirable. **Fact accepted, retirement rejected**: the lane's rule keeps an entry whose dead end is still reachable, and Codex found no justified retirement. Recon corrected.
5. Low, F2 is a proxy for the name a service logs under; F4's custom client name is not pinned. **Accepted**: the scan also checks the logged name; F4 states the gap, and OA-1 covers such sources.
6. High, importing `PXE_SERVICE_NAME` pulls the `@nulo/aztec-runtime/pxe` barrel into the popup. **Accepted**, and with finding 13 the list stays literal, so nothing is imported and the Phase 2 build is moot (D5).
7. Medium, the Home-behind-authwit-popup co-mount is not reachable. **Accepted**: verified (I2); "For whom", § #291 and § UI impact now describe a store-invariant fix proven by the composition test.
8. Low, I4 contradicts § UI impact on row order. **Accepted**: the new rows sit before Wallet and Ui; both texts say so.
9. Medium, A2 belongs in OWNER-ASKS.md and understates the refresh dot and the fee card's re-commit. **Accepted**: OA-2, with the store fix as what ships and the card-only change as the in-record fallback.
10. Low, D8 is OA-1 option (a) for one source. **Already resolved**: the helper left the arc after Codex round 1.
11. Medium, make C1 read status and delete its "Status is not read" exception; the pinned tape then proves #291 in the oracle; rename the D11 pin. **Accepted** (Phase 4, D9).
12. Low, the continuation's trace holds under epochs, outranked runs, joined ensures, an armed timer, a retry in flight and a release. **Noted**; the placement stays.
13. Low, literals plus the scan equal the imports at less cost; success control should cover every resolved class. **Accepted** (D5); the control already requires every registration in both files to resolve.
14. Medium, the smoke command cannot run without the armed build. **Accepted** (with Codex 7): Phase 5 builds before each run.
15. Medium, the 20-entry curation dropped rules. **Accepted** (with Codex 4): ten lossless edits; the proposed retirement is rejected (finding 4).

### Final fresh pass, Codex (gpt-6.1-sol, high, read-only, new session)

Verdict: reject (with blocking findings: D9 can manufacture recovery obligations and miss timeout failures; Phase 0 removes explicit safety instructions; Phase 1 has an incorrect red-proof criterion).

1. High, D9 keyed on mock rejections owes for a rejection that lands after the store's timeout (the store commits nothing then) and misses a failure by timeout. **Accepted**; the first replacement (a per-op `fetching` → `degraded` transition) failed the re-check below, and D9 settled on the tx-settle set.
2. Medium, Phase 1 said the last-token case passes on the base `send.vue`; after the splice the base handler returns before toasting. **Accepted**: both selected-token cases are red on the base file.
3. Medium, two lessons edits drop instructions (re-read the head before each cancel; never signal `$$`/`$PPID`). **Accepted**: both restored, 7,926 B. The other eight edits keep their claims.
4. Low, "one resolved class per file" cannot see a parser that skips the multiline call. **Accepted**: openers counted against resolved-or-refused per file, plus one inline refusal case.
5. Low, recon still described imported constants and a reachable co-mount. **Accepted**: recon corrected.

Re-check in the same session: reject (with blocking findings: D9 still owes a recovery the fix does not guarantee and misses adoption without a status transition). (1) High: the transition rule owes when a two-leg ensure's gas fails while its FPC leg is pending; a gas-only ensure then succeeds, debt stays stranded with no timer (pre-existing, outside this arc), and C1 fails. **Accepted**: D9 now requires `ready` at drain for a tx-settle under continuous cover, reading status only. (2) Medium: cover acquired after the trigger, with a continuation adopting, is not required by the oracle. **Accepted as a store case** (cover arriving mid-flight); the oracle owing less than the store delivers is the safe direction. (3) Low: the quality bar still promised two promotions. **Accepted.** Codex confirmed the other four fixes.

Second re-check in the same session: **approve**. No fixed-store counterexample to the revised D9; the first pinned tape still fails the base store (op `581260` adds scope 0 to `expectGasReady` under tx-refresh and retry cover, and the later failed forced refresh leaves it degraded); the narrower oracle is acceptable with the arrival-mid-flight store case.

Codex found sound: `adoptForRetrySubscribers` under epochs, outranked runs, an armed timer, a retry in flight and a mid-flight release; the store fix over the card-only change; literal rows checked against a registration-derived set as a faithful reading of the #288 record; the scoped `finally` and its control; OA-2 surfaced.

### Phase 2b consult (Codex gpt-6.1-sol high read-only, session 01a12933-4185-7142-8206-643b74099b63; Opus Plan agent in parallel)

Codex verdict: approve the ownership mapping with changes to PXE diagnostics and the scanner. Opus verdict: the rule is right; change the mechanism for the price helper, telemetry, NuloAccount and the registry default; build the general pin after the dynamic defaults are gone. Both: directory ownership for shared helpers, Token Balance for the ticker, Pxe Client for telemetry (with `clientName` protected, not re-derived), an explicit required source for NuloAccount (a rebinding logger rejected as a monkey-patch), no change to `Lock`, drop the unused queue/projector parameters and the registry option, keep `"wallet-sdk"` a literal. Split: the guard label (D13) and the general pin (D14); the price helper (D15). Opus found the second NuloAccount constructor (`account-integrity/coordinator.ts:57`) and the four tests that assert old sources; Codex found that `.log(` is not always `ILogger.log` (the receiver rule in § OA-1 (a)).

## Delivery

One arc, one branch (`worktree-wallet-followups-2`), one PR against `dev`, opened only after Phase 5 passes and the Codex fix loop converges. No stack (`gh stack` is not used: the orchestrator's standing D-orch-1).

| Arc | Phases | Base | `/code-review` |
|---|---|---|---|
| arc-1 | 0-5, then the close-out commits | `dev` | off |

- PR title: `fix: send token delete, logs window sources and clear, fee card gas retry` (73 characters, under the 93 limit).
- Open the PR without labels: `gh pr create --base dev --head worktree-wallet-followups-2 --title "<title>" --body-file <file>`. The diff touches `apps/extension/src/**`, so the smoke and network path filters select their suites; add `e2e:extension-smoke` or `e2e:extension-network` afterwards only if a suite the change needs was skipped.
- PR body: what changed and why per issue, the validation run with outcomes, the before/after screenshots, the OA-1 issue number, `Closes #283`, `Closes #288`, `Closes #289`, `Closes #291`, and last `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Then `gh pr checks <n> --watch`. Merging is the orchestrator's call.

## Post-implementation

Run after Phase 5 is green, before the PR exists.

1. **Codex audit** (`~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`): send the diff from `origin/dev`, this plan with its decision ledger, the adversarial ask ("What could go wrong? What would an attacker target? What are we trusting that we shouldn't?"), and these two rules verbatim:
   - *"Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."*
   - *"Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."*
2. **Fix loop.** Check each finding against the tree first. Apply the accepted fixes, commit them, and log the round (consult and verdict) in `lessons/phase-6.md`. Resume the same Codex session (`resume-codex.sh`) with the fix diff and the same two rules. Repeat until a round brings no new material finding. After three rounds with material findings, stop and report `ARC_FAILED: arc-1 codex loop did not converge` with the open findings.
3. **Delivery** per § Delivery: the first time a PR is opened.
4. **Close-out**, as the PR's final commits:
   - Merge `origin/dev` first and read what changed in `index.md` and `lessons.md` (another lane may have landed); never a union merge.
   - Write `## Outcome` directly after the front matter: date, status, what shipped (the PR number), what was dropped or left with its reason (a disposition line each), `Open items:` (the OA-1 issue number, or `none`), and a line retiring this plan's `/goal` and `/loop` seeds.
   - Promote the generalizable gotchas to `implementations-plan/lessons.md`, one line each with an evidence link into the archived plan, deduplicated, inside 8 KiB.
   - File every open item where it lives:

     | Situation | Home |
     |---|---|
     | Work inside the implementation you are on | the active `plan.md` and the PR |
     | Actionable work that outlives the plan: a bug, a gap, a missing test, a deferred refactor | a GitHub issue, with a domain label and a `Record` link to the archived plan |
     | Needs a product call, or waits on something outside the repo | an issue labelled `owner-decision` or `blocked:external` (the body names the trigger) |
     | A suspected exploitable weakness | a private draft security advisory; `plan.md` records only "tracked privately: GHSA-…" until it is published |
     | Rejected, superseded or already done | a disposition line in the plan's Outcome block; no open item anywhere |
     | Knowledge that prevents a repeat | `implementations-plan/lessons.md` (8 KiB budget) |
     | A legal or store blank with a release deadline | `BEFORE-LAUNCH.md` |
     | Accepted code work that blocks launch | the `v1.0.0` milestone, pointed at once from `BEFORE-LAUNCH.md` |

     Dedupe first (`gh issue list --state all --search "<words>"`); an issue body has `## What happens`, `## Where`, `## Impact`, `## Possible fix`, `## Record`.
   - Delete `STATUS.md`. Then, in its own commit, `git mv implementations-plan/wallet-followups-2 implementations-plan/archive/wallet-followups-2`, repair every relative link the extra level breaks (`git grep -n 'wallet-followups-2'`), and move this plan's line from `index.md` to `archive/index.md`.
   - `git add implementations-plan && bun run check:plans` must exit 0; push; report and wait.
5. **Teardown after the merge.** Once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/wallet-followups-2/plan.md` succeeds, run `agent-worktree done wallet-followups-2 --merged --trunk dev` from outside the worktree (this session did not enter it through `EnterWorktree`, so there is nothing to exit). It refuses rather than forces; relay a refusal and stop. A `/loop` session checks on each firing; a `/goal` session arms one background wait after its wrap-up: `until git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/wallet-followups-2/plan.md; do sleep 300; done`.

## Seeds

Drafts until the orchestrator approves; use exactly one per session.

Recommended, `/goal`:

```
/goal All phases of implementations-plan/wallet-followups-2/plan.md marked ✓ in the file, each backed by its validation gate reported passing in the transcript; for each phase LESSONS_FILE=implementations-plan/wallet-followups-2/lessons/phase-N.md printed; /code-review NOT run (code_review: off); the Codex fix loop converged on the whole diff, evidenced by a resumed gpt-6.1-sol pass reporting no new material findings, quoted; one PR against dev exists, opened only after the loop converged (gh pr view output in the transcript), its final commits the close-out that archived the plan (git show --stat of the archive-move commit); bun run test and bun run lint both exit 0 in the transcript.
```

Alternative, `/loop`:

```
/loop 15m Drive implementations-plan/wallet-followups-2 forward. Never idle. Each firing: (1) read plan.md and lessons/ (authoritative), judged against its Outcome & Quality Bar; if the plan dir is gone, check `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/wallet-followups-2/plan.md`: success → run `agent-worktree done wallet-followups-2 --merged --trunk dev`, report, clear this loop and stop; failure → babysit the PR's checks only. (2) No task in hand: take the next ✗ phase, run lint and the touched tests after each edit, commit. (3) A decision you would bring to the owner: argue it with Codex (run-codex.sh … high read-only gpt-6.1-sol), log it in lessons/phase-N.md, act; anything a person would see goes to OWNER-ASKS.md and is left out. Hard limits: no merge, no push to main, no --admin, no scope beyond plan.md. (4) Same step failed 5 times: reassess with Codex. (5) Phase gate green: paste it, mark ✓, print LESSONS_FILE=…, advance. (6) All ✓: the Codex fix loop per Post-implementation, then the PR, then the close-out commits, then gh pr checks --watch, then report and stop.
```
