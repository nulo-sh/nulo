# Fee-estimation init race in FeeSettingsCard

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The fee card derives its settings from resolved state instead of a racing watcher: `apps/extension/src/popup/components/modules/send/FeeSettingsCard.vue`, with its bug-pin tests in `apps/extension/src/popup/components/modules/send/FeeSettingsCard.test.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Replace the imperative watcher with a pure `computed` that derives fee settings only once initialisation has finished. Three responsibilities get three pieces of state: a display-only preview for the dropdown label while the wallet loads, the resolved selection used for derivation, and an init-complete gate that is reset at the start of every initialisation. Storage writes happen only at explicit user actions, never from a data-refresh handler. A saved selection is stored as a thin semantic key and resolved against freshly built fee methods, not restored as a whole snapshot. The first failing test pins the bug before any fix.

## Why

On first paint the card could push no fee settings at all to its parent, which silently disabled fee estimation on both the send page and the dApp approval window. The saved selection was assigned before the slow balance fetch so the dropdown would not flash "Select method". The selection watcher then fired synchronously against a zero balance, derived nothing for a fee-juice choice, and never re-ran when the real balance arrived; re-picking the same option unstuck it. Adding the balance as a watcher dependency would only paper over it: one state carried both what the label shows and what derivation uses, derivation was colocated with storage writes, deep watchers fanned out spurious saves, and clearing the selection left the parent holding the last valid settings after the card visibly cleared. That last one was a correctness bug beyond the init race.

## What shipped

- Settings derive from a `computed` gated on init completion, so the parent always sees the current resolved state, including after a balance or sponsor is deleted.
- A user pick made during the initial fetch survives to the end of initialisation, and storage is written only at user-intent boundaries.
- Choosing to override a dApp-supplied fee with the user's own method now triggers initialisation, so balances and sponsors load; it previously never did.
- Saved selections resolve against fresh methods, so a renamed or re-priced method cannot leave stale data behind.
- The test file opens with the failing bug pins for the race and covers the init contract, locked methods and the default-sponsor path.
