# Phase 6: P77-11 B, the expiry read of a refused row

- `origin/dev` merged first (`f55b7b4e6`, one commit): no conflict. `archive/index.md` was untouched on this branch then, so its `merge=union` attribute was not exercised.
- No new stored state: `expiry` is recorded at `submitting` and carried into the failed row (`failedFromSubmitting`), so a refused row already holds it. `refusedAnswer` hands it to `expiryAnswer`, whose parameter became the structural `{ txHash, url, expiry }`.
- Mutations checked: dropping the `refusedAnswer` branch turns both new send-check cases and the composition case red; reverting the `refused` → `expired` move turns the move matrix and the absent case red.
- Attempt 1 of the composition case timed out: its hash `0x3e…` is above the field modulus, so `TxHash.fromString` threw inside the receipt read and no read happened. Hashes in these harnesses stay below `0x30…`.
- Gate F: lint 0, typecheck:all 0, test 0 (14676 passed). Composition 3/3, three runs.
