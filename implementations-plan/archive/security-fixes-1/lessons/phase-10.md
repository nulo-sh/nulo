# Phase 10 — #35 userinfo refused at the last gate, and the arc 3 gate

- `rpcTransportVerdict` judges userinfo first (`{ allowed: false, refusal: "userinfo" }`); `RpcUrlSchema` lost its inline check and keeps its message; the adapter maps the refusal to `"userinfo is not permitted in an RPC URL"` and an unparseable string to the fixed `"not a valid URL"`. Its other two reasons still name the host or scheme, never the URL.
- The adapter table's whitespace rows hold a Unicode space (the schema trims it, the adapter does not), so a byte-literal replace missed them; the rows were rewritten by pattern. New rows: `https://user:hunter2@rpc.example.com:65536` (unparseable with credentials) → `not a valid URL`; a test that no refusal reason contains its input URL. Exact constant reasons are the proof that no credential reaches one.
- Base proof: with 8917dd1's `rpc-url.ts` and adapter, the three new verdict rows and the ten flipped or new adapter rows fail.

## Post-implementation loop

- Codex round 1 (gpt-6.1-sol, high, read-only; session `01a11db6-b767-7d53-8be0-4e30c366e9b6`; the script resolved the alejo-icloud account): `findings`. Should-fix accepted (a rejected post-write liveness read stranded the row, and import's catch then dropped the key): `assertStillLive` in 75ea79e. Three comment nits accepted.
- Opus review beside round 1: mergeable, two nits, both accepted in 572ddc2 (`sponsorRow` reads through `getFpcImpl`; one pin retitled). No dedicated test for the wiring: the composition harness's fakes return the same row from both reads, and making `getFpc` return the cold-cache shape there would also move `feeSpender`'s sequencing keys.
- Codex round 2 (resumed): `findings`, one test nit: no test told the new `sponsorRow` wiring from the old. Accepted: a dedicated composition test swaps `getFpc` for the cold-cache shape in that test only (a global fake change would move `feeSpender`'s sequencing keys for the whole file); red on the old wiring with "expected undefined to be defined".
- Arc gate on 6563c39 (before the loop's fixes): network `fee-methods`, `send-amount-exact`, `transfers`, `tx-sendTx-sponsoredFpc`, `account-balance-orphans`, `incoming-transfers`, `incoming-public-transfers`, `networks`: 8 files / 20 tests green, prover on, `NULO_E2E_RETRY=0`; smoke (armed build) 5 files / 28 tests green.
- Codex round 3 (resumed): `findings`, one non-material test nit (the new test's `await p` would pass on a caught send failure); applied, the test asserts the returned hash. The loop stops at its cap with nothing material open.
