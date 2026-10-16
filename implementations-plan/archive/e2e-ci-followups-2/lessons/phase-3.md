# Phase 3: a readable Firefox exception, one seed replay (#322)

## Unit

- `firefox-driver.test.ts` on Bun and Node: 56 tests, exit 0. The `recentFrame` table runs the serialised `RELAY_HELPERS`, so it proves the selection and that the function depends on nothing outside itself.

## Firefox smoke, retry 0

- Armed build (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:firefox`), then `env -u EXTENSION_PATH NULO_E2E_BROWSER=firefox NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e --retry=0`. Smoke has no `agent.sh` path; it claims no port.
- Launched at load1 82, 23:51-00:30Z: 58 files passed, 3 skipped (61); 243 tests passed, 14 skipped; 2,329 s; exit 0.
- The close's exception line now names add-on code: `Error: Client disconnected at moz-extension://…/assets/popup-CKljDShT.js:6:36687` where Firefox's own stderr prints the same text at `client-W8GDy5SJ.js, line 1`, its reported location: the relay keeps the saved stack's first add-on frame first, and the two can differ; both are add-on code.

## Seed replay, retry 0

- From the root: `NULO_E2E_BROWSER=firefox NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NULO_E2E_CHAOS=1 NULO_E2E_CHAOS_SEED=1960252198 VITE_NULO_FEE_MULTIPLIER=10 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/send-chaos.test.ts`, launched at load1 126, 00:30-00:35Z.
- `[send-chaos] seed=1960252198 (replay: NULO_E2E_CHAOS=1 NULO_E2E_CHAOS_SEED=1960252198) actions=[{"kind":"dapp"},{"kind":"send",…`; ``bundle contains parseFloat(`10`) ✓``.
- `a seeded burst of sends keeps every invariant` green, 192 s; 1 file, 1 test, 270 s, exit 0. No `too much recursion`; the close's exception line lists only `Error: Client disconnected` at `popup-C_a6Vsrr.js:6:36687`. No row for the worktree left in `~/.agents/ports.md`.
- The local Firefox build emits `creator-DQZXbG1H.js`, the content hash of the CI run's chunk, so its line 5 is the line Firefox named there: the tail of `@codemirror/state`'s `EditorState` and its `RangeSet` code (`mapPos`, `between`, `chunkEnd`). Without a column the recursion stays unmapped within it; a recursion there means CodeMirror state code ran, which the recon found no window doing at boot.
- Disposition: green, so #322 closes at close-out as `known-limit`, citing the CI record (192 post-#328 Firefox runs replaying this seed, none recurring) and this replay.
