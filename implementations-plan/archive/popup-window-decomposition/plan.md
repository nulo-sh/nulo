# Popup window decomposition

## Outcome

- **Date**: —
- **Status**: superseded by vue-design-system.
- **Shipped**: the pilot extraction `apps/extension/src/popup/windows/execute/humanize.ts` with its test; the remaining sub-steps were replaced by the component-model work in [vue-design-system](../vue-design-system/plan.md), and the execute window has since been split into pieces such as `OperationCard.vue` and `SignerIdentityStrip.vue`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Cut the two oversized dApp-window popups, the execute (transaction approval) window and the capabilities (permission grant) window, toward 400 lines each by a pure structural refactor in small sequential steps. Extractions are verbatim copies of what they replace: class names, test ids, event shapes, prop names and cleanup order are preserved, and no logic or test changes ride along except a unit test for each pure helper.

The planned order was: a pure helper first as a pilot, then visual islands with no state coupling (the signer identity strip, the dApp identity block), then a fee-estimation composable, then pure derivation helpers, then a one-shot payload loader, and last the operation-card components.

## Why

Both files had grown past a thousand lines even after the redesign retired the worst earlier offenders. The rules written down for the work are the lasting part:

- Auto-import does not cover popup component directories, so every extracted SFC is imported explicitly by its parent.
- Local style blocks move wholesale into the extracted component; passing the parent's CSS-module classes to a child only reaches the child's root and breaks nested selectors.
- A service client's connect and disconnect stay in the parent. A composable receives a connected client and exposes a `dispose()` that the parent calls in the existing teardown slot, after the service disconnects and before the timer clears. The cleanup order in `CLAUDE.md` comes from here.
- No dispatcher wrapper around the operation cards: the parent keeps the switch on operation kind, because a wrapper would only relocate it and make the operation typing harder.
- A pre-existing quirk is preserved verbatim and pinned with a test, so a later fix is a visible, deliberate change.

## What shipped

- `humanize.ts`, a pure helper extracted from the execute window, with a unit test. The first-underscore-only quirk it preserved at extraction has since been fixed, and the test now guards the replace-every-underscore behavior.
- Nothing else from this plan as written. The broader design-system plan replaced the remaining steps and absorbed the pilot, and the teardown and composable rules above survive as the repository's cleanup-order and composable conventions in `CLAUDE.md`.
