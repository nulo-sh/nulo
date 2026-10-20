# Phase 6: P77-11 B, the expiry read of a refused row

- `origin/dev` merged first (`f55b7b4e6`, one commit): no conflict. `archive/index.md` was untouched on this branch then, so its `merge=union` attribute was not exercised.
- No new stored state: `expiry` is recorded at `submitting` and carried into the failed row (`failedFromSubmitting`), so a refused row already holds it. `refusedAnswer` hands it to `expiryAnswer`, whose parameter became the structural `{ txHash, url, expiry }`.
- Mutations checked: dropping the `refusedAnswer` branch turns both new send-check cases and the composition case red; reverting the `refused` → `expired` move turns the move matrix and the absent case red.
- Attempt 1 of the composition case timed out: its hash `0x3e…` is above the field modulus, so `TxHash.fromString` threw inside the receipt read and no read happened. Hashes in these harnesses stay below `0x30…`.
- Gate F: lint 0, typecheck:all 0, test 0 (14676 passed). Composition 3/3, three runs.
- Arc gate: `audit:vue` 0; `test:all` failed once: `storage-facade-ban.test.ts`, a static scan, timed out at 5 s (6.4 s) at load average 206; rerun green with `check:plans` (no change between runs).

## Code review, round 3 (2026-10-20)

Codex, same session, resumed on `63cd6a8ba`: `approve`, no code finding ("The expiry handoff preserves `{ check: "refused" }` for CAS; the move requires a recorded expiry and rejects an inclusion. Restarted rows wait without dialing until expiry."). One low, adopted: OA-3's text still read as current behaviour; it now says what A did before the answer.

## Code review, round 4 (2026-10-20)

Codex, resumed on the asks fix: `approve`, "No regressions or new findings." The loop converged.
