# exec-dapp-1 phase 0: planning consults

## Codex R1 (gpt-6.1-sol, high, read-only; fresh session)

Verdict: conditional approve. Six findings, each checked against the tree:

1. Interval floor insufficient: an interval above the timer range wraps to an immediate fire (`retryUntil` sleeps `interval * 1000`). Accepted: clamp to [1 s, 2 147 483 s] (D2).
2. B's account contract is never initialized by the fixture, and Token calls B's real `verify_private_authwit`, which reads the constructor's signing-key note. Accepted: the wait step's send from B initializes it; B's signing window is driven explicitly (D8).
3. "The same error reaches the dApp" was false: an unclassified error crosses as the envelope's constant (`wallet-sdk/error-envelope.ts:198-214`). Accepted: Outcome and Security corrected; no new error contract.
4. Waiting outside the slot still holds the operation task, the interaction data and one admission place (`wallet-sdk/background.ts:599-606`). Accepted: Architecture lists what is released and what is held; `timeout: 0` held forever is a known limit.
5. Playground buttons need owner sign-off. Rejected: the playground is unshipped test infrastructure driven only by e2e, and the lane brief asks for playground scenarios (D7).
6. Tighten e2e claims: the deterministic red is the unit test; the scenario takes the classic discovery route. Accepted, and the two scenarios merged into one (D8).

## Opus R1 (Plan agent, opus; ran beside Codex R1)

Verdict: conditional approve. Checked against the tree:

1. B (the witness signer) is never initialized; `verify_private_authwit` carries an init check. Accepted with its order: the wait step's send initializes A, A owns the witness, B sends.
2. The floor does not bound the poll: clamp to [1, 60] (the deadline is checked only after each sleep) and read `wait: null` as omitted. Accepted (D2).
3. Discovery decodes every authorization request and signs it as the sender (`decodeAuthwitEffects` ignores `onBehalfOf`); after #1427 the unblocked flow shows a line for the owner's transfer. Verified: pre-attached witnesses render nowhere else in the window, so removing the line is a screen decision. Sent to the owner (OA-1); arc 1 leaves discovery unchanged (D10).
4. Log reach: a failed wait reaches `error`. Accepted as stated; `debug` rejected (D9).
5. What the wait still holds. Accepted (Architecture).
6. A profile switch during the wait makes the task's `fail` throw. Verified as the existing class (a failure during the prove behaves the same); no work.
Facts: F3 line numbers corrected; `buildForDiscovery` and the discoverer's build type forward `scopes`; `BuiltNoFromTx` omits it. Inference I3 qualified (aztec-nr reads scoped capsules internally).

## Codex R2 (final pass, resumed session)

Verdict: approve. D10 and OA-1 stand outside arc 1: the PXE takes the dApp's witness (`getAuthWitness` uses `.find()`), and B's redundant signature has no security or correctness consequence. Accepted: the call line already shows the transfer from A, so OA-1's rationale is qualified and its recommendation moves to B; the e2e continues only on a successful first receipt. Rejected: "`verify_private_authwit` has `#[noinitcheck]`": the vendored `SchnorrAccount.json` lists `abi_private`, `abi_view` only; initialization is required either way.
