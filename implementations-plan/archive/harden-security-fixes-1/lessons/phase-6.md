# Phase 6: the wallet's class copy first (C6), and PR B's review loop

- `registerContract` resolves `instance.currentContractClassId`: every caller with a provided artifact already checks that artifact against that class.
- The compiled-in bundle (12 class ids computed once, shared with note schemas) now loads at the first registration with an artifact in a worker's life, where before it loaded only when the store missed.

## Review loop (PR B)

- Round 1, Codex (gpt-6.1-sol, high, session 01a14562): approve, 1 minor + 2 nits, all applied — origin-precedence tests (k6 opaque origin with a matching URL refused; k7 URL-only sender judged by its URL), stale resolution-order text, a narrating comment.
- Round 1, Opus (alongside): C4/C6 correct. Accepted: (1) a further title site: the call names a settled transaction records (`tx-request-builder.ts`, an encoded call and a NO_FROM call), which the settled Activity title (`getTxTitle`) reads, now pass through `wireTitle` too (`wireTitle(name) ?? selector`); wallet-built `call` actions untouched, exact-name consumers (`STANDARD_MINTS`, `FEE_METHODS`, the transfer prefix) unchanged for conforming names; (2) `ensureKnown()` before `withPxeWrite` — applied, then reverted in round 2 (below); (3) a `content.test.ts` driving the real content script (red with either hook removed); (5)/(6) wording. Not changed: (4) the `"unknown"` clause stays as documentation.
- Transport tests on a red run bled an earlier test's async key-exchange response into the next count; `keyExchangeResponses(sessionId)` scopes it.
- Type-roles inventory: editing `operation-planner.ts` reds `identifier sites` on its digest; re-attest (the send-operation producer set is unchanged) and re-pin.
- Round 2, Codex (resume): conditional approve, 1 material: the pre-lock `ensureKnown()` put an await before `withPxeWrite`, which captures the chain's purge epoch at its entry. Resolved by removing the hoist rather than adding a second fence: the one-time bundle load runs inside the write again, as `getContractArtifact` already loads it under the read lock. Lesson: in `PxeService`, nothing is awaited between a public method's entry and `withPxeWrite`/`withPxeRead`.
- Round 3, Codex (resume): conditional approve — the runtime fix is correct; one commit body was reworded to state the invariant (unpushed HEAD amended). Loop closed at its three-round limit with every condition applied.
