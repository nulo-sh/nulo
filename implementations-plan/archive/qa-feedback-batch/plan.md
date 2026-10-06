# QA feedback batch

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the extension half of a friends-QA polish batch: the system theme default in `apps/extension/src/wallet/config/config.ts`, single-account auto-select in `apps/extension/src/popup/windows/capabilities/index.vue`, the gated debug panel on `apps/extension/src/popup/pages/tx/[id].vue`, and the empty-token import link in `apps/extension/src/popup/components/modules/general/TokensView.vue`. The faucet half belonged to the bridge app, which lives in the `alejoamiras/unleashed` repository.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Ship the feedback from alpha-testnet testers as one bundled, medium-tier PR across the faucet and the extension. Ten items, none architecturally complex.

- Faucet: drip buttons read "Get <token> (public)" and "(private)" with an explicit aria-label carrying the amount, the status row hides the previous result while a drip is in flight, success emphasis persists until the next drip, and the explorer contract link uses the instances path.
- Extension: the theme default changes from dark to system, the copy chip and any non-button click target get a pointer cursor, the capabilities popup preselects the account when exactly one is available, the transaction page's explorer link is brighter and the hash itself links out, the transaction debug panel shows only with debug or developer mode, and the empty token state links straight to the import popup.

## Why

Testers missed the success cue because it faded after a few seconds, and a stale "View tx" link next to an in-flight label pointed at the wrong transaction. The theme flip is a factory default only: existing users keep their stored setting, and the default's test is edited in the same commit. Auto-select adds no trust risk because the wallet alone decides which accounts are available, the single account is visibly checked, and approval still needs an explicit click. Gating the debug panel reduces exposure of raw transaction state. A global pointer rule on button roles was rejected because some components suppress it on purpose; each missing instance was fixed in place.

## What shipped

- The extension items listed in Decision, each in its own surface. Preselecting a single account keeps the existing toggle and the "select at least one account" guard, so approval stays an explicit act.
- Not done, by decision: a "confirmed versus submitted" split in the faucet (the send call already awaits mining, so the real gap was the short cue), and an explorer contract-URL builder in the extension.
