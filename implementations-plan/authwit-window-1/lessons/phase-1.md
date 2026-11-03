# authwit-window-1: phase 1 (implementation)

Every meaningful attempt of the arc, in order. Times are Chrome unless noted; e2e runs are `NULO_E2E_PROVERLESS=1`.

## Base

- `tx-sendTx-fields` unchanged at base: Chrome 34.9 s, Firefox 44.5 s (test time).
- The playground's on-behalf send without its witness and D11's assertions, on base sources: red at the refusal wait (no refusal block within 180 s; the window shows the fee failure). D10's unit and component tests: each red on base (commit `test(execution): …`).

## Implementation

- Routing check, first form: `sendScopes(AztecAddress.fromStringUnsafe(accountAddress), …).length > 1` in the estimator broke 81 executor tests, whose fakes use addresses like `0xacct`. Replaced by a string comparison of the op's scopes against its sender, lower-cased: a scope spelling the sender differently reads as another account, which only routes to classic, so the check fails safe.
- Test fakes that build a discovery context without `scopes` or `txRequest.authWitnesses` (`authwit-discoverer.real.test.ts`) gained both: production always sets them (`DiscoverContext.scopes` is required).
- The NO_FROM three-site test pinned the stub to the account alone; it now pins the account and every scope account, as D2 decides.
- After: `tx-sendTx-fields` green on Chrome, 45.6 s with the capture step (base 34.9 s): one more estimate for the refused send, and the captures.
- Captures of renderings B and C: SendTxSummary edited uncommitted, shots taken before the assertions, then restored.
- Chrome gate (5 files, 13 tests) green at retry 0: 427.6 s; `tx-sendTx-fields` 36.1 s.

## Review round 1

- Codex (gpt-6.1-sol, high, session 01a1a2e3): approve, two nits (a doc comment displaced onto the new method; the embedded test should assert the exact validated options). Both fixed.
- Opus 5.5 (general-purpose): conditional approve. (1) Reading the app-paid route's simulation brings the decoder's registry refusal there, a behaviour change outside § UI impact: surfaced as OA-6 with a pinning test. (2) Same comment nit. (3) The validated pipeline's new probe slot would reach the fold strategies if an app-paid op were estimated with `fj`/`fpc` settings (unreachable today; the strategy is picked by the settings' fee kind): split into `observer` (L10). (4) A classic confirm test for a hash listed for another account, added; it is red on base, where keys were hashes alone.
- Codex, resumed on (1) and (3): agree with changes. OA-6 is a merge requirement, and its premise was corrected: an owned account's witness for a registry change can exist from outside this wallet, so the affected case is not outside approvers only. The observer test spans `embedded`, `fj` and `fpc` settings and asserts `probe` stays unset.

## Final gates

- Firefox gate on the round-1 code: 12 of 13 green; `tx-sendTx-fields` read the new line as "Already authorized by ." because `AddressDisplay` paints the name only after its contact lookup returns. Fixed in the spec, which waits for `[data-address-shows="name"]` as `type-roles-windows` does.
- `audit:vue` then failed on the type-roles inventory: the details regrouping changed three address sites' branch keys, and the window added two `AddressDisplay` sites. The inventory gained them, and `type-roles-windows` gained a sweep of the consumed-authorization window at rest and with details open, since its last test fails on a network-owned site no state read. The owner setup moved into `readyAuthwitOwner`, shared with `tx-sendTx-fields`.
- `test:all` twice red on 5 s timeouts in files this arc does not touch (`copy-dash-ban`, `log-payload-ban`, `price/convert`, then a profile integration test), each at a host load average of 140 to 214 from other leads' runs; each file passed alone, and all passed in `audit:vue` minutes before.
- Codex round 2 (verify, same session): approve. Round 3 (verify the gate commit, then the whole arc): approve, one nit (the observer test's header), fixed.
- Process slip: the round-1 and round-2 implementation prompts paraphrased the README's two review rules (scope and comments) instead of quoting them. Round 3 quoted both verbatim over the whole arc diff, with the adversarial ask; its verdict is the one this arc relies on.
- `test:all` green at retry 0 at a load average near 50 (990 extension test files passed, 3 skipped).
- Final e2e gate (5 files, 14 tests, retry 0): Chrome 561.2 s, Firefox 569.0 s. `tx-sendTx-fields` 44.2 s on both (base: Chrome 34.9 s, Firefox 44.5 s); the new `type-roles-windows` sweep 43.1 s Chrome, 41.9 s Firefox; that file 211.0 s Chrome, 227.7 s Firefox.
