# quality-profile-1: phase 0 (planning) log

## Recon

- Two explorers on sonnet: one reuse sweep over `profile/service.ts` (ten capabilities, each with its search trail), one mapper over `pxe/service.ts`. Findings in [recon.md](../recon.md).
- `bun run audit:dup` at the base: production 183 clones / 8,841 lines; `profile/service.ts` internal 4 clones / 46 lines.

## Consults

### Codex round 1 (gpt-6.1-sol, high, read-only; plan A + outline B)

Verdict: conditional approve (preserve cleanup and comparison order, clarify D7's domain, make the smoke gates executable, settle D9 as option b).

- Fact 2 counted the final state: eleven framed sites today, ten after the verify merge. Accepted.
- I1 (wipe order unobservable) dropped: unlocks, finalize, password change and backup transfer wipe the slots before their other scratch today; each keeps that scratch in an outer `try/finally` around the frame, so the order holds without an argument. Accepted.
- D7 `sameUnlockFields`: equal at the two sites only for classified rows, and the passkey chain's order includes `pxeGeneration`; decline it or keep the chains. Accepted as a decline (D7), with the closed `profile-service-dedup` plan's same call as precedent.
- Smoke gates need the armed build per browser (`global-setup-smoke.ts:20`) and the two run flags. Accepted. Arc 3 named no network file. Accepted.
- Phase 3's pin omits the passhash and the frame's await-then-wipe; add the passhash and one codec unit test with a deferred body. Accepted.
- "Asks: none" contradicted the pending D9. Accepted: D9 settled before approval.
- D9: (b), high confidence: synchronous methods can keep the timings but not hold the whole invariant while the service owns the effects between them; a callback erase API is a new coordination contract for one caller.

### Opus round 1 (Plan lens, opus; plan A + outline B)

Verdict: conditional approve (fix the seam, widen the pin, add a smoke file, D9 as b).

- `countOpens` (`tests/helpers/profile-chaos-in-process.ts:757-774`) replaces `profiles.openSlots`; after the move it would wrap nothing, its count would stay 0 and `editRowDuringUnlock`'s `opens.count === 0` would pass vacuously. Verified in the file. Accepted: repoint to the codec and throw on a missing method.
- The Phase 3 pin covered five of ten sites and no passhash. Accepted: one table-driven test over nine paths with passhashes, moved to the start of arc 1 so it also guards the move.
- The smoke set missed `exportPlain`, `exportImportedKeysDek` and the passkey export check. Accepted: `account-import-export`.
- `entropyDerivesMaster` argument order and no added wipe. Accepted.
- Facts: 24 throws + 2 returns of the literal; `seal` has two callers. Accepted.
- Ask: say why the plan departs from `profile-service-dedup`. Accepted (Trade-offs).
- `sameUnlockFields` domain and the unpinned password type refusal: moot once D7 declined it.
- D9: (b). The `incarnation-fence.test.ts:302-310` record write is a state no public transition reaches, so a class would need a test-only mutator; `assertGenerationCurrent` already has one home, so about 60 lines would move, not 200.

### Codex round 2 (resumed, verification)

Verdict: conditional approve (an executable literal-count command; the network gate at retry 0). Both accepted. It verified the nine pin rows reach a post-open throw at the base, found no sixth seam, and accepted D12.

### Codex final pass (fresh session)

Verdict: conditional approve (reconcile #1446's disposition with the close-out standard; state the stack's PR bases). Both accepted: #1446 closes before building as a `known-limit` with its reopening condition, not through a PR's `Closes`; arc 1 targets `dev`, arc 2 arc 1's branch, the close-out arc 2's.

### Codex final pass, resumed

Verdict: approve; no new material findings.
