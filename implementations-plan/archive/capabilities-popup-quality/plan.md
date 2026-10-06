# Capabilities popup quality

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: One capability metadata source (`apps/extension/src/wallet/services/dapp-session/capability-meta.ts`), a decoded and sanitized scope view (`apps/extension/src/components/composite/capabilities/CapabilityDetailPanel.vue`, `apps/extension/src/components/ScopeAddress.vue`, `apps/extension/src/components/ScopeClassId.vue`) on the connected-apps settings page, and the approval window's unknown-permission handling (`apps/extension/src/popup/windows/capabilities/build-items.ts`).
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Make the capabilities approval popup and the connected-apps settings page say only what the protocol does, look like the rest of the popup family, and decode what a dApp asks for. Three parts:

1. **Honest copy** from a single `getCapabilityInfo` source (label, short label, description, risk) read by the connected-apps settings pages and the approval window's recognition check, replacing three duplicated label maps.
2. **Monochrome visuals**: mono glyphs and uppercase tokens in place of red, yellow and green risk text and check circles, keeping one targeted accent on the warning states.
3. **Decoded scope with the raw value kept**: contract addresses, class ids and method selectors are shown raw, with a friendly label or a contact name only as an annotation.

An unrecognized capability type renders as a fixed, sanitized "Unknown permission" card that starts switched off, so approving it takes a deliberate click.

## Why

The first draft misread the protocol in ways a user would have relied on, so every claim was re-grounded against the dispatcher, the scope enforcement and the interaction service:

- The default confirmation level is transactions, so a send always opens the execute popup, even with an embedded fee payer, while authwit creation, simulations, contract registration and address-book reads are silent. The copy therefore says a dApp may request sends within a scope and each one still needs approval, not that it submits on the user's behalf.
- The accounts capability also covers token registration, and the data capability covers sender registration. The copy says so.
- The humanizing function is many-to-one lossy (several transfer variants collapse to one label), so the raw method id stays visible.
- The shared address component prefers contact-book names and writes nothing to the clipboard. Inside a permission request, a name pulled from the user's own book can mislead, so scope addresses render raw with the name as an annotation.
- Class ids are not addresses and never go through address lookup.
- The dispatcher does not reject unknown capability types and approved unknown grants are persisted, so the safe default is off.

## What shipped

- **Metadata extraction.** Moving the capability metadata into the wallet service layer let both the settings page and the window import it without breaking the layer import rule.
- **Sanitizing.** Every wire-controlled string (selectors, addresses, class ids, unknown type names, contact annotations) goes through one helper that clamps length and strips bidirectional-control and non-printable code points.
- **Components.** `ScopeAddress` shows the trimmed raw address with an optional contact annotation and copy on click; `ScopeClassId` does no contact lookup, and its test asserts that.
- **Popup behaviour.** In the approval window's row builder, unknown capabilities are collected into one unselected row and recognized ones start selected, covered by a test on the build-items path. The window's layout has been reworked since, so its rows no longer render through the scope components above.
- **Settings.** The connected-apps page adopted the same terminology and label source, including the header rename.
- **Gates.** Component and unit suites, the smoke e2e, and the network e2e files for capability requests, authwit variants and send-transaction variants.
