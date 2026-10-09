# Phase 1: run isolation (arc 1a)

## 1.1 Host registry client

- Wrote `tests/e2e/port-registry.ts` to the plan's interface, with two additions the tests need: `acquireRegistryLock` (exported so the token-checked release is testable) and `withRegistry` (the generic locked rewrite the three-process case drives). `releaseDeadRows` returns the count dropped (or `undefined` when locked) instead of a boolean, so `e2e:reap` can report it.
- The rewrite goes through a temp file and a rename (the live writers use `writeFileSync` in place); a writer killed mid-write then leaves the other tools' rows whole. The registry's directory is created under `withRegistry`, so a fresh CI runner needs no setup.
- Mutation check: with the lock opened `"w"` instead of `"wx"`, the two held-lock cases and the three-process case go red; restored, all 15 pass.
- Gate: `bun run lint` 0, `bun run typecheck:all` 0, `bun run test` 0 (716 files, 10,730 tests), `bun --bun vitest run scripts/e2e/port-registry.test.ts` 15/15.

## 1.2 Claim the pack, release it at the end

- `resolve-ports.ts`: `reservePort(exclude)` skips listed ports in the static draw and retries the ephemeral fallback while it lands on one (bounded at 16). `resolvePorts()` is exported for the tests; `main()` keeps the CLI and adds `--release <runId>`. The repo root moved to `lockfile.ts` as `REPO_ROOT`, the worktree every registry row names.
- `agent.sh`: the EXIT trap is a function (`on_exit`), since shellcheck reads `$rc` inside a quoted trap string as unassigned (SC2154). An empty run id after `resolve-ports` is a fatal error (exit 2): an agent run always passes an owner pid, so no claim means something is wrong.
- Gate: Fast pass; `resolve-ports.test.ts` + `port-registry.test.ts` 25/25. Network (file) `tests/e2e/network/networks.test.ts`, Chrome, proverless, retry 0: 4/4 pass, exit 0; a 3 s registry watcher saw five `nulo-e2e-*` rows under one run id (`nulo-e2e-1763430-358c5d19`) for the whole run and none after. `NULO_E2E_BROWSER=bogus bun run e2e:agent tests/e2e/network/networks.test.ts`: claimed, `Script not found "build:bogus"`, exit 1, no row left; the 29 foreign rows stayed.
