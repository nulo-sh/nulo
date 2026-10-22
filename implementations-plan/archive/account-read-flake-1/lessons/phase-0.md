# account-read-flake-1 phase 0: planning

## Probes (applied in place, run, reverted; `git status` clean after each)

Host load1 about 90 to 100 throughout. `bun --bun vitest run src/wallet/services/account/service.test.ts --retry=0` from `apps/extension`; `-t "cannot revert a concurrent visibility"` for the single case.

The sign-delay spy, installed directly before `changeAccountName` (the prototypes left it unrestored only where the run hangs anyway):

```ts
const sign = crypto.subtle.sign.bind(crypto.subtle)
const spy = vi.spyOn(crypto.subtle, "sign").mockImplementation(async (...args: Parameters<typeof sign>) => {
	for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0))
	return sign(...args)
})
```

The no-lock mutation, `account/service.ts` `patchAccountField`: `return this.tupleLocks.withLock(accountRowId(...), async () => {...})` becomes `return (async () => {...})()`.

| Copy | Change | Result |
|---|---|---|
| base | none, whole file | 62 passed, 15.5 s wall |
| base | spy | `Error: Test timed out in 5000ms.` |
| prototype fix (reached signal + `waiting(rowId) === 1`) | none, whole file | 62 passed |
| prototype fix | spy | passed |
| prototype fix | mutation | red in 21 ms, `AssertionError: expected +0 to be 1` |
| base | mutation | red 5 of 5 (by the outcome assertion) |
| prototype fix | the same control from the test file: the instance's `tupleLocks.withLock` spied to call `fn` directly | red in 24 ms, `expected +0 to be 1` |
| reached signal, no second wait, no queue check | mutation | red 5 of 5: vis's read needs one sign, the name change's write two crypto calls, so vis read first each time. A race the mutant usually loses, not an order. |

The purge pins (`:927-955`, the `purges wait for a rename` describe, three cases), each mode run 3 times with `-t "purges wait for a rename"`:

| Change | Result |
|---|---|
| the no-lock control (every `tupleLocks.withLock` calls `fn` directly), assertions as on base | 3 passed, 3 of 3 runs |
| assertions filter by the `nulo:core:accounts@` / `nulo:core:imported-account-keys@` prefixes, no control | 3 passed, 3 of 3 runs |
| prefixes plus the control | red 3 of 3 runs (2, 3 and 3 cases red), `expected [ Array(1) ] to deeply equal []` |

The prototype used an inline `deferred` pair; the plan reuses `parkRowRead` instead (D1). Its patch is scratch in the lane's cache directory, never committed.

## Consults

- **Codex r1** (`gpt-6.1-sol`, high, read-only, fresh session): `conditional approve`. A: reuse `parkRowRead`; parking after the read keeps the stale snapshot. B: the second timer gives an unserialised visibility change a chance to overtake, and guarantees neither progress nor overtaking; a wrapper-only absence check cannot prove blocking without a progress bound, and waiting for the read deadlocks the correct product; reading the existing private lock is a proportionate pin, a production observation API would be excessive. C: recon's table holds for these fixtures. D: the spy delays the sign's invocation, not a native completion, but the consumer sees the same condition; the no-lock mutation suffices for the stated regression, and both outcome assertions must stay. Findings, all taken: (1, medium) step 5 edited `account/service.ts`, which the lane may not touch: the control now spies the instance's `tupleLocks.withLock` from the test file (verified red in 24 ms); (2, low) step 2 declared `spy` twice: the step now quotes the exact lines; (3, low) the gate's count is the merged BASE's, working directories are explicit, and `bun run lint:actions` joins the gate.

- **Opus Plan leg** (opus, beside Codex r1): `conditional approve`. A, B, D upheld: the second timer proves nothing on a correct product and only gives a no-lock mutant a head start; no wrapper-only proof is deterministic; two non-private options considered and rejected (a synchronous check that `rowKeys` is not called again, which misses a mutant that awaits first; a prototype spy on `KeyedLock.withLock`, which sees the call, not the queue). Findings: (1, high) the purge pins cannot catch their regression since account rows are sealed: verified (table above), recorded as D6 and filed, not folded (scope); (2, medium) the queue assertion rests on the editor locking before its first await: stated in F3 and in the case's comment; (3, low) the outcome assertions catch a stale write only when it lands last: Security reworded; (4, low) the file's inline cast shape instead of a `KeyedLock` import: taken; (5, low) the helper's TSDoc says "keyed read" and there are two call sites, not three: fixed; (6, low) recon's reason for `:96`/`:108` was incomplete: fixed; (7, low) step 1 wording, the soak's red handling, a grep that a comment could satisfy, `run-codex.sh` takes a prompt file: all fixed.
- **Codex r2** (resumed): `approve`. E: file D6 separately (a demonstrated coverage defect, outside the lane's authorised scope); its Possible fix is the prefix filter plus an observed lock request, since the purges reach the lock asynchronously: filed as #1091 with that text. F: round-1 fixes verified, no regression. One low, taken: the `/goal` seed demanded `100 ok` against step 6's red rule, and now matches the gate.
