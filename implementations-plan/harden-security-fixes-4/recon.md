# Recon: harden-security-fixes-4

Read at `origin/dev` `8ae2c06a4`. One reuse sweep and one dependency read (Explore, sonnet); every claim below re-read by the planner.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| A log line that names a dApp's scopes | `prepareNoFrom` already logs counts, with the reason (`execution/dapp-send-executor.ts:1317-1327`); the redactor blanks by key name (`wallet/logger/utils.ts:84-140`, `REDACTED_KEYS`); the static guard imports that set (`utils/log-payload-ban.test.ts:72`) | reuse: the opening line goes, the later count line stays; the key joins `REDACTED_KEYS` |
| The node-side fast path's eligibility rule | `partitionFastPrefix` stops at `hideMsgSender === true` on `FunctionCall` instances (`helpers/batched-view-simulation.ts:306-320`); `rehydrateOptimizablePrefix` scans raw wire objects on `type` and `isStatic` only (`fast-path.ts:95-101`) | adapt: the raw scan stops at the same flag. A shared predicate over both input shapes is not built (D2) |
| Which messages presuppose a session | `SESSION_BOUND_TYPES` (`wallet-sdk/stale-session.ts:24`) and `staleSessionVerdict`; `stale-session.test.ts:34` pins `disconnect-request` as forwarded from any tab | adapt: `disconnect-request` joins the set; the pin flips |
| A sender's document origin | `senderDocumentOrigin` (private, `wallet-sdk/content-admission.ts:142`) and the relay's `senderOrigin` (`content-message-relay.ts:68`) both read `sender.origin` first; Firefox 153, the manifest minimum, sets it for content scripts (`ExtensionParent.sys.mjs` `getSender`) | keep: only the note above the helper is corrected (D4) |
| A service that knows the active profile after a SW restart | The silent restore emits nothing (`profile/service.ts:514-516`: "subscribers pull via getActiveProfile()"); `PriceService` and `TokenBalanceService` pull at `init` and declare `ProfileService.name` (`price/service.ts:113,173`, `token-balance/service.ts:51,187`) | reuse the pattern in `TaskService` |

## Facts the plan rests on

- **The page-side content script** ignores `session-disconnected` for a session id it holds no port for (`@aztec-labs/wallet-sdk` 6.0.0 `dest/extension/handlers/content_script_connection_handler.js:166-176`).
- **Upstream's background handler** ends the session a `disconnect-request` names (`dest/extension/handlers/background_connection_handler.js:73-77`); the wallet's admission layer decides which such requests reach it.
- **`simulateViaNode`** builds each public call request with the account as sender and fee payer; a call's `hideMsgSender` does not reach it (`@aztec-labs/wallet-sdk` 6.0.0 `dest/base-wallet/utils.js:57`).
- **`TaskService`** clears its registry when a truthy profile id differs from the last one it saw; it saw none after a SW restart (`task/service.ts:246-254`).

## Collisions

- `contact-names-1` holds contacts, the contact forms, the Send recipient picker and how a contact prints in a window. Nothing here touches them.
- `harden-security-wallet` is a read-only review in its own worktree.
- No open issue names these files' behaviour (`gh issue list --state all --search` for "relay origin", "disconnect tab", "task profile", "hideMsgSender").
