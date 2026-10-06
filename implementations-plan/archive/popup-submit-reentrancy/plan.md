# Popup submit re-entrancy

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The async submit popups under `apps/extension/src/popup/components/popups/` and the capabilities approval window (`apps/extension/src/popup/windows/capabilities/index.vue`) hold a latch for the whole handler and disable their control on it; the pins live beside each popup and in `apps/extension/src/popup/windows/capabilities/reentrancy.test.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Every async submit handler checks a latch that lasts the handler's whole life, and every control that fires it disables on the same latch. Each popup folds the latch into its validity computed (available and not in flight), and that one value feeds both the handler's early return and the button's `disabled`. Where the existing wiring broke one half, it was repaired: a button that did not read the computed, a latch that ended before the handler did, a latch that never cleared on rejection, or no latch at all.

## Why

Enter and keyboard-focused activation call a submit handler directly, and the button's loading style only blocks the mouse, so a held Enter key could fire a handler many times. The result was duplicate contacts, senders, endpoints and networks, renames racing their own re-checks, duplicate same-named accounts (the worst case), and a double approval in the dApp capabilities window, the most security-adjacent site. The plan's first reading was too narrow: a fold alone would have locked two popups out after one rejected submit and reopened a third in the middle of its work, and the capabilities window and the authwit revoke popup were also open.

## What shipped

- **Plain folds.** The popups that add or edit contacts, FPCs, endpoints, profiles and senders fold the latch into the availability computed. The sender popup's button now reads that computed.
- **Lifetime repairs.** The network popup's latch spans the whole handler. The account and network edit popups clear theirs in a `finally`, so a rejection cannot lock them.
- **Missing latch.** The new-account popup gained one, closing the duplicate-account race.
- **Authwit and approval surfaces.** The revoke and change handlers self-guard on their loading flag and release it themselves. The capabilities window disables confirm while loading and drops a second approve, so the interaction resolves once.
- **Visual.** While loading, the design package's `Button` keeps a bright, spinner-bearing look (opacity 0.8) instead of the dim of an invalid form; the native `disabled` and `tabindex` behavior is unchanged.
- **Pins.** Each repair has a hung-promise re-press test and a rejection-then-retry case. The capabilities double-approve pin is an additive file, after an early draft overwrote the existing suite and had to be restored.
- **Left alone.** Popups with their own specialized latches (token creation, confirm with passkey, profile selection, incoming trust) and the unlatched click actions outside the submit family (account row selection, verification confirm) were not normalized and are not claimed.
