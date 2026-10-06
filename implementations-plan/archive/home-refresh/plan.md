# Home refresh

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the home-screen refresh in `apps/extension/src/popup/components/modules/general/TokenCard.vue`, `apps/extension/src/popup/components/modules/general/GasBalanceCard.vue` and `apps/extension/src/components/Header.vue`, the seeded endpoint label in `apps/extension/src/wallet/services/network/service.ts`, and the pointer cursor in `packages/design/src/base.css`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Implement the locked home-screen spec as a light, reversible change whose center of gravity is updating the tests correctly.

- Private and public values in token rows use small `lock` and `globe` icons, with value text lifted to the secondary color; the token page breakdown uses the same vocabulary. An unpriced row's subtitle shows the token's full name.
- Density goes compact: token row and activity card padding, the home section gap and the hero margins shrink.
- The home gas card shows two decimals, still truncating down.
- The two seeded hosted-RPC endpoints are labelled "dRPC"; Local Network keeps no label.
- The header account chip splits into an avatar button, a name button (both open the accounts popup) and an address button that copies the address with a toast. The `account-selector` test id moves to the name button so every existing switching flow keeps passing.
- The copy cursor becomes a pointer at every site.

## Why

The surface is cosmetic and covered by e2e that select by test id, so keeping each test id stable was the safe path. The address copy awaits the clipboard write before the success toast, so the toast can never claim a copy that failed, and the header test asserts the full active address is what gets written. The shared tooltip gained a focus trigger so a keyboard user can reach it.

## What shipped

- The lock and globe icons, name fallback subtitle, compact density, two-decimal gas, seeded endpoint label and header split, with pinned tests: the fractional gas cases, the seeded label, the copy helper, the header integration test and new accounts smoke tests.
- A one-line change to the design base stylesheet needed its pinned hash recomputed, which is the designed procedure for a deliberate edit.
- The refresh also added a threshold-gated "catching up" dot for the incoming-transfer scan. It is not in the tree today, so nothing here describes it as live behavior.
