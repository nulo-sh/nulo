# Phase 1: arc 1

## Implementation

- T1-T8 red on the base at their failure-mode assertions, controls green; green after D2-D8, one commit per issue. Gate green: lint, typecheck:all, the vitest list (895 tests), wallet-core (333), test:all (149 s).
- Two test-side slips: T2 asserted `{ block: undefined }` against a row whose key is absent after the fix (asserting the pair instead); a second `vi.spyOn` on the same method replaced the first, so the seeder's fault helper became one spy armed per use.

## Phase 2

- Network files at retry 0: Chrome 195 s, Firefox 384 s. Smoke files at retry 0 on the armed build: Chrome 188 s, Firefox 281 s.

## Fix loop, round 1

- **Codex, gpt-6.1-sol, high, read-only** (session `01a19e82-d797-7b13-a78a-c77db0d68e09`): conditional approve. (1) The tombstone test cannot show recovery, since its tombstone blocks every later commit: added a control with an unrelated tombstone (one failed commit persists nothing; after the backoff the next pass persists once and the tombstone stays). (2) The config log literal had changed outside D9: restored, the error kept under `{ error }`.
- **Opus 5.5, `general-purpose`**: conditional approve, no blocker; every D traced through callers and locks. Folded: the `runtime.ts` comment that said `rehydrate()` "has already restored" the lines (not so on the alarm-shim path); `applyRetentionPolicy()` swallows a failed import, the entry point's own rule, so a malformed saved run cannot reject the config leg; the tombstone test asserts its fault was consumed. Kept: a `verify-unsupported` envelope logs `discarded` once per refresh (at most daily, the outcome only).
