# Vue shell composites

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Four extractions from a duplication adjudication: `apps/extension/src/components/composite/CollapsingHeroLayout.vue`, `apps/extension/src/components/composite/ListStatusMessage.vue`, `apps/extension/src/popup/components/modules/settings/contacts/ContactFormFields.vue` with `apps/extension/src/components/composite/ProcessingErrorNote.vue`, and a per-format split in `scripts/dup-trend/report.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Assess the duplication scan clone family by family, extract only what survives an independent two-position review, and record the rest as deliberately left. Extract four things in one behaviour-preserving change, test ids verbatim:

1. Move `import.vue`, `profile/new.vue`, `settings/security/change-password.vue` and `settings/security/reset.vue` onto the existing collapsing-hero composite, generalised as needed.
2. A new composite for the repeated empty and no-results presentation, migrating only sites whose rendered contract matches.
3. A shared contact form-fields component for the two contact popups (template only; scripts stay per popup).
4. Make the duplication report show a production per-format split and keep html-format clones out of its actionable ranking.

Deliberately left: whole-page template shells, the dApp approval windows, bridge and fuel forms and wallet panels of an app no longer in this repository, and the remaining two-site stylesheet pairs of 39 to 47 lines.

## Why

The headline html clones are tokenizer noise. jscpd's html format counts two Vue pages that share only component vocabulary as one whole-template clone, with wildly unequal spans (a 247-line match against a 41-line region), so no contiguous region exists to extract and a page-shell abstraction would churn every page and its test ids for almost no real dedup.

The real duplication is equal-span and byte-level: four auth and seed pages hand-rolled the exact pattern the collapsing-hero composite already owned (scroll listener, collapsing-label header, one stylesheet block), and the two contact popups shared a 65-line template body that differed only in attribute order.

The approval-window layout and a wallet-panel merge in that other app were proposed, then dropped on measurement. Direct template diffs showed 0.33 to 0.39 similarity for the approval windows, whose largest shared block is the already-shared status strip and identity block. The wallet panels diverge in test ids and states, so a merged component's configuration surface would roughly equal the duplication removed.

## What shipped

- **Collapsing hero.** The secret-export layout was renamed `CollapsingHeroLayout`, gained a destructive tone, a bare overlay slot after the bottom bar and a tested root-attribute fallthrough contract. The four pages dropped their hand-rolled scaffold and kept their page-specific sections, test ids and root `data-*` markers.
- **`ListStatusMessage`.** An `empty` variant and a `no-results` variant, with the test id forwarded and omitted from the DOM when unset. Six exact-contract sites migrated (settings tokens and contacts; account-state authwits, notes, contracts, senders). Five files that share only headline typography were not migrated, so the component API never grew to force a site in.
- **Contact popups.** `ContactFormFields` and `ProcessingErrorNote` are separate because the error note sits in a different popup slot than the fields. Both popups' scripts and suites were untouched.
- **Reporter.** `scripts/dup-trend/report.ts` prints the production per-format totals and counts html clones in every total but excludes them from the top-pairs table; the raw headline is unchanged for trend continuity.
- Duplication stays watched, not gated.
