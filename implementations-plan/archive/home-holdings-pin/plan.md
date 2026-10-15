# Home, Holdings tab and Pin to Home

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: four tabs in the popup, a Holdings page in `apps/extension/src/popup/pages/holdings.vue` over `apps/extension/src/popup/components/modules/holdings/TokenList.vue`, shared token ordering in `apps/extension/src/utils/token-order.ts`, pins in `apps/extension/src/composables/usePinnedTokens.ts`, and the "Pin to Home" item in `apps/extension/src/popup/pages/tokens/[id].vue`.
- **Open items**: pasting a token address into the Holdings search to add it, tracked in #134. The search filters loaded rows only, and adding a token stays on Home's menu, the Send picker and Settings → Tokens.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Home never grows past three token rows. A new Holdings tab owns the full list, and the person picks which three Home shows.

- Four tabs: Home, Holdings, History, Settings. Home keeps its route name and URL, since many e2e files assert that hash and the manifest cold-opens it.
- Home shows up to three rows plus a "View all" link, ordered by one comparator shared with the Holdings page and the Send picker. Pinned tokens come first, then value.
- Holdings has a search, a value or name sort, an aggregate summary, and one fold that hides empty and under-dust tokens using the existing dust setting.
- "Pin to Home" and "Unpin from Home" live in the token page's menu, capped at three. A fourth pin opens a single-button informational popup naming the pinned tokens. There is no control or mark on rows.
- The balance-display popup is retired. The Home hero always shows the aggregate over the active chain.
- The Send picker keeps its rows, orders them like Home and gains a search field when more tokens exist than fit on Home.

## Why

Home listed every token alphabetically. With a real portfolio, value order was lost, the recent-transactions feed scrolled off screen, and every token picker grew linearly. A fixed small Home plus an explicit way to choose its rows fixes all three.

Pins are stored per profile and chain as lowercase contract addresses, not token ids, because ids are reallocated and an id could pin a successor token. Everything that renders rows filters by the active chain, since the balance query filters by account only and the service holds every chain's tokens for the profile. A malformed balance renders a dash rather than throwing, and long symbols are ellipsized so hostile metadata cannot push the balance off the row. Two extension contexts writing pins at the same instant are last-writer-wins, which was accepted.

## What shipped

- The pieces listed under Shipped, with the retired balance-display popup, its registration and its stored preference removed.
- Pin writes are serialized per key within a context, and each queued write drops itself if the scope changed before it ran. Deleting a token removes only its own pin.
- Review of the Send picker and hero found stale-result and reconnect bugs. A fetch for one account could install after a switch to another, a reconnect during a load was swallowed, and a search query outlived the box that applied it. Each got a scope fence or load generation and a test that resolves the fetches in the real transport's order.
- The balance-based tests use fixtures whose value order and name order differ, so a sort toggle cannot pass on coincidence.

## Lessons

### Popup mounts

`PopupManager` mounts every registry popup at start, locked or not, and never unmounts one. Setup work in a popup therefore runs while the wallet is locked unless it waits for `show` or the popup sits behind a `v-if`. The Send picker's price feed refreshed at mount while locked and so could reach the price provider, which is why the picker is rendered only while the wallet is logged in.
