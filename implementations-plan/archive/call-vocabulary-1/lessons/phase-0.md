# call-vocabulary-1: phase 0 consults

## Codex plan audit, round 1 (gpt-6.1-sol, high, session 01a14b46)

Verdict: **reject**. Seven findings:

1. The class pin is not the window's corroboration: a listed custom token whose `mint_to_private` has the vocabulary's arity but other types reads "Mint (private)" settled and plain in the window. Verified (the record keeps no selector). Disposition: pending the resume (known limit versus a persisted selector).
2. F3 overstated: the name comes from the PXE instance's class artifact (`contract-resolver.ts:42-52`), the recorded class from the node (`tx-request-builder.ts:576-582`). Verified; they differ only after an upgrade, which `assertWireArtifactClassId` refuses. F3 reworded.
3. F2 omits backup import (`transaction/service.ts:627-629`). Verified; F2 narrowed to a fresh send, `transfers` must be non-empty.
4. `claim_and_end_setup` also changes off Fee Juice. Accepted into UI impact, with a Fee Juice success control.
5. I2: a failed token load keeps the plain reading. Accepted: wording, UI impact line, one deferred-load test.
6. Missing controls: wrong arity, missing class, multi-grant alignment, the `icon` prop, two discovered authwits. Accepted.
7. The smoke run needs the armed build. Accepted, plus `audit:vue`.

## Opus Plan leg (opus, Plan agent)

Verdict: **conditional approve**. Accepted: listing a token needs the person's approval; the reading uses today's token list; the input-bound wording; the load switch as OA-3; the createAuthWit card in OA-2; the commitment mint's words as OA-1(b); D5 as OA-4, not a known limit (the conditions are supported and it happens on every in-flight call); the grant `read` expression made exact; `pinnedListedToken` module-private; the regenerated auto-import files and explicit imports in `tx/[id].vue`; the Minted comment in `TransactionIncomingCard.vue`. Not taken: an ask for the #516 tooltip note, which the orchestrator already carries.

## Codex round 1, resume

Sent the revision and the K1 argument for finding 1 (a known limit, not a persisted selector).
Verdict: **conditional approve**; K1 proportionate. Accepted: a selector alone is not parity (ABI roles, value kinds, sender too); F3's two class lookups are independent, not guarded by `assertWireArtifactClassId` (its caller is the wire registration); OA-3 reframed as covered by P40-02 with alternatives offered; the registry row is at builder `:568`. Codex's no-state alternative (movement words only on known standard Token classes) not taken: it drops custom-token coverage, a product change.

## Final fresh Codex pass (gpt-6.1-sol, high, new session 01a14b58)

Verdict: **conditional approve**, two document fixes, both applied: K1 also covers a two-argument transfer that hides its msg_sender (the record drops the flag, `tx-request-builder.ts:211-216` versus `:627-640`); OA-4's option B must record the arity as well as contract and class. Resume 1: D1 still limited K1 to custom tokens; fixed. Resume 2: **approve**, no remaining finding.
