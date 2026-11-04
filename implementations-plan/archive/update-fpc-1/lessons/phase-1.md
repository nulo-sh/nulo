# update-fpc-1: phase 1 (the allowance and its tests)

- 2026-11-04 first gate: `bun run lint` exit 1 (a formatter line break in the new test, fixed with `biome check --write`); `bun run typecheck:all` exit 2: `tsc -p tsconfig.scripts.json` checks what `scripts/e2e/update-rows.test.ts` imports, and the new imports of `fixtures/update/preferences.ts` and `helpers/fpc-seeds.ts` pulled page-bound e2e code (`chrome.storage.local.get(null)`, vitest `inject` keys) under `chrome-types`. Fix (D4): the pins move to the pure `helpers/protocol-fpc-pins.ts`, `allowedPicks` to the pure `fixtures/update/release-reads.ts`.
- Gate rerun, all green: `bun run lint` 0; `bun run typecheck:all` 0; `bun --bun vitest run scripts/e2e/update-rows.test.ts scripts/e2e/update-recording.test.ts` 23 passed; `bun run test` 0 (991 files, 17363 tests passed); `bun run test:all` 0.
- Red first: with the base copies of `verify.ts`, `preferences.ts` and `fpc-seeds.ts`, the three new tests fail (the excuse test on its assertion: two lost lines where one was expected).

# Review loop (phase 2 step 1)

- Codex diff review r1 (gpt-6.1-sol, high, read-only) over `040334f53...91fecb329`: clean, no finding.
- Opus diff review (beside r1): changes required, one finding, verified and accepted. The first `updateProblems` call runs while the wallet is still locked, and `getFpcs(chainId)` needs a session (`captureExecutionFence` throws `WalletLockedError`, `src/wallet/services/profile/service.ts:564-566`), so excusing the sponsor there would hide a loss the product cannot have made; with its picks then never forgotten, `allowedPicks` would accept them too. Fix: only the final call passes `unofferedSponsors`. Optional doc fix (the field holds ids) accepted.
- Live Chrome at `91fecb329` before the fix: passed, 16:27:43-16:30:42 UTC, test 99.7 s, vitest 166.0 s. Superseded by the runs at `C`.
