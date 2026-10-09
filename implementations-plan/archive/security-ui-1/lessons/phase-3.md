# Phase 3: the emoji check (Arc 3, #14, option A; Phase 3.3 skipped on call 3 = Yes)

## Phase 3.1

- **Inference 8 holds.** `handleWalletMessage` runs `enforceSessionProfileBinding` before the Terms check and before the dispatcher, so an unstamped live channel's call, a capability-exempt `getChainInfo` included, never reaches the dispatcher: it is answered with the session-invalid envelope and terminated. `session-revocation.test.ts` proves it through the real ingress, with a stamped control that dispatches.
- **A decode failure in the match loop is the same bug class as Fact 14.** `chainInfoToChainId` throws on a chain id `BigInt` cannot parse; inside a bare `filter` it would abort the whole revocation. Each session's match runs in its own `try`. Establishment decodes the same field before it stamps, so such a session holds no stamp anyway.
- **`DappSessionMacStorage.contains` cannot tell locked from absent**: it is `get() !== undefined` through the MAC. The first build checked presence through the inner store's raw `contains`; round 1 replaced it with the raw sweep.
- **A stub that verifies every profile's rows hides lock bugs.** The shared `service.test.ts` profile stub derives a MAC key for any profile id, locked or not. The refusal tests replace it with a provider that throws unless the profile is the active one, as the real `deriveDappSessionMacKey` does; without that, a lock never hides a row and a lock bug cannot show. Round 1 added the recovery guard back to it.
- **Every stub of `dapp-session` in the wallet-sdk tests needs the new event.** `wireSessionTeardown` subscribes to `onVerificationRefused` at boot, so `test-services.ts`, `background.init-order.pins.test.ts` and `background.discovery-race.pins.test.ts` each gained an `EventHandler` for it.
- **Mutation check.** Removing the unstamp, the per-match `try`, the raw presence check (back to the MAC `contains`), the fence re-check, or moving the refusal event onto the raw path only, each failed its test (round 1 reworked the last three; its own mutations are in the round-1 notes of plan.md).
- **Gate.** `bun run lint`, `bun run typecheck:all`, `bun run audit:vue` pass on the first run.

## Phase 3.2

- **The playground reports a wallet-ended session (Inference 4 holds).** Its `connect()` reaches `connected` once the key exchange completes, before the person answers the check, and its `onDisconnect` subscription flips it to `disconnected` when the wallet terminates the channel. The spec asserts both, connected first.
- **The list page's first render is the empty state**, before `getDappSessions` answers, so "no row" alone proves nothing. The spec keeps the wallet tab on Connected apps across the refusal: the row is seen first, and its removal is the wallet's delete event.
- **Gate.** Chrome and Firefox (`e2e:agent`, proverless, retry 0): `connect-verify-mismatch` 2/2, `connect-dapp` 1/1, `window-placement` (Chrome 1 + the Firefox-only refocus case skipped; Firefox 2/2), all on the first run.

## Post-implementation, round 1

- **A tuple can hold more than one row.** `addDappSession` enforces no uniqueness, so a delete by one id is not "the app is forgotten". The profile purge already knew the answer: read raw and by storage key.
- **A fence proves the session, not the MAC key.** Recovery mode is an open session with no DEK: `captureExecutionFence` and `isFenceLive` pass, `deriveDappSessionMacKey` throws, and every MAC read hides rows. Any "absent" concluded through the MAC view under a fence is wrong there.
- **A tuple match is not a profile match.** A verify window survives a profile switch, and so does an inactive profile's purge event; both ended the active profile's channel to the same app until revocation learned the row's profile.
- **Vue Test Utils' `trigger` skips disabled elements**, so a latch test that clicks a disabled button proves the attribute, not the handler's guard. Emit on the component.
- **A commit hung at signing**; `env -u SSH_AUTH_SOCK git commit` with stdin closed signed it at once.
