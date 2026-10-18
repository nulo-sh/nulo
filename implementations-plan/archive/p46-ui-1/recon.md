# p46-ui-1 — recon

Base: `origin/dev` at `9470d4e9`. One Sonnet Explore sweep plus direct reads. The four surfaces did not change between `18d29f23` (where decision page 46 drew its pictures) and `9470d4e9` (`git diff --stat` over the touched files is empty), so the page's `-a` pictures are valid "before" pictures.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Pending chip style | `.chip` in `apps/extension/src/components/composite/activity/activity-card.module.css` (label-section, secondary on surface-low, hairline border, `1px 4px`, no shrink, nowrap); the page drew this style | reuse: `composes: chip from` it |
| `pending` on the row the page gets | `Authwit.pending?` (`wallet/services/auth-registry/spec.ts:46`); `getAuthwits` returns whole stored rows; `decorateAuthwit` spreads them | reuse as is; add `pending?` to the helper's `RawAuthwit` type |
| Live clear of the chip | `reconcileAuthwits(…, "mined")` (`service.ts:292`) sets `pending: false` and emits **nothing**; the page listens to added/deleted only | adapt: add `onAuthwitUpdated` (`useEntityCrud` already takes `updated`) |
| Row title on an event-spliced row | `useEntityCrud` splices raw service rows; `decorateAuthwit` runs only in `fetch`, so an event row has no `kindName` (title falls back to "Custom Authwit", and `authwitMatchesSearch` throws on it) | adapt: decorate at render, not in `fetch` |
| Page-level test harness | `pages/settings/developer/account-state/senders/index.test.ts` (mocked client with real `EventHandler`s, testing pinia) | reuse its shape |
| Header chips | `Header.vue` `.network_chip` (`min-height: calc(1lh + 14px)`, padding `6px 10px`), `.lock_chip` (`height: 26px`), the 10 px compound rule; three `OVERRIDES` in `scripts/type-roles/exceptions.ts` | adapt |
| Manage accounts line | `settings/accounts/index.vue` description slot; `.desc_line:has(.addr_head)` 11 px rule + one `OVERRIDES` entry | adapt |
| Execute window full arguments | `CallArguments.vue` `.full .row > :first-child { flex-shrink: 0; max-width: 50% }`; `full` is passed only for the grant's arguments (`OperationCard.vue:280`) | adapt |
| Send token-mode line | `AmountCard.vue` meta row `Flex justify="between"`; token mode's `send-amount-fiat-label` has no nowrap; fiat mode has its own fit (`fitDerived`) | adapt, token mode only |
| Token row cap | `TokenCard.vue` `.fiat { max-width: 160px }`, `.fiat_figure` only on the priced figure | adapt `.fiat_figure` |

## Tests that pin the touched code

- `src/components/header-layout.test.ts`: pins `.network_chip` padding `6px 10px` and `min-height`; nothing on `.lock_chip`.
- `tests/e2e/appearance.test.ts:160-195`: the chip's height with the name on and off (not at 360 px, no cut check).
- `src/utils/type-role-ban.test.ts`: a removed `OVERRIDES` entry with its rule kept fails "no pick outside a role"; a removed rule with its entry kept fails "every carve-out and override still matches a pick". Both go together.
- `tests/e2e/fixtures/type-roles.ts` sweep: off-role values pass only through an `OVERRIDES` scope; no stale-scope check in e2e.
- `tests/e2e/account-import-export.test.ts:63-90`: at 360 px, badge/tail/line/wrapper not clipped; it reaches the line as `badge.parentElement`. `scripts/type-roles/identifier-sites.expected.json:761` pins `[data-testid="manage-accounts-row"] [data-testid="manage-accounts-address"]`.
- `src/popup/windows/execute/OperationCard.long-strings.test.ts:131-132`: pins `.row` gap and `.full .row > :first-child` exactly.
- `tests/e2e/network/type-roles-windows.test.ts`: the grant window state, `payloadPastCard`, `stretchPayload` (key is `:first-child`).
- `src/popup/components/modules/general/TokenCard.test.ts:362-370`: `.fiat_figure` declarations pinned with `toEqual`.
- `src/components/composite/send/AmountCard.test.ts`: fit logic and labels; nothing on the token-mode row's wrapping.
- `src/wallet/services/auth-registry/service.test.ts:58-106`: pending, mined, dropped reconcile.
- `src/popup/components/modules/settings/authwits/AuthwitCard.test.ts`: the row's accessible name is exactly "Call"; no `tabindex`, no nested buttons.
- `tests/e2e/helpers/authwit-seeds.ts:44` seeds rows `pending: false` for the type-role sweep only.

## The layout gate does not see these wraps

`expectLaidOut` (`tests/e2e/fixtures/type-roles.ts:510-527`) fails only on a horizontal overflow or a clip without an ellipsis. A wrap stays inside its box, and an ellipsis is recorded but passes. So a cut "TESTNET", a third line in the window, an orphaned "≈" and a three-line figure all pass it today. Each fix below therefore adds one measurement to an e2e test that already renders the state.

## Collisions

- `TokenCard.vue`: wallet-bugs-2 (#654) resizes the `.detail` glyphs in the same row.
- `Header.vue`: iface-line-1 works on the header's interface line.
- ui-dedupe-1 A7: a dedupe pass over popup components (files not named yet).
- No closed `known-limit` issue covers these surfaces (`gh issue list --state closed --label known-limit --search "authwit pending"`, `"13 px wrap"`: none).

## Search trail for absences

- Other "Pending" chips: `[Pp]ending` over `src/**/*.vue`: only `PrestoStatusCard.vue` (a dot) and `TransactionCard.vue:94` (a computed).
- An update event on the auth registry: `onAuthwit` over `wallet/services/auth-registry/`: added and deleted only.
- A page test for Authwits: `find src -path "*account-state*" -name "*.test.ts"`: only `senders/index.test.ts`.
- A "TESTNET" fit check: `TESTNET`, `network_label`, `header-lock` over `tests`, `scripts`, `src`: none.
