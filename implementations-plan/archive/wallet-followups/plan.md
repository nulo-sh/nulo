---
plan: wallet-followups
tier: mid
status: completed (delivered in #287)
issues: "#256, #257, #258, #259, #268 (arc 1); #262, #277 (no arc)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet) plus the planner's own seed replay; dual audit (Codex gpt-6.1-sol high + one Opus Plan agent); final fresh Codex pass
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-11.
- **Status:** delivered in one PR against `dev`, [#287](https://github.com/nulo-sh/nulo/pull/287) (arc 1, phases 1-5), awaiting the orchestrator's merge; the merge that lands it closes this plan.
- **Shipped:** #257 (New account counts a name of only spaces as empty), #256 (Edit account: New account's duplicate check against every other account, the existing "Already exist" warning, a blank name counts as empty, a trimmed save), #258 (the logs window drops from its document exactly the entries its list drops, in one change set with the append), #259 (the balances fuzz oracle owes a recovery past the gas `retryVersion` at the owe; the store is unchanged; the shrunk tape is pinned), #268 (`useConfigRead`: Display, Privacy and Developer reread after a worker restart, and the hub and Lock moved onto it; the restart e2e case is a four-row table).
- **Orchestrator records:** D-orch-2 (OA-2 A, the trim ships), D-orch-3 (OA-3 A, a blank Edit name counts as empty), D-orch-4 (OA-1 B, the #256 record as worded). OA-1 open on page 11; B shipped.
- **Dropped, rejected, superseded:** #262 and #277 had no arc (each waits on a rewrite of its deletion path: #271 and decision page 7's P7-09); they stay open, untouched here. The store change for #259 was rejected (D1: the store recovered; the oracle misread it). A debug log line in `useConfigRead`'s failed read was rejected (§ Security: no new log lines). The fuzz-oracle lesson was not promoted to `lessons.md` (at its 8 KiB budget; the rule lives in C1's own doc comment); the dropped-port lesson now names `useConfigRead`.
- **Open items:** the `LOG_SOURCES` gap (#288); the Clear-logs listener not re-added on a failed clear (#289); import accepting a duplicate account name (#290, `owner-decision`); the fee card's retrying notice after a debt-free tx-settle failure when the two fee cards share a key (#291). OA-1 is not an issue: the orchestrator carries it on decision page 11.
- **Seeds retired:** the `/goal` and `/loop` seeds below are retired; this plan is a record, not a task list.

# Wallet follow-ups: account name checks, the logs window trim, settings reads after a restart, the balances fuzz oracle

Five small wallet bugs filed by the program's own leads, in one arc and one PR against `dev`.

- **#257.** A New account name of only spaces leaves Create disabled, as an empty name does.
- **#256.** Edit account refuses a name another account already has (compared trimmed), shows the existing "Already exist" warning, and saves the name trimmed. Its blank case follows OA-3.
- **#258.** The logs window drops from its document exactly the entries its list drops, so a long session stops growing the editor. Ships only if the orchestrator's approval records OA-2.
- **#259.** The balances store is right; the fuzz oracle owed a recovery the store had already made. The oracle changes, and the failing tape is pinned.
- **#268.** Settings Display, Privacy and Developer read their config again after a worker restart, through one small composable that the hub and Lock also use.

Recon: [recon.md](recon.md). Owner and orchestrator questions: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Scope

**In:** #256, #257, #258, #259, #268, each with the surfaces it names.

**No arc:**

- **#262** (token purge deletes by id): waits on `tokens-and-balances` arc 1 (#271, a held draft that rewrites the purge path in `token/service.ts`). A fix here would conflict with that rewrite.
- **#277** (profile reset while the node is unreachable): waits on decision page 7's P7-09, which redraws the same deletion path.

**Out, found here (issues at close-out, after a dedupe):**

- Logs from sources missing from `LOG_SOURCES` show in the logs window's first document and leave it at the first rebuild (recon § #258). Which rows the window shows is the owner's call.
- "Clear logs" removes the window's log listener and never adds it back when `clearLogs` rejects, so the window stops receiving logs (`LogsViewer.vue:156-168`). Outside `onLogAdded`, so outside R3's scope here.
- Account import refuses only a blank name and has no duplicate check (`settings/accounts/import.vue:99, 280`), so it can create two accounts with one name. Whether import should refuse is a visible change: `owner-decision`.
- The two fee cards can share a key in one document (I1), against `FeeSettingsCard`'s own rule that `txRefresh` stays off for every subscriber on its key while it is mounted (`FeeSettingsCard.vue:465-470`). There, a failed tx-settle refresh from `GasBalanceCard` degrades gas with no retry debt (D11), and the fee card picks that up on its next FPC recovery (`:726`) and says it is retrying while no gas retry runs. A store or composition change, separate from the oracle; `balances` domain.

## Gates and reservations

- One PR against `dev`, no stack (the orchestrator's standing D-orch-1).
- `LogsViewer.vue` is reservation R3's file: `forms-and-contacts` arc 1 has landed; `chain-endpoints` arc 2b rebases onto this lane. The edit stays inside `onLogAdded`.
- This plan edits neither `tests/helpers/held-read.ts` nor `utils/entity-list.ts` (`forms-and-contacts` arc 2). No reducer changes.
- `settings/lock.vue` changes here; `forms-and-contacts` arc 3 (#151, not started) rebases onto it.

## Outcome & Quality Bar

**For whom.** A person who names accounts and opens Settings in the popup; a person who keeps the logs window open with Debug mode on; the next contributor whose PR runs the unit gate.

**What excellent looks like.**

1. In New account and Edit account, a name either saves trimmed and unique, or the form says why not with words it already uses ("Already exist"), or Save is disabled as for an empty name. Neither form saves a duplicate; New account never saves a blank, and Edit account does not under OA-3. Import is outside this arc (F3).
2. A Settings page that mounts during a worker restart finishes loading once the port is back, and never shows an older value over a newer one.
3. Under OA-2, the logs window holds what its list holds: no entry the list dropped, no entry cut in half.
4. The unit gate cannot go red on this fuzz class, and the oracle still fails a store that never recovers.

**Good enough.** No new words, rows or screens. No change to services. No new e2e beyond the restart table. Hub and Lock behave exactly as today, proven by their tests, whose cases and expectations do not change.

## Architecture & Implementation

### #259: the fuzz oracle

Recon § #259 has the trace. The store keeps its D11 rule (a failed tx-settle refresh creates no retry debt). The oracle is wrong: it owes a recovery the store already made, then reads a later, debt-free degradation as the missed recovery. This holds whatever the subscribers: the tape's mix of a txRefresh-capable and a retry-capable subscriber on one key can occur in production (I1), and what a person then sees is a separate defect with its own issue (§ Scope, Out).

- `expectGasRecovery` becomes `Map<string, number>`: key → `gas.retryVersion` read when the owe is recorded. The owe condition stays as today (the ensure resolved gas-`degraded` under live retry coverage): if the store ever failed to take the debt there, the recovery would never come and C1 would catch it. A later owe overwrites the earlier one.
- C1 asserts, per owed key: the entry exists, `retryDebt` is false, and `retryVersion` is above the recorded value. A retry-path success is the only commit that both bumps `retryVersion` and clears debt (`gasSuccessEntry`, `balances.store.ts:162-183`), so this is exactly "the owed recovery happened". It drops the `status === "ready"` read, which also failed a debt-free forced failure after the recovery.
- The oracle control is deterministic, built from direct store calls in the fuzz file (the tape pin below depends on how ops decode into pending calls, so it cannot be the only pin): an owe that never recovers fails C1; an owe whose debt is cleared with `retryVersion` unchanged fails C1; the #259 shape (owe, a retry success, then a failed tx-settle refresh) passes C1 and ends `degraded` with no debt, which documents D11's consequence.
- The shrunk tape from seed -2034686224 joins `fc.assert` as `examples: [[TAPE]]`, a second pin: fast-check runs it first on every run, with no seed dependency.

### #257 and #256: account names

- `NewAccountPopup.vue`: only the submit gate changes, to refuse a blank key (`!storedNameKey(name.value)`). The validator already gives a blank name no error (`sameStoredName` is false on a blank key), and Save already trims.
- `EditAccountPopup.vue`, as the #256 record words it ("New account's validator (`sameStoredName`, skipping the edited account by address)"):

  ```js
  validate: (v) => (appStore.accounts.some((a) => a.address !== accountToEdit.value?.address && sameStoredName(a.name, v)) ? "Already exist" : null),
  ```

  The `Input` gets New account's `#right` slot with `FieldWarning`. The gate refuses any error and, under OA-3, a blank key; Save sends `nameTerm.value.trim()`. Under OA-3's fallback the gate still refuses any error, but its blank check tests a literal empty field, as today, and Save sends `nameTerm.value.trim() || nameTerm.value`, so a name of spaces saves unchanged. An account whose stored name another account already has (a duplicate made by import, recon § #256) shows the warning as the form opens; OA-1 asks whether the owner prefers no warning for the account's own name.
- Services stay as they are (D5).

### #258: the logs window trim

Only under OA-2. Without it, phase 3 is skipped, nothing in this section ships and #258 stays open with a comment.

**The invariant.** At every point where the list drops entries, the document is an order-preserving subsequence of the list, entry by entry:

- the first document holds the whole loaded list (`LogsViewer.vue:225`);
- a live log is appended only when it passes the current filter (`:60, 70-72`);
- a filter change rebuilds the document from the filtered list in the same tick (`:133-140`);
- "Clear logs" empties the list and rebuilds after a `nextTick`; in that window the list is far below the cap, so no drop happens;
- a Debug mode change refetches into a new list and rebuilds; until the fetch returns, the old list and the old document stay paired.

So whatever the document holds of a dropped head sits at its start, in list order.

**Equal text does not confuse the match.** Identical text means identical source and level, so the filter gives both entries one verdict. The document is one base (the first document, or the last rebuild under the current filter) plus live appends under the current filter. A dropped entry is absent only when the current filter keeps it out, and then the filter keeps out every later entry with the same text too; the unfiltered first document holds only entries older than any live one. So no retained entry can match where an absent dropped entry is tried, and the greedy match deletes exactly the text of the dropped entries the document holds.

**Line breaks.** CodeMirror stores `\r\n` and `\r` as `\n` (checked against `@codemirror/state`), and a string log argument keeps its own line breaks. The helper compares each entry as the editor holds it, through `state.toText`.

- `logs-format.ts` gains a pure helper:

  ```ts
  /** How many characters at the document's start belong to `dropped`. The document lists a
   *  subsequence of the logs in their order, so what it holds of a dropped head sits at its start. */
  export function droppedPrefixLength(state: EditorState, dropped: LogEntry[]): number {
  	let end = 0
  	for (const log of dropped) {
  		// The editor stores every line break as "\n": compare the entry as the editor holds it.
  		const text = state.toText(`${formatSingleLog(log)}\n`).toString()
  		if (state.doc.sliceString(end, end + text.length) === text) end += text.length
  	}
  	return end
  }
  ```

- `onLogAdded` keeps the splice's return value, then, before the filter's early return, builds one change set against the current document: delete `[0, droppedPrefixLength)` when it is not zero, append the new line at `doc.length` when the log passes the filter. One `view.dispatch` applies both, so the append offset is never stale. Auto-scroll runs only for an appended line, as today.

### #268: one config read that survives a restart

New `SRC/composables/useConfigRead.ts`:

```ts
export function useConfigRead<T>(
	config: Pick<ConfigServiceClient, "onConnected" | "onUpdate">,
	fetch: () => Promise<T>,
	land: (value: T, updatedSince: (key: string) => boolean) => void,
): { read: () => Promise<void>; dispose: () => void }
```

- It subscribes `onConnected` and `onUpdate` when called. Contract: the page creates its client, then starts the read in the mount step that opens the port (the hub's `usePrestoCheck` may open it a moment earlier with its own `getValue`, in that same step). So the first `onConnected` belongs to the mount, and every later one is a reconnect that calls `read()`.
- `read()` takes `createRunFence().begin()`, starts a fresh set of keys updated since this read, awaits `fetch()` (a rejection or throw ends the read), and calls `land` only if the read is still the newest and the composable is not disposed.
- `dispose()` is idempotent: it invalidates the fence and removes both handlers. The page calls it in `onBeforeUnmount`, after `configService.disconnect()`.
- Its TSDoc states the precondition above: nothing requests on the client before the composable subscribes, and the mount's read goes out in the step that opens the port.
- Hub (`settings/index.vue`) and Lock (`settings/lock.vue`) replace their own generation, fence and connection counter with it; their `land` bodies are today's loops verbatim.
- Display, Privacy and Developer read through it in their existing mount hooks. Their `land` is today's mount loop verbatim (`settings[s.key].model.value = s.value`, and Display's dust threshold) with the `updatedSince` skip, then `isLoading = false`. It never calls `applySetting`: on Display that opens the side panel and closes the window, on Privacy it toasts, and on Developer it writes `indicateFailures` and `debugMode`. A reread after every worker restart must do none of that.

### File-level change map

| File | Change |
|---|---|
| `SRC/stores/balances.store.fuzz.test.ts` | owe map, C1, deterministic oracle control, `examples` |
| `SRC/popup/components/popups/NewAccountPopup.vue`, `.test.ts` | the gate refuses a blank key; one refused-class test |
| `SRC/popup/components/popups/EditAccountPopup.vue`, `.test.ts` | validator, warning, gate, trimmed save; the `Input` stub renders `#right`; a second account in the fixture; four pins, one control |
| `SRC/components/JsonViewer/logs-format.ts`, `logs-format.test.ts` | `droppedPrefixLength` and its tests |
| `SRC/components/JsonViewer/LogsViewer.vue`, `LogsViewer.test.ts` | `onLogAdded` change set; the test's editor holds a real `EditorState`; `onLog` and `onUpdate` get separate fake events |
| `SRC/composables/useConfigRead.ts`, `.test.ts` | new composable and its cases |
| `SRC/popup/pages/settings/index.vue`, `lock.vue` | adopt the composable; `lock.test.ts`'s fake and its two helpers move to real `EventHandler`s; no case or expectation changes |
| `SRC/popup/pages/settings/display.vue` + new `display.test.ts`; `privacy.vue`, `privacy.test.ts`; `developer/index.vue`, `developer/index.test.ts` | adopt the composable; the fakes use real `EventHandler`s with `onConnected`; one wiring test each, plus Developer's no-write reread |
| `apps/extension/tests/e2e/sw-resilience.test.ts` | the Lock restart case becomes a table over Lock, Display, Privacy, Developer |

### Trade-offs and alternatives not taken

- **#259, change the store** (a forced failure takes debt while a retry-capable subscriber holds the key): rejected here. It breaks D11, pinned at `balances.store.test.ts:387`, and is not what #259 is: the store did recover, and the oracle misread it. `GasBalanceCard` alone would still stay dim, so the change would heal only the co-mount. The co-mount (I1) is a real composition with its own issue, where the store change, or keeping the two cards off one key, gets argued on its own evidence.
- **#259, drop only the `ready` check:** rejected. `retryDebt === false` alone also passes a store that clears debt on a path that is not a retry success; the `retryVersion` check names the recovery itself.
- **#258, trim by `doc.lines`** (the issue's suggestion): rejected. It cuts multi-line entries and bounds lines, not entries, so the document and the list still disagree.
- **#258, rebuild the document on each splice:** rejected. It replaces the whole document every 100 logs and resets the reader's scroll position.
- **#258, build the first document from `filteredLogs`:** rejected here. It hides rows from the unlisted sources at open, a visible change (issue at close-out).
- **#268, copy the Lock pattern into each page:** rejected. Five copies of one mechanism.
- **#268, only the three pages use the composable:** rejected. Two hand copies would remain beside it.
- **#268, replay updates in `ServiceClient` on reconnect:** rejected. It changes every client in the extension for a page-level defect.
- **#256, an own-name exception** (the account's own trimmed name never warns): not shipped. It is not what the #256 record says; it is OA-1's option.
- **#256, EditFpc's raw "name changed" gate:** rejected. Not the record's validator, and it warns on an outer space added to the account's own name.

### Competing outline (cheapest first), as audited

Same arc, fewer moving parts: #259 removes the key from the owe set when its `retryVersion` moves (inside the step loop) and keeps the `ready` check; #258 uses the issue's `doc.lines` trim plus the single dispatch; #268 copies the Lock pattern into the three pages without a composable; #256 uses EditFpc's raw "name changed" gate. Each loses on a row above, except that the cheapest #256 (the record's own validator) is what the plan now ships. The audits saw both.

## Phases

All paths are under `apps/extension` unless they start with the repo root. "Fast layers" means `bun run lint` and `bun run typecheck:all` from the worktree root, plus the named test files (`bun run --cwd apps/extension test <files>`).

"Smoke run" means the following, from `apps/extension`. Warning: smoke builds nothing and refuses an unarmed `dist`, and an `e2e:agent` run leaves a network build there (`e2e-testing` skill, § Build-armed tests).

1. Build armed: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:chrome` (`build:firefox` for Firefox).
2. Run: `env -u EXTENSION_PATH NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- <files> --retry=0`, with `NULO_E2E_BROWSER=firefox` for Firefox.
3. A run against a base copy rebuilds from that copy the same way, and the next head run rebuilds again.

### Phase 1: #259, the fuzz oracle ✓

1. Change `expectGasRecovery` to a map from key to `retryVersion` at the owe.
2. Change C1 as § Architecture says. Keep its two other assertions.
3. Add the shrunk tape as an `examples` entry of `fc.assert`.
4. Add the deterministic oracle control from direct store calls: an owe that never recovers fails C1; an owe with debt cleared and `retryVersion` unchanged fails C1; the #259 shape passes C1 and ends `degraded` with no debt.
5. Run the red/green proof: the `examples` entry fails against the base copy of C1.

Validation gate:
- Commands: fast layers on `src/stores/balances.store.fuzz.test.ts`, `src/stores/balances.store.test.ts` and `src/popup/components/modules/fee-cards.comount.test.ts`; `NULO_FUZZ_SEED=-2034686224 bun run --cwd apps/extension test src/stores/balances.store.fuzz.test.ts`; `NULO_FUZZ_RUNS=2000 bun run --cwd apps/extension test src/stores/balances.store.fuzz.test.ts`.
- Pass: every command exits 0; the store and co-mount test files are unchanged and green; the red/green proof is in `lessons/phase-1.md`.
- Layers: lint, typecheck, unit.

### Phase 2: #257 and #256, account names ✓

1. Apply the New account change.
2. Add one test: a name of spaces leaves Create disabled, and Enter creates nothing.
3. Apply the Edit account change.
4. Add a second account to the Edit test fixture.
5. Let the test's `Input` stub render the `#right` slot, so the warning can be read.
6. Add four defect pins:
   - a trimmed duplicate ("Main " beside "Main") warns and blocks Save and Enter;
   - a name of spaces blocks Save (under OA-3; under its fallback this pin becomes a control that a name of spaces saves unchanged, and it passes on the base);
   - an outer-spaced new name saves trimmed;
   - an account whose stored name another account has warns as the form opens.
7. Add one control: a new unique name gets no warning and saves.

Validation gate:
- Commands: fast layers on both popup test files; a smoke run of `tests/e2e/accounts.test.ts` on Chrome.
- Pass: exit 0. Each defect pin fails against the base copy of its component; the preservation control passes there.
- Layers: lint, typecheck, component, smoke e2e.

### Phase 3: #258, the logs window ✓

Only under OA-2. Without its approval line, skip this phase, comment on #258 that its fix waits on the visible-change record, and leave it open.

1. Add `droppedPrefixLength`. Test it on a real `EditorState` from `@codemirror/state`, never a string stub. Cases: an entry with `\r\n` and an entry with a bare `\n` in its data; a dropped entry the filter keeps out of the document; two dropped entries with identical text; identical text where the later entry is retained (it stays); no dropped entries.
2. Change `onLogAdded` as § Architecture says.
3. Make the component test's editor real: unmock `@codemirror/state`, let the mocked `keymap.of`, `highlightActiveLine`, `logDecorationsField` and `createLoggerTheme` return `[]`, and give the mocked `EditorView` a real `EditorState` that `dispatch` updates.
4. Give `onLog` and `onUpdate` separate fake events (they share `H.noopEvent` today), and capture the registered `onLog` handler.
5. Add two tests. Past the cap, the document equals `logsDocument` of the kept list after one dispatch, with a `\r\n` entry among the dropped. A filtered-out log past the cap still trims.
6. Add a control: under the cap, the log is appended and nothing is trimmed.

Validation gate:
- Commands: fast layers on `src/components/JsonViewer/logs-format.test.ts` and `src/components/JsonViewer/LogsViewer.test.ts`.
- Pass: exit 0. Both trim tests fail against the base copy of `LogsViewer.vue`; the control passes there. The three existing tests pass unchanged in their assertions.
- Layers: lint, typecheck, component.

### Phase 4: #268, reads that survive a restart ✓

1. Add `useConfigRead` and at least 10 cases: first open reads once; another request on the same client opens the port first, in the same mount step, and the mount read still runs once; a later open reads again; a rejected read lands nothing and the next open lands; an older read answering last is ignored; an update during the read is reported for its key only; an update before the read is not; a synchronous throw from `fetch` ends the read; a read in flight at `dispose` never lands; after `dispose` no open reads and no update is recorded; `dispose` twice is safe.
2. Move the hub onto it.
3. Move Lock onto it.
4. Move Display, Privacy and Developer onto it.
5. Move the Lock fake to real `EventHandler`s, as `settings/index.test.ts:43-44` has, and route its `connect` and `update` helpers through `.invoke`. Today they call only the first registered handler, which would miss the composable's update recorder. Give the Privacy and Developer fakes real `onUpdate` and `onConnected` events. Change no test case or expectation in `settings/index.test.ts` or `lock.test.ts`.
6. Add `display.test.ts`.
7. Add one defect pin per page, Display, Privacy and Developer: a read rejected by a dropped port is read again on the next open, and the page leaves its loading state. The hub and Lock tests are preservation controls.
8. Add a Developer test: a reread that finds `developerMode` changed applies it and issues no `setValue`.
9. Add a Privacy test: with a reread held, an update delivers a newer `showFiatValues`; the older snapshot then resolves, and the newer value stays.
10. Turn the Lock restart case in `sw-resilience.test.ts` into a table: Lock (toggle state `false`, as today), Display (`theme-trigger`), Privacy (`fiat-values-toggle`), Developer (`settings-toggle-developerMode`). Keep its Chrome-only skip and its reason.
11. Run the three new rows three times on an armed build of the base copies of their pages. Record the results in `lessons/phase-4.md`. A new row is kept only when it is red in all three base runs. The Lock row is a regression guard and is green on the base, which already has its fix.

Warning: a new row that is green on the base does not reach the restart window. Diagnose it, then make the row open the page inside that window. Never keep a row that cannot fail, and never delete one without a recorded cause.

Validation gate:
- Commands: fast layers on `src/composables/useConfigRead.test.ts` and the five settings test files; three smoke runs of `tests/e2e/sw-resilience.test.ts` on Chrome (Firefox skips these rows for the reason the Lock case already states).
- Pass: exit 0; `settings/index.test.ts` and `lock.test.ts` change only in their fakes and helpers, and pass; each of the three defect pins fails against the base copy of its page; three green e2e runs; each kept new row is red in three base runs.
- Layers: lint, typecheck, unit, component, smoke e2e.

### Phase 5: arc gate ✓

1. Run the full gate below on the final head.
2. Take the before and after screenshots of #256 and #257's forms (Delivery).
3. Run the post-implementation loop.

Validation gate (the arc gate):
- Commands, in this order, from the worktree root: `bun run lint`; `bun run typecheck:all`; `bun run test:all` (it includes the extension suite `bun run test` runs); a smoke run of the whole suite on Chrome, then on Firefox (no `<files>`); last, `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/fee-sponsor-funding.test.ts` (the network config retries twice unless told otherwise, and its build replaces the smoke `dist`).
- Pass: every command exits 0. A red is first recorded and diagnosed in `lessons/phase-5.md`; only a red diagnosed as a known flake earns one rerun.
- Layers: lint, typecheck, unit, component, smoke e2e on Chrome and Firefox, network e2e.

## UI impact

The lane brief's no-ask records are the visible budget, quoted here verbatim. No new words, warnings, rows or screens.

- **New account.** Record (#257): "a name that trims to empty counts as empty, so Create stays disabled (the `NewFpcPopup` rule); the field says nothing new. No new copy." Before: a name of spaces enables Create and saves an empty name. After: Create stays disabled, as for an empty field.
- **Edit account.** Record (#256): "Edit account gets New account's validator (`sameStoredName`, skipping the edited account by address) and the existing "Already exist" warning with Save disabled, and saves `name.trim()` as New account does. Existing words only; no new copy." Before: any name saves as typed. After: a name matching another account's (compared trimmed) shows "Already exist" and disables "Update account", also when the form opens on a name an import already duplicated (OA-1); the saved name has no outer spaces. A name of spaces disables "Update account" (OA-3: the plan reads this from the trimmed save; fallback as today).
- **Settings Display, Privacy, Developer.** Record (#268): "the three pages finish loading after a reconnect the way the Lock page does; a small composable shared with the hub and Lock is the panel's call; no new words." Before: a page opened while the worker restarts stays on its loading state. After: it loads once the port is back.
- **Settings hub and Lock:** no change.
- **Logs window (#258).** No record names its visible effect (OA-2). A session under the cap shows what it shows today. Past the cap, the oldest entries leave the window as they leave the list and the CSV export. Ships only if the orchestrator's approval records OA-2.
- **Balances.** Record (#259): "if the store is wrong, a gas balance no longer stays degraded after its RPCs recover; no new words, no new state." The store is not wrong, so nothing changes; the fix is in a test.

The PR carries before and after screenshots of the New account and Edit account forms.

## Security & Adversarial Considerations

- **Threat model.** No new trust boundary. Account names come from the person's own typing in the popup. The RPCs that store them (`changeAccountName`, `createAccount`) answer only senders from the extension's own origin (`isTrustedInternalSender`, `packages/extension-messaging/src/core/sender-auth.ts:17-22`); a dApp page or content script cannot reach them. Log text can carry dApp-supplied strings; CodeMirror renders text, and the trim only compares and deletes characters already in the document. Config reads go to the same service as today.
- **Integrity of what a person sees.** The fence in `useConfigRead` keeps an older read from overwriting a newer value, so a stale `showFiatValues` or `developerMode` cannot come back after a restart. A Lock read never moves the auto-lock field while an edit is in progress (today's rule, kept).
- **Duplicates as a confusion vector.** Two same-named accounts make a picker ambiguous in Send and the connect window. The check closes the Edit path; import can still create a duplicate (F3; an issue at close-out), and Edit then warns until it is renamed.
- **Logging.** No new log lines. The logs window keeps the logging policy: nothing here changes what reaches a log line.
- **Supply chain.** No new dependency. fast-check's `examples` exists in the locked 4.9.0.
- **Least privilege, crypto, CI tokens:** not touched.

## Assumptions

### Facts

- F1. `storedNameKey` trims; `sameStoredName` is false on a blank key (`SRC/utils/account-name.ts:13-22`).
- F2. Edit account has no validator, blocks only an empty name and saves raw input (`EditAccountPopup.vue:25, 38, 59`).
- F3. Account import refuses only a blank name and has no duplicate check (`settings/accounts/import.vue:99, 280`), so two accounts can share a name without this bug. "Imported account" (`account/service.ts:573`) is only the service's fallback.
- F4. The logs trim condition can never hold after the splice (`LogsViewer.vue:56-64`); the append reads `doc.length` before any trim (`:63, 71`).
- F5. A plain-string log argument keeps its newlines (`logs-format.ts:28-54`); the decoration field splits multi-line entries (`logs-decoration.ts:5`).
- F6. The first logs document is built from the unfiltered list (`LogsViewer.vue:225`).
- F7. The shrunk tape fails C1 after a recovered retry and a failed forced read (recon § #259 trace).
- F8. A forced failure keeps debt unchanged (`balances.store.ts:193-194`); `balances.store.test.ts:387` pins it.
- F9. The port opens lazily and fires `onConnected` on each open; a dropped port rejects pending requests and reopens; a manual `disconnect()` does not reopen (`packages/extension-messaging/src/background/client.ts:50-99`).
- F10. `createRunFence` exists (`SRC/composables/runFence.ts`) and several composables and `popup/app.vue` use it.
- F11. A scratch copy of the corrected oracle passed the shrunk tape and 3,000 random runs (recon § #259).

### Inferences

- I1. A txRefresh-capable and a retry-capable subscriber can share a key in one document, so the fuzz tape's mix is reachable. `GasBalanceCard` (`txRefresh: true`, `retry: false`, `GasBalanceCard.vue:23`) renders on Home. `FeeSettingsCard` (`retry: true`) renders in two popups opened from Settings → Advanced → Account State → Authwits (`authwits/index.vue:97, 102`). `PopupManager` sits outside `RouterView` (`popup/app.vue:465, 489`), the Authwits page's teardown closes no popup (`:128-132`) and only the lock path calls `closeAll` (`popup/app.vue:179`), so nothing proves that a route back to Home closes them. `fee-cards.comount.test.ts` mounts both cards on one Pinia as a composition the store must handle, while `FeeSettingsCard.vue:465-470` says every subscriber on its key keeps `txRefresh` off while it is mounted. The consequence is the issue in § Scope, Out. The oracle fix does not depend on I1.
- I2. The trim deletes exactly the dropped entries the document holds (§ Architecture, #258: the invariant and the equal-text argument). Tested on a real `EditorState`.
- I3. The Display, Privacy and Developer pages reproduce the Lock race on Chrome (the issue read them, it did not run them). Phase 4 steps 10-11 test this.
- I4. The services named in recon § #258 log under their service names, so `LOG_SOURCES` hides them after a rebuild.

### Asks (conditions on the orchestrator's approval)

A working assumption is not an owner record. Each ask below needs a line in the orchestrator's approval (a `D-orch` entry), or its fallback ships.

- A1 (OA-3). Blank names in Edit account. The #256 record makes Edit save `name.trim()`, which turns a name of spaces into the empty name, so the plan reads the record as implying that a blank counts as empty, as #257's record says for New account. Fallback: Edit treats a name of spaces as today (Save enabled, name saved unchanged, § Architecture #256); every other part of #256 ships.
- A2 (OA-1). The plan ships the #256 record as worded, so an account whose stored name another account has warns as the form opens. The ask is whether the owner prefers an exception for the account's own name. No fallback is needed: the record covers what ships.
- A3 (OA-2). The logs window trim has no no-ask record naming its visible effect. Fallback: phase 3 is dropped, the PR neither carries the trim nor says `Closes #258`, and #258 stays open with a comment.

## Decision ledger

| # | Decision | Chosen | Rejected | Reason |
|---|---|---|---|---|
| D1 | #259: store or oracle | oracle | store (debt on forced failure) | § Trade-offs; the store recovered and the oracle misread it; the co-mount consequence (I1) is its own issue |
| D2 | #268 shape | one composable for five pages | per-page copies; three pages only; client-level replay | five copies of one mechanism; the client change is out of proportion |
| D3 | #258 trim | exact dropped prefix, one dispatch | `doc.lines`; rebuild; filtered first document | entries stay whole; doc and list agree; no scroll reset; no visible change at open |
| D4 | #256 validator | the record's: `sameStoredName` against every other account | an own-name exception (Codex: sensible); EditFpc's raw "changed" gate | Opus: the record is literal and Edit edits only the name; the exception is OA-1 for the owner |
| D5 | Services | unchanged | trim or refuse names in `account/service.ts` | the popup is the only writer; a service refusal would surface as a new error toast |
| D6 | Pinning #259 | fast-check `examples` | an example test in `balances.store.test.ts` | the tape exercises the oracle, which the store test cannot |
| D7 | Restart e2e | a four-row table; a new row kept only if red in three base runs; a green row is fixed, not dropped | no e2e; a new spec file; one base run | the issue's pages were never run; the Lock case is the proven harness; one run cannot tell red from flaky |
| D8 | #259 owe condition | unchanged (`degraded` under retry coverage) | owe only when `retryDebt` is set (Opus 4) | a store that failed to take the debt would then owe nothing and escape C1 |
| D9 | #268 reread side effects | `land` copies values, never calls `applySetting` | reuse `applySetting` | a reread would close the window, toast or write config (Opus 9) |
| D-orch-2 | OA-2, the logs window trim | A: the trim ships (phase 3 built, `Closes #258`, the full title) | B: as is | Orchestrator no-ask on the #210 precedent: the window holding the entries its list holds, dropping the oldest past the cap as the list and the CSV export already do, is the cap's intended behaviour with no new words |
| D-orch-3 | OA-3, a blank name in Edit account | A: a name of only spaces counts as empty, so "Update account" stays disabled as for an empty field | B: as today | Orchestrator, the #257 record read with the #256 record; no new words |
| D-orch-4 | OA-1, Edit account opened on an already-duplicated name | B: "Already exist" shows as the form opens and "Update account" stays disabled until another name is typed | A: an own-name exception | Orchestrator: the #256 record as worded ships; OA-1 goes to the owner's decision page (page 11), no issue filed |

## Audit verdicts

### Round 1, Codex (gpt-6.1-sol, high, read-only), 2026-10-10

Verdict: **reject**, with three blocking findings (CRLF breaks the trim; Asks stood in for owner records; the "unchanged Lock test" condition contradicts `dispose`). All ten findings were verified against the tree.

| # | Finding | Disposition |
|---|---|---|
| 1 | High. CodeMirror stores `\r\n` and `\r` as `\n`, so a raw-text comparison fails and the trim stops for good | Accepted: verified with `@codemirror/state`; the helper compares through `state.toText`; tests use a real `EditorState` |
| 2 | High. A1 and OA-2 assume records that do not exist | Accepted: both are now conditions on the orchestrator's approval, each with a fallback (OA-3 added) |
| 3 | Medium. `lock.test.ts:12-13` fakes have only `add`; `dispose` calls `remove` | Accepted: fixture-only additions; no assertion changes |
| 4 | Medium. The hub's first open comes from `usePrestoCheck`'s `getValue`, not the config read | Accepted: the contract says "the first open happens in the mount step that starts the read"; a composable case covers another request opening first |
| 5 | Medium. I1 overclaims: the fee card recommits gas on an FPC recovery | Accepted in part: I1 restated; the oracle fix is unaffected. The restatement (no shared key in one document) was wrong; the final pass, finding 1, corrected it |
| 6 | Medium. The subsequence invariant needs Clear, refetch and equal-text boundaries | Accepted: the invariant is stated per path, the equal-text case is argued, not conceded; tests cover equal text |
| 7 | Medium. The Lock row is green on the base by design; a green new row should be fixed, not deleted | Accepted |
| 8 | Medium. The network gate retries twice by default; a rerun must not erase an unexplained red | Accepted: `NULO_E2E_RETRY=0`; a red is diagnosed before any rerun; `bun run test` dropped as a subset of `test:all` |
| 9 | Medium. Edit's `Input` stub hides `#right`; controls must pass on the base; test spaces, not `""` | Accepted |
| 10 | Low. F10's count; the sender boundary is "the extension's own origin", not "popup-only" | Accepted |

Codex agreed with D1 (store right, oracle wrong; `examples` the right pin; keep the oracle control, adding a debt-cleared-but-version-unchanged negative case), D4 as then drafted (the own-name exception; since replaced by the record's validator, below) and D5, and rejected the competing outline on every row.

### Round 1, Opus Plan agent (same family, read-only), 2026-10-10

Verdict: **conditional approve**, with four conditions (a feasible Lock test gate; the pages' `land` never calls `applySetting`; the records quoted verbatim and OA-1 settled against the #256 record; armed builds named in every e2e gate). Opus replayed the seed itself and confirmed the trace and D1. All seventeen findings were verified against the tree.

| # | Finding | Disposition |
|---|---|---|
| 1 | Low. "Clear logs" never re-adds its listener when `clearLogs` rejects | Accepted: an issue at close-out (outside R3's scope) |
| 2 | Medium. Import requires a non-blank name and has no duplicate check, so duplicates come from any typed name | Accepted: F3 corrected; an `owner-decision` issue at close-out |
| 3 | Low. F10 count, F6 line, recon's Lock lines | Accepted |
| 4 | Low. Record the owe only when debt is set | Rejected (D8): a store that failed to take the debt would then escape C1 |
| 5 | Low. The positive control should document D11's consequence | Accepted: the #259-shape control ends `degraded` with no debt |
| 6 | Medium. Quote the records; the #256 record is literal, and OA-1's option A is not it | Accepted: records quoted; the record's validator ships; the own-name exception is the ask (D4) |
| 7 | Low. Argue A1 from #256's trimmed save | Accepted |
| 8 | High. The Lock fake has no `remove`, and its `update` helper reaches only the first handler | Accepted: real `EventHandler`s in the fake and its helpers; no case or expectation changes |
| 9 | Medium. `applySetting` has side effects a reread must not trigger | Accepted (D9), with a Developer no-write test |
| 10 | Low. The tape pin is fragile; make the control deterministic | Accepted: three direct-call cases; `examples` kept as a second pin |
| 11 | Low. State the first-open precondition; add a case | Accepted (also Codex 4) |
| 12 | Low. Use real CodeMirror state; separate `onLog` and `onUpdate` events | Accepted |
| 13 | Low. New account's validator change is a no-op; the Edit stub hides `#right` | Accepted: only the gate changes |
| 14 | Competing outline: the cheapest #256 is the right one | Accepted |
| 15 | Medium. Smoke builds nothing; name the armed build and run env; smoke before `e2e:agent` | Accepted: § Phases defines "smoke run" |
| 16 | Low. Controls pass on the base | Accepted (also Codex 9) |
| 17 | Low. Three base runs per new row | Accepted (D7) |

**Disagreement between the legs, settled.** D4: Codex found the own-name exception sensible; Opus held that the #256 record words the validator and that Edit edits only the name, so a person opens it to rename. The record decides what may ship without asking, so the record's validator ships and the exception goes to the owner as OA-1.

### Final pass, Codex (fresh session, gpt-6.1-sol, high, read-only), 2026-10-11

Verdict: **conditional approve**: correct I1's reachability claim, and carry the approval fallbacks through architecture, tests, completion criteria and delivery. All six findings were verified against the tree and folded. Codex found sound: D8, the #258 matching argument, the first-open contract on all five pages, the composable's boundary, the smoke arming.

| # | Finding | Disposition |
|---|---|---|
| 1 | Medium. I1 overclaims: `PopupManager` sits outside `RouterView` and nothing closes the Authwits popups on navigation; `fee-cards.comount.test.ts` belongs in phase 1's gate | Accepted: verified (`popup/app.vue:179, 465, 489`, `authwits/index.vue:128-132`, the co-mount suite, `FeeSettingsCard.vue:465-470`); I1 rewritten as reachable; the consequence is an issue at close-out (§ Scope, Out); the oracle fix stands; the co-mount suite joins the phase 1 gate |
| 2 | Medium. The OA-2 and OA-3 fallbacks are not carried through: Edit's blank rule, phase 3, `Closes #258`, the title and the quality bar's "no path saves a blank or a duplicate" | Accepted: each is now conditional, with the fallback's code, pin and title stated; the name guarantee is scoped to the two forms |
| 3 | Low. recon.md's reuse row still says Edit skips its own name by key | Accepted |
| 4 | Low. Name Display, Privacy and Developer as the three base-red pins; hub and Lock are controls | Accepted |
| 5 | Low. OA-2's Debug-mode threshold is 10,100, not 11,100 | Accepted |
| 6 | Low. Add a Privacy test: a newer update during a held reread survives the older snapshot | Accepted (phase 4 step 9) |

**Confirmation (same session, resumed), 2026-10-11.** Verdict: **conditional approve**, one condition left: the completion seeds must accept a phase omitted under an approval fallback. Codex held the co-mount deferral as the stronger call (the oracle misjudges a recovery whatever the subscribers; the co-mount needs its own failing sequence and a composition decision; changing D11 here widens the authorized scope), and found no architectural defect in the fold.

| # | Finding | Disposition |
|---|---|---|
| 1 | Medium. Both seeds require every phase ✓ with a passing gate, which a skipped phase 3 cannot meet | Accepted: both seeds accept a phase omitted under an approval fallback, with its disposition recorded |
| 2 | Low. "The gate refuses only an empty field" reads as dropping the duplicate block under OA-3's fallback | Accepted: the fallback keeps refusing errors; only the blank check is literal |
| 3 | Low. `lessons/phase-0.md` still calls the co-mount unreachable | Accepted: a correction appended, the historical line kept |
| 4 | Low. I3 points at phase 4 step 9, now steps 10-11 | Accepted |

The remaining condition is folded as Codex worded it; no further round was run, since the four fixes are wording, not design.

### Post-implementation round 1, Codex (gpt-6.1-sol, high, read-only), 2026-10-11

Diff `af4afcc..e78a4af` (phases 1-4). Verdict: **approve with fixes**, three low findings, no runtime defect. All verified against the tree.

| # | Finding | Disposition |
|---|---|---|
| 1 | Low. A store regression that bumps `retryVersion` and clears debt on a failed retry would pass the new C1 | Accepted: a fourth C1 control settles the owed retry as a failure and asserts debt and `retryVersion` unchanged, and C1 rejects |
| 2 | Low. `droppedPrefixLength`'s doc states the subsequence invariant, which alone does not justify the greedy match | Accepted: its TSDoc now says equal text means equal source and level, so a dropped entry the document lacks was filtered out, and so was every later twin |
| 3 | Low. `LogsViewer.test.ts`: `mountOn`'s comment misstates the fixture (two batches, not one); the header recounts the algorithm; the stub's `dispatch` comment can go | Accepted in part: the `mountOn` comment is gone and the header is two sentences; the `dispatch` comment stays, since `scrollIntoView` is stubbed to `{}`, which a real `state.update` refuses |

Codex found sound: I1 and I2 (no request opens a config port before the composable subscribes, on all five pages), the update fence against held rereads, disposal and cleanup order, CRLF and bare-CR trimming, one change set with original offsets, every name case against D-orch-3 and D-orch-4, and no new visible change or log line.

### Post-implementation round 1, Opus (same family, general-purpose, read-only), 2026-10-11

Same diff. Verdict: **no real defect**; three low findings and a bookkeeping note, all verified.

| # | Finding | Disposition |
|---|---|---|
| 1 | Low. Lock disposed its config read between its two service disconnects (CLAUDE.md § Cleanup order) | Accepted: `lockRead.dispose()` moved after `profileService.disconnect()` |
| 2 | Low. Display, where a reread through `applySetting` would close the window, had no no-side-effect test | Accepted: a reread that flips `sidePanel` shows it with no `window.close` and no `sidePanel.open`; mutation-checked (with `land` calling `applySetting` the test fails) |
| 3 | Low. `useConfigRead` drops a failed read silently; add a `console.debug` | Rejected: § Security commits to no new log lines; the hub and Lock already dropped a failed read silently, and the next reconnect retries |
| 4 | Bookkeeping. The regenerated auto-import types and the phase 4 record were uncommitted | Already committed when the review returned (`b7410c9`) |

### Post-implementation rounds 2 and 3, Codex (same session, resumed), 2026-10-11

Round 2, on the round-1 fixes (`e78a4af..b7410c9`): **clean**, no new material finding. Round 3, on the Opus folds (`b7410c9..c9baef8`): **clean**. The loop converged after three rounds, the last two clean.

## Delivery

One arc, one PR, no stack (D-orch-1).

| Arc | Phases | Base | `/code-review` | PR title |
|---|---|---|---|---|
| arc-1 | 1-5 and the close-out | `dev` | off | `fix: account name checks, logs window trim, settings reread on reconnect, fuzz oracle` (85 characters); without OA-2, `fix: account name checks, settings reread on reconnect, fuzz oracle` |

- Branch: `worktree-wallet-followups`. Merge `origin/dev` into it before the PR, and read what changed in `implementations-plan/index.md` and `lessons.md`.
- Open the PR only after phase 5's gate passes and the Codex loop converges: `gh pr create --base dev`, no labels. Add `e2e:extension-smoke` afterwards only if the path filter skipped the smoke lanes.
- PR body: what changed and why, per issue; which of OA-2 and OA-3 the approval recorded; the validation runs with outcomes; the screenshots; `Closes #256`, `Closes #257`, `Closes #259`, `Closes #268`, and `Closes #258` only when phase 3 shipped; it ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Screenshots: New account with a name of spaces, Edit account with a trimmed duplicate, each before (base build) and after (head build). Drive the smoke harness from a scratch config under `~/.cache/nulo-backlog/wallet-followups/`, never a spec file in the repo. Commit the PNGs in one commit and remove them in the next; the PR links them by that commit's SHA.
- Commits are signed, conventional, lower-case, and end with the `Co-Authored-By` trailer the brief names.

## Post-implementation

### 1. Codex audit

Run `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol` (unset `CODEX_ACCOUNT`; on a quota or 401 error retry once with `CODEX_ACCOUNT=alejo-icloud`). The prompt file lives under `~/.cache/nulo-backlog/wallet-followups/`. Send: the net diff from `af4afcc` (or the merge base after the `dev` merge), this plan with its ledger, and an adversarial ask (what could go wrong, what is trusted that should not be). Include both rules verbatim:

> Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone.

> Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact.

### 2. Fix loop

1. Verify each finding against the tree before acting.
2. Apply the accepted fixes; commit them apart from the implementation.
3. Log the round, with the verdict, in `lessons/phase-5.md`.
4. Resume the same session (`resume-codex.sh <session-id> <prompt-file> <codex-dir> high`) with the fix diff.
5. Stop when a round has no new material finding. After three rounds with material findings, stop and report `ARC_FAILED`.

Rerun the phase 5 gate after the last fix.

### 3. Delivery

Per § Delivery. This is the first time a PR opens.

### 4. Close-out (the PR's final commits)

1. Write `## Outcome` directly after the front matter: date, status, what shipped with the PR number, every dropped or rejected item with its disposition, `Open items:` with issue numbers, and one line that retires the seeds below.
2. Promote generalizable gotchas to `implementations-plan/lessons.md` (8 KiB budget; dedupe, retire, date tool versions). Candidate: a fuzz oracle that owes a recovery must discharge it when the recovery commits.
3. File every open item as an issue (dedupe first with `gh issue list --state all --search`; five sections: What happens, Where, Impact, Possible fix, Record). Known now: the four in § Scope, Out (the `LOG_SOURCES` gap, the Clear-logs listener, import duplicates as `owner-decision`, the fee-card co-mount). A suspected exploitable weakness goes to a private draft advisory instead.
4. Comment on every issue whose fix was left out or did not hold; it stays open.
5. Delete `STATUS.md`.
6. In its own commit: `git mv implementations-plan/wallet-followups implementations-plan/archive/wallet-followups`; repair links the extra level breaks (`git grep -n wallet-followups`); move the index line to `archive/index.md`.
7. Push; watch `gh pr checks --watch`. Merging is the orchestrator's call.

Where open work lives:

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

### 5. Teardown after the merge

When `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/wallet-followups/plan.md` succeeds, run `agent-worktree done wallet-followups --merged --trunk dev` without asking (the session was started inside the worktree, so there is nothing to exit). It refuses rather than forces; relay a refusal and stop. A `/loop` session checks this on every firing; a `/goal` session arms one background wait after its wrap-up report (`until <the check>; do sleep 300; done`, at the maximum timeout).

## Seeds (draft; not run, the orchestrator owns execution)

Recommended:

```
/goal Every phase in implementations-plan/wallet-followups/plan.md is either marked ✓, backed by its validation gate reported passing in the transcript, or marked omitted under an approval fallback (phase 3 without OA-2) with its disposition recorded in the plan and on its issue; LESSONS_FILE=implementations-plan/wallet-followups/lessons/phase-N.md printed per phase; code_review is off and /code-review was not run; the Codex fix loop converged on the whole diff, evidenced by a resumed Codex pass with no new material findings quoted in the transcript; the PR against dev exists (gh pr view output), opened only after the loop converged, with the close-out commits that archive the plan (git show --stat of the archive move); bun run test and bun run lint exit 0 in the transcript.
```

Fallback:

```
/loop 15m Drive implementations-plan/wallet-followups forward. Never idle. Each firing: read plan.md and lessons/ (authoritative), including Outcome & Quality Bar; if the plan sits under archive/ on origin/dev, run the teardown in plan.md § Post-implementation 5 and stop; if a PR exists, check gh pr view --json statusCheckRollup and fix red checks on this branch; otherwise take the next unchecked phase (skip one the orchestrator's approval omits, marking it omitted with its disposition), run fast layers after each edit, commit, and run the phase's gate before marking ✓. Stuck on a decision: consult Codex (gpt-6.1-sol, high) and log it in lessons; never merge, never push to main, never widen scope. Every phase ✓ or omitted: run plan.md § Post-implementation 1-4, then report and stop.
```
