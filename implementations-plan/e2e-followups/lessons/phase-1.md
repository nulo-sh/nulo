# Phase 1: implementation log

## 1.1 (#249), 2026-10-11

- First run of the guard's unit test: 9 of 13 green, every watch case and the parse-failure case red. Cause: the test runs under `bun --bun vitest`, which puts Bun's `node` shim first on the child's PATH; the shim drops `--` and `-w` from `node -e`'s argv (`node --input-type=module -e 'console.log(process.argv)' -- -w a` prints `[bun, "a"]`), so the inline parse step answered `run`. Real Node prints `[node, "-w", "a"]`. A fail-open whenever the guard runs under a Bun parent.
- Fix (D14): the watch read moved to `scripts/e2e/watch-mode.ts`, run with `bun run`. Probe under bash (not zsh, which keeps an unquoted `$a` as one word): `bun run`, the shim and Node 24 give the same answer for every case: `-w`, `--watch`, `--watch=true`, `-w=true`, `--watch=0`, `--watch=no`, `--watch.enabled=true|false` → watch; `--watch=false`, `--no-watch`, `-w=false`, no watch flag → run; `--watch --watch=false` → exit 1; an unknown flag → run (the listing then refuses it).
- `vitest list --filesOnly --json` (vitest 4.1.10): `[{"file": "<absolute path>"}]`; an empty selection writes `[]` and exits 0; an unknown flag exits 1.
- Red on base: with the guard's body replaced by `af4afcc`'s inline block, 9 of 13 cases fail, the first two included. Restored.
- Gate: `bun run lint` 0; `bun run typecheck:all` 0; guard test 13/13 (about 3 s, concurrent); `bun run test` 735 files, 11125 passed; `bun run test:ci-gating` 480 pass; `shellcheck` 0; `bun run e2e:agent tests/e2e/network/import-handshake-note.test.ts --retry=0` exits 2 with the FATAL lines and no `resolving ports` line.
