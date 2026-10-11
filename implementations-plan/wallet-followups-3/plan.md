---
plan: wallet-followups-3
tier: mid
status: approved by the orchestrator (D-orch-1 to D-orch-5); arc 1 in implementation
issues: "#297, #295 (arc 1); #281, #294, #290, #262, #277 (no arc)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 Explore agents (sonnet); dual audit (Codex gpt-6.1-sol high + one Opus Plan agent), one Codex resume to settle disputes; one final fresh Codex pass
post_implementation_hardening: not scheduled
base: origin/dev at 0643a14, merged up to ca79036 before Phase 0
trunk: dev
---

# Wallet follow-ups 3: a Firefox fee pick that saves, error objects in integrity logs

Two wallet issues found by the program's own leads. One arc, one PR against `dev`.

- **#297.** On Firefox a sponsor pick in the fee card of an app window or an authwit popup is not saved. The card writes the picked menu row, whose `fpc` is a Vue reactive Proxy, and Firefox's `storage.local.set` refuses a Proxy. The fix: the card saves a plain record, the storage boundary refuses on every engine any value that cannot be structured-cloned, and the write's failure is handled.
- **#295.** Five account-integrity and account-service log lines pass `String(error)`, so the redactor's error projection never runs. The fix passes the error under a named key. The issue named two of the five lines.

Recon: [recon.md](recon.md). Owner questions: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults: [lessons/phase-0.md](lessons/phase-0.md). Live progress: [STATUS.md](STATUS.md).

## Issue map (the arc that closes each issue)

| Issue | Arc | Closes when |
|---|---|---|
| #297 | arc 1 (Phase 1) | arc 1 merges |
| #295 | arc 1 (Phase 2) | arc 1 merges; its optional scanner rule is dropped with the reason (D4), stated in a comment on the issue |
| #281 | no arc | The e2e lane that owns it re-lands its relay once #297 is on `dev` (its relay surfaced #297 and was reverted out of #298) |
| #294 | no arc | `owner-decision` |
| #290 | no arc | `owner-decision` |
| #262 | no arc | waits on tokens-and-balances arc 1 (#271) |
| #277 | no arc | waits on decision page 7, P7-09 |

## Outcome & Quality Bar

**For whom.** A person on Firefox who approves an app's transaction or toggles an authwit setting and picks a sponsor to pay the fee. Also a maintainer who reads an exported log after an integrity failure.

**What excellent looks like.**

1. On Firefox, a sponsor pick is saved and comes back the next time the card opens, as on Chrome today. A real Firefox run proves it: after the pick, the account's saved record names the sponsor's exact FPC id. No `DataCloneError` reaches Firefox's stderr in the seven network files that raised it (the base count is recorded; the fix count is 0).
2. Every unit test that writes through the real storage facade refuses a Proxy, whatever fake sits under it. An unhandled refusal also shows on the Chrome lanes, not only on Firefox. No current caller changes behaviour.
3. A failed fee-pick write is caught and logged once at `error`, with the error under a named key. Nothing is swallowed and nothing is left unhandled.
4. Each of the five log lines records a thrown `Error` as the projected `{ name, message }` object, URL-scrubbed and capped, never as a finished string.

**What good enough looks like.** No new screen state, copy or row. No change to Send's own pick (already plain). No change to the other callers, which the audit found plain. No new scanner rule. No hardening of the legacy key's reader (D10).

## Assumptions

### Facts (verified against the tree at 0643a14)

- F1. `persistSelection` writes the picked row into `nulo:ui:feePaymentMethods`, and `handleMethodPicked` calls it as `void persistSelection(m)` (`apps/extension/src/popup/components/modules/send/FeeSettingsCard.vue:362-373`, `:391-402`).
- F2. The emitted row is a plain object; its `fpc` is a Proxy read from `registeredFpcs` (a deep `ref`), `fpcEdits` (a `reactive(Map)`) or the Pinia store (recon § #297).
- F3. Every other `storageLocalSet` caller writes plain data for every value its code produces. `BalanceView.vue` is not a caller (an unused import). `syncedRef.js:18` is a caller the issue missed; it writes a number or `null`, and it adopts a stored value without checking its type, so a tampered stored object would come back reactive and its watcher would write a Proxy (refused on Firefox today, and on Chrome too after this plan).
- F4. The saved record's readers use `type`, `title`, `subtitle`, `fpc.id` and `fpc.isProtocol`, and `fpc`'s truthiness (`FeeMethodRow`). No reader uses a saved `spend`, `disabled`, `disabledReason`, `setAside`, `checking`, `fpc.type`, `fpc.name`, `fpc.address`, `fpc.profileId` or `fpc.chainId` (recon § Readers; both audit legs traced the same-identity re-run path: `derivedSettings`, `payerOut`, `feePayer`, `sponsorFunding`, `sponsorShortText`, `onFpcUpdated`, the verdict watch, `touchedSince`, `snapshotRowFor`, `FeeMethodRow`, the selector trigger, `fpcs/index.vue`).
- F5. `structuredClone` refuses a Vue reactive Proxy on Bun 1.4.2 (JavaScriptCore) and on Node (V8) with a `DataCloneError` (a `DOMException`, which `trim` projects: `ERROR_TAGS` at `apps/extension/src/wallet/logger/utils.ts:157`).
- F6. `FeeSettingsCard.test.ts`'s storage fake returns stored values by reference from `get` (about line 155) and stores them by reference in `set` (about line 162). So today a write can mutate the backing before `set` runs, and the fake accepts a Proxy that Firefox refuses.
- F7. `LoggerStore.log(source, level, ...data)` runs `trim` over `data`, and `data[0]` is the line's message (`apps/extension/src/wallet/logger/store.ts:61,76`). `trim` projects an `Error` under any key to `{ name, message }` (`utils.ts:174,201`).
- F8. Five `this.logger.log(..., LogLevel.Error, "<message>", String(x))` lines exist: `account-integrity/coordinator.ts:83,176`, `account/service.ts:171,652,657`.
- F9. `packages/extension-messaging/src/core/base-client.ts:248` logs `String(event)` at debug: a validated event name that can be a symbol, on purpose.
- F10. CI's Firefox lane runs all seven network files proverless (`.github/workflows/pr-extension-network-e2e-firefox.yml:149-176`).
- F11. The fee menu rows carry `data-fpc-id` (`FeeMethodSelector.vue:69`). FPC rows live in `chrome.storage.local` under `nulo:core:fpcs@<id>` as JSON with an `address`; `tests/e2e/network/fee-sponsor-funding.test.ts:96-104` already finds a row's id by address, and `tests/e2e/fixtures/aztec.ts:186` (`getSponsoredFpcAddress`) gives the sponsor's address.
- F12. Persisted shape: narrowing `nulo:ui:feePaymentMethods`'s record is a persisted-shape change to a UI key. CLAUDE.md § Persisted-storage shape changes records the repository as pre-production ("the CURRENT state"), where no migration is written. That is the only ground for writing none: once production users exist, every persisted-shape change needs a numbered migration, whatever the readers tolerate (A2).

### Inferences (the gates prove them)

- I1. All ten `DataCloneError`s the issue counted come from `persistSelection`: the seven files make exactly ten sponsor picks in an app window or an authwit popup (recon). Firefox prints these errors as `JavaScript error: undefined, line 0`, with no location. Proof by elimination: the fix changes only the card's write. Any other reactive write in these flows is still refused by Firefox, and is now refused by the boundary too, with the same message. So a fix-run count of 0 together with the positive readback (Phase 1 step 5) supports the attribution and proves the pick persists in the pinned flow. The `.catch` also changes what reaches stderr, so the count alone is not proof; the per-file base observations stay on record.
- I2. Cloning at the boundary changes no write any current caller makes from values its own code produces (F3). The unit suites and the Chrome and Firefox smoke runs prove it.
- I3. Saving only `type`, `title`, `subtitle` and `fpc: { id, isProtocol }` changes nothing a person sees or pays with (F4). The same-identity re-run test (Phase 1 step 3), run for a protocol sponsor and a hand-added one, proves it.

### Asks

- None open. A1 (resolved by evidence, F10): the Firefox network runs use `NULO_E2E_PROVERLESS=1` for all seven files, in two calls, matching CI. The error comes from a UI write and does not depend on proving. Both audit legs agreed.
- A2 (resolved by the orchestrator, D-orch-2: no migration): F12 rests on CLAUDE.md's pre-production statement. The code ships to the stores, but the ruleset says flipping to production is a deliberate owner decision recorded in that section, and it has not been flipped.

## Architecture & Implementation

### Proposed architecture

Two layers, each with one job.

1. **The cause, at the caller.** The fee card saves a plain record, not its menu row. A pure projection `savedSelectionOf(method)` in `fee-helpers.ts` sits beside `resolveSavedSelection`, which reads the same key. It copies only what the readers use (F4): `type`, `title`, `subtitle`, and `fpc: { id, isProtocol }`. It leaves `fpc` out when the row has none.
2. **The contract, at the boundary.** `storageLocalSet` takes only structured-cloneable items. It clones them on entry, before it waits for the migration barrier, and writes the clone. The `unless` check stays after the wait, unchanged. Two consequences, both deliberate:
   - A non-cloneable value (a Proxy, a function) is refused every time, on every engine, whether or not the barrier is busy and whether or not `unless` would skip the write. A skip can then never hide a caller's bug.
   - The write records the value the caller handed in at the call. No current caller changes `items` during the wait.
   Nothing is unwrapped: a caller that hands in reactive state gets an error, not a silently rewritten value.

The card handles the write's rejection: `persistSelection(m).catch((error) => console.error("Failed to save the fee method", { error }))`, the same shape as `pickForSend`'s handler two functions above, with the logging policy's named key. The cache update keeps its place after the write, so a successful pick updates `cacheStore.feePaymentMethods` exactly as today.

### Key interfaces

```ts
// fee-helpers.ts
/** The one-pick-per-account key's record: what the trigger shows while the card loads, and the
 *  sponsor's identity and whether Nulo vouches for it, as plain values. */
export type SavedSelection = Pick<FeeMethodOption, "type" | "title" | "subtitle"> & {
	fpc?: Pick<RegisteredFpc, "id" | "isProtocol">
}
export function savedSelectionOf(method: FeeMethodOption): SavedSelection

// utils/storage.ts (signature unchanged; still async, so the clone's throw is a rejection)
export async function storageLocalSet(items: Record<string, unknown>, options?: { unless?: () => boolean }): Promise<boolean>
```

`SavedSelection` stays its own type: the card assigns it to `selectedMethod` during pre-fill (an untyped SFC), but nothing casts it to a full `FeeMethodOption`.

### Data and control flow (a sponsor pick in an app window)

1. `FeeMethodSelector` emits the plain row; `handleMethodPicked` sets `selectedMethod`.
2. `persistSelection` reads the saved map, sets `map[address] = savedSelectionOf(row)` and calls `storageLocalSet`.
3. `storageLocalSet` clones the items (a Proxy anywhere rejects here), waits for the barrier, checks `unless`, writes the clone.
4. On success the card updates `cacheStore.feePaymentMethods`. On failure the `.catch` logs one `error` line with `{ error }`.
5. On the next open, `prefillSelection` shows the saved `title`. On a same-identity re-run the saved record also drives settings and the payer flags until the commit (F4). The commit resolves the record by `type` and `fpc.id` against fresh rows (unchanged).

### File-level change map

| File | Change |
|---|---|
| `apps/extension/src/utils/storage.ts` | `storageLocalSet` clones `items` with `structuredClone` on entry and writes the clone; the doc comment states the contract in one or two sentences (items must be structured-cloneable, because Firefox refuses what Chrome would serialise; the value is taken at the call) |
| `apps/extension/src/popup/components/modules/send/fee-helpers.ts` | add `SavedSelection` and `savedSelectionOf` |
| `apps/extension/src/popup/components/modules/send/FeeSettingsCard.vue` | `persistSelection` writes `savedSelectionOf(method)`; `handleMethodPicked` catches the rejection |
| `apps/extension/src/utils/storage.test.ts` | two refusal tests, a success control, and the snapshot case added to the existing blocked-write test |
| `apps/extension/src/popup/components/modules/send/FeeSettingsCard.test.ts` | the fake clones on `get` and `set`; a save-and-remember test; a same-identity re-run test for both sponsor kinds; a failed-write test |
| `apps/extension/tests/e2e/network/tx-sendTx-sponsoredFpc.test.ts` | before the pick, the account has no saved record; after it, the record names the sponsor's exact FPC id |
| `apps/extension/src/wallet/services/account-integrity/coordinator.ts` | `:83` `{ error }`; `:176` `{ error: writeError }` |
| `apps/extension/src/wallet/services/account/service.ts` | `:171` `{ error: err }`; `:652` `{ error: writeError }`; `:657` `{ error: closeError }` |
| `apps/extension/src/wallet/services/account-integrity/coordinator.test.ts`, `account/runtime-mismatch.test.ts`, `account/service.test.ts` | the builders return their real `LoggerStore`; one assertion per changed log line |

### Trade-offs and alternatives not taken

- **Unwrap at the boundary (competing outline B).** B1, `jsonSanitize`, would silently rewrite persisted values on Firefox: a `Map` becomes an entries array, a `Set` an array, a `bigint` a string, and `undefined` keys vanish. B2, a hand-written `toRaw` walker, is new code for one caller. Both hide the cause: the card would keep persisting a live view row. Rejected (D1).
- **Caller only (outline C).** The next caller that hands in reactive state would fail on Firefox only, where extension-page errors are invisible to the suite (#281), and every by-reference test fake would keep accepting it. Rejected (D1).
- **Reuse `recordOf` and `previewForPick` for this key.** The sponsor preview carries no `fpc`, so on a same-identity re-run the settings would drop to `undefined` and the payer flags would change. The pre-fill title of a private Fee Juice pick would change too. Rejected (D2).
- **A spread copy, or the full declared `fpc`.** It keeps transient view flags, or fields no reader uses (`address` would sit stale in storage for a future reader to trust). Rejected (D2).

## Decision ledger

Each line: the decision, both legs' views, the outcome and why.

- **D1. Where the fix lives for #297.** Draft: both layers. Codex: both layers; B1 rewrites semantics, B2 is an unneeded Vue-aware codec, caller-only lacks the contract. Opus: both layers; caller-only leaves every by-reference fake unfaithful. **Outcome: both layers.**
- **D1a. When the boundary clones.** Draft: on entry. Codex round 1: just before the write, to keep today's skip result and write-time snapshot. Opus: on entry, so the refusal does not depend on the barrier's read or a running migration and an `unless` skip cannot hide a caller bug. Codex, resumed: agrees with entry, provided the contract is written down (cloneability is an unconditional input requirement; valid values are taken at the call) and a test pins refusal even when `unless` would skip. **Outcome: on entry, with that test and that doc sentence.**
- **D2. The saved record's shape.** Draft: copy the full declared `fpc`. Opus: trim to `{ id, isProtocol }`; nothing reads the rest, and a stored `address` is a stale value a future reader might trust. Codex: reuse existing types rather than restating them; agreed to the trim on resume. **Outcome: `{ type, title, subtitle, fpc?: Pick<RegisteredFpc, "id" | "isProtocol"> }`.**
- **D3. #295's scope.** Both legs: all five lines; two would leave the same integrity path inconsistent. **Outcome: five.**
- **D4. A `String(…)` refusal in `log-payload-ban.test.ts`.** Draft: drop, because a direct-argument rule refuses `base-client.ts:248`. Codex round 1: a rule limited to error-level `logger.log` calls has no false positive on the tree. Opus: drop for a stronger reason: the defect is "an error flattened to a string", which has several spellings on the tree (`String(e)`, `getErrorData(e)` at 13 log sites, a bare `err.message` at `security/export/full.vue:413` and `utils/files.ts:181`), so a rule on one spelling at some levels gives false coverage and adds level parsing to a textual scanner. Codex, resumed: agrees; its bounded rule was a counterexample, not a complete guard. **Outcome: drop; the reason goes on #295; D8's issue is widened to every spelling.**
- **D5. The fee card's failure log.** Both legs: `{ error }`, per CLAUDE.md § Logging policy. **Outcome: `{ error }`; `pickForSend`'s `getErrorData(e)` stays for D8's issue.**
- **D6. #295's tests.** Draft expected `data` to be `[{ error }]`. Both legs (High): wrong, `data[0]` is the message (F7). **Outcome: one assertion per changed line; find the entry by `data[0] === "<message>"` and assert `data[1]` equals `{ error: { name: "Error", message: "<thrown message>" } }` (on base `data[1]` is `"Error: <thrown message>"`); the builders return the `LoggerStore` they already construct; existing fail-closed assertions stay.**
- **D7. Firefox network validation.** Both legs: all seven files proverless, in two sequential calls (F10). **Outcome: as drafted.**
- **D8. Other ways errors are flattened into log lines.** Both legs: out of this lane, one issue. Widened after D4: the issue inventories `String(error)` (fixed here), `getErrorData(error)` (13 log sites, with a by-name `EXTRA_NAMES` entry as the scanner fix that fits its mechanism) and direct `message` / `stack` extraction, and separates error flattening from legitimate scalar formatting (such as `base-client.ts:248`). **Outcome: the close-out opens it (dedupe first).**
- **D9. `cacheStore.feePaymentMethods` has no reader.** Both legs: keep its update; the no-ask record names it. **Outcome: kept; disposition line in the Outcome.**
- **D10. The legacy key's pre-fill trusts an unvalidated stored record** (raised by both legs). On a same-identity re-run, a tampered record could show any title, name a dangling `fpc.id`, or carry `isProtocol: true` so the readout says "Nothing" until the commit. Opus: file an issue. Codex, resumed: a disposition only; no lower-privilege path into the key exists (its writers are the card and the FPC settings page's delete, and it is in no backup slice). **Outcome: disposition in the Security section and the Outcome; no issue. Hardening the reader would change what the pre-fill shows, which is an owner question with no evidence behind it.**
- **D11. Positive Firefox evidence** (Opus, Medium). Once the `.catch` lands, a broken projection would be caught and logged through the console sniffer, not printed to stderr, so a 0 count alone cannot tell a working fix from a caught failure. Codex, resumed: necessary and in scope; require the exact sponsor id and an empty record before the pick. **Outcome: `tx-sendTx-sponsoredFpc.test.ts` reads the saved record back (Phase 1 step 5), and that file runs on Chrome and Firefox.**
- **D12. The Phase 1 pin** (Opus, blocking; Codex agreed). The fixture's protocol sponsor is the card's default, so "reconciles to it" passes on base, and the by-reference `get` let a failed write still change the backing. **Outcome: the fake clones on `get` and `set`; the test seeds a protocol sponsor and a hand-added one and picks the hand-added one; the remount runs in a fresh Pinia with a deferred FPC read; the same-identity re-run test runs for both sponsor kinds, since a dropped `isProtocol` reads as "unvouched" just as a hand-added one does.**
- **D-orch-1. Delivery.** Single arc: one branch, one PR against `dev`, no stack; the close-out lands as that PR's final commits.
- **D-orch-2. Ask A2: no migration.** CLAUDE.md § Persisted-storage shape changes still records the repository as pre-production, and the owner has not flipped it. The narrowed record is a launch-baseline change: no numbered migration, no compatibility read of the old shape beyond what this plan specifies.
- **D-orch-3. D11 stands.** The readback in `tx-sendTx-sponsoredFpc.test.ts` is in scope; the report gives the readback result and the stderr count, base and fix, per browser.
- **D-orch-4. D1a's contract is written where it binds:** a TSDoc sentence on `storageLocalSet` (cloneability is an unconditional input requirement; the snapshot is taken at the call; `unless` unchanged) and a unit case that feeds a Proxy to a storage that accepts it, as Chrome's does, and expects the refusal.
- **D-orch-5. D8's issue is filed at close-out**, deduped first (`gh issue list --state all --search "getErrorData log"`), labelled `privacy`, five sections, with the plan's inventory and the scanner fix that fits its mechanism.
- **D13. The same-identity re-run test is red on base on its own assertion** (implementation finding, Phase 1 step 7). The plan expected it red only through the unhandled rejection. On base nothing is saved, so the re-run has no record to pre-fill and emits no new payer: the "re-run started" check (a new payer emission) fails, after its read counts pass. Kept as written: the pre-fill landing is the path the guard checks, and with the fix every assertion holds. Evidence in [lessons/phase-1.md](lessons/phase-1.md).

## Security & Adversarial Considerations

- **Threat model.** No new trust boundary. `chrome.storage.local` is extension-private. The plan narrows what the card writes and leaves every reader's handling unchanged.
- **Residual trust (D10).** The legacy key's pre-fill installs the stored record as the selection, and on a same-identity re-run that record drives settings (`fpc.id`), the payer flag and the readout's payer (`fpc.isProtocol`) until the commit replaces it. A tampered record could mislead for that interval. The key's writers are the card and the FPC settings page's delete; it is in no backup slice; a hostile app has no path to it. A party that can write the extension's storage already controls far more. Recorded, not changed.
- **Fail closed.** The boundary refuses instead of rewriting, so a non-cloneable value never reaches storage on either engine, and the caller learns it. No `try/catch` swallows the refusal: the card's handler logs it at `error`. Cloneability is not validation: the boundary still accepts any cloneable shape, and each caller owns what it writes.
- **Log redaction.** #295 moves five `error`-level lines from an uncapped string to the projected object (URL-scrubbed, capped at 200 characters) when the thrown value is an `Error`; a thrown string stays a string. Those lines are captured for every user with every toggle off and reach an exported bug report. Keeping secrets out of an error message stays the call site's job. The new fee-card line logs `{ error }` too.
- **No Chrome-only branch.** One code path on both engines; the tests clone with the platform's own `structuredClone`.
- **Least privilege, cryptography, supply chain.** No change: no new dependency, permission, key or workflow.

## UI impact

None. Surfaces touched: the fee card in app windows and authwit popups (`FeeSettingsCard.vue`). The orchestrator's no-ask record (the #210 precedent), quoted: "the pick is remembered on Firefox exactly as it is on Chrome today, the card's FPC cache updates, and no unhandled rejection is raised; existing states and words only, nothing new on any screen." The saved record keeps every field a reader uses (F4, I3), so the loading trigger, the settings and the readout read as today. No screenshot is needed: no rendering changes.

## Phases

### Phase 0: baseline evidence on base

1. Confirm the worktree is at the plan's base: `git log --oneline -1` prints 0643a14, or the `origin/dev` head merged in before work starts.
2. Run the Firefox network call A on base, writing all output to a log:
   `cd <worktree> && NULO_E2E_BROWSER=firefox NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/same-token-concurrent-sends.test.ts tests/e2e/network/concurrent-sendtx-confirm.test.ts tests/e2e/network/concurrent-sendtx-approve.test.ts > ~/.cache/nulo-backlog/wallet-followups-3/ff-base-a.log 2>&1; echo "exit=$?"`
3. When call A has ended, run call B the same way with `popup-escape-layered`, `tx-sendTx-sponsoredFpc`, `authwit-lifecycle` and `selfpay-phase` into `ff-base-b.log`.
4. Count the errors in each log: `grep -c "DataCloneError: Proxy object could not be cloned" <log>; echo "grep_exit=$?"`. Exit 1 means zero matches; exit 2 means the log could not be read.
5. Record both counts, both exit codes, each file's outcome and, where the log shows it, the test in flight when each error printed, in `lessons/phase-0.md` and `STATUS.md`.

**Validation gate.**
- Commands: steps 2 to 4.
- Pass criteria: the summed count is at least 1 and is written down, and neither `grep` exited 2. A red test on base is recorded, not fixed here.
- Layers: e2e-live-network (Firefox).

### Phase 1: #297, a plain record and a refusing boundary

Write the tests first and see them red on base sources, then change the code.

1. In `FeeSettingsCard.test.ts`, make the fake clone like a browser: `get` returns `structuredClone` of what it finds, and `set` stores `structuredClone(items)` before it changes the backing.
2. Add the save-and-remember test. Seed two sponsors: `s1` with `isProtocol: true` (Nulo's, the default) and `s2` with `isProtocol: false` (hand-added). Mount a one-pick-per-account card (no `originPrivacy`) and pick `s2`. Then assert:
   - the saved record for the account is the literal `{ type: "fpc", title: <s2's title>, subtitle: "sponsored", fpc: { id: "s2", isProtocol: false } }`;
   - `cacheStore.feePaymentMethods` holds an entry for `s2`;
   - a second card, mounted in a fresh Pinia on the same storage with its FPC read deferred, shows `s2`'s title in the stub selector's `data-active-title` while the read is held; once the read lands, `data-active-type` is `fpc` and the emitted settings name `fpcId: "s2"`.
3. Add the same-identity re-run test, once for `s1` and once for `s2` (`test.each`). Pick the sponsor, then re-run init on the same identity (`setProps({ profile: { ...profile } })`) with the balance and FPC reads held. While held, first assert the re-run has started: the saved selection was read again and both deferred reads were requested a second time, and a new payer emission arrived. Then assert the emitted settings name the sponsor's `fpcId`, the emitted payer is `{ type: "fpc", fpcId, isProtocol }` with the sponsor's own `isProtocol`, and the stub readout's `data-payer` is `sponsor` for `s1` and `unvouched` for `s2`. Release the reads and assert the same three values. This test guards the projection, not the bug: it turns red if `savedSelectionOf` drops a field the window reads (a lost `isProtocol` reads as `unvouched` for `s1`). On base it fails only through the refused write's unhandled rejection.
4. Add the failed-write test: the fake's `set` rejects once. Assert `console.error` was called once with `"Failed to save the fee method"` and an object whose `error` is the rejection; the storage backing and `cacheStore.feePaymentMethods` are unchanged; the selection stays the pick. Vitest fails the run on an unhandled rejection, so that case is covered too.
5. In `tests/e2e/network/tx-sendTx-sponsoredFpc.test.ts`:
   - before `approveExecute`, read `nulo:ui:feePaymentMethods` through `execPopup` (an extension page) and require no record for the fixture's `accountAddress`;
   - find the sponsor's FPC id the way `fee-sponsor-funding.test.ts:96-104` does, matching the address from `getSponsoredFpcAddress()`;
   - after `approveExecute(execPopup, { feeMethod: "sponsored" })`, which confirms without waiting for the save, poll in the wallet popup the test already opens: `waitForFunction` (bounded, as at `send-keyboard.test.ts:143-154`) until the record for `accountAddress` has `type: "fpc"` and `fpc.id` equal to that id. Compare addresses the way the card keys them; if the fixture's spelling differs in case, compare case-insensitively, as `fee-sponsor-funding.test.ts` does for FPC addresses.
6. In `storage.test.ts`, add:
   - the refusal test: `storageLocalSet({ k: { m: reactive({ a: 1 }) } })` rejects with a `DataCloneError`, and `chrome.storage.local.set` is never called;
   - the skip test: the same value with `{ unless: () => true }` also rejects (the refusal does not depend on the skip);
   - the success control: a plain nested value is written deep-equal to the input;
   - the snapshot test, extending the existing "a write BLOCKS while a migration is running" case: pass a nested mutable value, mutate it while the barrier holds the write, assert nothing is written yet, clear the barrier, and assert the value as it was at the call is what is written. This pins the clone-on-entry contract (D1a); the existing post-barrier `unless` test stays as it is.
7. Run the unit tests on base sources: `cd apps/extension && bun run test -- src/utils/storage.test.ts src/popup/components/modules/send/FeeSettingsCard.test.ts`. Record the expected outcome per kind of test in `lessons/phase-1.md`, with the output:
   - bug pins, red on base on their own assertions: step 2 (nothing saved; the remount reconciles to `s1`, not `s2`), step 4 (no `console.error`; the rejection is unhandled), step 6's two refusal tests (`set` is called with the Proxy) and the snapshot test (the mutated value is written);
   - projection guard, red on base only through the refused write's unhandled rejection: step 3;
   - success control, green on base: step 6's plain write.
8. Run the e2e file on base sources on Firefox: `cd <worktree> && NULO_E2E_BROWSER=firefox NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/tx-sendTx-sponsoredFpc.test.ts`. Expect red at the readback. Record it.
9. Add `SavedSelection` and `savedSelectionOf` to `fee-helpers.ts`.
10. In `FeeSettingsCard.vue`, make `persistSelection` write `savedSelectionOf(method)`, and make `handleMethodPicked` call `persistSelection(m).catch(...)` with `{ error }`.
11. In `storage.ts`, clone `items` with `structuredClone` as the first statement of `storageLocalSet`, pass the clone to `chrome.storage.local.set`, and state the contract in its doc comment.
12. Run the gate.

**Validation gate.**
- Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun run test -- src/utils/storage.test.ts src/popup/components/modules/send/ src/popup/components/modules/fee-cards.comount.test.ts src/popup/windows/execute/ src/popup/pages/send.integration.test.ts`; `bun run test`.
- Pass criteria: every command exits 0. The red output of steps 7 and 8 and the green rerun of step 7 are in `lessons/phase-1.md`. No existing test was loosened or skipped. Existing sponsor-pick tests that turned red on base under the cloning fake are green again with no edit beyond the fake.
- Layers: typecheck/lint, unit, component, e2e-live-network (Firefox, the red half).

### Phase 2: #295, error objects in five log lines

1. Make the three test builders return the `LoggerStore` they construct (`coordinator.test.ts`, `runtime-mismatch.test.ts`) or reach the one `service.test.ts` uses.
2. Add the log assertions (D6). Each finds the entry whose `data[0]` is the line's message and expects `data[1]` to equal `{ error: { name: "Error", message: "<thrown message>" } }`:
   - `coordinator.test.ts`: a boot verify whose deriver throws, then `"boot integrity verification failed"`; a mismatch whose block persist throws, then `"integrity block persist failed"`.
   - `account/runtime-mismatch.test.ts`: extend the fail-closed test with `"integrity block persist failed"`; add a case where the session close throws, then `"integrity session close failed"`.
   - `account/service.test.ts`: a sweep that throws during init, then `"imported-key orphan sweep failed"`.
3. Run them on base sources. Expect red: `data[1]` is `"Error: <thrown message>"`. Copy the output into `lessons/phase-2.md`.
4. Change the five lines to `{ error }`, `{ error: writeError }`, `{ error: err }`, `{ error: writeError }`, `{ error: closeError }`.
5. Run the gate.

**Validation gate.**
- Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun run test -- src/wallet/services/account-integrity src/wallet/services/account src/utils/log-payload-ban.test.ts`; `bun run test`.
- Pass criteria: every command exits 0; the red and green runs are in `lessons/phase-2.md`; existing fail-closed assertions are unchanged.
- Layers: typecheck/lint, unit.

### Phase 3: final validation on the arc head

Warning: smoke loads whatever `dist/<browser>` holds, and `e2e:agent` rebuilds it with other flags. Build right before each smoke run, and never run two e2e runs in this worktree at once.

1. Run `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all` and `bun run lint:actions` (the standing pre-push gate; no workflow changes here).
2. Build and run Chrome smoke at retry 0:
   `cd <worktree> && VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome && cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- --retry=0`
3. Build and run Firefox smoke the same way, with `build:firefox` and `NULO_E2E_BROWSER=firefox`.
4. Run the Phase 0 calls A and B on the arc head, into `ff-fix-a.log` and `ff-fix-b.log`.
5. Run the changed e2e file on Chrome: `cd <worktree> && NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/tx-sendTx-sponsoredFpc.test.ts`.
6. Count `DataCloneError: Proxy object could not be cloned` in `ff-fix-a.log` and `ff-fix-b.log` as in Phase 0 step 4.

**Validation gate.**
- Commands: steps 1 to 6.
- Pass criteria:
  - every test command exits 0 at retry 0;
  - each fix-run count is 0, with `grep` exit 1 (no match) and never exit 2;
  - `tx-sendTx-sponsoredFpc` passes its readback on both browsers.
  - The base count, the fix count and each file's outcome go in `lessons/phase-3.md`, `STATUS.md` and the PR body. Smoke has no sponsor pick in an app window, so its runs prove only that no other write path regressed.
  - A red file gets one rerun only for a known flake fingerprint; anything else is a fix.
- Layers: typecheck/lint, unit, component, e2e smoke (Chrome, Firefox), e2e-live-network (Firefox, and Chrome for the changed file).

## Delivery

Single-arc plan, the orchestrator's standing D-orch-1: one branch (`worktree-wallet-followups-3`), one PR against `dev`, no stack. The plan's close-out lands as that PR's final commits.

| Arc | Phases | Stacks on | `/code-review` |
|---|---|---|---|
| arc 1 | 0, 1, 2, 3 | `dev` | off |

- **PR title** (at most 93 characters, lower-case subject): `fix: save a firefox fee pick as plain data, log integrity errors as objects`.
- **PR body:** what changed and why (both issues); the validation run with outcomes, including the base and fix `DataCloneError` counts and the readback on both browsers; `Closes #297` and `Closes #295`; the claims that did not hold (`BalanceView` is no caller; `syncedRef.js` is one; five lines, not two; the dropped scanner rule).
- **Open it** with `gh pr create --base dev` only after the Phase 3 gate and the Codex fix loop have converged. Open it without labels. Then check the run list: add `e2e:extension-network` or `e2e:extension-smoke` only if a path filter skipped a suite the change needs.
- **Commits:** conventional, lower-case subject, signed (`git log --format='%h %G?' -3` shows no `N`), each ending with the Co-Authored-By trailer the orchestrator's brief names.
- **Do not merge.** The orchestrator merges.

## Post-implementation

Run these steps in order after the Phase 3 gate passes. `code_review` is `off`, so there is no `/code-review` step.

1. **Codex audit.** Run `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`. The prompt carries: the diff from the plan base (`git diff 0643a14...HEAD`, or from the merged `origin/dev` base), this `plan.md` with its decision ledger, an adversarial and security ask, and both rules below, word for word.
2. **Fix loop.** Verify each finding against the repository first. Apply the accepted fixes, commit, and log the round (the consult and its verdict) in `lessons/phase-3.md`. Then resume the same session with `resume-codex.sh <session-id> <followup-file> <codex-dir> high` and the fix diff. Repeat until a round brings no new material finding. Hard stop at three rounds: if round three still finds material problems, stop and surface them in the report.
   - **No-over-engineering rule:** "Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."
   - **Comment-quality rule:** "Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."
3. **Delivery.** Merge `origin/dev` into the branch first, read what changed in `implementations-plan/index.md` and `lessons.md` (e2e-followups-2's close-out edits both), rerun the fast gates, then open the PR per the Delivery section. This is the first PR the plan opens.
4. **Close-out, as the PR's final commits.**
   - Write an `## Outcome` block directly after the front matter: date, status, what shipped with the PR number, the dispositions (D4 dropped, D9 kept, D10 recorded, #297's `BalanceView` claim, #295's count), an `Open items:` line, and a line retiring this plan's `/goal` and `/loop` seeds.
   - Promote the generalizable gotcha to `implementations-plan/lessons.md` (under Extension runtime, one line, linking the archived plan; dedupe first, keep the file under 8 KiB): Firefox's `storage.local.set` structured-clones and refuses a Vue reactive Proxy that Chrome serialises; `storageLocalSet` now clones on entry so both engines refuse.
   - File open items, per the table below. D8 becomes one issue, after `gh issue list --state all --search "getErrorData"` and a search for "flatten", with the five sections (`## What happens`, `## Where`, `## Impact`, `## Possible fix`, `## Record`) and the `privacy` label.
   - Comment on #295 with D4's reason, and on #297 with the claims that did not hold.
   - Delete `STATUS.md`.
   - In its own commit: `git mv implementations-plan/wallet-followups-3 implementations-plan/archive/wallet-followups-3`, repair any relative link the extra level breaks (`git grep -n wallet-followups-3`), and move the index line into `implementations-plan/archive/index.md` marked completed.
   - Run `bun run check:plans` on the staged files before each close-out commit.

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

5. **Report and wait.** Write the report: what shipped, each panel decision with both views, the base and fix counts, open items by number. Merging is the orchestrator's call.
6. **Teardown after the merge.** The check is `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/wallet-followups-3/plan.md`. A `/loop` session runs it on every firing. A session without a loop arms one background wait right after its report (`Bash` with `run_in_background` at the maximum timeout: `until <the check>; do sleep 300; done`). Once it succeeds, run `ExitWorktree` with `keep` if the session entered through `EnterWorktree` (a session started inside the worktree has nothing to exit), then `agent-worktree done wallet-followups-3 --merged`. It refuses rather than forces: relay a refusal and stop. This step is standing authorization; do not ask first.

## Audit verdicts

- **Codex, round 1** (gpt-6.1-sol, high): conditional approve (with conditions: correct D6's log assertions, preserve guarded-write semantics, and test the same-identity prefill path).
  - Accepted: D6's buffer shape (High); the `jsonStringify` correction (a `Map` becomes an entries array, not `{}`); F3 and I2 qualified for `syncedRef`'s unchecked adoption; the `grep -c` exit-1 handling; the persisted-shape status (F12); reusing existing types; a literal expected record; the whole `items` cloned in the fake; the failed-write test asserting unchanged storage and cache; the same-identity re-run test; residual trust described accurately; cloneability described narrowly, not as engine equivalence; the redaction claim limited to thrown `Error`s.
  - Rejected after the resume: "clone just before the write" (D1a), withdrawn by Codex; the error-level `String(…)` rule (D4), withdrawn by Codex.
- **Opus 5.5 Plan agent, round 1:** conditional approve (with conditions: fix the Phase 2 assertion shape; a base-red "remembered" pin with a cloning `get` and a hand-added sponsor; positive Firefox evidence).
  - Accepted: D6 (High); F6 incomplete (`get` by reference); D12's pin; D11's readback; D2's trim; Outcome 2 reworded; D4's stronger reason and D8's widening; the persisted-shape statement; the smoke count stated as checking nothing.
  - Rejected: an issue for the legacy key's pre-fill trust (D10): no lower-privilege write path exists, and Codex agreed.
  - Noted: `syncedRef.js`'s unawaited write (a future object value would be an unhandled rejection on both engines) stays out; its one user writes a number.
- **Codex, round 1 resumed:** conditional approve (with conditions: adopt these settlements, test both sponsor classifications during same-identity prefill, and make browser readback prove the new pick's exact identity). All three are now in Phase 1 (steps 3 and 5) and the ledger.
- **Final fresh Codex pass** (new session, gpt-6.1-sol, high): conditional approve (with conditions: pin clone-on-entry snapshot semantics across a migration wait; correct F12's production-migration claim).
  - Accepted: the snapshot test (Phase 1 step 6); F12 rewritten and A2 added; I1 reworded (supports attribution, proves persistence in the pinned flow); Phase 1 step 7 split into bug pins, the projection guard and the success control; the re-run test first proves the re-run started; the e2e readback reads through `execPopup` and keys on the fixture's `accountAddress`; recon's `jsonSanitize` line corrected; `bun run lint:actions` added to Phase 3.
  - Confirmed: the e2e readback's sequence and the FPC row lookup; all five Phase 2 failure paths reachable in the existing harnesses; `LoggerStore`'s buffer shape; D10's disposition; rejecting outline B and `recordOf`+`previewForPick`.
  - Both conditions are met in this version, so the gate's Codex verdict is satisfied without another round.

## Seeds

Recommended: `/goal`. Use exactly one per session; they do not compose.

```
/goal All phases marked ✓ in implementations-plan/wallet-followups-3/plan.md, each ✓ backed by its phase's validation gate reported passing in the transcript; for each phase the agent has printed `LESSONS_FILE=implementations-plan/wallet-followups-3/lessons/phase-N.md`; the Firefox DataCloneError count is printed for the base run (≥ 1) and the fix run (0), and tx-sendTx-sponsoredFpc's readback passes on Chrome and Firefox; `/code-review` was NOT run (code_review: off); the Codex fix loop on gpt-6.1-sol at high converged over the whole diff, evidenced by a resumed pass reporting no new material findings, quoted in the transcript; one PR against dev exists, opened only after the loop converged (`gh pr view` output in the transcript), carrying `Closes #297` and `Closes #295` and the close-out commits, including the archive move (`git show --stat` of that commit in the transcript); `bun run test` and `bun run lint` both report exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/wallet-followups-3 forward. Never idle waiting for input. Each firing:
1. Reality check: read implementations-plan/wallet-followups-3/plan.md and lessons/ (not the chat), including its Outcome & Quality Bar. If that path is gone, the close-out ran: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/wallet-followups-3/plan.md` succeeds → run the teardown now (ExitWorktree keep if entered through EnterWorktree, then `agent-worktree done wallet-followups-3 --merged`), report its output, clear this loop and STOP; fails → babysit the PR's checks only, report once when green, STOP. A live plan.md with an `## Outcome` means an interrupted close-out: finish it. Otherwise rebuild the task list from plan.md; run `git status`, `git log --oneline -5`; with a PR, `gh pr view --json statusCheckRollup`.
2. Waiting on CI is fine; confirm it progresses (`gh run watch <id>` up to 10 minutes), use the wait to review the diff.
3. No task in hand? Take the next pending step in plan.md. After each edit run `bun run lint` and the touched tests. Commit (signed, conventional, lower-case subject).
4. Stuck or facing a decision? Consult Codex (`run-codex.sh … high read-only gpt-6.1-sol`), settle on the stronger argument, log it in lessons/phase-N.md. Never merge, publish, force-push or widen scope; a UI question goes to OWNER-ASKS.md and that part is left out.
5. Same step failed 5 times? Stop retrying; reassess with Codex.
6. Phase green means its plan.md gate passes: paste the result, mark ✓, write the lessons entry, print LESSONS_FILE=…, move on.
7. All phases ✓? Run the Post-implementation section: the Codex fix loop until clean (hard stop at 3 rounds), then the PR, then the close-out commits, then `gh pr checks --watch`, then the report. Merging is the orchestrator's call.
```
