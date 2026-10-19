# test-infra-1: phase 10 (the scenario suite on the real repository)

## Shape

- One `FakeBrowserApi` backs one real `IncomingTransferRepository` for the suite; `@webext-core/fake-browser` keeps one store per process, so `beforeEach` resets it and `bootService` no longer does (its `keepStorage` went).
- Seeds and reads go through the repository's own methods. `seedTrustRow` writes through `setArrivalFloor` so a seed's `updatedAt` is stored as given (`setTrust` stamps `Date.now()`). The repository has no arrival listing and no trust delete: `arrivalRowsAt(scopes)` over `BOOTED_SCOPES` stands in for the first, and the one test that deleted a trust row never seeds it.
- Parks and spies sit on the service's repository instance; `instrumentReceipt` and `bootClear` bind each captured method to it, since the real methods read `this`.
- 7406 → 7342 lines, 339 = 339 titles. `repository.test.ts` and `service.composition.test.ts` unchanged and green. The fake's accepted `clearChain` complexity record left the baseline with it.

## Changed assertions (30; the PR body lists each with its old and new lines)

| class | count | why |
|---|---|---|
| `updatedAt` | 0 | no test reads the stamp of a row the service wrote |
| call order | 23 | real `setTrust` reads through `this.getTrust`, so the fake's `trustRead` is `getTrust#2` in the note and public matrices, and the floor's read is `getTrust` #3; four seam pins spy on the repository's methods, since there is no map to spy on |
| which read | 6 | arrival `size` / `keys()` reads became `getArrivalRow` over the seeded or booted scopes, plus no `setArrivalRow` call; one event-time read starts in the callback and is awaited after (the fake store snapshots at call time) |
| decode | 1 | stored rows are JSON, so an unset `blockTimestamp` is absent on read; the codec reads absent and `undefined` alike |
| clear scope | 0 | two arranges: `clearProfile("p1")` for the hand clears, and the never-seeded trust row |

No product bug surfaced.

## Mutations

- `clearChain` matching rows by value: red in two scope tests.
- `clearScope` skipping the cursor table: red in "clearChain wipes the public cursor + outbox rows too".
- `setTrust` dropping the stored `arrivalFloor`: green across all 339. No scenario writes trust over a floored row and reads the floor back; `repository.test.ts`'s "a trust state change keeps the stored arrival floor and its pending mark" covers it at the repository layer, and a new scenario was outside the phase's rules.
