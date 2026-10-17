# Implementations plan index

Format: `- [plan-name](plan-name/plan.md) — status — one-line hook`

- [send-fees-ux](send-fees-ux/plan.md) — planned, awaiting approval — the edit form's sponsor address check and the cap refusal words (#316, #340), #504's wait measured; #503, #504's field and #505 wait on owner asks OA-1 to OA-4
- [test-infra-1](test-infra-1/plan.md) — arc 1 implemented, in review — one source walker and TS tokenizer, one approval-window harness, one wait per test layer, shared builders (#561 #550 #540 #536)
- [service-structure-1](service-structure-1/plan.md) — planned, awaiting approval — five refactors from page 37 in four arcs: the import waiter (#521) now; discovery and session holders (#545), the balance outbox (#547), operation traits and named parameters (#549 #560) when their colliding lanes merge
- [backup-restore-1](backup-restore-1/plan.md) — planned (Codex approve), arc 1 in review (#720) — what a paused reset, the migration barrier and a restore tell a person (P38-04, -05, -09, -10); keep restored imported accounts until their network is added (#663, arc 2); #671 in arc 1
- [dapp-boundary-3](dapp-boundary-3/plan.md) — approved, arc 1 in review — the authorization registry answers only the wallet's own action (P38-06 = A); the see-your-address toggle (P38-08) held for the owner
- [ui-dedupe-1](ui-dedupe-1/plan.md) — approved, A1 merged (#705), arc A2 in review — six page-37 dedupes in six unstacked arcs: the export run object and config restore first, the PXE IndexedDB layer next, then settings, the countdown Close and the two list mirrors as their lanes clear (#541 #518 #519 #520 #517 #548)
- [consent-display-1](consent-display-1/plan.md) — arc 1 in review — discovery admits secure origins only (arc 1); token text cleaned and a dApp token add bound to its window (arc 2, after OA-1); the full origin, "About", the strip caveat and the label mark (arc 3, after fees-display-1)
- [authwit-intent-1](authwit-intent-1/plan.md) — planned (Codex approve), awaiting approval — a dApp's inner-hash authorization intent never names the account that signs it; the Fee Juice selector pin runs only where it can compute
