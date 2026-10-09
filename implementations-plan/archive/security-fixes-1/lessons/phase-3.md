# Phase 3 — #13 fixed selector-binding text, and the arc 1 gate

- `assertSelectorBinding`'s claim type lost `to`, so the one caller that built a literal `{ name, to }` (`tx-request-builder.ts`, the NO_FROM build) now passes the parsed call itself.
- The fast-path fallback test drives the real `ViewExecutor` → `TxRequestBuilder` chain with a mixed payload: a truly public-static prefix (bound and "simulated" by the node mock) and a non-static remainder whose name claims `balance_of_public` over the `transfer` selector. The remainder's refusal reaches `logError("fast-path failed, falling back to standard path", err)` before the standard path rethrows it. The shared executor harness needed `fakeNode()`/`fakePxe()` spread in for the fast path's block-header and fee reads.
- Red on the base: with the base `contract-resolver.ts`, 9 tests fail (the four throw-site rows, the five fast-path assertions including the fallback log test).
- Arc gate, first pass on 88c33fe: `vitest run src/wallet/services/execution/` 995 passed; `bun run lint`, `typecheck:all` exit 0; `bun run test` 10274 passed; `bun run test:all` exit 0; network e2e (11 files, 17 tests, `NULO_E2E_RETRY=0`, prover on) green in one run.

## Post-implementation loop

- Codex round 1 (gpt-6.1-sol, high, read-only; session `01a11c3d-7d68-7820-ac8e-2efd0a9ffabd`; ran on the `alejo-icloud` roster account that `CODEX_ACCOUNT=best` picked): `findings`, one nit. Three "Kept inline … a malformed stored element must throw the same text" comments in `capability-negotiation.ts` justify inline predicates by a case projection now removes. Accepted, deleted.
- Opus review (general-purpose, read-only), run beside round 1: one should-fix, two nits, one process note.
  - Should-fix, accepted: the capability window's "unknown" row stores a request entry as sent, a bare string included (`argsRequestCapabilities` lets `"x"` through by design), so `collectNewGrants` can store `{ capability: "x" }`; the round-1 read refused every later scoped call for that session. Fixed in the read: only a non-object record or a null/undefined capability refuses; a capability of no known type passes untouched. The request-side refusal it also offered was rejected: it changes what a person sees (no window) and contradicts the pinned request tolerance.
  - Nit, accepted: the README's "before any leg of the batch runs" was wrong for a nested `batch` leg; now "of that batch".
  - Nit (same as Codex's), accepted.
  - Process note (phase 3 not ticked yet): the tick waits for the final-head gate.
- Codex round 2 (resumed): `clean`. A non-null primitive capability has no type, so it cannot satisfy a known-type check or replace a transaction or simulation grant; D3 holds.
- Final-head gate on f279e54: `bun run lint`, `typecheck:all` exit 0; `bun run test` 10275 passed; `bun run test:all` every workspace exit 0 (wallet-bridge 616); the same 11 network e2e files green again (17 tests).
- OA-2 after shots were taken on f279e54 with the same throwaway spec, copied in for the run and removed after; the raw block now reads the fixed text in the message, the raw JSON and the stack's first line, and the label and History card are unchanged.
