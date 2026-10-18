# authwit-intent-1: phase 2 (the fee-payer pin split)

- The pin now lives in `fee-payer.pins.test.ts`, excluded from the jsdom runner beside `auth-registry.pins.test.ts`; `vitest list --filesOnly` in `apps/extension` lists only `fee-payer.test.ts`.
- Red proof: `CLAIM_AND_END_SETUP_SELECTOR` changed by one digit failed the pin in wallet-bridge's runner (expected `0xcbe67244`, received `0xcbe67243`); restored.
- Review round 1: the pin now builds the claim with upstream `FeeJuicePaymentMethodWithClaim` and round-trips it through JSON; altering the pinned selector by one digit fails it.
