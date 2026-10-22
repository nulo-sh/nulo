# account-read-flake-1 phase 1: the order proof

BASE: `c49430a6d` (`origin/dev`, fpc-create-flake-1 landed), merged at `206c421d5`. Nothing under `account/` changed since the plan's base. The edit: `016e5e407`.

| Step | Copy and change | Result |
|---|---|---|
| 2 | BASE, the sign-delay spy | `Error: Test timed out in 5000ms.` (5020 ms) |
| 4 | the edit, the same spy | passed |
| 5 | the edit, the no-lock control (`tupleLocks.withLock` spied to call `fn`) | red in 22 ms, `AssertionError: expected +0 to be 1` |
| 6 | the edit, `service.test.ts` 100 times at retry 0, 4 at a time, beside the running lanes | `100 ok`, 22:28:51 to 22:33:48 UTC, load1 64 at the start and 123 at the end |

Each scratch edit was reverted with `git checkout --`; `git status` was clean after each.

Gate on `016e5e407` plus the merge: the `account` directory at retry 0, 21 files and 245 tests passed (`service.test.ts` at 62, as at BASE); `lint`, `typecheck:all`, `lint:actions` and `test:all` exit 0 (`test:all`: extension 15120 passed, 1 expected fail, 5 skipped, 7 todo; aztec-runtime 419 passed, 2 skipped; wallet-bridge 805 passed); no scratch spy left (`grep -c` prints 0); only `service.test.ts` and plan files differ from `origin/dev`.

## Review loop

- **Review r1, Codex** (`gpt-6.1-sol`, high, fresh session, read-only): `clean`. Removing editor locking fails the synchronous queue check; scheduling cannot cause a false failure within the timeout; the hoisted helper keeps the three purge cases' behaviour; both comments explain non-obvious constraints.
- **Review r1, Opus** (`general-purpose`, opus): `findings: 2`, no bugs. It ran two mutants on `service.ts` and restored it: the read started before `withLock` (hoist), and a lock that covers only the read (narrow). Both pass the queue check; the outcome assertions caught each 5 of 5 by race (`expected 'A' to be 'B'`). Taken: the case's comment no longer claims read order, only queuing; the helper's TSDoc names an exact `get(rowKey)`. Commit `a5f8ba20f`; the file 62 of 62.
- **Review r2, Codex** (resumed): `clean`, both fixes verified, no regression. Converged.
