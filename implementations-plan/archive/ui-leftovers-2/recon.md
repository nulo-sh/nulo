# ui-leftovers-2: recon

Read at `2c0df3b9` (`origin/dev` at spawn). One Explore sweep (Sonnet) plus the parent's own reads; every claim below was checked against the tree. Paths are under `apps/extension/` unless they start with `packages/`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| "dApp" fallback for a nameless dApp | `DAPP_LABEL` (`src/utils/tx-enrichment.ts:127`); `journalCardOriginLabel` (`src/utils/journal-state.ts:442-445`: `null` for every kind but `dapp_execute`, else `sanitizeJournalSubtitle(op.subtitle) ?? DAPP_LABEL`) | reuse as-is |
| Terminal row's app chip | `dappCardFields` (`journal-state.ts:413-423`) sets `originLabel: sanitizeJournalSubtitle(op.subtitle)`; `TransactionTerminalCard.vue:59-62` renders what it is given | adapt: one line, call `journalCardOriginLabel` |
| Journal details' App row | `originChip` (`src/popup/pages/journal/[id].vue:119-122`) is `sanitizeJournalSubtitle(...)`, gated to `dapp_execute`; the row (`:298-301`) shows only when it is set | adapt: call `journalCardOriginLabel` |
| "Waiting for the first price answer" | inline only: `awaitingQuotes` (`src/popup/components/modules/general/BalanceView.vue:183-185`) = fiat on, `!prices.settled`, some `isPriceableHolding` row | adapt: move into `src/utils/token-aggregate.ts` beside `isPriceableHolding` and `pricesUnavailable`, both pages call it |
| Skeleton | `Skeleton` (`packages/design/src/ui/Skeleton.vue`): `width`/`height` props, root `<span aria-hidden="true">`, inline-block; resolved without an import (`scripts/design-resolver.ts:28`). Home's hero: 150×40, `.hero_skeleton { vertical-align: middle }` "so the section does not move when the number lands", `aria-busy` on its parent | reuse as-is |
| A pending price answer in a real browser | `interceptRpc(browser, extensionId, "https://api.coingecko.com", mode)` (`tests/e2e/fixtures/browser/index.ts:42`, modes `refuse` and `redirect`), used by `network/hero-prices-unavailable.test.ts:27` | reuse for scratch screenshots (redirect to a run-owned stub that holds requests until the spec releases a valid quote) |

No new helper beyond the moved predicate. Search trail for "no other price-wait predicate": `settled|awaitingQuotes|isPriceableHolding|pricesUnavailable|HERO_PENDING` over `apps/extension/src` and `packages`.

## Claims checked

- **Origin-name renderers.** In flight: `RecentActivityView.vue:879` (fallback, since #628). Settled row and tx page: `getOriginLabel` (fallback). Terminal row and journal details: no fallback (the two #675 sites). The orphan "executing" card's `executingOriginLabel` (`RecentActivityView.vue:199-207`) has none, but it is never a dApp's: `isExecutingTask` admits a UI transfer only (`:648-658`). The sweep's "third gap" does not hold.
- **The drawing for #675** (`p39-nameless-a`): the cancelled and failed rows show the DAPP chip as the in-flight one does; the details page shows "App · dApp" after "What happened", before "Method". The template's row order already matches.
- **How long `settled` stays false** (`src/composables/usePrices.ts:69-96`). It turns true on the first `refreshIfStale` answer, its rejection, or any `onQuotesUpdated` broadcast.
  - The provider fetch, body included, aborts at 10 s (`src/wallet/services/price/service.ts:357`); a failure resolves through `recordFailure`.
  - Concurrent callers share one in-flight refresh (`service.ts:322-333`), and a backoff window answers at once.
  - A dropped port that said Ready rejects every pending call (`packages/extension-messaging/src/background/client.ts:140`), so `settled` turns true.
  - A port still `Connecting` keeps its waiters (`client.ts:132-136`), and the client sets no `requestTimeoutMs`, so a worker that restarts while the page is open can hold the call to the 60 s RPC deadline. Storage reads also sit before and after the fetch (`service.ts:147-160`). The 10 s is the fetch's abort; the call's bound is the 60 s deadline, readiness and storage reads included (corrected after the Codex audit).
- **Holdings while its list loads.** The summary renders whenever the session is unlocked (`src/popup/pages/holdings.vue:195`), not gated on `isLoading` (`src/composables/useEntityCrud.ts:75`, true until the first fetch settles). Until the rows answer it reads "$0.00" and "0 tokens". The same holds after a scope switch (`refresh({ clear: true })`, `holdings.vue:159`). This state is outside page 39's pick: OWNER-ASKS OA-1.
- **The drawing for #676** (`p39-holdings-b`, measured on the 2× PNG): a 96×26 px skeleton at the summary's left, "2 tokens" alone on the right. The drawn summary line is 9 px shorter than today's, because the drawing drops the figure's line box (the search field's top moves from 139 to 130 px). Home's skeleton keeps that box: OWNER-ASKS OA-2.

## Tests that change

- `src/utils/journal-state.test.ts:286-298`: a nameless terminal row's `originLabel` is `null` today; it becomes "dApp". `:267` (named) and `:309` (schemeful) stay as controls.
- `src/popup/pages/journal/[id].test.ts:204-216`: only the named case today.
- `src/popup/pages/holdings.test.ts:211-219`: "before the first answer the summary reads as it did" pins today's "$0.00" and "1 tokens". It is rewritten to the skeleton. The pending answer is `answerQuotes = () => new Promise(() => {})`.
- `src/popup/components/modules/general/BalanceView.test.ts:385-600`: the hero's price-wait cases (rejection, the empty and unpriced wallet never waiting, the 12 s cap) stay green unchanged when the predicate moves.
- `tests/e2e/rows.test.ts:773,949`: the nameless terminal row's chip is asserted `null`; it becomes a short whole chip beside the title. No e2e reads `holdings-summary` (grep over `tests/`).

## Collisions

- Open PRs #702, #706, #707 and #708 touch none of the files above (`gh pr diff --name-only`).
- The leads named in the lane brief (call-vocabulary-1, fees-display-1, onboarding-3) may touch `journal/[id].vue` (fee rows) or Home. Merge `origin/dev` before the PR and retake the shots.

## Known limits in the area

#674 (a dApp named only whitespace shows a blank chip, in flight and settled). With #675 the terminal row and the details' App row read the same helper, so the limit extends to them unchanged. #645 (a dApp transfer's chips at ten-digit amounts) is unrelated to these rows.
