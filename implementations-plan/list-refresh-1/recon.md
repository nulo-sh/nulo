# list-refresh-1: recon

Base: `origin/dev` at `ff395c3d0`. Two read-only explorers (sonnet) plus the planner's own reads. Paths are under `apps/extension/src/` unless they name another root.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Popup → worker call | `Service` / `ServiceClient` from `@nulo/extension-messaging/background`; `defineRpcMethods` is compile-time exhaustive; ports only from trusted internal senders (`packages/extension-messaging/src/background/service.ts:47`). Smallest analogue: `wallet/services/legal/{spec,service,client}.ts` (`getStatus(): LegalStatus`). | adapt: `TokenListService` becomes a `Service` with one RPC |
| A token-list client | none. Searched `token-list/client`, `TokenListServiceClient`, `rpcMethods` in `wallet/services/token-list/`, `token/`, `price/`. `TokenService` and `PriceService` only read `getSnapshot()` and `onListChanged` in process. | build new: `wallet/services/token-list/client.ts` |
| Refresh trigger | `TokenListService.refresh()` (`wallet/services/token-list/service.ts:131-138`): single-flight, never rejects, resolves `void`; `doRefresh` computes `outcome` and only logs it. | adapt: resolve what the refresh did |
| Cadence rule | `nextAttemptAt` (`:60-63`), `DAY_MS`, `JITTER_MS`, `FAILURE_BACKOFF_MS` (`:21-25`), ceiling in `decodeTokenListState` (`:37-47`). | adapt |
| Pending / outcome UI | `SettingItem` click rows with `loading`, `icon`, `trailingIcon` (`components/ui/Settings/SettingItem.vue:55-70`; in-place rows on `popup/pages/settings/networks/[id].vue:263-270`); `Button` `loading` sets `aria-busy` and a spinner and does not disable (`packages/design/src/ui/Button.vue:117-130`); header icon refresh on `popup/pages/tokens/[id].vue:230-247`. No settings page shows a refresh outcome inline; `AsyncListStatus` is a list-fetch error state, not an action result. | reuse primitives; no new component |
| Page-local pure helper | `popup/pages/received/received-copy.ts`, `popup/pages/send-*.ts` | reuse the pattern: `popup/pages/settings/tokens/list-refresh.ts` |
| Served list in e2e | `tests/e2e/fixtures/token-list.ts` (`serveTokenList`, `signTestList`, `waitForStoredList`, `requestListRefresh`); scenario 1 of `tests/e2e/token-list.test.ts:100-151` | reuse: extend scenario 1 |
| Legal patch bump | `packages/legal/README.md` § Shipping a new version; `packages/legal/src/manifest.test.ts` holds document, archive and manifest together; `BEFORE-LAUNCH.md` § 4 carries one "Due at the release that publishes privacy 1.2.N" block per patch | reuse the procedure |

## Facts the plan rests on

- `TokenListService` is built in the service worker (`wallet/runtime.ts:555-556`) and is `implements IService`, not a `Service` (`service.ts:77`). Converting it moves `start` into `init` (`packages/extension-messaging/src/core/base-service.ts:61-67`), drops its own `logger` parameter property (the base declares `protected readonly logger`), and adds the framework `backup`/`restore` RPCs every `Service` has, whose defaults return `null` (`background/service.ts:133-140`).
- `service.composition.test.ts` already constructs `LegalAcceptanceService`, a `Service`, in the same node-environment harness, so a `Service` constructor runs there today.
- The page's only client is `TokenServiceClient`; `onBeforeUnmount` disconnects it (`popup/pages/settings/tokens/index.vue:70-72`). The page uses one toast, for a delete (`:58`).
- A person who taps "Not now" on the Terms sheet reaches Settings → Tokens with the Terms not current: the sheet is per-version dismissable (`utils/legal-sheet.ts:32-36`). `doRefresh` then requests nothing (`service.ts:183`).
- The failure ladder's last step is a day (`FAILURE_BACKOFF_MS[4] = DAY_MS`), the longest deadline the service writes once the success cadence is six hours.
- The golden `tokenList.full` stores `nextAttemptAt` 19 h after `GOLDEN_NOW` (`wallet/storage/stored-shapes/goldens.json:1473-1482`, `stored-shapes/baseline.ts:87`); R3 reads it through `decodeTokenListState` (`wallet/storage/stored-shapes.ts:242`).
- `tests/e2e/fixtures/token-list.ts:41` plants a held list's deadline 12 h ahead (`HELD_FOR_MS`) so the worker does not fetch it at boot.
- No test pins the ceiling (searched `decodeTokenListState`, `latest`, `nextAttemptAt` in every `*.test.ts`).
- Cadence statements: `legal/privacy.md:290`, `:306`, `:317`; `apps/extension/store/listing.md:56`, `:81` (which cites `wallet/services/token-list/service.ts:143-146`); `ARCHITECTURE.md:99`; `apps/extension/tests/e2e/README.md:65`; `tests/e2e/fixtures/egress-guard.ts:95`; `tests/e2e/fixtures/token-list.ts:155`; `service.ts:59`; the composition test names at `:226` and `:284`. None in `SECURITY.md`, `README.md`, `CLAUDE.md`, `infra/token-list/`, `packages/token-list/`, `apps/landing/`, `glossary.ts`.
- `apps/extension/scripts/store-listing.test.ts` requires a listing counterpart for every privacy § 6 row; it does not compare the row text.
- One e2e opens Settings → Tokens: `tests/e2e/settings-crud.test.ts:285` (`navigateToSettings(page, "tokens")`, then the import popup). The explorer's search for `settings/tokens` missed it (Opus R1).

## Issue claims checked (#1608 and the lane brief)

- Held: the cadence is compiled, the envelope carries no TTL, the request bypasses the HTTP cache (`privateFetchInit`), and the three triggers are boot, the alarm and acceptance.
- Held: a fresh install fetches on acceptance; a held install waits up to 26 h.
- **Did not hold**: "the stored-deadline ceiling and `decodeTokenListState` moved with it". A ceiling of six hours plus jitter would read the day-long backoff deadline as due, so during a host outage every worker boot would fetch (trace in plan.md D2), and the R3 golden at +19 h would read differently, a stored-read change.
- Partly held: Settings → Tokens "uses a toast for a like action". It toasts a delete, not a status check; no settings page reports a check's outcome by toast.

## Open work and closed limits in the area

- #1612 (open, price-feed-1) bumps privacy to 1.2.8 and edits `service.ts:265` and `spec.ts:14-19` (`priceFeeds` on the snapshot): a textual conflict only.
- #1611 (owner-decision) waits for the first list with price feeds; not touched.
- #1578 (closed known limit): a refresh whose state read fails schedules no next attempt. A manual refresh in that state returns `error`; the limit's disposition is unchanged.
- #386, #1610 (closed known limits): a host can withhold an update. The manual refresh does not change that; it can only ask sooner.
