# deps-audit-1: phase 1 (the two bumps)

All commands from the repo root on branch `deps-audit-1-a1`, before 21:01Z, so both installs used the scratch config.

- Base `bun run test:all` at `ef5336bbc`: exit 0, 198 s. Pass counts: extension 14707 (5 skipped, 7 todo), wallet-bridge 805, design 534, extension-messaging 429, aztec-runtime 414 (2 skipped), wallet-core 317, wallet-crypto 123, token-list-host 85 (3 skipped), landing 79, third-party-notices 66, legal 59 (1 skipped), token-list 33, wallet-sdk-schema-patch 15, resolve-asset 14.
- Scratch config: a fresh `cp bunfig.toml` plus one `minimumReleaseAgeExcludes` line; `diff` against the tracked file shows only that line.
- `bun update follow-redirects`: exit 0. Override `8.2.4`, `bun install --config=<scratch>`: exit 0. Override and the three floors `^8.2.4`, `bun install --config=<scratch>`: exit 0. The resulting diff equals the planning probe's.
- Gate: bunfig and ack-file diff empty; `bun.lock` 6 lines changed (4 ranges, the vite and follow-redirects entries), no `@alejoamiras/*` line; one `vite` line per manifest; both integrity strings equal the registry's `dist.integrity`.
- `rm -rf node_modules apps/*/node_modules packages/*/node_modules infra/*/node_modules`, then `bun install --frozen-lockfile` with the tracked `bunfig.toml`: exit 0. The store holds `vite@8.2.4`, `follow-redirects@1.16.1` and no older copy of either.
- `bun audit --audit-level=low --json` (exit 1) into scratch, then `audit-gate.ts --mode enforce`: exit 0, `41 acknowledged, 0 unacknowledged, 0 stale, 0 unreadable`.
- `bun run lint` exit 0; `bun run typecheck:all` exit 0. Committed as `81e1e7303` (signed).
- Review round 1: Codex (session 01a15c4b) approve with fixes, Opus approve with fixes; records only, no dependency file changed (plan § Review verdicts).
