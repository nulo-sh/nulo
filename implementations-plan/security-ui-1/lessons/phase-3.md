# Phase 3: the emoji check (Arc 3, #14, option A; Phase 3.3 skipped on call 3 = Yes)

## Phase 3.1

- **Inference 8 holds.** `handleWalletMessage` runs `enforceSessionProfileBinding` before the Terms check and before the dispatcher, so an unstamped live channel's call, a capability-exempt `getChainInfo` included, never reaches the dispatcher: it is answered with the session-invalid envelope and terminated. `session-revocation.test.ts` proves it through the real ingress, with a stamped control that dispatches.
- **A decode failure in the match loop is the same bug class as Fact 14.** `chainInfoToChainId` throws on a chain id `BigInt` cannot parse; inside a bare `filter` it would abort the whole revocation. Each session's match runs in its own `try`. Establishment decodes the same field before it stamps, so such a session holds no stamp anyway.
- **`DappSessionMacStorage.contains` cannot tell locked from absent**: it is `get() !== undefined` through the MAC. The refusal's presence check is the new `isStored`, the inner store's raw `contains`.
- **A stub that verifies every profile's rows hides lock bugs.** The shared `service.test.ts` profile stub derives a MAC key for any profile id, locked or not. The refusal tests replace it with a provider that throws unless the profile is the active one, as the real `deriveDappSessionMacKey` does; without that, a lock during the replacement lookup never hides a row and the `unavailable` path is untestable.
- **Every stub of `dapp-session` in the wallet-sdk tests needs the new event.** `wireSessionTeardown` subscribes to `onVerificationRefused` at boot, so `test-services.ts`, `background.init-order.pins.test.ts` and `background.discovery-race.pins.test.ts` each gained an `EventHandler` for it.
- **Mutation check.** Removing the unstamp, the per-match `try`, the raw presence check (back to the MAC `contains`), the fence re-check, or moving the refusal event onto the raw path only, each fails its test.
- **Gate.** `bun run lint`, `bun run typecheck:all`, `bun run audit:vue` pass on the first run.
