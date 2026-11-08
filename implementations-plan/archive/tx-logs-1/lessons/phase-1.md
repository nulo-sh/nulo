# Phase 1: the id and the envelope

- `scripts/type-roles/identifier-sites.expected.json` pins a whitespace-collapsed digest of `packages/wallet-bridge/src/dispatcher.ts` and quotes its generic-path `executeOperations` line as evidence. Any dispatcher edit reds `inventory.test.ts` with "re-attest, then re-pin". Re-attested: the window producers' operations are unchanged, and only hook fields were added. Re-pinned the digest from the test's own output, since a plain `sha256sum` differs because of the collapse, and the evidence line now passes `traceHooks`.
- The six e2e pins now parse the envelope through the shared `errorEnvelopeOf` and expect `tracedEnvelope(...)`; `sim-methods`' private `envelopeOf` moved into `fixtures/playground.ts`.
