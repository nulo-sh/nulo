# Phase 1 — #28 grantPublicAuthwit refused in a batch

- Gate: `bun --bun vitest run src/dapp-grant.characterization.test.ts src/dispatcher.test.ts src/method-descriptors.test.ts` (wallet-bridge) green, 355 tests; `bun run lint` and `bun run typecheck:all` exit 0.
- Red on the base: with the base `method-descriptors.ts` restored, the `grantPublicAuthwit alone` row and the exact-set test fail (2 of 87); with the flag both pass.
- OA-2 before shots were taken first, on the plan commit, through a throwaway network spec that rewrites the claimed call name in the playground page before the SDK encrypts it (`TextEncoder.prototype.encode`), so the wallet sees a raw client's `balance_of_public` call over the transfer's selector. It ran green on the first try under `NULO_E2E_PROVERLESS=1`.
- Found while shooting: a refused call's activity record is titled by the dApp's claimed name ("Balance Of Public" for a transfer selector), on the History card and the detail page. Only a refused call can carry a mismatched name, since a send that runs passed the binding. Out of scope; filed as a follow-up.
