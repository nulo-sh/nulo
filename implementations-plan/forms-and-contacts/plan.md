---
plan: forms-and-contacts
tier: mid
status: approved; arc 1 in progress (arcs 2 and 3 wait on their gates)
issues: "#184, #205, #210, #212, #214 (arc 1); #224, #225 (arc 2); #151, #211, #215, #216, #229 (arc 3)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 explorers (sonnet); dual audit (Codex gpt-6.1-sol high + one Opus Plan agent); final fresh Codex pass
post_implementation_hardening: not scheduled
---

# Forms and contacts: validators, stack depth, logger, toggles, shells, contacts import, motion

Twelve issues on popup forms, contacts and presentation primitives, in three arcs and a close-out, as the lane map groups them.

- **Arc 1 (no owner decision; ships first, as its own PR, once the orchestrator records its three visible corrections as it recorded #210).** Pages stop sending debug log lines the worker would drop (#184). A failed config write leaves memory, listeners and the toggle on the stored value (#205). Form popups give their card its depth (#210). The logs viewer ends every line with a newline, so the first live line gets its own line (#212). Account and FPC name checks compare names without their outer spaces (#214).
- **Arc 2 (decision-free; waits on `account-session-life` arc 3 for `export/full.vue`).** A test helper holds a list read and injects service events; all six reducers are exercised at that seam with today's behaviour pinned, and the three identical contact reducers become one (#224). `GlobalLoader` uses the scrim token it duplicates and the export page's shake uses the shared shake; the snack card stays local because no shared primitive matches it (#225). No visible change, proven.
- **Arc 3 (waits on decision page 11, hold H6, `send-queue-activity` arc 3, `incoming-transfers` arc 3, and the blocking owner asks FA-1, FA-2, FA-4, FA-7).** A contacts import a person cannot interrupt by accident (#151, P11-01); the name field at the cap, both options planned (#216, P11-02); a darker red for the destructive buttons (#229, P11-03); one link colour and one bottom spacing on detail pages (#211, P11-04); shakes and shimmers stop under Disable animations and reduced motion (#215, P11-05).

Recon: [recon.md](recon.md). Owner questions beyond page 11: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Scope

**In:** the twelve issues above, with every surface they name.

**Out, with reason (each is an ask in OWNER-ASKS.md, or an issue filed at the arc that leaves it):**
- #210's other recorded items: the order gap after re-opening an open popup (FA-8: fixing it changes which lower card sits back) and the per-owner reducer policies (a visible difference per owner; carried by FA-9 with #224's evidence).
- #224's race: a list load can lose an event that lands during the read (real for the FPC popups and Send). Repairing it changes which rows show, which arc 2's "no visible change" contract excludes (FA-9).
- Network names with outer spaces (FA-10): the popups and the worker agree on exact names today, so trimming them is a new rule, not a restored one.
- `EditAccountPopup` has no duplicate-name check, and a New account name of only spaces saves as an empty name: issues at arc 1's delivery.
- The logs viewer's trim branch never runs, so the editor document grows past its cap (recon § #212): an issue at arc 1's delivery. R3 asks for a small change to `LogsViewer.vue`.
- Keyframe motion beyond shakes and shimmers under Disable animations, and onboarding applying the setting at all (FA-6).
- #205's three hand-copied toggle bindings stay separate (D6); #205 closes with that disposition in the PR body.
- No storage migration: arc 1 changes no stored value or shape.

## Owner dependencies

| Item | What it gates | Where |
|---|---|---|
| No-ask (orchestrator, decisions.json `no_ask` #210) | Arc 1's #210: "Pass the card depth, not the raw stack order." | recorded |
| The orchestrator's record for #205, #212 and #214 | Arc 1's three visible corrections (§ UI impact) | recorded: D-orch-3 |
| Page 11, P11-01 (approve), hold H6 | Arc 3 phase 3.1 (#151, the fenced sender) | decision page 11 |
| Page 11, P11-01, FA-1, FA-2, FA-7 | Arc 3 phases 3.2-3.3 (#151, the running state and its e2e) | decision page 11; OWNER-ASKS.md |
| Page 11, P11-02 (visual: A, B, As is), FA-5 if B | Arc 3 phase 3.4 (#216) | decision page 11 |
| Page 11, P11-03 (approve), FA-4 | Arc 3 phase 3.5 (#229) | decision page 11 |
| Page 11, P11-04 (approve); R1; #142 | Arc 3 phase 3.6 (#211) | decision page 11; sibling arcs |
| Page 11, P11-05 (veto list), FA-6 | Arc 3 phase 3.7 (#215) | decision page 11 |
| FA-3, FA-8, FA-9, FA-10, FA-11 | nothing in this plan; each "what ships now" is today's behaviour | OWNER-ASKS.md |

Sibling gates: arc 2 starts on a base that contains `account-session-life` arc 3 (both edit `popup/pages/settings/security/export/full.vue`; the lane map also names `backup-import-export` for that file). Phase 3.6 starts on a base that contains `send-queue-activity` arc 3 (R1, `journal/[id].vue`; R1's own rule text names that lane's arc 2, so wait for whichever is later) and `incoming-transfers` arc 3 (#142's detail rows). R3: arc 1 merges before `chain-endpoints` arc 2 edits `LogsViewer.vue`.

## Outcome & Quality Bar

**For whom.** A person managing names, fees and contacts in the popup, often with two popups stacked; a developer reading the logs window; the maintainer who inherits these forms.

**What excellent looks like.**
- Every duplicate warning agrees with what a save would store: an account or FPC name that would save as a duplicate is refused before Save, and only then.
- A setting the wallet could not store never shows as stored, and asking again writes again. The existing error toast is the only message.
- Every popup under another one sits back by the same rule, whether it is a form or not.
- A contacts import that a stop interrupts never writes a contact after its sender stage stopped; the incomplete toast counts only rows whose contact write the wallet confirmed.
- Arc 2 changes nothing a person sees: proven per shell, not argued.

**What good enough looks like.** No new abstractions beyond the ones named here (a level answer and event for the logger, one stored-name key, one contact reducer, one held-read test helper). No copy outside page 11's words. Tests are the smallest set that proves each fix and catches its failure.

## Assumptions

### Facts (verified against the tree at `ed59711`)

- F1. Every page log line is an RPC; only the worker drops debug lines (`SRC/wallet/services/logger/client.ts:20-56`; `SRC/wallet/logger/store.ts:59-62`). `LogLevel` is `Debug 0 … Error 3` (`packages/wallet-core/src/logger/interfaces.ts:13-18`). `debugMode` is not restorable from a backup (`config/spec.ts:47-56`).
- F2. The logger client's own `ServiceClient` logs to a `DummyLogger` (`client.ts:17`).
- F3. `Service.emit` sends an event to every connected port of that service (`packages/extension-messaging/src/background/service.ts:85-94`): events are global broadcasts, not profile-scoped (`SRC/composables/useEntityCrud.ts:34-40` documents this). Each port is FIFO. A request is dispatched and answered with no task boundary between the method's synchronous part and its answer (`packages/extension-messaging/src/core/base-service.ts:112-120`).
- F4. `client.ports.test.ts` S1/S2 pin Debug `Connected`/`Disconnected` lines on the wire with a registry that answers `undefined`.
- F5. `ConfigStore.set` and `apply` mutate memory and announce before they persist (`SRC/wallet/config/store.ts:61-68, 87-100`). `apply` serves `load()` and `reset()`. A rejected `load()` vetoes the boot, and `runtime.ts:458-460` then applies log retention on whatever memory holds.
- F6. `Toggle` is controlled (`packages/design/src/ui/Toggle.vue:8-18`); the settings pages apply a value only after `setValue` resolves (`privacy.vue:49-59`, `display.vue:100-110`, `developer/index.vue:92-102`, `lock.vue:63-72, 88-115`).
- F7. Boot refuses a stored bearer under strict mode (`session-manager.ts:583`).
- F8. `FormPopup` passes the raw order to `PopupCard`, which wants the depth (`FormPopup.vue:25-26`, `PopupCard.vue:34`). Eleven form popups; `popup-stack.pins.test.ts` pins the raw order.
- F9. `popupStore.open` on an open key sets `order` to the key count, which includes the key itself (`SRC/stores/popup.store.ts:18-23`), leaving a gap that a later open can turn into a duplicate order.
- F10. The logs editor's first document lacks the trailing newline its rebuild has (`LogsViewer.vue:110, 225`); an empty rebuild is `"\n"`, a blank first line.
- F11. Account names are saved trimmed and compared untrimmed (`NewAccountPopup.vue:34, 71`). FPC names are saved and compared untrimmed (`NewFpcPopup.vue:35, 76`; `EditFpcPopup.vue:40, 122`; `fpc/service.ts:251-323`), so the issue's "the saved name is trimmed" holds for accounts only. `FpcInfo.name` is optional (`fpc/spec.ts:29, 56`).
- F12. Network names are compared and saved untrimmed by both popups and the worker (`NewNetworkPopup.vue:37, 86`; `EditNetworkPopup.vue:29, 46, 68`; `network/service.ts:510-513, 532-535`): consistent today.
- F13. The NewContact, ImportContacts and Send contact reducers are byte-identical; EditContact adds an edited-row branch; FPC, SelectProfile and Send token-delete each have their own policy; in-place identity and add-always-appends are pinned (recon § #224).
- F14. `fieldAddressKey` equals `toLowerCase` for every address the contact form or the import accepts; it returns `undefined` for anything else (`packages/wallet-bridge/src/field-address.ts:11-17`). `ContactService.addContact` does not validate, so a restored backup row may hold another shape.
- F15. `--scrim-loader` is `rgba(10, 9, 8, 0.85)` on `:root, [theme="dark"]` and the light theme inherits it (`base.css:108-114`); it has no consumer; `GlobalLoader.vue:34` writes the same literal; `base.css` loads at every entry (`popup/index.ts:15`, `onboarding/index.ts:21`).
- F16. `full.vue`'s `.shake` equals `shake.module.css`'s `.shake_password` in keyframe steps, duration, easing and reduced-motion rule; the keyframe name differs because CSS modules hash it per file; `a11y-css.test.ts:31-36` pins the local rule.
- F17. No design-system class matches the snack card's background, border and shadow (`ToastManagerBase.vue:208-226`).
- F18. Lock is never disabled today and `SRC/utils/in-flight-send.ts:14-15` says so; both Lock controls run through `useLockWallet`, whose final action is `lockWallet` (`useLockWallet.ts:45-49`), reached directly or from the "Lock anyway" confirm. A profile switch in a window starts on the lock screen (`pages/auth.vue:246`).
- F19. In the import, the sender registration is not fenced, runs after the contact write is counted, and swallows its own failures and the no-network case (`useContactImportExport.ts:262-271, 290-306`). `AccountStateService.addSender` runs PXE work inside `viaPxe`, which logs any failure at Error and rethrows a generic error (`account-state/service.ts:142-153`); the service has no `ProfileService` today (`:49-62`).
- F20. `.noanimations *` stops transitions only (`base.css:378-381`); `base.css` is hash-pinned (`base.css.test.ts:21`).
- F21. `#c62828` gives 5.62:1 against pure white and 5.2:1 against the label as drawn (`--txt-white`, 95% white): both above 4.5:1.
- F22. `setExpiryDeferral` is worker-internal with one caller, `ExecutionService` (`execution/service.ts:264`).
- F23. Smoke setup only checks that `dist/<browser>/manifest.json` exists (`tests/e2e/global-setup-smoke.ts:42-49`); `e2e:agent` builds its own network-stamped wallet into the same `dist/<browser>/` (`scripts/e2e/agent.sh:99, 111`).

### Inferences (unverified; audits attack these)

- I1. Arc 1 leaves `popupStore.open`'s re-open gap as it is; the phase pins it as a BUG PIN.
- I2. A list load can lose an event that lands during the read only where the read does work after its storage call or waits on other reads: `getFpcs` (`fpc/service.ts:117-140`) and Send's three-read `Promise.all` (`send.vue:599-612`). For NewContact, ImportContacts and SelectProfile one storage read answers in order, so a held-read test there shows the reducer's mechanics, not a production schedule.
- I3. Re-registering an already registered sender through `registerTaggingSecretSource` succeeds. Phase 3.3's re-run proves it by selecting an already registered row on purpose.
- I4. An import the page's unmount disconnects keeps running on lazily reconnected clients (recon § #151); FA-3 decides whether that changes.

### Asks (each with the working assumption the plan proceeds on)

- A1. The orchestrator may merge arc 1 without a stack (as `backup-import-export` did). Answered: D-orch-1, no stack; arc 1's PR targets `dev`.
- A2. FA-1, FA-2, FA-4 and FA-7 go on decision page 11 before it is signed; they block their phases. Working assumption: those phases wait; the rest of arc 3 ships when page 11 is signed.
- A3. FA-3, FA-5, FA-6, FA-8, FA-9, FA-10 and FA-11 ship in their "what ships now" form until answered.

## Architecture & Implementation

### Arc 1

**#184, the logger gate.** The worker tells each page its minimum level; the page drops only lines below a level it knows.

- `LoggerStore` gains a read-only `level` getter and an `onLevel` `EventHandler<LogLevel>` fired from `onConfigUpdate` only when `debugMode` changes the level.
- `LoggerService`: spec `log(...)` returns `LogLevel`; a new event `onLevel: LogLevel`. `log` reads `this._logger.level` synchronously, with no `await` before the read, and returns it; the service re-emits `onLevel` to every logger port.
- `LoggerServiceClient` keeps `private minLevel: LogLevel | undefined`. It sets it from each `log` answer and each `onLevel` event, accepting only `LogLevel.Debug` or `LogLevel.Info` (anything else sets `undefined`); it clears it on `onDisconnected`. `documentLogger().log` returns a resolved promise, before `trim`, only when `minLevel !== undefined && level < minLevel`.
- Invariants: a Warn or Error line is never dropped (the minimum is only ever Debug or Info). While the level is unknown, every line is sent, which keeps S1/S2. The answer is read and posted in the same task as the log (F3), and `onLevel` is posted after the change that caused it, so the last message a page receives carries the current level. Freshness covers the logger port only; the config page's own port is separate and not relied on.

**#205, persist first where memory is ahead of storage.** `ConfigStore.set` builds `next = { ...this.config, [key]: validated }`, awaits `storage.set(next)`, then assigns memory and announces. `reset()` does the same through `apply`: build the merged object and the changed props, persist, then assign and announce. `load()` keeps today's order (assign, announce, then write back): its values came from storage, and assigning first keeps the user's `developerMode` for the retention step if the write-back fails (F5). `apply` takes the order as an argument. `display.vue:91-93`'s comment is rewritten (the rollback stays for a field edited while the write is in flight). The three page bindings are not merged (D6).

**#210, depth.** `FormPopup` gains `depth: { type: Number, required: true }` and passes it to `PopupCard`; `displaceIdx` keeps feeding `Popup`. Each of the eleven callers destructures `depth` from `usePopupStack` and passes `:depth="depth"`. A closed key's depth is `NaN`; `NaN > 1` is false and the prop has no validator, so Vue does not warn. `popupStore.open` is not changed (FA-8).

**#212, line-terminated documents.** `logs-format.ts` gains `logsDocument(logs) = logs.map((l) => formatSingleLog(l) + "\n").join("")`: every line ends with a newline, and an empty list is `""`. The editor's first state and `updateEditorContent` both use it, so the first live line appends on its own line, and a rebuild after "Clear logs" no longer starts with a blank line. `scrollToTargetLog`'s offset arithmetic is unchanged (it counts the lines before the target).

**#214, one stored-name key.** `SRC/utils/account-name.ts` gains `storedNameKey(name: string | undefined) = (name ?? "").trim()` and `sameStoredName(a, b)`, which is false when either key is empty. `NewAccountPopup`, `NewFpcPopup` and `EditFpcPopup` compare with `sameStoredName`. The empty-key rule keeps today's result for blank input: `EditFpcPopup` validates a spaces-only name (`EditFpcPopup.vue:38-41`), and it must not match an unnamed FPC; what a blank name should do is outside #214. Saves are not changed: accounts are stored trimmed as today, FPC names as typed, as today (#214's fix is the comparison; storing FPC names trimmed would be a new rule). Case stays significant (D5). Network popups are not changed (FA-10).

### Arc 2

**#224.** `apps/extension/tests/helpers/held-read.ts` exports `held<T>()` (a deferred) and `liveBus<T>()` (a real `EventHandler` a service-client mock exposes, so a test invokes the handler the component registered). `send.test.ts`'s `held()`/`holdTokenReads()` move onto it. One test per owner (NewContact, ImportContacts, Send contacts, NewFpc/EditFpc, SelectProfile, Send token-delete) holds the read, fires an event, resolves the read and pins today's result: where the event's row is lost, the test is a BUG PIN that cites FA-9. The three byte-identical contact reducers become `contactListReducers(listRef)` in `SRC/utils/entity-list.ts` (in-place `push` and index assignment, delete through `withoutId`), so every identity and add-always-appends pin holds; `EditContactPopup` keeps its edited-row branch on top of it. The import's own address keys (`useContactImportExport.ts:100, 113`) stay: `fieldAddressKey` refuses an upper-case `0X` prefix and any malformed row that `toLowerCase` matches today, and a restored backup keeps such a string (`contact/service.ts:277`), so the swap would change an export's `isSender` (F14). The PR records that part of #224 as declined, with this reason.

**#225.** `GlobalLoader.vue:34` uses `var(--scrim-loader)`. `full.vue`'s `.shake` becomes `composes: shake_password from "../../../../../components/composite/shake.module.css"` (relative, like the four existing composes sites, `auth.vue:432`); its local keyframes and reduced-motion rule go, and `a11y-css.test.ts` drops the `full.vue` row (the shared file's row covers the rule). The snack card stays local: no shared primitive matches it (F17); the PR states that disposition.

### Arc 3 (built only after page 11 is signed, and per phase after its blocking asks)

**#151 (P11-01).**
- The write unit. `AccountStateService` gains `ProfileService` (an `init` lookup and a `dependencies` entry). `addSender(networkId, address, fence?)` asserts the fence (`assertRunFence`) before `viaPxe` and checks `isFenceLive` immediately before the PXE call, both outside `viaPxe`, so a stop reaches the page as `SessionEndedError` and never as an Error log line. In `importRow`, after the `stillAsShown` check (a refused row registers nothing), the sender step runs first when the row asks for it and returns one outcome: `registered`, `failed`, `skipped` (no network) or `stopped`. When a sender step ran, the book is read again and `stillAsShown` checked again immediately before the contact write, so a contact another window changed while the registration waited on the PXE is refused, not overwritten (the window left between that read and the write is today's). Only `stopped` ends the run before the contact write; `failed` and `skipped` keep today's behaviour (the contact is written and the outcome toast reports the sender count). Guarantee: a sender stage that ends in `stopped` never proceeds to the contact write, and neither does a row after it. It is not atomicity: a registration already awaiting the PXE when the session ends may still complete (in its own profile), and `failed` and `skipped` rows are written as today.
- The running state. The app store gains `contactImports: Map<symbol, { done: number; total: number }>`. `importContacts` adds its own token with its progress when `applyImportRows` starts, updates only that entry after each confirmed row, and deletes only that entry in its `finally`; Lock is disabled while the map is not empty, so an overlapping second import cannot clear the first one's state (today's overlap stays allowed). Which progress the line shows when two imports overlap is part of FA-1. The lock seal (`createLockedState`, `locked-state.ts:19-29`) clears the map beside `resetInFlight`, wired in `app.vue:178-185`: a registration still awaiting the PXE after its session ended keeps its import's `finally` pending, and its entry must not disable Lock in the next session. An import touches only its own entry, and only while it is present, so a late update or `finally` from an ended session neither re-adds its entry nor removes a newer one. The header Lock chip and Settings → Lock → "Lock now" read it as `disabled`; `lockWallet`, the final action both the direct path and the "Lock anyway" confirm reach, refuses while it is not empty. The worker's auto-lock is outside these guards (H6). The progress line renders where FA-1 says; FA-7 decides any time limit. `SRC/utils/in-flight-send.ts:14-15`'s comment is restated with the exception.

**#216 (P11-02).** Option A: the length warning moves into the right slot's fallback, `<slot name="right"><Transition v-if="warning.show">…</Transition></slot>`. Vue renders the fallback when the slot is absent or renders only comments, so a `v-if`'d duplicate warning wins when it shows and the length note shows otherwise. Option B: the right slot always renders; the warning icon and "Maximum length reached" leave the `Tooltip` for a helper row under the field (`Text` size 12, colour secondary, `data-testid="input-max-length-note"`), as shot `o-216-B` shows; FA-5 decides which fields. As is: no change; #216 closes as not planned (SR3).

**#229 (P11-03).** One new design token `--btn-destructive: #c62828` in both themes (through `token-contract.ts` and the generated `tokens.ts`); `.wrapper.destructive` and `.wrapper.cta_destructive` use it, and their hover is `color-mix(in srgb, var(--btn-destructive), black N%)` with N from FA-4 (the idiom `Button.vue:263` already uses). `--red` is not changed. `base.css.test.ts`'s hash and `Button.test.ts`'s red-fill assertion move in the same commit.

**#211 (P11-04).** `tx/[id].vue` drops its `.detail_link` colour override; `journal/[id].vue` drops `.wrapper`'s `padding-bottom` and composes the shared `.content`. Received stays as it draws.

**#215 (P11-05).** `shake.module.css` and a new `apps/extension/src/components/composite/shimmer.module.css` (the AmountCard and fee-shared skeleton, sized by `--shimmer-w`/`--shimmer-h`, set where each is used) each stop their animation under `@media (prefers-reduced-motion: reduce)` and under `:global(.noanimations)`. `NewSenderPopup`'s own shake keeps its look and gains both stops. The design package's `Skeleton.vue` and the received page's fee shimmer gain the `.noanimations` stop beside their existing reduced-motion rule. Spinners, pulses (including `Icon.vue`'s opacity pulse, `packages/design/src/core/Icon.vue:86-101`), the countdown bar and the row glow are left alone (FA-6).

### File-level change map

| Arc | File | Change |
|---|---|---|
| 1 | `SRC/wallet/logger/store.ts`, `store.test.ts` | `level` getter, `onLevel` event |
| 1 | `SRC/wallet/services/logger/{spec,service,client}.ts`, `client.test.ts` | `log` answers the level; `onLevel` event; client gate |
| 1 | `SRC/wallet/config/store.ts`, `store.test.ts` | persist first in `set` and `reset` |
| 1 | `SRC/popup/pages/settings/privacy.test.ts`, `display.vue` (comment) | BUG PIN becomes the new contract's page pin |
| 1 | `SRC/components/composite/FormPopup.vue`, `FormPopup.test.ts`, `FormPopup.stories.ts` | `depth` prop |
| 1 | 11 form popups under `SRC/popup/components/popups/` | pass `depth` |
| 1 | `popup-stack.pins.test.ts`, `SRC/components/Popup/PopupCard.test.ts`, `SRC/stores/popup.store.test.ts` | pin depth; `.displace` at depth > 1; re-open BUG PIN |
| 1 | `SRC/components/JsonViewer/{logs-format.ts,logs-format.test.ts,LogsViewer.vue,LogsViewer.test.ts}` | `logsDocument` |
| 1 | `SRC/utils/account-name.ts`, `account-name.test.ts` | `storedNameKey`, `sameStoredName` |
| 1 | `NewAccountPopup`, `NewFpcPopup`, `EditFpcPopup` + their tests | compare keys |
| 2 | `apps/extension/tests/helpers/held-read.ts`; `SRC/popup/pages/send.test.ts` | harness helper; move `held` onto it |
| 2 | `SRC/utils/entity-list.ts`, `entity-list.test.ts` | `contactListReducers` |
| 2 | `NewContactPopup.vue`, `ImportContactsPopup.vue`, `EditContactPopup.vue`, `pages/send.vue` + the six owners' tests (adds `NewFpcPopup.test.ts`, `EditFpcPopup.test.ts`, `SelectProfilePopup.test.ts` cases) | one contact reducer; held-read pins |
| 2 | `SRC/components/GlobalLoader.vue`; `export/full.vue`; `SRC/utils/a11y-css.test.ts` | token; composed shake |
| 3 | `SRC/wallet/services/account-state/{spec,service,client}.ts` + tests | fenced `addSender`, `ProfileService` dependency |
| 3 | `SRC/stores/app.store.ts`, `useContactImportExport.ts`, `Header.vue`, `settings/lock.vue`, `useLockWallet.ts`, `utils/in-flight-send.ts` (comment), the FA-1 surface, tests | #151 |
| 3 | `apps/extension/tests/e2e/contacts-import.test.ts`; new `tests/e2e/network/contacts-import-stop.test.ts` | #151 e2e |
| 3 | `packages/design/src/ui/Input.vue`, `Input.test.ts`, `Input.stories.ts` | #216 (A or B) |
| 3 | `packages/design/src/{token-contract.ts,tokens.ts,base.css,base.css.test.ts}`, `ui/Button.vue`, `ui/Button.test.ts` | #229 |
| 3 | `SRC/popup/pages/{tx,journal}/[id].vue` | #211 |
| 3 | `shake.module.css`, new `shimmer.module.css`, `AmountCard.vue`, `fee-shared.module.css`, `NewSenderPopup.vue`, `packages/design/src/ui/Skeleton.vue`, `received/[id].vue`, `a11y-css.test.ts`, a design-package pin | #215 |

### Algorithms and non-obvious mechanics

- **Level freshness (#184).** See the invariants above. A stale minimum can be Info at worst until the next answer, and Info drops only Debug lines.
- **Sender first (#151).** The contact write is the commit point for a stop: a stop before it leaves the row "new", so a re-run writes it. A non-stop sender failure or skip is written and reported exactly as today.
- **Import ownership (#151).** Each run owns a token; the Lock guard reads the set's size, so overlapping runs cannot release each other's guard.

### Trade-offs and alternatives not taken

See the decision ledger and the competing outline it was argued against.

## UI impact

- **Arc 1** (no new words; each restores what the screen was meant to show; the PR attaches screenshots):
  - Form popups (11 surfaces): a form popup under another popup sits back 15 px like every other popup; a form popup on top of two or more popups no longer sits back. No-ask: "Pass the card depth, not the raw stack order." (decisions.json `no_ask`).
  - Settings → Display, Privacy, Developer, Lock: after a failed write the control shows the stored value; the existing "Failed to update setting" toast is unchanged.
  - Logs window: the first live line starts on its own line; after "Clear logs" the list starts on the first line, not after a blank one.
  - New account, New FPC, Edit FPC: a name with outer spaces that matches a saved name shows the existing "Already exist" warning and Save stays disabled; saved names are not changed.
  - Logger: none.
- **Arc 2**: none. Phase 2.3 proves it per shell; any difference fails the arc (SR2). The held-read pins change no behaviour.
- **Arc 3** (quoting page 11 word for word):
  - P11-01: "While an import runs, Lock and profile switch are disabled and the import shows "Importing contacts · N of M". Auto-lock is not postponed: if it fires mid-import the wallet locks and the existing "Import incomplete · N of M contacts written" toast shows. The PR attaches the result in both themes." Where the line shows: FA-1; other windows: FA-2; a time limit: FA-7.
  - P11-02 A: "The right slot wins at the cap: a duplicate warning shows; the length note shows only when the slot is empty." B: "Both show: the duplicate warning stays at the right; "Maximum length reached" moves to visible text under the field, with no tooltip."
  - P11-03: "Both red buttons use a darker red in both themes (#c62828: 5.62:1 with the white label) with a hover that darkens instead of lightening, so every state passes AA. The emoji check's wording stays as signed." The hover amount: FA-4.
  - P11-04: "The tx page drops its local grey link colour and the journal page its local padding, so all three use the shared module: the Tx hash link in the primary text colour, the same bottom spacing. Received keeps its from-text as it draws it."
  - P11-05: "Shakes and shimmers stop when Settings' Disable animations is on or the system asks for reduced motion, through one shared class."

## Security & Adversarial Considerations

- **Threat model.** The logger and config ports are extension-internal (sender-authenticated, `packages/extension-messaging/src/core/sender-auth.ts`). Hostile input in scope: a backup file's config and contact rows (restore goes through `ConfigStore.set` and `ContactService` without address validation), and contact-import files (≤ 512 rows, validated addresses). Service events are global broadcasts (F3); no phase here adds a reducer that trusts an event's scope.
- **What each phase can lose or expose.**
  - 1.5 (#184): the risk is dropping Warn or Error lines, which every user's bug report relies on (CLAUDE.md § Logging policy). The client accepts only Debug or Info as a minimum; never-happens tests answer Warn, Error, `7` and `"x"` and still see Warn and Error lines posted, with the control that Debug is dropped under a known Info. A hostile backup cannot move the gate (`debugMode` is not restorable). Fewer Debug payloads crossing is a data-minimisation gain; `trim` is unchanged for every line sent.
  - 1.2 (#205): persist-first moves when `SessionManager` reacts to `strictSecurityMode` and `sessionTtl`: only after the value is stored. A crash between persist and announce is covered by the boot refusal (F7). `load()` keeps its order so a failed write-back cannot turn retention off and purge a developer's logs.
  - 1.1, 1.3, 1.4: no data path; 1.4 changes only which names the duplicate check refuses.
  - 2.1-2.2 (#224): tests and an identical-behaviour fold; no data path.
  - 2.3 (#225): CSS only.
  - 3.1-3.3 (#151): disabling Lock is a security trade the owner signs (P11-01); a hostile 512-row file of senders behind a slow PXE keeps manual Lock disabled for as long as the import runs, and with auto-lock off nothing else ends it (FA-7). Auto-lock, other windows (FA-2), the integrity coordinator, deletion and a worker restart still end the session, and the run fence stays the guarantee. The fenced `addSender` stops a registration from starting after the import's session ended (one already awaiting the PXE may finish in its own profile); the fence check sits outside `viaPxe`, so a stop logs nothing at Error. H6: a call-site pin keeps `setExpiryDeferral`'s one caller. The lock seal clears every import entry, so a session that ended cannot leave Lock disabled in the next one. A row's contact is refused, not overwritten, when another window changed it while its registration waited.
  - 3.4-3.7: CSS and design tokens only; #229 raises contrast.
- **Least privilege, crypto, supply chain.** No new dependency, permission, credential or cryptographic code. Frozen lockfile unchanged.

## Phases

Every command runs from the worktree root unless it says otherwise. "Fast layers" means `bun run lint`, `bun run typecheck:all`, and the touched test files through the repository's runtime: `bun run --cwd apps/extension test <files>` or `bun run --cwd packages/<pkg> test <files>`; all exit 0. "Smoke, both browsers" means `bun run --cwd apps/extension build:chrome && bun run --cwd apps/extension test:e2e -- <files> --retry=0`, then `bun run --cwd apps/extension build:firefox && NULO_E2E_BROWSER=firefox bun run --cwd apps/extension test:e2e -- <files> --retry=0` (a fresh build before each run: smoke setup does not check freshness, and `e2e:agent` overwrites `dist/`). "Network" means `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/<file>.test.ts`; until `e2e-harness-gaps` arc 1a (#169, gate G1) merges, run it inside an exclusive host lock that covers its build and its run, `flock --timeout 7200 ~/.cache/nulo-backlog/network-e2e.lock env NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/<file>.test.ts` (the kernel releases it when the run exits, crash included). The lock is atomic only among runs that take it, so also wait while `~/.agents/ports.md` lists a live `e2e:agent` run from another worktree; the orchestrator's G1 schedule governs, and it can hand the same lock path to the other lanes. Never run two in this worktree.

### Arc 1: logger, config, stack depth, logs viewer, names (decision-free)

**1.1 #212, the logs document.** ✓ Lands first in the arc (R3).
1. Add `logsDocument(logs)` to `logs-format.ts`.
2. Use it for the first `EditorState` and in `updateEditorContent`.
3. Test in `logs-format.test.ts`: two entries plus one live insert at the end read as three lines, each the `formatSingleLog` of its entry; an empty list gives `""`, and one live insert into it gives one line.
4. Test in `LogsViewer.test.ts`: the editor's first document (`H.editors[0].state.doc`) ends with `"\n"` for two entries.
- Validation gate: fast layers on the two test files; the document test fails against the base copy of `LogsViewer.vue`.

**1.2 #205, persist first.** ✓
1. Reorder `ConfigStore.set` and the `reset` path of `apply`; `load` keeps its order.
2. In `store.test.ts`: a `set` whose persist throws leaves `get(key)` on the old value and announces nothing; a retry of the same value writes and announces once (control). The same pair for `reset()`. A `load()` whose write-back throws keeps the stored values in memory.
3. Rewrite `privacy.test.ts`'s BUG PIN as the page pin of the new contract: the fake `setValue` throws without announcing; the toggle shows the stored value; a second press calls `setValue` again. (The red/green proof is `store.test.ts`; this case also passes on the base page code.)
4. Rewrite the `display.vue:91-93` comment.
- Validation gate: fast layers on `store.test.ts`, `privacy.test.ts`, `config/service.test.ts`, `session-manager.test.ts`, `logger/store.test.ts`; the new `set` and `reset` tests fail against the base `store.ts`.

**1.3 #210, depth.** ✓
1. Add `depth` to `FormPopup`; pass it to `PopupCard`.
2. Pass `depth` from the eleven callers.
3. Tests: `popup-stack.pins.test.ts` expects form popups to forward the depth to the card and the order to `Popup`; `PopupCard.test.ts` applies `displace` at depth 2 and not at depth 1 or `NaN`; `popup.store.test.ts` adds a BUG PIN for the re-open gap that cites FA-8.
- Validation gate: fast layers on those three files and each touched popup's test; `bun run --cwd apps/extension build-storybook` exits 0.

**1.4 #214, stored-name key.** ✓
1. Add `storedNameKey`/`sameStoredName` with tests: outer spaces equal; inner spaces and case significant; `undefined` keys as `""`; two empty keys are not the same name.
2. Switch the three validators.
3. Tests per popup, modelled on `NewContactPopup.test.ts`'s `nameWarns`: a saved "Alice" makes "Alice " and " Alice" warn and keep Save disabled; "alice" does not warn (control); an unnamed saved FPC beside a saved "Alice" does not throw, does not warn for "Bob", and does not warn for " " in Edit FPC (as today); `addFpc`/`updateFpc` receive the name as typed (as today).
- Validation gate: fast layers on the three popup test files and `account-name.test.ts`.

**1.5 #184, the logger gate.** ✓
1. Add `level` and `onLevel` to `LoggerStore`; answer and emit them in `LoggerService`.
2. Add the client cache and the gate in `documentLogger().log`.
3. Tests in `client.test.ts` with `PortRegistry` answering `LogLevel.Info`: after the first answer a Debug line is not posted (control); Warn and Error lines are. For answers and events of `Warn`, `Error`, `7` and `"x"`: Warn and Error lines still post, and so do Debug lines (the minimum stays unknown). An `onLevel` Debug event makes the next Debug line post. A remote close resets to sending everything. A real service and client pair (the service over a `LoggerStore` with a mutable config) turns `debugMode` on and the next Debug line reaches the store. `store.test.ts`: `onLevel` fires once per real level change. `client.ports.test.ts` S1-S4 pass unchanged.
- Validation gate: fast layers; `bun run test` and `bun run test:all` exit 0.

**Arc 1 precondition.** The orchestrator's record for #205, #212 and #214: met (D-orch-3).

**Arc 1 gate.** `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all` exit 0. The full smoke suite, both browsers (no `<files>`), every file passing; one rerun of a known flake, named in `lessons/phase-1.md`. PR screenshots: a form popup under the delete confirm, dark and light. Filed with the PR: the issues for `EditAccountPopup`'s missing duplicate check, the spaces-only account name, and the logs viewer's dead trim branch (dedupe first).

### Arc 2: harness-gated refactors (decision-free; base must contain `account-session-life` arc 3)

**2.1 The held-read helper.**
1. Add `tests/helpers/held-read.ts` (`held`, `liveBus`).
2. Move `send.test.ts`'s `held()`/`holdTokenReads()` onto it.
- Validation gate: fast layers; `send.test.ts` passes with the same test count.

**2.2 The six owners at the seam.**
1. One held-read test per owner, pinning today's result; a lost row is a BUG PIN citing FA-9.
2. Add `contactListReducers` to `entity-list.ts` with unit tests (in-place add and update keep the array identity; add appends even for a listed id; delete goes through `withoutId`).
3. Wire NewContact, ImportContacts, Send and EditContact onto it.
- Validation gate: fast layers on the six owners' tests and `entity-list.test.ts`; every existing identity and add-always-appends pin passes unchanged.

**2.3 Shells, proven unchanged.**
1. `GlobalLoader.vue` uses `var(--scrim-loader)`.
2. `full.vue`'s shake composes `shake_password` by relative path; drop its local keyframes and reduced-motion rule and the `a11y-css.test.ts` row.
3. Proof, against the arc's parent commit (record its SHA in `lessons/phase-2.md`):
   - Loader: a source pin in `a11y-css.test.ts` style asserts `--scrim-loader` is `rgba(10, 9, 8, 0.85)` in `base.css`, declared once on `:root, [theme="dark"]` and not overridden by the light theme, and that `GlobalLoader.vue` uses the token. On Chrome, a capture of `global-loader` during boot, dark and light, at a fixed viewport, compared pixel for pixel against the parent. Firefox cannot hold the loader on screen (the background cannot be stopped under an open page), so the source pin is its proof.
   - Shake: on Chrome and on Firefox, dark and light, at a fixed viewport, trigger the encrypt-pair mismatch (`full.vue:351, 658`), pause the animation through `document.getAnimations()` at 0, 60, 120, 180 and 240 ms, capture the field, and compare pixel for pixel against the parent; also compare the keyframe rule text with its name removed, `animation-duration` and `animation-timing-function`.
   - Scripts and captures live under `~/.cache/nulo-backlog/forms-and-contacts/`; the table goes in `lessons/phase-2.md` and the PR body.
- Validation gate: fast layers on `a11y-css.test.ts` and `base.css.test.ts`; every capture pair pixel-identical and every compared value equal. A difference fails the arc (SR2).

**Arc 2 gate.** Arc 1's commands, the full smoke suite on both browsers, and the 2.3 table.

### Arc 3: page 11 (waits on the signed page, H6, the sibling arcs and the blocking asks)

Every phase waits on page 11. A struck or "As is" item is not built; its issue gets the SR3 comment.

**3.1 #151 fenced sender, sender first.**
1. Give `AccountStateService` the `ProfileService`; fence `addSender` outside `viaPxe`.
2. Reorder `importRow`: refusal check, sender step with its outcome, the refusal check again when a sender step ran, then the contact write.
3. Tests: composition — a session that ends between the sender and the contact leaves no contact row (never-happens), and an unstopped run writes both (control); a registration already awaiting the PXE when the session ends may finish, and the contact write after it still stops; a failed sender (live session) still writes the contact and the outcome toast reports it, as today (pin); with the registration held, another window renames the row's contact: the contact write is refused and counted as a refusal (never-happens), and with no change while held the row is written (control); unit — a dead fence registers no sender and logs nothing at Error; the pins stop table still reads "Import incomplete · N of M contacts written".
- Validation gate: fast layers on `useContactImportExport.{test,pins.test,composition.test}.ts` and the account-state service tests.

**3.2 #151 the running state.** Waits on FA-1, FA-2 and FA-7, whichever option each answer picks. The steps below build the recommended answers (FA-1 A, FA-2 A, and FA-7 A or B). If FA-2 B or FA-7 B is picked, the phase is revised in `plan.md` before any code: files, the owner of the cross-window flag or the timer, how the timer ends with the import and with the session, the wording the page signs, and the tests below rewritten for that branch, with a Codex review of the revision recorded here. Sketch: FA-2 B moves the guard to a worker-side import flag set and cleared by `ContactService` under the run fence, read by every window's Lock and checked by the worker's lock entry; FA-7 B adds a 2-minute deadline per entry after which `lockWallet` opens the "Lock anyway" confirm instead of refusing.
1. The token map in the app store; `importContacts` owns its entry; the lock seal clears the map (`locked-state.ts`, `app.vue`).
2. Lock chip and "Lock now" disabled; `lockWallet` refuses while the set is not empty.
3. The progress line where FA-1 says.
4. Tests: both controls disabled while an import runs and enabled after it, including after a throw; with a sender registration held, a lock and an unlock leave Lock enabled, and the held import's late progress update and `finally` neither re-add its entry nor remove one a newer import added (never-happens, with the control that an import with no lock between keeps Lock disabled until it ends); two overlapping imports keep Lock disabled until both end, and each one's end removes only its own progress entry; `useLockWallet.test.ts` refuses on the direct path and from the confirm callback when an import started during `readForLock`; a call-site pin that `setExpiryDeferral` has exactly one caller (H6).
- Validation gate: fast layers on the touched component, composable and store tests.

**3.3 #151 end to end.**
1. Smoke, `contacts-import.test.ts`: during an import of the 500-row fixture with `isSender: false`, `header-lock` is disabled and enabled again after it ends; with `setSessionTtlMs`, auto-lock fires mid-import, the wallet locks and the incomplete toast shows.
2. Network, new `tests/e2e/network/contacts-import-stop.test.ts`: an import of `isSender: true` rows stopped by auto-lock; every listed contact has its sender registered; after unlocking, a re-run selects one row the first run already registered (it lists as "Already saved" and is unselected by default) plus the remaining rows: the registration is attempted again for that address, and every row ends with its contact and its sender (I3).
- Validation gate: smoke, both browsers, on `contacts-import.test.ts`; network (Chrome) on `contacts-import-stop`. No Firefox network twin: nothing here touches fixtures, focus, windows, user activation or WebAuthn.

**3.4 #216, the option the page picks.** Build A or B; for B, FA-5's scope.
- Tests in `Input.test.ts` with the real slot: at the cap with a `right` slot whose warning appears and disappears reactively, A shows the warning and hides the note, then shows the note when the warning goes; an empty fragment counts as empty; B shows both, the note as visible text with `input-max-length-note`; below the cap both show the slot.
- Validation gate: fast layers on `Input.test.ts`; `bun run --cwd apps/extension build-storybook` exits 0; screenshots of the contact, network and FPC name fields at the cap, both themes.

**3.5 #229, the darker red.** Waits on FA-4.
- Tests: `Button.test.ts` asserts both variants use the token and a hover that mixes toward black; a contrast unit test computes ≥ 4.5:1 for the drawn label on the rest and hover colours in both themes.
- Validation gate: fast layers; `base.css.test.ts` with its new hash; storybook build; screenshots at rest and hovered, both themes.

**3.6 #211, detail pages.** Starts on a base with R1 and #142 in.
- Validation gate: fast layers on the three pages' tests; smoke, both browsers, on `rows.test.ts`; screenshots of the three pages full height, both themes.

**3.7 #215, motion.**
- Tests: `a11y-css.test.ts` rows pin both stops (reduced motion and `.noanimations`) for every shake and shimmer; the design package pins the same for `Skeleton.vue`; a computed-style check at both shimmer sizes (72×10 and 60×12) matches the parent.
- Validation gate: fast layers; `bun run test:all`.

**Arc 3 gate.** Arc 1's commands, the full smoke suite on both browsers, and the network file from 3.3.

## Delivery

One `gh stack`, base `dev`, one PR per arc, each opened only after its gates pass and its Codex loop converges.

| Layer | Branch | Phases | Stacks on | PR title (≤ 93 chars) | Closes | code_review |
|---|---|---|---|---|---|---|
| 1 | `worktree-forms-and-contacts` (adopted) | 1.1-1.5 | `dev` | `fix(popup): form popup depth, trimmed name checks, config persist order, logger level gate` | #184, #205, #210, #212, #214 | off |
| 2 | `forms-and-contacts-arc-2` | 2.1-2.3 | layer 1 | `refactor(popup): pin list reducers under held reads, share the loader scrim and the shake` | #224, #225 | off |
| 3 | `forms-and-contacts-arc-3` | 3.1-3.7 | layer 2 | `feat(popup): guard contacts import, darker destructive red, shared detail and motion rules` | #151, #211, #215, #216, #229 (each only if page 11 approves it) | off |
| 4 | `forms-and-contacts-close-out` | close-out | layer 3 | `docs(plans): close forms-and-contacts` | — | off |

- Start: `gh stack init --adopt worktree-forms-and-contacts --base dev`. Each later layer: `gh stack add <branch>` after the previous arc's loop converges.
- Arc 1 may be submitted and merged before arcs 2 and 3 can start (A1). After its squash merge, restack with `gh stack sync`; never merge `dev` into the old head (add/add, `lessons.md`).
- If R1 or #142 lags behind page 11, the orchestrator may cut phase 3.6 into its own layer; 3.6 touches no file another arc-3 phase touches. The same holds for any phase whose blocking ask stays open.
- Open each PR without labels, then add `e2e:extension-smoke` or `e2e:extension-network` only when the path filter would skip a suite the arc needs.
- PR body: what changed and why, the validation run with outcomes, `Closes #n` per issue, screenshots for arcs 1 and 3, the 2.3 table for arc 2, and each disposition: #205's bindings stay separate (D6); #210's re-open gap and per-owner policies go to FA-8 and FA-9; #224's race goes to FA-9; #225's snack card stays local.
- An issue whose fix is left out or did not hold gets a comment with the reason and stays open (a struck or "As is" page-11 item closes as not planned per SR3).

### Issue to arc (for each issue's Pickup section)

| Issue | Arc | Closed by |
|---|---|---|
| #212, #205, #210, #214, #184 | 1 | layer 1's PR |
| #224, #225 | 2 | layer 2's PR (waits on `account-session-life` arc 3) |
| #151, #216, #229, #211, #215 | 3 | layer 3's PR (waits on page 11; #151 also H6, FA-1, FA-2, FA-7; #229 also FA-4; #211 also R1 and #142) |

## Decision ledger

Each entry: the choice, the rejected alternatives and why. "C" is Codex, "O" the Opus lens.

- D1 (#184): the worker's answer and an event carry the level; the client accepts only Debug or Info. Rejected: a config client inside the logger (second port per document, logs through itself, breaks S2); the level in answers only (a developer who turns debug on loses lines until the next Info line). C and O: sound; both asked for the clamp's never-happens tests and the stated freshness invariant (added).
- D2 (#205): persist first in `set` and `reset`; `load` unchanged. Rejected: page-side rollbacks (worker listeners stay on the unsaved value; `SessionManager` would clear a bearer for a strict mode never stored); persist-first in `load` too (O-13: a failed write-back would purge a developer's logs).
- D3 (#210): an explicit `depth` prop. Rejected: `FormPopup` reading the store (L3 composites may not import stores); a `popupKey` prop (puts the stack lookup in a presentational component).
- D4 (#210 re-open): not fixed in arc 1. The first draft compacted orders; O-8 showed that compaction changes which lower card sits back ({a,b,c}, re-open a: c goes from depth 1 to 2), a visible change the no-ask does not cover, and #210's own comment calls it the owner's. FA-8.
- D5 (#214): a trim-only key for accounts and FPCs, tolerant of an unnamed FPC; saves unchanged. Rejected: storing FPC names trimmed (F-4: a new storage rule, beyond the issue's fix); `contactNameKey` (case folding warns on "alice" beside "Alice", allowed today); extending to networks (C-5: their popups and worker agree on exact names, so trimming is a new rule; FA-10).
- D6 (#205): the three page bindings stay separate. Rejected: a `useConfigToggles` composable (four shapes with side effects — side panel, explorer toast, the developer cascade — for no defect). C: "Possible fix" does not require the dedupe; O: needs a disposition line (added).
- D7 (#212): line-terminated `logsDocument`. Rejected: `formatLogs(logs) + "\n"` (O-11: an empty viewer's first live line would land after a blank line).
- D8 (#224): harness, held-read pins for all six owners, one contact reducer; the race repair and the import's `fieldAddressKey` swap are not built. Rejected: the `fieldAddressKey` swap (F-5: stricter than today's lower-case match, so a restored `0X` row would export `isSender: false`); `loadReplaying` (C-1: events are global broadcasts, so a replay trusts scope it does not have; C-7 and O-9: the race is real only for FPC and Send, and repairing it changes which rows show, which breaks arc 2's no-change contract); `useEntityCrud` (immutable updates and dedupe-on-add break pinned in-place identity and add-always-appends); a re-read repair for FPC and Send (O-9's middle path; it follows Send's own `tokenAddedDuringLoad` precedent and is the recommended answer in FA-9, but it is a behaviour repair).
- D9 (#225): the scrim token and the composed shake; the snack card stays local. Proof per shell (2.3), not one blanket screenshot (C-8, O-10).
- D10 (#151): sender first, fenced outside `viaPxe`, with an explicit sender outcome; only `stopped` blocks the contact write. Rejected: contact first and count the row after the sender (the contact row is readable as complete between the two writes); skipping the contact on any sender failure (changes what an import writes, not in P11-01; FA-11 asks it). Kept after the final pass: the lane's requirement binds the interruption, and a failed or skipped sender is reported by the outcome toast (`useContactImportExport.ts:346-354`), while an interrupted row today is silent about its sender. Unresolved with Codex (F-1); the owner decides through FA-11.
- D11 (#151): an app-store token set read by both Lock controls and refused in `lockWallet` (the final action). Rejected: a guard only at `lock()`'s entry (C-3: misses an import starting during `readForLock` or before the confirm); a single boolean (overlapping imports clear each other); postponing auto-lock (H6); a worker-side flag for every window (FA-2). Entries cleared by the lock seal (F-3), since a registration held past its session keeps its `finally` pending.
- D12 (#229): one button token plus `color-mix(…, black N%)` hover. Rejected: changing `--red` (it colours every error); two tokens (O-15: the mix idiom needs one).
- D13 (#215): stops scoped to shakes and shimmers through the shared modules. Rejected: `.noanimations * { animation: none }` (stops spinners, pulses and the countdown bar, beyond P11-05's words).
- D14 (#216 A): the right slot's fallback. Rejected: filtering `useSlots().right?.()` for comment nodes (C-10: mishandles empty fragments and evaluates the slot by hand).
- D15 (blocking asks): FA-1, FA-2, FA-4 and FA-7 hold their phases instead of shipping a reduced P11-01 or P11-03 (C-4, O-3).
- D16 (delivery): one stack, arc 1 first; titles ≤ 93 characters (O-12 caught a 95-character arc 3 title). Superseded for arc 1 by D-orch-1.
- D-orch-1 (orchestrator, 2026-10-10): no stack. Arc 1 opens its own PR against `dev` (`gh pr create --base dev`) with the Delivery table's title; later arcs branch from `worktree-forms-and-contacts` and rebase onto `dev` after arc 1 lands.
- D-orch-2 (orchestrator, 2026-10-10): arc 1 only. Arc 2 waits on `account-session-life` arc 3; arc 3 waits on decision page 11, where FA-1 to FA-11 sit as items P11-06 to P11-17. FA-8 and FA-10 ship as today in arc 1 (today's behaviour pinned, as phases 1.3 and 1.4 say).
- D-orch-3 (orchestrator, 2026-10-10): arc 1's three visible corrections are no-ask decisions on the #210 precedent (bug fixes restoring intended behaviour with existing words) and ship in full: #205, after a failed config write the toggle shows the stored value again beside the existing "Failed to update setting" toast; #212, each log line on its own line, and after "Clear logs" the list starts on the first line; #214, duplicate checks compare trimmed input, so "Alice " beside a saved "Alice" shows the existing "Already exist" warning with Save disabled, and saved names are not changed. No other visible change and no new words.
- D-arc1-1 (#205, phase 1.2): `display.vue`'s dust-threshold catch drops its ref rollback and restores the field from the ref (`el.value = dustThreshold.value`). With persist-first a failed write never moves the ref, so the old `prev` rollback was dead, and in a cross-window race it would have shown a stale value instead of the stored one. The plan said only the comment changes; the tree made the rollback line dead.
- D-arc1-2 (#210, phase 1.3): the re-open BUG PIN in `popup.store.test.ts` says the fix is an owner decision without naming FA-8, since code comments carry no plan ids (CLAUDE.md § Code-comment style). The pins test also gains a closed-key case for the eleven form popups (`undefined|NaN`).

### Competing outline (cheapest-first), sent to both audits

- #184: gate in `documentLogger` on a `ConfigServiceClient` the logger opens lazily.
- #205: no worker change; each settings page restores its ref on a failed `setValue`.
- #210: `FormPopup` takes `popupKey` and calls `usePopupStack` itself.
- #214: reuse `sameContactName` in the account and FPC validators; leave networks.
- #224: tests only (held read + injected event, pinning today's overwrite as a BUG PIN); no helper.
- #151: contact first, then count the row only once its sender registered.

Outcome: the plan kept its #184, #205, #210 and #151 shapes; it took the outline's "leave networks" (#214) and moved toward its "tests only" for #224, keeping the one fold that changes no behaviour.

## Audit verdicts

### Round 1 (2026-10-10)

**Codex (gpt-6.1-sol, high): reject** (blocking: sender failures permit incomplete contacts; replay trusts global events; visible defaults lack approval; e2e gates can test stale builds). All ten findings accepted:
- C-1 [High] events are global broadcasts, not profile-scoped: F3 corrected; the replay design dropped (D8).
- C-2 [High] sender-first alone does not hold when a sender fails without a stop: explicit sender outcome; the invariant limited to stops; failure and stop tests with controls (D10). I3 now proven by 3.3's re-run.
- C-3 [High] the Lock guard must hold after `readForLock` and at the confirm; overlapping imports: guard in `lockWallet`, token ownership, tests (D11).
- C-4 [High] open asks treated as authorization: FA-1, FA-2, FA-4 block their phases (D15).
- C-5 [High] networks are a scope expansion: dropped (FA-10).
- C-6 [Medium] optional FPC name: the key handles `undefined`; test added.
- C-7 [High] #224's repair breaks arc 2's no-change contract: tests and BUG PINs only (D8, FA-9).
- C-8 [Medium] the pixel gate: frozen frames, keyframes compared without names, per-browser, named parent (2.3).
- C-9 [High] stale builds: `build:<browser>` before every smoke run; repository test runner; the network file named; the slot rule for `e2e:agent`.
- C-10 [Medium] #216 A through the slot fallback (D14).

**Opus 5.5 (Plan): conditional approve** (conditions: findings 1, 4, 5, 6, 7, 8, 12 before arcs 1 and 3; rescope #224 and rewrite the #225 proof before arc 2; surface new asks before page 11 is signed). Fourteen findings accepted, one in part:
- O-1 [High] sender failure that is not a stop: as C-2.
- O-2 [Medium] the fence inside `viaPxe` would log Error and lose the type; `AccountStateService` lacks `ProfileService`: fence outside `viaPxe`; dependency added to the change map.
- O-3 [Medium] Lock disabled with no limit: FA-7; FA-1 blocking (D15).
- O-4 [Medium] the H6 test was vacuous: a call-site pin; a smoke auto-lock case with `isSender: false` on both browsers (3.3).
- O-5 [Medium] optional FPC name (as C-6); spaces-only names: networks dropped; the account case filed as an issue.
- O-6 [Medium] the clamp's never-happens tests and the freshness invariant: added (1.5).
- O-7 [Low] "profile-scoped" was false: as C-1.
- O-8 [Medium] the re-open compaction is visible: dropped from arc 1 (D4, FA-8).
- O-9 [Medium] `loadReplaying` is bigger than the problem: accepted in part. The race is real for FPC and Send only (I2 restated); the re-read repair it recommends goes to FA-9 rather than arc 2, per C-7's stronger argument on arc 2's contract.
- O-10 [Medium] the #225 proof: as C-8, plus the loader's source pin for Firefox and the relative composes path.
- O-11 [Medium] a blank first line in an empty viewer: line-terminated builder (D7).
- O-12 [Medium] arc 3 title 95 characters: shortened to 90.
- O-13 [Low] persist-first in `load` would purge developer logs; the page test is not the red/green proof; dispositions for #205 and #225: all applied.
- O-14 [Low] fast tests on the Node launcher: the repository's `test` script.
- O-15 [Low] shimmer sizes need a computed check; one token plus `color-mix` for #229: applied.
- Fact corrections applied: F9 and F12 line numbers; F16's hashed keyframe name; 2.3's trigger is the encrypt-pair mismatch; recon's ledger reference.

### Round 2 (2026-10-10): Codex, resumed session

**Codex: conditional approve** (conditions: align FA-7 gating, define overlapping progress ownership, strengthen sender retry controls, reserve the network-test slot atomically). Round-1 findings C-1 to C-10 reported resolved (C-9 partly: slot admission). Seven findings, all accepted:
- R2-1 [High] FA-7 blocked 3.2 in OWNER-ASKS but only "if answered with a limit" in the phase: 3.2 now waits on FA-7 whatever the answer; the dependency table splits 3.1 (page 11 only) from 3.2-3.3.
- R2-2 [Medium] overlapping imports owned Lock but not progress: progress is stored per token; which progress shows when two overlap joins FA-1; a test covers it.
- R2-3 [Medium] the fence guarantee was overstated: restated as "a stopped sender stage never proceeds to the contact write"; a registration already awaiting the PXE may finish; a test covers it.
- R2-4 [Medium] the re-run could skip already registered rows (unselected by default): the network re-run selects one on purpose.
- R2-5 [Medium] a spaces-only Edit FPC name would match an unnamed FPC under an empty key: `sameStoredName` is false for empty keys; test added.
- R2-6 [Medium] a registry check is not a reservation: the network run holds an exclusive `flock` across build and run until G1 merges.
- R2-7 [Low] `Icon.vue`'s skeleton is an opacity pulse, not a shimmer: recon and FA-6 corrected.

### Final pass (2026-10-10): Codex, fresh session

**Codex: reject** (blocking: #151 still permits incomplete contacts; stale imports can block Lock in a new session; visible changes lack recorded authorization). Six findings; four accepted, one partly, one rejected:
- F-1 [High] contacts are written after a `failed` or `skipped` sender, with no incomplete marker: **rejected, with the owner as tie-break.** The lane's requirement binds the interruption: an interrupted row is today silent about its sender, and sender-first removes that case. A failed or skipped sender in a live session is reported by the outcome toast ("2 of 5 senders registered", `useContactImportExport.ts:346-354`) only when the run ends with no contact error and no stop: a contact error (`:343-345`) or a later stop (`:185`, `:335-338`) replaces the sender count, so an earlier row saved without its sender can go unreported, as today. Skipping those contacts changes what an import writes, which P11-01 does not sign. Recorded as unresolved; FA-11 puts the choice to the owner, with the reporting gap stated, and what ships now is today's behaviour.
- F-2 [High] sender-first opens a stale-review window while the registration waits: accepted. The book is read and `stillAsShown` checked again before the contact write; a held-registration test with another window's edit, plus its control (3.1).
- F-3 [High] an import entry can outlive its session and disable Lock in the next one: accepted. The lock seal clears the map; an import touches only its own present entry; a lock-and-unlock test with a held registration (3.2).
- F-4 [High] arc 1's visible corrections rest on the lane brief, not a recorded authorization; FPC trimming is a new rule: partly accepted. FPC saves are no longer changed (#214's fix is the comparison). The three remaining visible corrections (#205, #212, #214) need the orchestrator's record, as #210 has; arc 1 waits for it, and without it each part stays as it is (§ Owner dependencies, OWNER-ASKS.md § Arc 1 corrections).
- F-5 [Medium] `fieldAddressKey` changes an export for a restored `0X` address: accepted (verified: `field-address.ts:7` requires a lower-case `0x`). The swap is dropped from arc 2; the PR records that part of #224 as declined.
- F-6 [Medium] FA-2 B and FA-7 B are gated but not specified: accepted. 3.2 builds the recommended answers and is revised, with a Codex review, before any code if either B is picked.

**Confirmation (same session): conditional approve** (correct FA-11's reporting claim; remove arc 2's stale address-key clause). F-1 to F-6 reported as holding (F-1 for the interrupted-row guarantee, F-4 subject to the orchestrator's record). Two findings, both accepted and verified in the code:
- F-7 [Medium] FA-11 said the snack always reports a failed sender and that an interrupted import leaves no such row: a contact error or a later stop replaces the sender count (`useContactImportExport.ts:185, 335-345`), and an earlier row's failed sender stays saved. FA-11 and the F-1 disposition now say so.
- F-8 [Low] arc 2's summary still named the address-key swap: removed.

### Arc 1 post-implementation loop (2026-10-10)

**Codex round 1 (gpt-6.1-sol, high, fresh session): approve**, no production defect. Two Lows, both accepted:
- A1-C1 [Low] the real service and client test could pass with both level paths broken (the worker drops the first Debug line anyway). Accepted and verified: the cold first round trip took 7 ms against the test's 5 ms settle, so its first half proved nothing. The test now awaits the first answer, asserts the Debug line never reached the worker, waits for the `onLevel` event to land, and asserts the next Debug line reached both the worker and the store; it fails with the answer removed and with the event removed.
- A1-C2 [Low] `ConfigStore.apply`'s docblock carried history and restated its parameter: cut to one sentence.

**Opus 5.5 review (alongside round 1): approve.** One Low, accepted:
- A1-O1 [Low] Settings → Lock's auto-lock field kept the typed value after a failed write (as before the arc), so the plan's Lock line held only for the strict toggle, and typing the same value again wrote nothing. The catch now puts the stored timeout back (the dust-threshold field's rule; no new words), and a page test proves the reset and the retry; it fails on the prior `lock.vue`.

**Codex round 2 (same session): conditional approve.** A1-C1 and A1-C2 resolved; one new finding, accepted:
- A1-C3 [Medium] the A1-O1 reset could overwrite a newer edit: a write that fails after the person typed another timeout put the stored one back and the newer edit was never saved. The reset now runs only while the field still holds the attempted value; Display's dust field (whose catch this arc rewrote) gets the same guard. A held-rejection page test proves the newer edit survives and is written; it fails on the round-1 `lock.vue`.

**Codex round 3 (same session): approve, no new material findings.** The loop converged.

## Post-implementation

This section is self-contained: the implementing session follows it from here.

### Per arc, at each arc boundary (before `gh stack add` opens the next layer)

1. Run the arc gate (above) and paste its result.
2. Codex audit: `env -u CODEX_ACCOUNT ~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol` (on a quota or 401 error, retry once with `CODEX_ACCOUNT=alejo-icloud`; if that fails too, log the failed consult and continue on your own judgment within scope). The prompt carries: the arc's diff; this plan and its decision ledger; the arc map ("this is arc N of 3; later arcs build X on it", so seams reserved for later arcs are not flagged); the adversarial ask (what could go wrong, what would an attacker target, what are we trusting that we should not); and the two rules below, verbatim.
3. Triage each finding. Verify Codex's factual claims against the repo first; it can misread code. Apply the accepted fixes, commit, and log the round (consult and verdict) in `lessons/phase-N.md`.
4. Resume the same Codex session (`resume-codex.sh "" <followup> <codex-dir> high`) with the fix diff and ask for a re-review under the same rules. Repeat until a round yields no new material findings. Rejected nitpicks do not count. Still material after three rounds: stop and surface it to the orchestrator.

### After every arc is looped

5. Final cross-arc pass: a fresh Codex session over the net diff from the plan baseline, asking for seams between arcs, duplication across arcs and drift from this plan, with the two rules. Same loop, same three-round stop.

**The no-over-engineering rule** (verbatim in every post-implementation Codex prompt): *"Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."*

**The comment-quality rule** (verbatim in every post-implementation Codex prompt): *"Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."*

### Delivery

6. Per the Delivery section. Never open a PR, not even a draft, before its arc's loop converges. `gh stack submit --auto`, then `gh pr edit` each body. Then `gh pr checks --watch`.

### Close-out (the stack's docs-only top layer, after the arc PRs exist)

7. Before the close-out commit, merge `origin/dev` into the branch and read what changed in `implementations-plan/index.md` and `lessons.md`; never a union merge.
8. Write an `## Outcome` block directly after the front matter: date, status, what shipped with PR numbers, what was dropped or did not hold (a disposition line each), an `Open items:` line, and a line retiring the `/goal` and `/loop` seeds below.
9. Promote the generalizable gotchas into `implementations-plan/lessons.md`, one line each, linking the archived detail; keep it under 8 KiB, deduplicate, retire what a new entry supersedes, date tool-specific lines.
10. File every open item in its home (at least each FA-n still unanswered, as an `owner-decision` issue, unless an earlier arc filed it):

| Situation | Home |
|---|---|
| Work inside the implementation you are on | this `plan.md` and the PR |
| Actionable work that outlives the plan | a GitHub issue with a domain label and a `Record` link to the archived plan |
| Needs a product call, or waits on something outside the repo | an issue labelled `owner-decision` or `blocked:external` |
| A suspected exploitable weakness | a private draft security advisory; the plan records only "tracked privately: GHSA-…" |
| Rejected, superseded or already done | a disposition line in the Outcome block |
| Knowledge that prevents a repeat | `implementations-plan/lessons.md` |
| A legal or store blank with a release deadline | `BEFORE-LAUNCH.md` |
| Accepted code work that blocks launch | the `v1.0.0` milestone, pointed at once from `BEFORE-LAUNCH.md` |

   Dedupe first (`gh issue list --state all --search "<words>"`); an issue body has `## What happens`, `## Where`, `## Impact`, `## Possible fix`, `## Record`.
11. Delete `STATUS.md`. Keep `OWNER-ASKS.md` with its answers (it archives with the plan). `git mv implementations-plan/forms-and-contacts implementations-plan/archive/forms-and-contacts` in its own commit; repair the relative links the extra level breaks (`git grep -n 'forms-and-contacts'`); move the index line to `implementations-plan/archive/index.md`. Run `bun run check:plans`.
12. Report and wait. Merging is the orchestrator's call; the merge of the close-out completes the plan.

### Teardown after the merge

13. Once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/forms-and-contacts/plan.md` succeeds, run `agent-worktree done forms-and-contacts --merged --trunk dev`, without asking (a session started inside the worktree has nothing to exit). It refuses rather than forces: relay a refusal and stop. A `/loop` session checks this on every firing; a `/goal` session arms one background wait after its wrap-up report: `until git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/forms-and-contacts/plan.md; do sleep 300; done`.

## Seeds

Recommended: `/goal`. Use exactly one per session; they do not compose. Both are drafts until the orchestrator approves the plan; arc 2 starts only on a base with `account-session-life` arc 3, and arc 3 only with page 11 signed.

```
/goal Every phase of the arcs the orchestrator released is marked ✓ in implementations-plan/forms-and-contacts/plan.md, each backed by its validation gate reported passing in the transcript; for each phase the transcript prints LESSONS_FILE=implementations-plan/forms-and-contacts/lessons/phase-N.md; /code-review was NOT run (code_review is off); the Codex fix loop (env -u CODEX_ACCOUNT run-codex.sh … high read-only gpt-6.1-sol) converged for each released arc at its boundary and for the final cross-arc pass, each convergence a resumed Codex pass reporting no new material findings, quoted in the transcript; the Delivery section's stack exists on GitHub, created only after the loops converged (gh stack view in the transcript), including the close-out layer that archived the plan (git show --stat of the archive-move commit); bun run test and bun run lint both exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/forms-and-contacts forward. Never idle. Each firing: (1) read plan.md, STATUS.md, OWNER-ASKS.md and lessons/ from the top stack layer; if the plan path is gone, check `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/forms-and-contacts/plan.md`: success means merged, so run `agent-worktree done forms-and-contacts --merged --trunk dev`, report, clear this loop and stop; failure means delivered, so babysit CI only. (2) Waiting on CI is fine; confirm it progresses. (3) No task in hand: take the next pending step of a released arc; arc 2 needs account-session-life arc 3 on its base, arc 3 needs the signed page 11 and each phase's blocking asks, and an open OWNER-ASKS item leaves its part as it is. Run lint and the touched tests after each edit; commit; gh stack push. (4) A decision you would bring to a person: consult Codex (env -u CODEX_ACCOUNT run-codex.sh … high read-only gpt-6.1-sol) and log it; anything a person would see goes to OWNER-ASKS.md and waits. Never merge, publish or widen scope. (5) Same step failed 5 times: reassess with Codex. (6) Phase green per its gate: mark ✓, print LESSONS_FILE=…, advance; at an arc boundary run the Codex loop before gh stack add. (7) All released phases ✓: final cross-arc pass, Delivery, close-out per plan.md, gh pr checks --watch, report and stop.
```
