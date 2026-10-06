# Copy polish

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the clause-dash ban in `apps/extension/src/utils/copy-dash-ban.test.ts`, the glossary line in `apps/extension/src/utils/glossary.ts`, the snack layer over the Terms sheet in `apps/extension/src/popup/app.vue`, and the spoken unknown-contract row in `apps/extension/src/components/composite/capabilities/DetailsTable.vue`.
- **Open items**: Add token shows the PXE store's two developer errors (the wedged-store refusal and the store version mismatch) in developer wording, split at the dash only; mapping them to user copy is a copy decision, tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Four small, user-visible changes shipped as one change set:

- Remove the em dash that joins two clauses from 46 user-visible strings. Thirty-five become two sentences, and eleven are reworded where the bare split read clipped or wrong. A unit test keeps new ones out.
- Make the glossary's "where" line for Authorization name Connected apps, where the term is dotted, instead of an approval window where it is not.
- Draw snacks over the Terms sheet while it is open instead of hiding them under it.
- Give an unknown contract's Details row a spoken name for screen readers.

## Why

A rule nobody runs does not stop strings from coming back, so the ban is a test. Its AST scan reads every string literal and text node, where a line scanner miscounted comments and multi-line templates. Thrown developer text, log lines and dApp-facing messages keep their dashes because no screen shows them.

The Terms sheet sits at a higher layer than snacks, so a failed Accept message or an arrival snack was drawn under its backdrop and never seen. Lowering the sheet below the snack would let a menu teleported beside it draw over the consent, and raising the snack layer globally would put every snack over every open menu, so only the snack host is raised while the sheet shows.

## What shipped

- **Guard**: the test fails on a new clause dash in the forms it can read, outside log calls, with a reviewed list of allowed hits and a header naming the forms it cannot see. The repository rules state the ban.
- **Glossary**: Authorization reads "Permission window · Connected apps".
- **Snack over the sheet**: while the sheet is visible the snack host draws between the sheet and the loader and barriers, and the card sits above Continue's row. Browser cases on both engines prove it by hit-testing and computed style, through a new background-evaluation helper on the browser driver.
- **Spoken row**: a screen reader hears "Unknown contract" plus the address and the columns, and nothing drawn changes.
- **Dropped**: a Chrome-only loader step, since a worker restart never draws the loader.
