# One Vite in the tree

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: a root `overrides` pin of `vite` to `^8.0.0` in `package.json`, the unused Vue devtools plugin removed, and the extension `test` script in `apps/extension/package.json` made non-watching.
- **Open items**: two stale auto-import globals that outlive their exports, tracked in #173.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Reach exactly one Vite (8.x) in the dependency tree and lockfile, with every suite green and the app builds unchanged.

- **Delete `vite-plugin-vue-devtools`.** It was declared but imported by no Vite config, so removing it evicts the whole chain and its Vite 7 copies, a net supply-chain reduction.
- **Pin with a declarative override.** The test runner's range accepts Vite 6, 7 or 8 and the package manager left a nested Vite 7 under it. A range override (`^8.0.0`) forces the hoisted 8.x, and no runner release forces Vite 8 on its own.
- **Fix the watch-mode footgun in scope.** The extension's bare `vitest` test script became `vitest run`, which also stops `test:all` and `audit:vue` hanging locally.

## Why

Tests ran on a different Vite than the builds. The override is the only deterministic mechanism; surgical lockfile edits fight the resolver and are brittle. A range, not an exact pin, lets 8.x patches flow. Overrides are global and no longer tracked by dependency bots, which is accepted because every consumer (the apps, the runner, Storybook and the extension bundler plugin) accepts Vite 8.

## What shipped

The lockfile diff is the devtools-chain removals, the override line and the runner collapsing onto the shared Vite, verified by a single `vite` version on disk and no Vite 7 or nested runner Vite in the lockfile. Suites ran with identical counts.

One dynamic service import in a unit test timed out on CI because the first call paid Vite 8's cold transform of the inlined workspace graph; it became a static import so the cost lands in the file's import phase, and the global timeout stayed untouched.

## Lessons

### Fresh install

An incremental `bun install` rewrites the lockfile correctly but leaves orphaned nested directories on disk, so the tests had in fact run on the stale Vite 7. Prove dependency removals against the lockfile, and against disk only after `rm -rf node_modules` and a frozen install, because a leftover import passes locally and fails on CI.
