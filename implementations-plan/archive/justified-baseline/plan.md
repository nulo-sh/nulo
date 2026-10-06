# Justified complexity baseline

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Every remaining complexity suppression carries a justified accepted form that `scripts/complexity-baseline/scan.ts` enforces, `scripts/complexity-baseline/generate.ts` fails closed, and `scripts/complexity-baseline/rescore.ts` audits exactly in `scripts/ci-cd/complexity-rescore.test.ts`; the manifest is `scripts/complexity-baseline/manifest.json`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

The "refactor when touched" contract for the surviving over-budget functions is retired. Each survivor is an accepted function with a one-sentence reason, and the tooling refuses anything else. No function body changed. This is the last arc of the burn-down recorded in [complexity-residue](../complexity-residue/plan.md).

## Why

A baseline that says "refactor someday" never shrinks and hides growth: a function can get worse under a still-valid directive, and a regeneration after a Biome upgrade can quietly grandfather new offenders. The acceptances that remain are functions whose branching is their specification, so they should say so at the line and be held to an exact number.

## What shipped

- **The accepted form.** A whole `//` comment line, `accepted at score <N> — <why>` for the cognitive rule and `accepted at <N> lines — <why>` for the length rule. The number must match the rule's unit and the sentence must be long enough and free of placeholder words. The check is syntactic; whether a reason is specific stays a review matter.
- **Scanner.** The legacy baseline text, the generator's marker, a bare reason and a unit mismatch are all forbidden, locally and in the CI mirror.
- **Identity, not counts.** The manifest pins each acceptance as file, rule, anchor (the declaration line under the directive) and stamp, so a swap inside one file is an add plus a remove and fails like growth.
- **Generator.** A function pushed over budget gets a `JUSTIFICATION REQUIRED` marker and the run exits non-zero without writing the manifest. `--adopt` is accepted only when the pinned Biome version differs from the installed one, and the generator never rewrites an existing directive.
- **Rescore audit.** One sibling copy per file with its accepted directives removed is linted in a single run and compared with the stamps. The audit is exact: a raised stamp, a grown function and a stale directive all fail. It parses Biome's messages with rule-anchored patterns, so wording drift fails instead of mis-parsing. A negative fixture proves it catches a function stamped too low.
