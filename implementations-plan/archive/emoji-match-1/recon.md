# Recon: emoji-match-1 (#587, P28-04 = A)

Base: `dev` at aa2cfcac. Sources: the driver's own read of the sdk and the wallet, plus two Explore agents (sonnet): a reuse sweep of the trust flag's surface, and a map of the admission and hold path. Paths are repo-relative; the sdk is `@aztec-labs/wallet-sdk@6.0.0-rc.3` as installed (`src/` of the package).

## 1. The sdk side (the lane's phase 1)

- **Discovery** (`extension/provider/extension_provider.ts:170-231`): the page posts a discovery request; a `DISCOVERY_RESPONSE` with a port streams the wallet to the page (`:213-216`). The page cannot tell a wallet's instant answer (a remembered origin) from an answer after Allow, except by timing.
- **Key exchange** (`extension_provider.ts:56-103`): ECDH over the port with a 2 s timeout (`:20`); both sides compute the hash locally. The hash is the hex HMAC-SHA256 of a fixed string, 64 lower-case hex characters (`crypto.ts:340-344`).
- **The match on the dApp side** (`manager/types.ts:5-33`, `manager/wallet_manager.ts:222-249`): `establishSecureChannel` returns `{ verificationHash, confirm, cancel }`. The dApp is expected to draw `hashToEmoji(verificationHash)` and call `confirm()` when the person says they match. `confirm()` (`:232-240`) builds the `ExtensionWallet` locally and resolves at once: it sends nothing and waits for nothing from the wallet. `cancel()` (`:242-248`) posts `DISCONNECT`.
- **No wallet-side confirmation exists in the protocol** (`types.ts:9-35`): no message type reports that the wallet showed or answered its check. After the page's `confirm()`, a wallet `DISCONNECT` reaches it as `onDisconnect` (`extension/provider/extension_wallet.ts:143-144`). Before it, the disconnect is lost: the relay posts `DISCONNECT` and closes the port (`extension/handlers/content_script_connection_handler.ts:236-243`), the port's handler is still the key-exchange one, which ignores it (`extension_provider.ts:66-91`), and the provider's `onDisconnect` is a no-op until `confirm()` builds the wallet (`manager/wallet_manager.ts:258-263`).
- **The playground** (`apps/playground/src/lib/wallet.ts:91-94`, `main.ts:41`) calls `confirm()` right after the key exchange and keeps the hash in a hidden span; it draws no grid.
- **Today, with a trusted row**: the page draws its grid (a stock dApp) and waits for its own button; the wallet opens nothing and releases the session's call hold at establishment (`session-established.ts:186-193`), so the app's calls run as soon as the page confirms.
- **Conclusion**: the sdk resolves the connection with no wallet confirmation able to reach it, so A is built on the wallet side only. Under A the dApp page shows what it shows today for an untrusted reconnect: its own grid until its own confirm; then its calls wait in the wallet's hold until They match (signed on P14-01); They don't match ends the session; a page that confirmed gets `onDisconnect`, one still showing its grid does not (above).

## 2. What "remembered" is in the wallet

- A remembered app is a `DappSession` row for `(origin, chainId, profile)`. A reconnect with a row on a served chain is auto-approved with no connect window (`background.ts:923-926`).
- The emoji check is skipped only when the row has `trustedVerification === true`: `needsVerification = isNewConnection || !dappSession.trustedVerification` (`session-established.ts:186`), and admission asks for no window slot (`background.ts:1049-1055`, `needsWindow: !trusted`).
- The flag is set by the "Skip this check next time" toggle in the check (`popup/windows/verify/index.vue:52, 82-83, 231-239`) and on Settings → Connected apps → the app (`DappSessionVerification.vue:26-33`, `[id].vue:73, 168-171, 355-359`), through `setTrustedVerification` (`dapp-session/service.ts:83, 273-277`, `client.ts:37`, `spec.ts:129`). The toggle's copy was owner-signed in security-ui-1 ("Always trust" became "Skip this check next time").
- **Capability consent is already skipped for a remembered app, independent of the flag**: grants live on the row; a `requestCapabilities` the held grants cover returns early with no window (`packages/wallet-bridge/src/dispatcher.ts:718`, `capability-negotiation.ts:~517-545`). Proven by `dispatcher.test.ts:2245` and, across a reload and an untrusted reconnect, by `tests/e2e/network/connect-locked-queue.test.ts` (`reconnectAfterReload`, `callExpectingNoPopup`).
- **They don't match deletes the remembered rows** (`dapp-session/service.ts:408-430`, `refuseVerification`) and ends every channel of the pair; P2-09 signed "They don't match ends the session as today".

## 3. Storage

- The MAC is computed over the parsed row (`dapp-session/mac-storage.ts:85-105`, canonical form `integrity.ts:31-47`; the codec is `DappSessionSchema.parse`, `service.ts:113`; zod strips unknown keys). Dropping `trustedVerification` from the schema would make every row that carries it fail its MAC and be deleted: the person's remembered apps would vanish. Keeping the optional field costs nothing.
- No backup slice carries dApp session rows (`backup/backup-migration-registry.ts:~202-224`).

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Show the check on a reconnect | `handleSessionEstablished` (standalone window via `openVerifyWindow`, `isReconnect=true`), as for an untrusted row | reuse as is |
| Bound a reconnect loop | `VerifyAdmissionGate` (3 tokens per origin, refill 20 s; 2 window slots per origin, 8 global; queue 4) | reuse as is |
| Hold calls until They match | `VerificationHold` (`verification-hold.ts`), released by `confirmVerification` | reuse as is; its only other release site goes |
| Skip covered capability consent | `computeCapabilityDelta` early return (`dispatcher.ts:718`) | reuse as is, no change |
| Refuse on They don't match | `refuseVerification` | reuse as is |
| Reconnect e2e | `session-reconnect.test.ts` (both cases), `connect-verify-mismatch.test.ts`, `session-reconnect-flood.test.ts`, `verify-hold.test.ts` | adapt `session-reconnect`; keep the rest |
| Unit harness for remembered rows | `wallet-sdk/test-services.ts` `remembered: { trusted }` | adapt |

Nothing is built new.

## Code that becomes dead

- `session-established.ts:186-193` (the ternary and `else deps.hold.release()`) and `SessionEstablishedDeps.hold` (`:71`), its only use; the wiring in `background.ts` (~`:517`) keeps `hold` for `drop`.
- `autoApproveExistingSession`'s `trusted` parameter (`background.ts:924, 1049-1055`).
- `setTrustedVerification` (service, client, spec) and both toggles, once OA-1 is signed.
- `needsWindow: false` loses its last production caller: both callers pass `true` (`background.ts:1031, 1055`); only `verify-admission.test.ts`'s token tests use it.

## Tests that change (keep / flip / delete)

- `session-established.test.ts`: delete `:178`, `:677` (trusted: no window, hold released); fold a trusted-row case into `:667`'s `test.each` as "shows the check and keeps its calls held"; drop the moot trusted setup at `:371`, `:578`, `:640`, `:689`; drop `hold` from `makeDeps`.
- `background.connect-window.test.ts`: `:807` folds into `:786` as a `test.each` over the flag; in `:711-743` the `r3` tail assumes the skip (in the "slot expired" row `r3` queues at the cap of 2), so it goes.
- `background.admission.test.ts`: delete the trusted `describe` at `:143`; `:376` re-checked under a window.
- `trusted: true` as a window-less shortcut: `background.transport.test.ts:56`, `background.reset-wait.test.ts:129`, `background.unserved-chain.test.ts:139, 188, 207, 297, 311` dispatch nothing and need only `remembered: true`; `background.refusal-teardown.test.ts:61` establishes with no discovery, so no slot is reserved and the session would end before the refusal: it sends a discovery first.
- Verify window: `index.window.test.ts:205` deleted with the toggle; the no-trust assertions at `:232`, `:287`, `:343` dropped. `index.test.ts:37` stub dropped.
- e2e: `session-reconnect.test.ts` loses its `alwaysTrust=true` case; `connect-verify-mismatch.test.ts:81` waits on the settings toggle; `connect-one-window.test.ts:32, 186` asserts the toggle stays off; `fixtures/popups.ts:201-234` `approveVerify`'s `alwaysTrust` branch.
- No smoke test or stories reference either toggle (searched `verify-always-trust-toggle`, `connected-app-verification` outside `tests/e2e/network/`; `find apps -name "*.stories.*"`).

## Docs

- `ARCHITECTURE.md:181`: "A trusted reconnect, which shows no check, is released at establishment."
- Stale comments: e2e headers (`session-tabClose`, `session-tabNavigate`, `session-explicitDisconnect`, `frozen-account-canary:223`, `session-reconnect-flood:29`), `test-services.ts` head, `background.ts:1046-1048`, `session-established.ts:91, 202-203`.
- No hit in SECURITY.md, CLAUDE.md, `legal/`, `apps/extension/store/`, the landing, `glossary.ts`, package READMEs, the e2e README or skills (searched `emoji|skip this check|trusted|verification`).

## Open work and collisions

- `gh issue list --state all --search "trusted verification emoji"`: nothing beyond #587. Closed `known-limit` issues searched for `emoji OR verify OR reconnect`: none on this path.
- `harden-security-fixes-2` arc 3 edits `popup/windows/execute/` only; `small-ui-fixes-1` edits `Header.vue` and Display settings; `testers-fixes-1` edits `base.css`, the onboarding done page, the router, the toast and Home. None touches the files above.
- `type-role-ban.reviewed.json` holds no entry for the verify window or `DappSessionVerification.vue`, so removing their toggle styles leaves no stale entry.
