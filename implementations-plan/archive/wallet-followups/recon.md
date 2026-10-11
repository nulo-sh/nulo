# Recon: wallet-followups

Base: `origin/dev` at af4afcc. One Explore agent (sonnet) swept the six capabilities below; the planner replayed the #259 seed, traced its shrunk tape and read every file the five fixes touch. `SRC` is `apps/extension/src`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Name key and duplicate check | `SRC/utils/account-name.ts:13` `storedNameKey`, `:19` `sameStoredName` (false on a blank key) | reuse as is; `!storedNameKey(v)` is the "trims to empty" test. No new helper: `NewFpcPopup`'s `!v.replace(/\s/g, "").length` is equivalent for this input and stays untouched |
| Duplicate warning in a name field | `NewAccountPopup.vue:130-134` (`FieldWarning` in the `#right` slot, "Already exist") | reuse the same markup in `EditAccountPopup.vue` |
| Edit-form "own row" rule | `EditFpcPopup.vue:38-43, 80-97` (skips its own row by id; warning and Save gate apply only to a changed name) | adapt: Edit account skips the edited account by address, as the #256 record words it (D4); an own-name exception is OA-1 |
| Generation fence | `SRC/composables/runFence.ts` `createRunFence()` (`begin()` returns `isCurrent`) | reuse inside the new composable |
| Re-read on reconnect | `settings/index.vue:44-78` (hub) and `settings/lock.vue:38-40, 127-155` (Lock): connection count, read generation, per-read update fence | adapt: lift into one composable (D2) |
| Composable with a connected client | `useIncomingTransfers.ts:162-181` (idempotent `dispose`, handlers removed), `usePrestoCheck.ts` (parent owns the connection) | match the convention |
| Measuring a log entry | `logs-format.ts:80` `logsDocument` (`formatSingleLog(log) + "\n"` per entry) | reuse its line shape in a new pure helper (D3) |
| Pinning a fuzz counterexample | fast-check's `examples` parameter of `fc.assert` (fast-check 4.9.0, `node_modules/.bun/fast-check@4.9.0`) | reuse; no new tooling |
| Worker-restart e2e | `tests/e2e/sw-resilience.test.ts:183-206` (Lock opened while the worker boots, Chrome only) | adapt into a table over four pages |

Absence trail: no shared "blank name" helper (searched `isBlank|isEmpty.*Name|trim().length|replace(/\\s/g` in `SRC`); no other CodeMirror document kept in sync with a capped list (searched `doc.line|state.doc|EditorView|changes:`); no shared fake config client (each test defines its own: `settings/index.test.ts:38-66`, `lock.test.ts`, `privacy.test.ts`, `developer/index.test.ts`); no `display.test.ts`.

## Findings per issue

### #256 Edit account

- Holds. `EditAccountPopup.vue:25` has no `validate`; `:38` blocks only an empty name; `:59` saves the raw input. `app.store.ts:408-418` passes the name through; the service method is `changeAccountName` → `patchAccountField` (`account/service.ts:399-430`), not `updateAccount` as the issue says.
- Duplicates can exist without this bug: account import refuses only a blank name and has no duplicate check (`settings/accounts/import.vue:99, 280`). `"Imported account"` (`account/service.ts:573`) is only the service's fallback.
- `isStartedEditing` (`EditAccountPopup.vue:32`) is never read.
- Tests: `EditAccountPopup.test.ts` has two cases and one account in its fixture; its `Input` stub renders `data-testid="stub-name-field"`.

### #257 New account

- Holds as written: `NewAccountPopup.vue:32-36`, `:49`, `:71`.

### #258 Logs viewer

- Holds: after the splice at `LogsViewer.vue:56-58`, `filteredLogs.length` can never exceed the bound checked at `:64`.
- Two more defects in the same branch: the append at `:70-72` uses `doc.length` read before the trim dispatch, so a trim would put the next line at the wrong offset; and the trim sits after the early return at `:60`, so a filtered-out log never trims.
- The issue's suggested fix (trim by `doc.lines`) cuts entries: a plain-string log argument keeps its newlines (`formatArg`, `logs-format.ts:28-54`), and `logs-decoration.ts:5` already splits entries that span lines.
- The document is not always `logsDocument(filteredLogs)`: the first document is built from the unfiltered list (`LogsViewer.vue:225`), and `LOG_SOURCES` (`useLogFilters.ts:5-31`) lacks several service names (`price`, `incoming-transfer`, `operation-journal`, `legal-acceptance`, `imported-account-keys`, by `*_SERVICE_NAME`). Logs from those sources show in the first document and leave it at the first rebuild. Not part of #258; an issue at delivery (Inference: those services log under their service name; the implementer confirms).
- `chain-endpoints` arc 2b plans shadow-root changes in `LogsViewer.vue`'s `onMounted` and in `LogsViewer.test.ts`'s stubs; it rebases onto this lane.

### #259 Balances store fuzz

- Reproduced at af4afcc: `NULO_FUZZ_SEED=-2034686224` fails after 10 tests; `NULO_FUZZ_TRACE` writes only digests, so the planner replayed the shrunk tape with a scratch trace.
- Trace (key `p1/0xa1`, every subscriber retry- and txRefresh-capable): step 7, the ensure's gas read fails → `degraded`, debt set, recovery owed; step 11, the 5 s backoff fires a retry read; step 28, that read succeeds → `ready`, debt cleared, `retryVersion` 1 (the owed recovery happened); step 30, a settled transaction starts a forced read; step 34, it fails → `degraded`, no debt. The drain issues nothing for the key, and C1 reads `degraded`.
- The store follows its documented rule: a tx-refresh failure creates no retry debt (`balances.store.ts:193-194`), pinned by `balances.store.test.ts:387`. The forced read belongs to `GasBalanceCard` (`retry: false`, `txRefresh: true`, `GasBalanceCard.vue:23`); `FeeSettingsCard` (`retry: true`) copies a snapshot and wakes only on `retryVersion` (`FeeSettingsCard.vue:716-726`). The two can share a key in one document (plan I1): there the fee card picks up a debt-free forced failure on its next FPC recovery. An issue at close-out, separate from the oracle.
- The oracle is wrong: `expectGasRecovery` (`balances.store.fuzz.test.ts:184, 353-355`) keeps the key after the owed recovery commits, and C1 (`:452-460`) then reads a later, debt-free degradation as a missed recovery.
- Feasibility: a scratch copy whose C1 requires a retry-path success after the owe (`retryVersion` above its value at the owe, debt cleared) passed the shrunk tape and 3,000 random runs.

### #268 Settings pages

- Holds in substance. `display.vue` and `privacy.vue` read in `onMounted`, `developer/index.vue` in `onBeforeMount` (the issue says all three use `onBeforeMount`). None catches the read or handles `onConnected`.
- `ConfigServiceClient` (`packages/extension-messaging/src/background/client.ts:50-99`): the port opens lazily on the first request and fires `onConnected` there; a dropped port rejects every pending request, then reconnects and fires `onConnected` again; nothing replays missed `onUpdate` events; a manual `disconnect()` does not reconnect.
- The Lock page fix (`8c3c671`) is already on `dev`; the hub has the same mechanism. With three more pages that makes five copies.
- Loaded-state test ids exist: `theme-trigger` (Display), `fiat-values-toggle` (Privacy), `settings-toggle-developerMode` (Developer).
- `privacy.test.ts` and `developer/index.test.ts` fake the client without `onConnected`; they change with the pages.

## Collisions

- `forms-and-contacts` arc 2 (running): held-read pins in NewFpc, EditFpc, SelectProfile and Send tests, `tests/helpers/held-read.ts`, `utils/entity-list.ts`. No file overlap with this plan; this plan edits neither helper.
- `forms-and-contacts` arc 3 (not started) edits `settings/lock.vue` for #151; it rebases onto this lane.
- `chain-endpoints` arc 2b (held on page 12): `LogsViewer.vue` `onMounted` and `LogsViewer.test.ts` stubs (R3); it rebases onto this lane.
- `e2e-harness-gaps` arc 3 (running): playground and network tests; no overlap.
- `tokens-and-balances` arc 1 (#271, draft): `token/service.ts`, `useTokenBalanceSnapshot`; no overlap. It is why #262 has no arc here.
- Open issues: no other issue names these files (searched `logs viewer`, `LOG_SOURCES`, `balances store`, `settings reconnect`, `account name`, `Edit account`, `worker restarts`).
