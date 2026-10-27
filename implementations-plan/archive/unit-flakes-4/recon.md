# unit-flakes-4: recon

Base: `dev` at `78f5f9171`. One Explore sweep (sonnet) plus the planner's own reads, measurements and reproductions. Scratch scripts lived outside the repo and are not committed.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| A fake clock for the restore deadline | `vi.useFakeTimers({ toFake: [...] })` with `Date` in `src/composables/useArrivals.test.ts:187` and `useFullBackupImport.test.ts:1373`; the same service test already fakes timers at `service.test.ts:342` with an `afterEach(vi.useRealTimers)` scoped to its own describe (`:257-260`) | reuse-as-is (the restore describe at `:454` has no `afterEach`: add one) |
| An injectable clock in `AccountStateService` | none: `restore` reads `Date.now()` at `service.ts:332,334`; other services inject `now` (`legal/service.ts:41`, `operation-journal/reaper.ts:105`) | not taken: a production parameter for one test (D3) |
| A bounded scan input | none: `sourceFiles` (`scripts/type-roles/source-scan.ts:106`) walks the roots; `callsTo` (`source-code.ts:191`) parses every file it is given (SFC, postcss, one TS source file per script block and template fragment). Searched `source-scan.ts`, `source-code.ts` and every `*.test.ts` importing them for a text pre-check | build new, one line per guard |
| A parsed corpus shared across test files | none: vitest 4.1.12 isolates each file's modules (`apps/extension/vitest.config.ts` sets no `isolate`/`pool`); the only memo is a per-file `??=` (`css-v-bind-ban.test.ts:49`, `copy-dash-ban`, `red-text-ban`, `type-role-ban`). No unit `globalSetup` exists | not taken (D1) |
| A raised budget for a whole-tree scan | `scripts/type-roles/inventory.test.ts:155,246`: `beforeAll(…, 120_000)`; trailing timeouts across the suite (`full-backup-keys.test.ts`, `presto-policy.test.ts`) | not taken (D1) |
| The plans gate's temp repos | `scripts/ci-cd/plans/fixture-repo.ts` (`makeRepo`, `tempDir`, `git`), consumed by five test files; `permalinks.test.ts:110-132` builds the stacked origin and the shallow clone | reuse-as-is |
| A check that the gate's fetch stays unfiltered | none: `permalinks.ts:117-140` states it in a comment only; no test asserts it. Searched `scripts/ci-cd/**` for `--filter`, `promisor`, `allowFilter`, `--unshallow` | build new, one assertion |

## Measurements (this host, 188 cores, load 56 to 95)

- `amount.callers.test.ts` › "every known-token capped amount reads compact": 1068 to 1387 ms. It parses 824 files; 15 spell `balanceFormatted`.
- `css-v-bind-ban.test.ts` › "no component runs useCssVars": 1068 to 1246 ms. It parses 834 files; 11 spell `useCssVars` or `v-bind`.
- A scratch bench with a substring pre-check: 1180 → 115 ms and 909 → 34 ms, identical findings. Reading all 834 files alone costs 24 ms.
- Vue's `descriptor.cssVars` comes only from `/v-bind\s*\(/g` over style content (`@vue/compiler-sfc` `parseCssVars`).
- #1112's failing run took 5933 and 5030 ms at load 250 to 320, about 4.5× the times above.
- The same cost class, not named by #1112: `stored-shapes.scan.test.ts` (three tests, 1479 to 1690 ms), `useLogFilters.scan.test.ts` (1731), `log-payload-ban.test.ts` (1645), `copy-dash-ban.test.ts` (1481), `type-role-ban.test.ts` (1463), `icon-names.test.ts` (632); and two non-scan cases, `useFullBackupImport.test.ts` "a body nested past the engine's stack" (1732) and `useRestoreAgain.test.ts` (1498).

## Reproductions

- **#1226, red**: a 20 ms real delay injected into `ensureInitialized` (between the deadline's start and the first launch) gives the issue's exact error, `expected "vi.fn()" to be called 1 times, but got 0 times`. **Green**: with only `Date` faked and the first registration advancing it 30 ms, the same delay passes, 36/36 in the file.
- **#1241**: in `oven/bun:1.4.2-alpine` with git 2.56.0 from Alpine edge, the depth-1 case on the pre-#1247 `permalinks.ts` (`bf7932c8a^`) fails 30/30 with `cannot fetch dev: fatal: index-pack failed`; at HEAD it passes 30/30. Host git is 2.43.0, which lacks the failing index-pack step.
- **The promisor mark**: an unshallowing fetch with `--filter=tree:0` sets `remote.origin.promisor=true` in the clone on git 2.43.0 and 2.56.0, whether or not the origin serves filters; an unfiltered one leaves it unset.

## Issue claims checked

- #1112: holds (both tests parse the whole tree in one test). Its options list misses the bounded input.
- #1226: holds (`service.ts:328-334`, reproduced).
- #1241: "a git failure inside the test's own temporary repositories, not a property of the gate" does not hold. The test runs the gate's own fetch (`prepareDev`), which then passed `--filter=tree:0`. Both recorded hits (runs 40498659303 at 11:46Z and 40508151494 at 12:59Z on 2026-10-27) predate #1247's merge (14:09Z). The 26 Quality runs since: 19 green, 6 cancelled, 1 red on an unrelated case (`workflow references in code and config`).

## Open work

Closed known limits searched (`timeout`, `scan`, `flake`, `deadline`, `permalink`, `index-pack`): none covers these tests. Open `flake` issues nearby: #1122 (a composition case at 5 s on CI) and #1198 (a fixed 10 ms wait), neither in this lane.
