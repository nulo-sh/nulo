# ui-leftovers-1: recon

Base `dev` 1b93cbfa. One Explore sweep (Sonnet, six capabilities) plus the planner's own reads and one browser probe. Paths are repo-relative.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Per-kind toast life | `packages/design/src/composables/toast.ts`: `SUCCESS_TOAST_MS = 2_000` (6 000 before #642), armed in `openToast` for `kind === "success"` only; `ToastOptions.action` already exists; hold/release in `holdToast` | adapt: the success timer reads the toast's own `action` |
| Success toasts with an action | `composables/useArrivals.ts:362` ("Received …", View), `popup/pages/send-submit.ts:87` ("Transaction submitted", View only when the hash is well formed) | reuse as is; no call site changes |
| "Prices unavailable" predicate | `BalanceView.vue:208-220` (`isPriceableHolding`, `pricesUnavailable`), inline; `utils/token-aggregate.ts` `aggregateFiat` (sum, `partial`) | adapt: move the two predicates into `token-aggregate.ts`; Home and Holdings call them |
| Holdings total and meta line | `popup/pages/holdings.vue:110-122,192-203` (`aggregateDisplay`, `summaryMeta`, the fit ruler); `usePrices` gives `settled`, `mapped`, `isPriced` | adapt |
| dApp fallback label | `utils/tx-enrichment.ts:131` `origin.name \|\| "dApp"` (settled row, tx details); `utils/journal-state.ts:127` `sanitizeJournalSubtitle` (null on empty); the in-flight site `journalCardOriginLabel` (`journal-state.ts:441`) | adapt: one exported constant, used in `journalCardOriginLabel` |
| Click that ends a selection | `utils/selection.ts` `selectedWithin`; pattern in `ScopeAddress.vue:58`, `ScopeClassId.vue:29` (span `role=button`, keys handled apart) | reuse as is |
| Token hero tap | `BalanceView.vue:63,74-79,165-178,301,304,419` | delete |

No helper outside `BalanceView.vue` says "every priceable holding lacks a price": searched `pricesUnavailable|isPriceableHolding|priceable` over `apps/extension/src` and `packages/`. No per-call toast duration exists: searched `SUCCESS_TOAST_MS|armTimer|duration` in `packages/design/src` and `openToast(` with `action:` over `apps/extension/src` (two hits, above). No `"dApp"` constant: searched `"dApp"` over `apps/extension/src` (`tx-enrichment.ts:131`, `execution/service.ts:1112` for a log field, test fixtures).

## Issue claims checked

- **#635** holds: `BalanceView.vue:301` binds the tap only with a token; `handleTokenBalanceClick` copies `totalTokenBalance` and toasts "Balance is copied". `totalTokenBalance` has no other reader; `showFullBalance` is set only by the click and widens `heroCandidates` after it. Both go with the tap; `amount.callers.test.ts` pins BalanceView at `[3, 0]` compact calls and becomes `[2, 0]`.
- **#639** holds, with one correction. The address is a native `<button>` (`Header.vue:193`) and `base.css:257-263` sets `user-select: none` on `button`. The issue's fix ("as `ScopeAddress.vue` does") cites a `span role=button`, not a native button, so it needed proof: a probe (Chrome 152 and Firefox 153, headless, Puppeteer) showed that a child with `user-select: text` inside a native button is drag-selectable, that the drag ends in a `click` on the button with the selection still set, and that a drag from text above runs into it. So `user-select: text` plus the `selectedWithin` guard is enough; the element stays a `<button>`. A native button turns Enter and Space into a `click` with `detail === 0`; the scope rows' convention (keys still copy) needs the guard to skip those.
- **#628** holds for the in-flight rows. `discoveryDappMetadata` (`wallet-sdk/background.ts:1241`) keeps a name that sanitizes to `""`; `sanitizeJournalSubtitle("")` is `null`; the settled `TransactionCard` uses `getOriginLabel`, which falls back to "dApp". One live in-flight render site: `TransactionAwaitingCard` via `journalCardOriginLabel`. The orphan card (`executingOriginLabel`) admits UI transfers only (`RecentActivityView.vue:493,648-658`; pinned by `RecentActivityView.test.ts:337`), so it never shows a dApp's call. Two more sites show the same blank: the terminal journal card (`dappCardFields`, `journal-state.ts:413`) and the journal details' App row (`journal/[id].vue:121`); neither is in the signed pick (OA-1). `queued-journal.ts:186` writes `?? "Unknown dapp"` only when the metadata has no name at all, which `discoveryDappMetadata` never produces.
- **#618** holds: `holdings.vue:110-111,122,193`; the meta line counts rows and appends "· priced assets only" on `partial`. Before the first price answer the page also reads `$0.00` (quotes are `{}`), a gap the issue does not name (OA-2).
- **#634** holds: `SUCCESS_TOAST_MS` went 6 000 → 2 000 in #642 for every success.

## Tests and e2e that pin today's behaviour

- `BalanceView.test.ts:752-775`: the token page's tap copies, and a drag skips it. Replaced.
- `ToastManagerBase.test.ts:443-496`: three hold tests open a success **with** a View action and expect the close 1 400 ms after release (2 000 − the 600 ms settle). Under the rule the remainder is 5 400.
- `journal-state.test.ts:285` (terminal, nameless: `originLabel` null) stays while OA-1 is open. `RecentActivityView.test.ts:988` (awaiting `{ kind: "dapp_execute" }` → `originLabel: null`) flips to "dApp".
- e2e: `rows.test.ts:828` asserts the nameless **terminal** row has no chip (stays while OA-1 is open); `navigation.test.ts:150` drags from the hero to the header name across the address; `snackbar.test.ts:330,374,411` time plain "Address is copied" snacks at 1.5 to 2.5 s (unchanged). No e2e clicks `balance-amount`, reads the Holdings total, or times an action toast to its close (`incoming-arrival` holds its snack by focus).

## Collisions

- testers-fixes-3 edits the activity rows (`TransactionAwaitingCard`, `TransactionTerminalCard`, `rows.test.ts`) and the journal details' App row (#629). This lane touches the rows' label helpers and one `rows.test.ts` line at most.
- type-scale-1 retunes roles (`meta`, the hero, the header). This lane adds no size, weight or role.
- #638 (other click-to-copy values) is a separate open issue; the header is not in its list.
