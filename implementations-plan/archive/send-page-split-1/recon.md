# send-page-split-1: recon

Base `origin/dev` at `6bab0009e`. Two read-only explorers (Sonnet) plus the planner's own reads. Line numbers are `apps/extension/src/popup/pages/send.vue` at the base unless a path is given.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Latest-run fence | `composables/runFence.ts` (`createRunFence`: `begin`, `invalidate`, `snapshot`) | reuse as is: it replaces the page's hand-rolled `tokenReadSeq` and `identityFetchSeq` counters with the same semantics |
| Balance rows, read latest-wins | `composables/useTokenBalanceSnapshot.ts`, already used by the page (`:183`) | reuse as is: the page keeps constructing it; the new data hook receives it |
| Contact list reducers | `utils/entity-list.ts` (`entityListReducers`) | reuse as is |
| One identity's tokens, contacts and journal, read together | none: `refetchIdentityScopedState` exists only in `send.vue` (`:934`). Searched `refetchIdentityScopedState`, `appStore.account?.address]`, `createReconnectRead`, `createRunFence`, the exports of `useScopedTokens`, `useIncomingTransfers`, `useEntityCrud`, `usePinnedTokens`, `useArrivals`, `useJournalMirror` | build new (`useSendData`): no hook combines the four reads behind one barrier |
| Single-slot fee estimate | `composables/useFeeEstimation.ts`, `utils/estimate-when-clear.ts` | reuse as is, wrapped by the new estimate hook |
| Queued answer, slow clock, failure snack | none outside `send.vue` (`:452-469`, `:776-791`). Searched `feeQueued`, `ESTIMATE_SLOW_MS`, `restartSlowClock`, `onEstimateStarted`, `estimateWhenClear` | build new (`useSendEstimate`). The execute window (`popup/windows/execute/index.vue`) runs a keyed estimate with its own queued state; it shares only the two reused modules, so nothing is duplicated |
| Fiat submit gate | `popup/pages/send-fiat-gate.ts` (pure; only consumer `send.vue` `:433`, `:688`) | adapt: `git mv` to `src/utils/` so a composable may import it |
| Popup stack slots | `composables/usePopupStack.ts`: `order` (undefined when closed), `depth` (`NaN` when closed); no `isOpened`, `open`, `close` | not a drop-in: see below |
| Send-only composable in `src/composables/` | `composables/useSendReview.ts` | the precedent for the homes |
| Popup-layer composable colocated with its consumer | `popup/components/modules/settings/contacts/useContactImportExport.ts`, `components/JsonViewer/useLogFilters.ts` | the alternative home, not taken |

## Layer rules and budgets

- `biome.json` overrides ban `@/popup`, `@/popup/**`, `**/popup`, `**/popup/**` in production files of `src/composables/**`, `src/utils/**`, `src/stores/**`, `src/components/**`. The rule's message: "move shared code down, pure policy to @/utils, the rest to its lowest consumer's folder". Nothing bans a `src/popup/pages/*.ts` import.
- `recent-sends.ts` sits under `popup/components/modules/send/` and is imported only by `send.vue`; no new hook needs it. `components/composite/send/send-sides.ts` imports only `@/utils/*`.
- Complexity (Biome 2.5.13, `error`): cognitive complexity 15, 80 lines per function, blank lines and comments not counted. Measured on scratch copies outside the repo: a nested function pays one extra nesting level on every structural increment (8 flat `if`s in an inner function score 16), and the outer function's line count includes its nested functions' lines. `refetchIdentityScopedState` scores 14 at module level today; moved inside a hook it scores 19.
- `vite.config.ts` auto-imports `src/composables/`, `src/stores/`, `src/utils/`, `src/onboarding/composables/`; `src/types/auto-imports.d.ts` and `.eslintrc-auto-import.json` are tracked and regenerate on a build.

## The mount suites

- Both suites mock every client by module path (`execution`, `token`, `token-balance`, `contact`, `operation-journal`, `price`, `transaction`, `fpc` in the integration suite), plus `@/utils/core`, `@/composables/toast.js`, `vue-router`. No mock targets a page-local module, so code moving to a new file stays mocked.
- Page internals reached: `w.vm.tokens` (`send.test.ts:2186`) and `w.vm.contacts` (`:2292`, with array identity pinned at `:2296-2306`). The page must keep top-level bindings with those names.
- Client counts by `mock.results`: per-identity journal clients (`:714-733`), `.at(-1)` for price, contact, token and balance clients; price clients by index in the integration suite (`:939`). Construction order per class must not change.
- Unmount: the execution port stays open while a submit is pending (`:627`), closes once otherwise (`:639`); an unmount while the balance read is out ends the load with no token read or selection after it (`:1931`). `cancelEstimate` on unmount and the `preselectedBalanceType` reset are not asserted.
- Composable suites use `effectScope()` (`useFeeEstimation`, `useSendReview`) or a direct call with fake clients (`useTokenBalanceSnapshot`).

## E2E specs that open Send

- Smoke: `send-keyboard`, `send-fee-privacy`, `send-picker-add`, `token-list`, `rows`, `home-links`, `legal-acceptance`, `type-roles`.
- Network: `send-picker`, `transfers`, `send-amount-exact`, `send-amount-clamp`, `fee-methods`, `fee-shortfall-recheck`, `fee-sponsor-funding`, `fiat-send`, `snack-placement`, `send-chaos`, `legal-acceptance-wall`, `type-roles-windows`, `store-captures`, `stale-network-a10-capture`; `@requires-proverless`: `failed-send-check`, `same-token-concurrent-sends`. The helper `tests/e2e/fixtures/send-page.ts` pins the Send testids.

## Open work and collisions

- No open PR touches `send.vue`, its `send-*.ts` helpers or the composables it uses (checked 2026-11-24).
- Closed known limits on this page stay as they are, verbatim: #1969, #1836, #1537, #1418, #394.
- #513 (fee card modes) and #1470 (the side rule, now `send-sides.ts`) are closed; neither touched the page's controller.
