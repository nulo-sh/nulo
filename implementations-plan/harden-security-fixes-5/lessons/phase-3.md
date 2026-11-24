# Arc 3: Phase 6, and the arc's review

## Phase 6, the calls one batch carries

- `argsBatch` runs before the popup-leg scan, so a batch that carries a `batch` call and a popup method is refused with `InvalidWalletArgumentsError`; the characterization that scanned a nested batch when it ran became the refusal at one and two levels down.
- The limit's constant stays module-local, and the tests pin the literal 1,024, so a changed constant reds them.
- The composition test reads the refusal through `toWalletResponseError`, the mapping `wallet-message.ts` applies to every dApp reply, so it pins what the app receives.
- Each refusal case fails against the base `method-descriptors.ts`; the stock-client control passes on both.
