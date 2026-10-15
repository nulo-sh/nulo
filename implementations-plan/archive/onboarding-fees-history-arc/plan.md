# Onboarding, fees and history arc

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the shared primary-method helper `apps/extension/src/utils/primary-method.ts`, the onboarding fees step `apps/extension/src/onboarding/pages/fees.vue`, the journal detail page `apps/extension/src/popup/pages/journal/[id].vue`, and incoming receives in history through `apps/extension/src/wallet/services/incoming-transfer/service.ts` and `apps/extension/src/popup/components/popups/IncomingTrustPopup.vue`.
- **Open items**: the first-receive trust prompt shows the contract address (expand, copy) but no explorer link, since the old blocker, a payload with no network, is gone and the explorer URLs exist; a link is new UI, tracked in #97.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

One change in four risk-ascending commits, then two rounds of audit fixes folded into the same change.

1. **Transaction-card name**: every site that titled a journal record from its call list now picks the primary call through one helper that skips wallet-injected fee methods and applies the mint heuristic. This includes the activity planner and the awaiting-transaction destination in the app store.
2. **Onboarding fees step**: a new page between "Meet Aztec" and the accelerator step, with a Fees cell added to the step indicator (at the time Setup, Aztec, Fees, Speed, Done). The shared continue handler splits in two so Continue goes to fees and Skip goes to the accelerator.
3. **Journal detail page**: a route for cancelled and pending operations showing the error kind and a friendly subtitle. The raw message and normalized raw text show only with developer or debug mode on. The pending banner is dropped in favour of the existing pending icon and subtitle.
4. **Incoming receives in history**: a background incoming-transfer service and repository, fed by a single poll loop per network and account that reads raw notes. Records are keyed by the siloed nullifier and ordered by block, transaction and note index. Dedupe covers earlier records, the user's own outgoing hashes and in-flight journal hashes, with a late-delete path.

Each contract carries one persisted trust state (unknown, pending, trusted, blocked). The first note from a new contract is recorded hidden and raises one confirmation card, and Allow reveals the queued records. A visibility setting hides receives for users who restore the same seed on another device, while still recording them. Cleanup is wired into both chain purge and profile delete.

## Why

- The "first call" title was wrong whenever the wallet prepended a fee call, and seven separate sites repeated the same mistake.
- Showing only known tokens is not a defence against a look-alike contract. The user has to confirm one specific address the first time anything from it appears.
- A passive ticker that drains a queue never polls, so receive discovery needed its own trigger, and scanning on every tick rather than on a balance increase avoids missing receives netted against spends.
- The first audit pass of the finished change rejected it. Its criticals and highs were fixed in the same change, and the remaining trust-state concurrency work was split out rather than rushed.

## What shipped

- Audit fixes: the subtitle sanitizer applied on every card that shows an operation subtitle and widened beyond `://` schemes; the error kind restricted to a known set; the home widget connecting and loading incoming transfers on mount; the visibility setting also gating the pending prompt and its replay; account add and delete handled by the scanner; the trust popup showing the full contract address with expand and copy; a real queue for pending prompts instead of last-write-wins; and service-level tests for dedupe, late delete, trust transitions, visibility and cleanup.
- Later fixes: per-hash and per-account filtering of transaction events, a popup-manager visibility seed with unmount cleanup, an auto-allow for a token the user added themselves, a one-shot replay once its inputs are ready, a categorical label helper for the journal page, and rehydration scoped to identity.
- Copy on the fees step says fee juice and private fee juice are separate assets and that neither is transferable.
- Deferred from this change: replacing `setInterval` with alarms for background-worker resilience, a symbol-collision badge, and the full trust-state concurrency design.
