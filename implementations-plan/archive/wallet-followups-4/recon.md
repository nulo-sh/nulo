# Recon: wallet-followups-4 (#299)

Read against `origin/dev` at 27af8d7. One Explore agent (sonnet) plus the planner's own reads. Every `file:line` below is at that commit.

## Reuse map

| Capability needed | Existing code found | Verdict |
|---|---|---|
| Redact an error at a log call | `trim` projects any `[object Error]` or `[object DOMException]` to `{ name, message }`, the message URL-scrubbed and capped at 200 characters, the stack dropped (`apps/extension/src/wallet/logger/utils.ts:157,174-180,201`). `documentLogger` trims before its RPC (`wallet/services/logger/client.ts:51`), so popup, onboarding and offscreen lines are projected before they leave the page. | reuse as is |
| The target shape at a log call | `{ error }` / `{ error: x }` at 17+ sites: the five #295 lines (`account-integrity/coordinator.ts:83,176`, `account/service.ts:171,652,657`), `FeeSettingsCard.vue:402`, `popup/app.vue:370`, `popup/pages/send.vue:115`, `popup/windows/execute/index.vue:421,442`, `aztec-runtime/src/pxe/chain-runtime.ts:245`. | reuse the convention |
| A guard against a flattener at a log call | `log-payload-ban.test.ts`: `EXTRA_NAMES` (line 60) bans `getErrorMessage` and `errorMessageFromUnknown` by name; any occurrence of a denied name that is not an object key is a hazard (`hazards`, line 412). | adapt: add `getErrorData`; add a member-read rule for `.message` / `.stack` (decision D4) |
| A pin on a log line | Real `LoggerStore` plus `loggedAfter(logger, message)` (`apps/extension/tests/helpers/logged.ts`), used by `coordinator.test.ts:177-190`, `account/service.test.ts:506-508`, `account/runtime-mismatch.test.ts:84,92-94`. Console-spy form: `FeeSettingsCard.test.ts:661-682`. Mocked-logger form: `console-forwarding.test.ts:42-56`. | reuse; each test keeps the form its file already uses |
| A shared unhandled-rejection logger | None. Three handlers (`offscreen/index.ts:40`, `wallet/index.ts:70`, `wallet/logger/console-forwarding.ts:17`) each classify their own expected rejections differently. Searched `onunhandledrejection`, `unhandledrejection`, `PromiseRejectionEvent` over `apps/extension/src` and `packages/*/src`. | none built: the change is one argument per handler (D1) |

## The 16 listed sites: every claim holds

All 13 `getErrorData` sites and all 3 direct extractions sit at the issue's line numbers on 27af8d7. Every `getErrorData` call in the repository is one of the 13 log sites; its only other reference is `console-forwarding.test.ts:3,54,55`, which asserts it as an argument. `errors.test.ts` does not test it. It is re-exported by `packages/wallet-core/src/utils/index.ts:6`; no published npm entry (`scripts/publish/packages.ts`) reaches it.

## Whole-tree audit (beyond the listed lines)

Method: a balanced-paren window from every opener the scanner's `LOG_CALL` matches, over `git ls-files` of `apps/extension/src` and `packages/*/src` (no tests, no `.d.ts`), flagging `.message`, `.stack`, `instanceof Error ?`, `String(err…)`, `${err…}`, `.toString()`, `JSON.stringify(err…)` and the three flattener names; a second pass for identifiers bound from a flattener and then logged. About 190 sites pass a raw error positionally: `trim` projects those, so they are not this defect.

| Site | Level | Spelling | Verdict |
|---|---|---|---|
| the 13 `getErrorData` sites of #299 | error (2 of them debug or error) | `getErrorData(x)` | fix (arc 1) |
| `popup/pages/settings/security/export/account.vue:192` | error | `err?.message \|\| err` | fix (listed) |
| `popup/pages/settings/security/export/full.vue:413` | error | `err.message \|\| err` | fix (listed) |
| `utils/files.ts:181` | warn | `err instanceof Error ? err.message : err` | fix (listed) |
| `composables/full-backup-restore.ts:761`, `:769` | error | `(err as Error)?.message \|\| err`, the only argument | fix (not listed) |
| `composables/useFullBackupImport.ts:458`, `:509` | error | `(err as Error)?.message \|\| err` | fix (not listed) |
| `popup/components/modules/settings/contacts/useContactImportExport.ts:130` | error | `(err as Error)?.message \|\| err` | fix (not listed) |
| `wallet/services/note/service.ts:131-132` | error | `const message = getErrorMessage(error)`, then logged | fix (D2; `message` stays for `renderError`) |
| `aztec-runtime/src/pxe/service.ts:1003-1006` | error | `const message = errorMessageFromUnknown(err)`, then logged | fix (D2; `message` stays for the `includes` test) |
| `wallet/services/token-balance/balance-projector.ts:156-160` | error | `` `Failed to sync chunk: ${errorMessage}` `` | fix (D2; `errorMessage` stays in the returned row) |
| `popup/windows/execute/index.vue:384-386` | warn | `` `…: ${msg}` `` from `getErrorMessage` | fix (D2; `msg` stays for `refs.errors`) |
| `popup/pages/settings/advanced/account-state/notes/index.vue:81-82` | warn | `message` from `errorMessageFromUnknown`, then logged | fix (D2; `message` stays for `renderError`) |
| `aztec-runtime/src/pxe/opfs-store.ts:216-220` | warn | `{ detail: mismatch }`, where `mismatch` embeds the JSON parse error of the PXE's own version stamp | leave (plan D11): the stamp's writer stores a schema version and a public rollup address (`:224`); the residual is recorded; the opener `log.warn(` is outside `LOG_CALL` (D7) |
| `wallet/runtime.ts:394`, `:433` | error, warn | `${migration.reason}` | fix with a fixed message and a category (plan D10): the reason can carry a `JSON.parse` excerpt of a malformed stored row (`wallet-core/src/migration/staging.ts:27-30`); it stays the recovery screen's text (`migrator.ts:77`) and the persisted status |
| `useContactImportExport.ts:194` | error | `err instanceof Error ? err.name : typeof err` | not a defect: a fixed category, on purpose (the message can quote the file) |
| `useProfileCreateFlow.ts:142`, `token/seeder.ts:210,505,603,627`, `wallet-core/src/storage/entity_storage.ts:127` | warn, debug, error | a fixed category or enum | not a defect |
| `extension-messaging/src/core/base-client.ts:248` | debug | `String(event)` | not a defect: a validated scalar, not a caught error |
| `e2e/csp-report.ts:102` | — | `err.message` returned to `sendResponse` | not a log call |

## Test reach (which existing test drives each failure path)

| Line | Existing test that drives the failure | Observes the arguments? |
|---|---|---|
| `offscreen/index.ts:51`, `wallet/index.ts:73,100,112` | none: no test imports either entry module | — |
| `console-forwarding.ts:21` | `console-forwarding.test.ts:42-56` | yes (mocked `documentLogger.log`) |
| `FeeSettingsCard.vue:705` | `FeeSettingsCard.test.ts:1014` (init throws) | no spy today |
| `FeeSettingsCard.vue:383`, `:731` | none drives the failure | — |
| `discover/index.vue:89` | `discover/index.test.ts:308,322`; `discover/index.lifecycle.test.ts:293` | no spy today |
| `discover/index.vue:115` | `discover/index.test.ts:289,433` | no spy today |
| `capabilities/index.vue:178` | `capabilities/index.test.ts:300` | no spy today |
| `capabilities/index.vue:333` | none (tests reject only with `JobCancelledError`) | — |
| `network-unavailable/index.vue:82` | none (the mocks never reject) | — |
| `export/account.vue:192` | none (no test mounts the page) | — |
| `export/full.vue:413` | none (`downloadFile` always resolves in `full.test.ts:125`) | — |
| `utils/files.ts:181` | `files.settle.pins.test.ts:78` (assertion at `:84`) | yes, but its `expect.anything()` accepts a string and an object alike |
| `wallet/runtime.ts:394`, `:433` | `runtime.blocked-persist.pins.test.ts`, `runtime.migration-gate.test.ts`, `runtime.test.ts` drive blocked and degraded outcomes | to check in Phase 2 |
| `balance-projector.ts:160` | `balance-projector.test.ts:210,222` | to check in Phase 2 |
| the other new sites | the implementer checks each in Phase 2 | — |

Unit tests run with `documentLogger` mocked silent (`apps/extension/tests/vitest.setup.ts:9-13`), so a popup line is observable only through a `console.*` spy.

## Consumers of the logged text

- Only `console-forwarding.test.ts:54-55` breaks; it asserts `getErrorData(...)` as an argument.
- The log viewer and its CSV export render each `data` element through `formatLogData` (`components/JsonViewer/logs-format.ts:58-65`; `logs-csv.ts:19`): a string as is, an object as JSON. No production code reads `data[0]`'s text.
- e2e: `journal.ts:333` matches balance-tick lines only; `readSwLogTrail` (`journal.ts:286`) regex-tests serialized data for diagnostics only; `fixtures/page-errors.ts` sees page errors, never these lines. Searched the five message strings repo-wide outside `implementations-plan/`: no other reader.

## Scanner blind spots found on the way

- `ALLOWLIST`'s `^apps/extension/src/wallet/logger/` skips `console-forwarding.ts`, one of the 16 lines. The only file there that must name denied identifiers is the redactor, `utils.ts`; `store.ts` and `index.ts` hold no log call, and `utils.ts`'s `console._debug(` and siblings do not match `LOG_CALL`.
- `LOG_CALL` does not match `log.warn(` (`aztec-runtime/src/pxe/opfs-store.ts:219`) or `logger?.error(` (`apps/extension/src/wallet/services/execution/claim-helper.ts:170`, already `{ error: err }`).

## Collisions

In-flight branches touch `pxe/service.ts` (account-session-life arc 2), `export/full.vue` (forms-and-contacts arc 2) and `full-backup-restore.ts` / `useFullBackupImport.ts` (backup-import-export); none edits a line this plan changes. Open PRs on `dev`: #293 and #271, neither touching these files.
