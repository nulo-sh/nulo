# Bun 1.4 adoption

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the repository runs on Bun 1.4 (`packageManager` in `package.json`, `.github/actions/setup-bun/action.yml`), with the isolated linker in `bunfig.toml`, parallel `audit:vue` and unit suites on the Bun runtime through `vitest.base.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Treat the Bun 1.4 bump as four separate pieces of work, each with its own plan at its own tier, rather than one change: the version bump with its cheap wins ([bun-1.4-bump](../bun-1.4-bump/plan.md)), the isolated linker ([isolated-linker-store](../isolated-linker-store/plan.md)), Vitest on the Bun runtime ([vitest-on-bun](../vitest-on-bun/plan.md)), and a pass over the tooling scripts that spawn processes. This record is the map those plans started from.

Scope limits fixed up front: Vite stays (no Vue single-file-component support and no MV3 pipeline in `bun build`), Puppeteer e2e and its supervisor stay on Node, the extension's browser-side WASM store stays, and no `@aztec/*` pin changes. The isolated-linker piece carried an abort rule: if Aztec resolution could not be made sound, keep the hoisted linker and close it as rejected with evidence.

## Why

The bump itself was low-risk because the repo's Bun-API surface is tooling only. The payoff was in the package manager (the isolated linker, `bun pm` inspection commands that fit the supply-chain posture), in the test runner (Vitest officially running under Bun) and in CI mechanics (`bun run --parallel`), not in the runtime APIs.

Two consults before the later plans changed their shape:

- Make every layout-sensitive consumer resolve packages independent of the node_modules layout first, while still hoisted, and only then flip the linker. Hoist patterns recreate phantom dependencies and stay an emergency bridge.
- A jsdom suite is not certified by the claim that Vitest works on Bun. Promote package by package behind a retry-0 flake baseline against Node; two green runs are smoke, not proof. The wallet-crypto suite turned out to be jsdom, which reordered the rollout.

## What shipped

- The bump, parallel `audit:vue`, an advisory `bun dedupe --check` and a transitive release-age check that retired an old workaround.
- The isolated linker, with consumers made layout-agnostic first (see `packages/resolve-asset`).
- Unit and component suites on Bun behind a shared Vitest base, proved by a fail-closed soak.
- The process-spawning pass found its premise wrong: the argv-array call sites were already shell-free, so moving to `Bun.$` was no security gain. It shipped as Node-API hardening of the few interpolated shell strings instead. Those scripts now live in the `alejoamiras/unleashed` repository.
- The e2e supervisor stayed on Node, so `--no-orphans` was never enabled; it kills a descendant tree, not a process group, and no consumer existed.
