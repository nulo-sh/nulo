# Recon: forms-and-contacts

Read against `ed59711` (`origin/dev`). Three read-only Sonnet explorers (arc-1 reuse sweep; arc-2 and arc-3 surfaces; the contacts import against lock), plus the planner's own reads of every file an issue names. Paths are repo-relative; `SRC` is `apps/extension/src`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Learn the worker's log level in a page | Nothing: `LoggerService` has no event and `log` returns `void` (`SRC/wallet/services/logger/spec.ts:14`). `ConfigServiceClient` (`getValue("debugMode")`, `onUpdate`) exists, but a logger that owns a config client opens a second port per document and logs through itself (`client.ports.test.ts` S2 pins zero live config ports). Searched: `getLevel`, `onLevel`, `logLevel`, `minLevel` in `SRC` and `packages/*/src`. | adapt: `log` answers the store's level; the service emits a level event (built on `Service.emit`, `packages/extension-messaging/src/core/base-service.ts:129`) |
| Port fakes for a logger test | `PortRegistry` + `connectStub` (`@nulo/extension-messaging/testing`), as `client.test.ts` and `client.ports.test.ts` use them | reuse as-is |
| Config write order | `ConfigStore.set` / `apply` (`SRC/wallet/config/store.ts:47-101`); in-memory `chrome.storage.local` fixture `withStored` (`store.test.ts:11`) | adapt (persist first) |
| A config toggle binding shared by pages | None. Three hand copies (`settings/privacy.vue:49-90`, `display.vue:100-157`, `developer/index.vue:92-134`); `lock.vue` a fourth shape. `fullscreenPopupSetting.ts` is read-only. Searched: `useConfigToggle`, `useConfigSetting`, `syncedRef`, `useSyncedRef`. | not built here (see plan, D6) |
| Order and depth of a stacked popup | `usePopupStack(key)` → `{ order, depth }` (`SRC/composables/usePopupStack.ts:9-15`); 14 non-form popups already pass `depth` to `PopupCard` | reuse as-is |
| Logs document text | `formatLogs` / `formatSingleLog` (`SRC/components/JsonViewer/logs-format.ts:69-77`) | adapt: one helper builds the document both places use |
| A name key for accounts and FPCs | `contactNameKey` / `sameContactName` (`SRC/utils/contact-name.ts:60-69`, NFKC + case folding); `normalizeProfileName` (`SRC/utils/profile-name.ts`, NFKC + lower case, no trim). Neither matches what an account or FPC stores (trim only; FPC stores the raw input). Searched: `nameKey`, `sameName`, `trim()` in `SRC/utils`. | build new: a trim-only key in `SRC/utils/account-name.ts` (case folding would add warnings people see today as allowed) |
| Run fence for the contacts import | `RunFence`, `assertRunFence`, `isFenceLive` (`ContactService` writes, `SRC/wallet/services/contact/service.ts:103-160, 243`) | reuse; extend to `AccountStateService.addSender` (arc 3) |
| An app-wide "operation in progress" flag | Only the in-flight send tracker (`SRC/stores/app.store.ts:152-262`, `commitScopeChange`). Searched: `isImporting`, `importInProgress`, `isBusy`, `lockBlocker`, `blockLock` in `SRC`. | build new (arc 3, after page 11) |
| Progress text that survives a lock | Toasts have `success` / `error` only; a lock closes every toast (`scope-epoch.ts` `onLocked`) | owner ask (OWNER-ASKS.md FA-1) |

## Arc 1 findings

### #184 logger

- `documentLogger().log` → `LoggerServiceClient.log` → `request("log", …)` for every line (`SRC/wallet/services/logger/client.ts:20-56`). The only gate is the worker's `LoggerStore.logWithContext`: `if (level < this.logLevel) return` (`SRC/wallet/logger/store.ts:59-62`), with `logLevel` Debug when `debugMode` is on, else Info (`:28`, `:164-167`).
- Who sends debug lines: every `ServiceClient` built on `documentLogger()` logs `Connected`, `Disconnected`, `→ method`, `← method` and `Event received` at Debug (`packages/extension-messaging/src/core/base-client.ts:130, 241, 277`; `background/client.ts:76, 90`); `installConsoleForwarding` maps `console.debug` to Debug and a disconnect rejection to Debug (`SRC/wallet/logger/console-forwarding.ts:15, 21`); the offscreen document's PXE logger (`SRC/offscreen/index.ts:31, 88`).
- Contexts: popup, onboarding, offscreen (`DocumentLogContext`). The worker logs into `LoggerStore` directly.
- `LogLevel` is `Debug 0, Info 1, Warn 2, Error 3` (`packages/wallet-core/src/logger/interfaces.ts:13-18`). `debugMode` is not restorable from a backup (`config/spec.ts:47-56`).
- Pins: `client.ports.test.ts` S1/S2 expect Debug `Connected`/`Disconnected` lines on the wire with a registry that answers `undefined`. A gate that sends while the level is unknown keeps them. `tests/vitest.setup.ts:9-13` mocks `documentLogger` globally; real-client tests `vi.unmock` it.

### #205 config write

- Claim holds: `set` assigns memory, invokes `onUpdate`, then awaits `storage.set` (`store.ts:65-67`); a failed persist leaves memory and every listener on the new value, and the early return at `:62` makes a retry of the same value a no-op. `apply` (load, reset) has the same order (`:87-100`).
- Listeners of `ConfigStore.onUpdate`: `ConfigService` re-emits to pages (`SRC/wallet/services/config/service.ts:39, 87-89`); `LoggerStore` (`debugMode`, `developerMode` purge); `SessionManager` (`sessionTtl`, and `strictSecurityMode` ON clears the bearer, `session-manager.ts:735-757`). A worker that dies after a persist and before the announce is safe for strict mode: boot refuses a stored bearer under strict mode (`session-manager.ts:583`).
- The pages apply a value only after `setValue` resolves (`privacy.vue:49-59` and twins); `Toggle` is controlled (`packages/design/src/ui/Toggle.vue:8-18`), so once the worker stops announcing a failed write, the toggle keeps the stored value with the existing "Failed to update setting" toast. `display.vue:91-93` carries a comment that describes today's order; it becomes wrong.
- Pin to invert: `SRC/popup/pages/settings/privacy.test.ts:93-109` (BUG PIN).

### #210 form popup depth

- Claim holds: `FormPopup` forwards its one `displaceIdx` (the raw order) to `Popup` and to `PopupCard` (`SRC/components/composite/FormPopup.vue:10, 25-26`); `PopupCard` displaces when `displaceIdx > 1` (`SRC/components/Popup/PopupCard.vue:34, 62-64`), which wants the depth (1 on top). All 11 form popups pass `order` only (NewAccount, NewFpc, NewNetwork, NewToken, NewContact, NewEndpoint, EditAccount, EditEndpoint, EditFpc, EditNetwork, EditContact). The 14 non-form popups pass `order` and `depth` correctly.
- Effect today: a form popup at order 0 or 1 is never pushed back when another popup opens over it; a form popup opened third or later (order ≥ 2) is pushed back while it is on top.
- Pin to invert: `SRC/popup/components/popups/popup-stack.pins.test.ts` (`FORM_POPUPS` expects the raw order, header comment `:2-7`).
- Re-open claim holds: `open` on an open key sets `order = Object.keys(popups).length`, which counts the key itself (`SRC/stores/popup.store.ts:18-23`): `{a:0,b:1}` re-open `a` gives `{a:2,b:1}`; `close("a")` then leaves `{b:1}` with `len` 1, and the next `open("c")` gets order 1, the same as `b`.
- The "unmount before the visibility seed" part was fixed by #234 (comment on #210).
- "Add and update reducer policies differ per owner": no file named; read as the entity-list reducers #224 covers (arc 2). Each owner's policy is visible, so arc 2 pins them and does not unify them (OWNER-ASKS FA-9).
- `send.vue:311-317` hand-rolls `len - order` for the review sheet (not a form popup; left as is).

### #212 logs viewer

- Claim holds: the editor starts from `formatLogs(logs)` with no trailing newline (`LogsViewer.vue:225`), a live line inserts `"<line>\n"` at the document end (`:70-72`), and `updateEditorContent` rebuilds with a trailing newline (`:110`). Only the first document lacks it.
- Observed, not in the issue: the trim branch in `onLogAdded` (`:64-68`) can never run. `logs` is spliced back under `maxLogsCount + MAX_LOGS_DIFF` before `filteredLogs.length` is compared against the same bound, so the editor document grows past the cap in a long session (the stale `doc.length` the branch would use is therefore unreachable too). Out of scope for R3's small change; filed at close-out.
- Test seam: `LogsViewer.test.ts` mocks CodeMirror so `EditorState.create` returns its config (`H.editors[0].state.doc` is the initial text).

### #214 name duplicates

- Account: compares `a.name === v` untrimmed (`NewAccountPopup.vue:34`); saves `name.value.trim()` (`:71`). Claim holds.
- FPC: compares untrimmed (`NewFpcPopup.vue:35`) and saves the raw input (`:76` → `FpcService.addFpc`, `SRC/wallet/services/fpc/service.ts:251-306`, no trim). **The issue's "the saved name is trimmed" does not hold for FPCs**: "Alice " and "Alice" are stored as two rows that read the same. `EditFpcPopup.vue:40, 75, 122` has the same untrimmed compare and raw save.
- Outside the issue: `NewNetworkPopup.vue:37, 86`, `EditNetworkPopup.vue:29, 46, 68` compare and save raw names, and the worker's exact-match check (`network/service.ts:510-513, 532-535`) agrees with them: consistent today, so trimming would be a new rule (OWNER-ASKS FA-10). `FpcInfo.name` is optional (`fpc/spec.ts:29, 56`). `EditAccountPopup.vue` has no duplicate check at all (a missing check, not a trim bug).
- `Input` with `sanitize` keeps spaces (`SRC/utils/string.ts:34-43`), so outer spaces reach the validators.
- Test template: `NewContactPopup.test.ts:215-304` (`nameWarns` loop over near-duplicate forms).

## Arc 3: the contacts import against lock (#151)

- The import is a popup-side loop (`SRC/popup/components/modules/settings/contacts/useContactImportExport.ts:140-201`): pick, parse (≤ 512 rows), capture a `RunFence`, the selection popup, then `applyImportRows` writes one row at a time: re-read the book, `addContact`/`updateContact` (fenced), then `accountStateService.addSender` (**not fenced**, `:300`). A failed fenced call probes the fence; a failed probe returns `STOPPED` and the "Import incomplete · N of M contacts written" toast (`:338`, signed on contacts-import-1 ask 1 B).
- A contact row is one `chrome.storage.local` key, written atomically (`contact/service.ts:126, 157`; `EntityStorage.set`). The only half-applied unit is the pair contact row + sender registration: a stop between them leaves the contact saved, counted as written (`tally.written++` before `registerSender`, `:267`), and the sender unregistered. A re-run lists the row under "Already saved".
- Lock controls: header `header-lock` (`SRC/components/Header.vue:271-282`) and Settings → Lock → "Lock now" (`settings/lock.vue:160-166`), both through `useLockWallet`. Neither has a disabled state. `SRC/utils/in-flight-send.ts:14-15` states "Locking the wallet is never blocked"; running sends get a confirm ("Lock anyway").
- Profile switch in a window: only from the lock screen (`SelectProfilePopup`, opened at `pages/auth.vue:246`), so a disabled Lock also disables switching in that window. Other windows, the side panel, auto-lock, the integrity coordinator, profile deletion and a worker restart still end the session; the fence stays the guarantee.
- Auto-lock lives in the worker (`session-manager.ts`, `chrome.alarms`); `setExpiryDeferral` is one slot owned by `ExecutionService` (`execution/service.ts:264`). P11-01 does not postpone auto-lock, so the slot is untouched (H6).
- A lock closes every toast and every popup (`SRC/popup/locked-state.ts:19`; `scope-epoch.ts` `onLocked`), so a progress toast would vanish with the lock that ends the import.
- Navigating away from Contacts mid-import disconnects the page's clients: the fence probe passes, the row is logged as an error, and the loop goes on. Closing the popup window ends the loop with no toast.
- Tests: `useContactImportExport.pins.test.ts:278` (the stop table), `useContactImportExport.composition.test.ts:378` (a profile switch mid-import, real `ContactService`), `contacts-import.test.ts` (e2e, no interruption case), helpers in `tests/e2e/helpers/contacts.ts`, `setSessionTtlMs` (`tests/e2e/fixtures/helpers.ts:498`).

## Arc 2 findings

### #224 reducers and the harness

- Six owners: NewContact (`NewContactPopup.vue:30-47`, load `:140`), ImportContacts (`ImportContactsPopup.vue:34-51`, load `:149`) and Send contacts (`send.vue:196-212`, load `:599-612`) are byte-identical; EditContact (`EditContactPopup.vue:34-62`) adds an edited-row branch; NewFpc/EditFpc (`NewFpcPopup.vue:90-111`; `EditFpcPopup.vue:137-175`) ignore an update for an unknown id; SelectProfile (`SelectProfilePopup.vue:76-102`) upserts and splices; Send token-delete (`send.vue:116-131`) splices and moves the active token.
- Pins that any change must keep: in-place identity (`toBe(before)`) and add-appends-even-for-a-listed-id (`NewContactPopup.test.ts`, `ImportContactsPopup.test.ts`, `send.test.ts`, `EditContactPopup.test.ts`).
- No component harness for a held read beyond Send's tokens (`send.test.ts` `held()`/`holdTokenReads()`); every other popup test resolves its read at once and calls handlers from `bus.add.mock.calls`. `tests/helpers/app-store-harness.ts` is a store fake only.
- Where a read can answer older than an event already posted on the same port: `getFpcs` works after its storage read (`fpc/service.ts:117-140`), and Send waits on three reads in one `Promise.all`. Send already re-reads when a token is added during its load (`tokenAddedDuringLoad`, `send.vue:94-100, 597-607`), the repo's precedent for a repair. Contact and profile reads are one storage read each, answered in order.
- Service events are global broadcasts (`packages/extension-messaging/src/background/service.ts:85-94`; `useEntityCrud.ts:34-40` documents it with its `accept` filter).
- `fieldAddressKey` (`packages/wallet-bridge/src/field-address.ts:11-17`): lower-cases a `0x` + 64-hex value below the modulus, else `undefined`; importable from popup modules (precedent `FeeSettingsCard.vue:80`).

### #225 shells

- Snack card (`packages/design/src/ui/ToastManagerBase.vue:208-226`): no design-system class with its background, border and shadow; no shadow token exists.
- Loader scrim: `--scrim-loader` (`base.css:114`) equals `GlobalLoader.vue:34`'s literal in both themes and has no consumer. Moving the loader onto `LoadingState` would change spinner size, gap, padding and width (not planned).
- Export shake: identical to `shake.module.css` `.shake_password` except the per-module keyframe name; `a11y-css.test.ts:31-36` pins the local rule.
- No pixel-diff tooling in the repo; Chrome e2e can read computed styles and pause animations; Firefox cannot hold the boot loader on screen.

## Arc 3 findings (beyond #151)

- #216: `Input.vue:267-287` replaces the right slot with the length warning at the cap; 7 call sites have both a cap and a right slot; no test covers the swap.
- #229: `.wrapper.destructive` hover mixes toward `--txt-primary` (lightens in dark), `.wrapper.cta_destructive` hover is `opacity: 0.9`; `--red` is `#f03c3c` in both themes and colours every error; `Button.test.ts` regex-parses the style block; call sites: `reset.vue:167`, `export/full.vue:429-430` through `ConfirmPopup`.
- #211: `tx/[id].vue:388-391` greys its hash link; `journal/[id].vue:315-322` pads its own wrapper and content; `received/[id].vue` uses the shared module.
- #215: 20 keyframe animations exist in `SRC` and `packages/design/src`; only `PasskeyScreen`, `TransactionCardLayout` and `BalanceView` honour `.noanimations`. Shakes: `shake.module.css`, `full.vue`, `NewSenderPopup.vue:171-189` (no reduced-motion rule); shimmers: `Skeleton.vue`, `AmountCard.vue:565-596`, `fee-shared.module.css:30-52`, `received/[id].vue:425-452`. `Icon.vue:86-101` animates opacity only: a pulse, not a shimmer (FA-6). Onboarding never applies `.noanimations`.
