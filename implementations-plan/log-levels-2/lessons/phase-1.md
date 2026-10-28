# Phase 1: both sites and their tests

- First commit refused by the pre-commit hook: an inner `refreshIn` put `useStaleNetwork` at 83 lines (budget 80). Fixed by moving the read to a module-level `syncActiveIfStale(deps)`, which keeps the function at its base length. No suppression.
- The red check then copied base sources over the working tree and restored them with `git checkout HEAD --`: with the commit refused, HEAD was base, so the staged sources were reset. Check a commit's exit code before swapping in base copies.
- In zsh a `$t` holding several paths is one argument (`lessons.md`, Agent tooling): the first red/green run matched no file. Rerun with literal paths.
- Red/green at 982c271c6: the four regression cases (stale debug, arrival debug, arrival `error` pin, wiring pin) fail with the base copies of the three sources and pass after; the stale control passes on both.
- Gate: `lint`, `typecheck:all`, `test` (947 files), `test:all` exit 0. Armed Chrome smoke build, then `stale-network.test.ts` + `network-arrival.test.ts` at retry 0: 7 passed, 2 skipped (the env-gated captures block), 101 s.
