# Phase 2: markup, copy, tests

- Tests first, red at base: 11 cases (the copy, the install contract, the nav, `/subscribed`, `index.html` serving both stores). The Terms pin and the `aria-describedby` resolution passed at base, as the plan expects of guards.
- One case was vacuous at base: "the form comes after the store links" compared against `indexOf` = -1; it now asserts the secondary link exists first.
- The store-link extraction reads `href="…"` values and filters them, rather than one regex with two `[^"]*` runs around an alternation, which backtracks quadratically on a miss.
- Gate: landing 10 files, 146 passed, 1 skipped (the launch-gate env test); landing typecheck, `bun run lint`, `bun run typecheck:all`, `bun run test:all` (extension 957 files), `bun test scripts/release/store-copy-run.test.ts` (27 passed): all exit 0.
