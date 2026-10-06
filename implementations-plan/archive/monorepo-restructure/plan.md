# Monorepo layout: apps, packages, contracts

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the role-based layout under `apps/` and `packages/`, with the workspace globs in `package.json` and the project references in `tsconfig.json`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Reorganize the flat `packages/*` workspace into role-based directories in one atomic, rename-preserving change.

- `apps/` holds the deployable leaves (the extension, the landing and the playground, at the time also the faucet).
- `packages/` stays flat and holds the shared libraries; directory name equals the `@nulo/<name>` package name equals the CI filter segment.
- Contracts moved to a non-workspace `contracts/` tree; that code has since left this repository.

Package names did not change, so no import statement did. Historical documents were left as they were.

## Why

Flat layout won over grouped sub-directories because the CI guard test, the Biome layer-import globs, the path filters and the project references all assume `<dir>/<name>` identity, and grouping would have needed a name-to-directory map and deeper globs. It also kept the path-coupling surface of a high-blast-radius move to a minimum. Contracts were not zero-coupling: one compile-time import, one silent Foundry remapping and several path-reading scripts depended on their location.

## What shipped

- The guard test learned the apps/packages split (an `APPS` set picks the directory), and the dorny path filters, reusable build workflows, composite setup actions, release config and changelog include-path were repointed.
- Depth-coupled tests and configs were fixed individually: cross-package imports in the bridge tests, the extension's sibling-library test includes, the Storybook glob and the design-token CSS parity tests.
- The lockfile diff was path-only, and a deliberate layer-import violation proved the lint rules still bind after the glob repoint.
- The forbid-grep scope for the accelerator boundary was widened from `packages/` to `apps/ packages/`, since it silently stopped scanning the moved extension code otherwise.
- Silent breakers (a cache key, a changelog filter, a script reading a sibling path) escape typecheck, so each got its own gate, and a repository-wide completeness grep over live files, not hand enumeration, caught the missed readers.
