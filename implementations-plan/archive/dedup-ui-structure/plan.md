# Dedup of popup UI structure

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Dead popup style blocks are deleted, address trimming goes through one helper (`trimAddress` in `apps/extension/src/utils/string.ts`), and the dApp status strip is one shared component (`apps/extension/src/components/composite/IdentityStrip.vue`).
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Three structural cleanups in the extension UI with zero visual change, as one change from a dedup audit.

- Delete dead popup CSS: one identical block of `.network`, `.icons` and `.item` selectors copied across five popups, and isolated dead selectors in eight more files. Each selector was checked against its template for `$style` references before deletion.
- Route the hand-rolled address trimming through `trimAddress(address, start, end, separator)`, with the separator added as a parameter. Each site passes its current start, end and separator, so its rendered output does not change. The four-style separator inconsistency across sites is reported, not unified.
- Extract `IdentityStrip.vue`, a presentation-only composite (status dot, account, network, brand mark), and make the discover and capabilities strip, the signer identity strip and the verify window's inline copy thin callers that keep their own test ids.

## Why

- Zero visual change was the hard constraint, since the home screen's design is fixed. The helper's default separator differs from what most sites render, so a separator parameter was the only way to adopt it without altering output.
- The three strips rendered the same skeleton with class-for-class identical CSS, so one component with slots where they diverge removes the copies.
- The strip is the anti-phishing identity anchor in dApp windows, so the extraction must not change what any window displays. The component test, preserved test ids and an armed smoke run over the dApp windows pin that.

## What shipped

- The dead-selector deletions, each checked against its template before removal.
- `trimAddress` with the separator parameter and tests for the separator and for parity with each migrated site. A site whose layout does not map onto the helper's slicing is scoped out instead of forced.
- `IdentityStrip.vue` with its component test; every `data-testid` survived verbatim.
