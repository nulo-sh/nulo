# Phase 3: final validation and the fix loop

## Gates on the arc head (`92ec209`, before the fix loop)

- `bun run lint` exit 0; `bun run typecheck:all` exit 0 (Phase 2, same sources).
- `bun run test:all` exit 0: 13 workspaces, `@nulo/extension` 740 files passed, 3 skipped.
- `bun run test:ci-gating` exit 0 (plans gate 0 findings); `bun run lint:actions` exit 0.

## Fix loop

- Round 1, Codex (gpt-6.1-sol, high, session `01a12b75`) and an Opus 5.5 diff review in parallel. Codex: approve with changes, three Low scanner edge cases. Opus: approve, four Low. Accepted the optional-chained arity read and two wording fixes (`2e4e8d9`); rejected the window over-reach (needs every opener per line read, a restructure of the accepted-complexity `findLoggedSecrets`; fails safe; joins the D7 issue), code on a `<script>` tag line (not on the tree), and `version` on the blocked line (D-orch-3).
- Round 2, Codex resumed: approve, no new material findings. Converged.
- A commit hung in `ssh-keygen -Y sign` on the agent socket; killed and rerun as `env -u SSH_AUTH_SOCK git commit`, signed (`G`).

## Chrome smoke

Armed build (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`), then `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- --retry=0`: 48 files passed, 3 skipped; 212 tests passed, 10 skipped; exit 0 (1,367 s). Built from the sources of `92ec209`; `2e4e8d9` changed only the scanner test and CLAUDE.md. Smoke has no sandbox; `agent.sh` is the network runner and no network run is in scope (D8).
