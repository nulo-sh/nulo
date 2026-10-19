# Phase 1: the close fails on a node request the stand-in held (#836)

## Gate (2026-10-19)

- `bun run lint`: exit 0 (the repo's existing warnings only; the changed files are clean).
- `bun run typecheck:all`: exit 0.
- `bun --bun vitest run scripts/e2e/egress-guard.test.ts scripts/e2e/standing-interception.test.ts scripts/e2e/node-stub.test.ts`: 51 passed.
- `bun run test`: 858 files, 14059 tests passed.

## Mutations (each applied alone, then restored from a copy)

| Mutation | Red |
|---|---|
| `note()` ignores the predicate (`held = false`) | "an attempt at a watched host counts as held only while its watch holds…" |
| `holding()` always `true` | "the launch's handle holds only while its own interception is armed" |
| `ownGuardedLaunch` never calls `watch` | "a node request that reaches the guard while the stand-in holds its origin fails the close…", "a held node request and an undeclared host…" |
| `egressFailure` ignores `held` | the same two |
| extra: the watch drops `!closed` (D8) | "success control: node requests before the hold, while it is released, and from the browser's close pass" |

## Notes

- `HeldNode.holding()` is declared in `egress-guard.ts`; `HeldInterception` lives beside `ArmedInterception` in `browser/index.ts`, and `node-stub.ts` joins them, so `egress-guard.ts` still imports nothing from `browser/`.
- The control-spec case (D4) is written here and runs in Phase 3.
