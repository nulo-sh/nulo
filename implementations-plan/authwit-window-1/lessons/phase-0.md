# authwit-window-1: phase 0 (planning consults)

Every consult of the planning panel, in order. Transcripts stay local; verdicts and findings are in plan.md § Audit verdicts.

## Consult 1: Codex plan audit (gpt-6.1-sol, high, session 01a1a2b6)

Verdict: reject, three blocking findings, three should-fix. Each was checked against the tree before acting.
- Embedded fee payments skip discovery at estimate and confirm (`dapp-send-executor.ts:548-564`, `:1189-1201`) and the card hides their authorizations (`OperationCard.vue:239`): demonstrated by trace. Accepted.
- Stubbing another scope account in the folded first run lets a contract that checks that account without emitting a request reach an approvable estimate (`fee-juice-strategy.ts:50`, `fpc-strategy.ts:182` skip the validated run when nothing decoded): demonstrated by trace; aztec-nr's `assert_inner_hash_valid_authwit` emits nothing. Accepted; fixed by routing such sends off the fold rather than stubbing there.
- One hash set lets a hash listed as another account's authorization be signed by the sender at confirm: demonstrated by the proposed data flow. Accepted; the listed set keys on account and hash.
- Should-fix: the line's wording overstates what a carried witness proves; `AddressDisplay` shows a contact's name first; tests for the new boundaries and the build gate. All accepted (wording and name go to the owner).

## Consult 2: Opus 5.5 plan audit (Plan agent)

Verdict: conditional approve. Checked against the tree:
- Stubbing an approved account whose contract instance the PXE never registered throws (`packages/aztec-runtime/src/pxe/service.ts:535-537`); the scope registrar registers keys only (`pxe/scope-registrar.ts:19-22`). Demonstrated by trace. Accepted: the build registers each scope account's contract first (D2, L9).
- The folded first run sizes the fee: same finding as Codex's; resolved by routing sends with another scope account off the fold rather than Opus's rebuild trigger (L4).
- History reads the refused request as "Not allowed…" instead of "You rejected", and the dApp text is a public contract: both to the owner as OA-5.
- App-paid route: Opus proposed a known limit; Codex's blocking view taken for the listing (the validated run holds the effects), Opus's kept for the refusal (I4).
- The missing-snapshot test, `refusalKind` order, the witness-order and misattribution notes (I5): accepted.

## Consult 3: final fresh Codex pass (gpt-6.1-sol, high, session 01a1a2c4)

Verdict: conditional approve. D6 lacked the `service.ts` adapter that drops the probe today (`service.ts:515-516`, demonstrated); the NO_FROM registration had no test; recon overstated what a standard send's reuse key binds. All three accepted and applied. Resumed: **approve**, no regression.
