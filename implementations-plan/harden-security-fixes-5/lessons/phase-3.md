# Arc 3: Phase 6, and the arc's review

## Phase 6, the calls one batch carries

- `argsBatch` runs before the popup-leg scan, so a batch that carries a `batch` call and a popup method is refused with `InvalidWalletArgumentsError`, at one level down and at two.
- The limit's constant stays module-local, and the tests pin the literal 1,024, so a changed constant reds them.
- The composition test reads the refusal through `toWalletResponseError`, the mapping `wallet-message.ts` applies to every dApp reply, so it pins what the app receives.
- Each refusal case fails against the base `method-descriptors.ts`; the stock-client control passes on both.

## Review (Codex `gpt-6.1-sol`, high, one pass)

- **Codex r1**: approve with fixes, no code point. Accepted: a lessons clause in the past tense, A3's rationale clause, P4's heading still saying the leg bound waits, the constant's comment restating its name, and the registry-sweep test name, which now reads "the popup-leg refusal", since a `batch` leg is refused too, with another class. Left unchanged, with the reason given back: the Security section's availability line and D6's reason (merged with arcs 1 and 2, neutral, and the section is one the plan standard requires) and the base-commit evidence lines (the standard's own proof).

