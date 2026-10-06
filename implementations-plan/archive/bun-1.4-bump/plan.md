# Bun 1.4 bump

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the Bun 1.4 pin in `package.json` and `.github/actions/setup-bun/action.yml`, the pull-request workflow folded onto that composite action, `bun run --parallel` in `audit:vue` and `dev:full`, an advisory `bun dedupe --check` step in `.github/workflows/_lint-and-typecheck.yml`, and the package-manager workflow and age-gate notes in [`SECURITY.md`](../../../SECURITY.md) and `bunfig.toml`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Move the toolchain from Bun 1.3 to an exact Bun 1.4 pin and land only the wins that need no runtime or topology change:

- Pin-surface dedupe: the pull-request workflow's inline setup folds into the shared composite action, leaving two pin files.
- `bun run --parallel` for the gate scripts, dropping `concurrently`.
- `bun dedupe` over the lockfile's duplicates, with an advisory CI check.
- Explicit `permissions: contents: read` on the reusable lint workflow.
- A package-manager workflow section: `bun pm diff` on every bump review, `bun audit fix --dry-run` for advisory triage.

The isolated linker, vitest on Bun and Bun-native tooling were separate arcs of the [Bun 1.4 adoption](../bun-1.4-adoption/plan.md). The runtime pin is exact, never "newest 1.4.x at merge", because a re-pin restarts validation.

## Why

The runtime is not an npm dependency, so the seven-day release-age gate does not govern it; the exact pin is the control. This arc kept the existing v1 lockfile: Bun 1.4 never migrates one on its own, and 1.3 cannot read v2, so keeping v1 left older agents working. The isolated-linker arc later regenerated it as v2. The machine-wide upgrade stayed a precondition for the parallel scripts and CI parity. The dedupe check is advisory because collapsing duplicate ranges can lower a transitive, and one of them is reachable from the production bundle; each collapse is reviewed by a human, and a required check must never pressure anyone into accepting unreviewed downgrades.

## What shipped

- The pin, composite-action fold and parallel scripts above, validated under the new toolchain with the full local battery.
- The dedupe step and the workflow permission narrowing.
- The age-gate documentation, backed by the probe below; the bunfig comment no longer carries the old "delete the lockfile first" workaround.

## Lessons

### Age gate probe

A mock-registry probe with positive controls showed that on Bun 1.4 the seven-day age gate holds transitives on `bun update --latest`: a forced fresh resolution under the gate picks the old candidate, the same resolution without the gate picks the young one, and an ungated twin shows that retaining an already-locked version is runtime behaviour independent of the gate. On Bun 1.3 an already-locked young transitive persisted while direct dependencies were re-gated. The nuance that remains by design: `bun update` and frozen installs never re-gate a version already in the lockfile, so evicting one means a deliberate regeneration, and a manifest edit re-gates the edited workspace's tree.

### Probes that serve and spawn

A probe that serves a local registry from `Bun.serve` must spawn its client asynchronously: a synchronous spawn blocks the event loop that serves the registry and deadlocks.
