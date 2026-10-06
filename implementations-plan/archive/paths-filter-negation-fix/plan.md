# Whole-repo CI gating from the dependency graph

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Path filters derived from each gated target's dependency graph in `.github/workflows/`, and the guard `scripts/ci-cd/behavior-gating.test.ts`, run through `test:ci-gating`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Every `dorny/paths-filter` gate is derived from what its target is built from, using positive patterns only.

- **A built or tested target** (the extension, the playground) is gated on its whole package, which covers source, manifest, public files, scripts, build config, tsconfig and the e2e harness, present and future.
- **A dependency library** is gated on its `src/**` and `package.json`, the surface a consumer actually imports.
- **Repo-wide build inputs** (`package.json`, `bun.lock`, `bunfig.toml`, `tsconfig.json`, `patches/**`) gate every target. Workflow and action files gate the suites they run.

One guard test recomputes each target's transitive graph from the workspace manifests and fails if a gate omits a package, or if any `!` pattern appears anywhere. It is wired into the unit-test workflow so it runs on every pull request. A filter with no consumer was dropped, and the workflow-lint filters were left alone, since they have no graph.

## Why

The filters were hand-curated lists that had drifted from the graph in both directions, and a bare `!` negation under the action's default quantifier matches every file that is not the named one, so a filter containing it fires on everything. Under-gating was worse: a change to a core library did not run the required network suite, and a change to a shared library did not rebuild one of the apps built from it.

Naming the target's whole package ended the cycle of adding one more missed input after every audit, because it cannot under-gate a build input. It can only over-trigger, on a target's own README.

Gates intentionally over-trigger. Source-nested tests, stories and docs under `src/` run the end-to-end suites. Running a required suite that was not strictly needed is wasteful, and skipping one is unsafe. A tighter gate through extglob patterns was left unbuilt, since it would first need proving against the action.

## What shipped

- Rewritten filters for the smoke gate, the network gate and the quick-pipeline build filters, with no negation anywhere.
- `behavior-gating.test.ts` over graph coverage, the no-negation rule and the cross-cutting entries, run by the unit-test workflow through `test:ci-gating`.
- The gating principle in [CI.md](../../../CI.md).
