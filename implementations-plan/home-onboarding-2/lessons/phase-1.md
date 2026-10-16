# Phase 1: the permission read and the row

- 2026-10-15: `usePrestoHostPermission` built as planned. A read that lands while the status is still `pending` is the first read, whichever read it is: an event's read that supersedes the mount read takes its place, so `onFirstAllowed` still runs exactly once.
- Origins are matched with `new URL(pattern)` (protocol `http:`/`https:`, `hostname === PRESTO_HOST`): `*://*/*` fails to parse and drops out, so no regex reaches CodeQL.
- `usePrestoCheck.start()` after `dispose()`: the new test is red on the base copy (`[1, 1]` for `[0, 1]`) and green on the head.
- Mutation check on the composable (five single-line mutations: the fence and dispose guard, the first-read-only fallback, the granted-to-granted no-op, `request()` after dispose, a missing `removeListener`): each turned at least one test red.
- `src/types/components.d.ts` gains the row's line by hand, in the generator's sorted position; the Phase 3 build confirms it rewrites nothing.
- Gate: `bun run lint` 0 (after `biome format` on three new files), `typecheck:all` 0, `bun run test` 0 (798 files, 12880 tests).
