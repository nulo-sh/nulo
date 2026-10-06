# Vitest on Bun

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the workspace unit suites run on the Bun runtime through `bun --bun vitest run` (all but `packages/resolve-asset`, still on Node), with a shared base in `vitest.base.ts` and a fail-closed soak tool in `scripts/ci-cd/test-soak/`.
- **Open items**: `packages/resolve-asset` still tests on Node, and the interop stopgap in `vitest.base.ts` awaits a vitest release that carries the upstream fix, both tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Run every workspace Vitest suite, the extension component run and the jsdom smoke on Bun, with proof that Bun is no flakier than Node, and leave CI YAML untouched. This is the third step of the Bun 1.4 adoption. The Puppeteer e2e layer stays on Node.

- One root `vitest.base.ts` holds a shared `test` object that every workspace config spreads. Four workspaces that had no config got a minimal one with an explicit node environment.
- Scripts flip per workspace, one commit each, so a revert is per package. Watch scripts flip only after a watch smoke passes.
- The proof is a soak: 30 retry-0 runs per suite on both engines at one clean commit after a frozen install, compared by exact test inventory, plus the CI-shaped concurrent fan-out repeated and a dispatch of the quick PR workflow bound to that commit.

## Why

Every Bun failure traced to one vitest interop rule. Vitest 4 treats a module as CommonJS when `"__esModule" in mod.default` holds, and Bun answers true for ES-module namespaces, so zod's namespace default replaced the module and `z` vanished. The upstream fix ships in vitest 5.0.0-beta.3. Until the installed vitest has it, `deps.interopDefault: false` is the stopgap: it fixes Bun and gives an identical test set on Node (the extension aggregate ran the same files and tests on both engines).

Per-script `--bun` was chosen over a global Bun run setting, which would have flipped vite builds, storybook and Puppeteer tools at once. Waiting for a vitest prerelease bump was rejected as its own review under the age gate.

## What shipped

- The base object, its retirement trigger in a comment, and the workspace `test` scripts flipped, all but `packages/resolve-asset`'s. `experimental.viteModuleRunner` must never be set to false, because that path needs a module hook Bun lacks.
- The soak tool: it refuses a dirty tree, mismatched commit, lockfile, vitest version or runtime identity, an inventory with a missing or differing test, any run failure, and any module-resolution difference outside a pinned allowlist of the four packages that declare a Bun export condition. Its own failure detection (crash, hang, unhandled rejection, missing output, wrong source map) is proven on both engines by the CI gating tests.
- The standard for any future test-runtime change is this soak bar, recorded in `CLAUDE.md`.
- Left on Node: the extension e2e layer, and `packages/resolve-asset`, which was added about when the flip landed and was never soaked.
- Vitest's JSON `success` ignores an escaped unhandled rejection, so a run is judged by exit code as well as the report.
- When the stopgap is retired, delete the key and rerun the soak matrix; whichever vitest bump lands owns that rerun.
