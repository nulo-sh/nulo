# Complexity budgets

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Biome complexity rules in `biome.json`, the shrink-only baseline in `scripts/complexity-baseline/`, its CI mirror `scripts/ci-cd/complexity-baseline.test.ts`, and the duplication trend report `scripts/dup-trend/report.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Three Biome rules at error severity, riding the existing pipeline (editor, pre-commit on staged files, `bun run lint`, the required quality status). No new linter, gating job or dependency.

| Rule | Ceiling | Scope |
|---|---|---|
| `noExcessiveCognitiveComplexity` | 15 | all code: src, tests, e2e, scripts, `.vue` script blocks |
| `noExcessiveLinesPerFunction` | 80 non-blank lines | production only; tests and e2e exempt by override |
| `noExcessiveNestedTestSuites` | 5 | test suites |

Existing offenders get a function-scoped suppression directive, and `scripts/complexity-baseline/manifest.json` is regenerated from a source scan. The checker refuses growth: a count that rises fails, a count that falls means the manifest must be regenerated in the same change. Duplication is watched through a trend report, never gated.

## Why

- **Cognitive over cyclomatic**: it measures understandability, and on this codebase nearly every function over the cyclomatic bar was already over the cognitive one, so a second gate would add almost nothing.
- **The length cap targets verbosity and duplication**, the usual failure of generated code. Blank lines are free, so the only way under the cap is less code.
- **Error severity, no advisory tier**: automated loops react to failures, and a warning shapes nothing.
- **One directive per function** keeps new code in a dirty file under the full budget. Per-directory thresholds and "fix the whole file when touched" rules either leak new code or force risky refactors of wallet execution paths into unrelated changes.
- **Rejected**: nesting-depth limits (already covered by cognitive scoring), parameter-count limits (API churn), the maintainability index (no maintained JavaScript tooling), and hosted dashboards (slower than the edit loop).
- **Clone identity is too unstable to ratchet**, and over half the duplication is test against test, so the trend report is advisory.

## What shipped

- Rules and overrides in `biome.json`.
- The generator, scanner and checker in `scripts/complexity-baseline/`. The checker runs in `bun run lint` and the pre-commit hook; the hook reads the index, so split-staging a suppression past it is impossible.
- The checker classifies every suppression form that would evade a naive text match: bare, group, and file-wide or range variants. A Biome version change forces a deliberate regeneration, since scores drift between releases. The generator will not grow the baseline without an explicit adoption flag.
- The CI mirror in `test:ci-gating`, and `bun run audit:dup` with an advisory nightly step that prints the duplication trend.

The baseline later became a short list of justified acceptances, each with a stated reason and an exact score. See [complexity-residue](../complexity-residue/plan.md).
