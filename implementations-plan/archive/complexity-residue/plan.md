# Complexity residue

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the burn-down of the complexity directives left by [complexity-budgets](../complexity-budgets/plan.md), ending in the justified-in-place form enforced by `scripts/complexity-baseline/` and recorded in `scripts/complexity-baseline/manifest.json`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

The budget gate was left with 126 directives. The first pass cut them to 49 by refactoring seven clusters in sequence (backup migration and restore, the PXE and network boundary, the execution pipeline, balances and durable jobs, the service-worker and wallet protocol, the faucet composables, popup shell state), each with characterization pins committed first where behaviour had none.

The second pass retired the category "refactor when touched". Every survivor was adjudicated function by function: either the code reads or tests better under budget and is refactored on that merit, or it stays exactly as written and its directive carries a specific one- or two-line justification. Driving the count to zero was not a goal, and a function is never reshaped to hit a number. That pass took the 49 to 35. The live manifest now holds 24, because several accepted functions were later rewritten on merit.

### Adjudication

Ten production functions are accepted because their branches are their specification: the recursive redaction walker, the hostile-JSON clone, the row-transform interpreter and its type-coercion matrix, the type-tagged canonical encoder, the layered Kahn traversal, the JSON replacer codec, the integer formatter, one declarative editor theme, and one store closure whose slices share ABA-safe fences. Fourteen test and CI-harness directives remain: a lexer state machine, in-page selector and journal scans, polling predicates, a CLI grammar and a reporter traversal. The sentence on each directive and `scripts/complexity-baseline/manifest.json` are the record; a new acceptance above the existing ceiling needs a blueprint and owner sign-off.

## Why

A suppression that says "refactor when touched" is an IOU nobody collects, and forcing a hard function under a metric makes it worse, not better. Several earlier category rationales also turned out wrong when the functions were read: "scores mirror scenario matrices" was false for a dozen harness entries, which were scanners, predicates and parsers. Writing the reason at the line, in a form a tool can check, makes a stale or copied justification visible.

## What shipped

- Refactors on merit: shared browser-side balance joins and reply planners in the e2e fixtures, staged global setup, a fuzz-world driver with a model oracle, gate-by-gate operator scripts and named validators in the soak tooling. Two bridge-side bugs that characterization tests had pinned were fixed and the pins flipped; that code now lives in the unleashed repository.
- The accepted form `// biome-ignore lint/complexity/<rule>: accepted at score N — <sentence>`, with a scanner that refuses every other form for these rules, anchors each acceptance to its declaration, and requires that line to be unique in its file.
- A manifest that must match the tree entry by entry. On a pull request it is also ratcheted against the base branch: no added entry, no raised stamp, and a move only with the `baseline:move-approved` label. The generator never writes an acceptance and refuses to re-pin on the same Biome version.
- A rescore audit (`bun run baseline:rescore`) that re-lints directive-stripped copies and fails any stamp that is not exactly the observed value.
- The rules for working in this area live in `CLAUDE.md`, section "Complexity budgets".
