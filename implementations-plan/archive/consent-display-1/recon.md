# consent-display-1: recon

Base `origin/dev` at 2c0df3b9. Two Explore agents (sonnet): a reuse sweep over six capabilities, and a map of a dApp token add from ingress to the stored row. The driver read the identity block, the discovery handler, the fee row, the strip and the call surface. Paths are relative to `apps/extension/src` unless they start with `apps/`, `packages/` or `node_modules/`.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| The identity line in the consent windows | `composables/useDappHostname.ts` (`new URL(url).hostname`; IDN/`xn--` flag); `components/composite/DappIdentityBlock.vue` (`.dapp_hostname`: `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`); six windows call the composable and pass two props (`discover` :61/:188, `capabilities` :120/:382, `execute` :145/:553, `fee` :79/:239, `network-unavailable` :48/:118, `verify` :73/:212, which also puts `HOSTNAME_WARNING` in an announcement, :150) | adapt |
| A stored dApp origin | `DappMetadata.url = discovery.origin` (`wallet/services/wallet-sdk/background.ts`, the session write), upstream's `new URL(sender.tab.url).origin` (`@aztec-labs/wallet-sdk` `background_connection_handler`, top frame) | reuse as is |
| Wrapping long mono text | local `overflow-wrap: anywhere; min-width: 0` rules (`popup/windows/execute/OperationCard.vue` `.payload`, `CallArguments.vue`, `SendTxSummary.vue`), pinned by `OperationCard.long-strings.test.ts` (`WRAPS`); no shared utility | reuse the idiom |
| Refusing a discovery | `handleDiscovery` (`background.ts`) refuses with `handler.rejectDiscovery(requestId)` (Terms, profile switch, queue cap); upstream's `rejectDiscovery` answers nothing to the page | reuse |
| A loopback rule | `isLoopbackHost` (`packages/wallet-core/src/utils/rpc-url.ts`: `localhost`, `127.0.0.1`), used by the network service; no dApp-origin rule exists (searched `isSecureContext`, `protocol`, `https:`, `isLoopback` across apps and packages) | reuse; new 10-line predicate |
| The app-set fee row | the only "Fee up to" on a dApp window: `OperationCard.vue:372,376` (`execute-op-app-fee`, `execute-op-app-fee-estimating`); fees-display-1 moves it into a new `popup/components/modules/send/AppFeeLine.vue` | adapt after fees-display-1 |
| The privacy strip | `components/composite/send/publish-facts.ts` (pure), `PublishStrip.vue`, `popup/pages/send.vue:325-328,844` | adapt |
| A token's class | `Token.classId?` / `TokenInfo.classId?` (`wallet/services/token/spec.ts`), set from the instance at add and refreshed from the chain on restore (`service.ts` `readChainToken` → `buildToken`); `send.vue`'s `activeToken` carries it | reuse |
| The validated class set | `BUNDLED_TOKEN_CLASS_IDS` (`packages/token-list/src/class-ids.ts`), "token contract classes the wallet bundles an artifact for", pinned to `getBundledTokenClassId()` by `token-list-pins.test.ts`; gates the signed list; one id at rc.3 | reuse as is |
| Cleaning untrusted text | `sanitizeWireString(input, max)` (`wallet/services/dapp-session/capability-meta.ts`); `safeWire`, `displaySymbol`, `wireTitle` wrap it; `restore-rows.ts` and `background.ts` already import it from the wallet layer; no biome rule bars `wallet/services/token/` from it | reuse as is |
| Name and symbol bounds | the seeder only: name 1-80, symbol at most 32 (`token/seeder.ts:34-36`); `decodeUtf8` strips NUL only (`token/functions/descriptors.ts:50`) | reuse the seeder's bounds |
| Binding an approval to what the window showed | `OperationApprovalDelta` (`dapp-interaction/approval-delta.ts`) → `OperationApprovalEnvelope` (`execution/models/index.ts`), validated in `approveInteraction` (`feeCeiling` via `isFeeAmount`); `PreviewSnapshots`/`SingleShotTtlCache` (120 s TTL) for sends only | adapt the delta; no new store |
| The token add commit | `executeRegisterToken` (`execution/service.ts`): re-parses the interface, then `addTokenAuthorized` → `persistToken`, whose `live` arm reads the metadata inside the token lock; the `seeded` arm stores values already checked and never fetches (`token/service.ts:80,485`) | adapt |
| A pinned interface read | `previewTokenMetadata(networkId, account, address, expectedClassId?)` → `parseTokenInterface` refuses another class with `PinMismatchError` | reuse |
| Rendering call arguments | `popup/windows/execute/call-surface.ts` (`callSurface`, `corroborates`), `CallArguments.vue` (decoded rows, no notice), `UnreadableArgsNotice.vue` (warning glyph, orange title, tertiary sentence; raw only) | adapt |

## Claims in the lane brief, checked

- **P38-03, "the label lives in one row only".** Holds. `feeRiseAsks` (`execution/fee-reask.ts:21-27`, 10 %) has one caller, the dApp send executor (`dapp-send-executor.ts:1401`); the wallet-paid readout on a dApp window says "You pay" (`FeeCostReadout.vue`); `SendReviewSheet.vue:166` ("Fee up to …, based on your last send. If it comes out higher, we ask again.") is the wallet's own queued Send and is not bound by that rule.
- **P38-07, "every listed token is a bundled class".** Holds for what the wallet seeds: `readTokenList` keeps only `BUNDLED_TOKEN_CLASS_IDS` entries (`selectEntries`, `packages/token-list/src/index.ts:57`); wallet-mode parsing itself accepts any class (`parse.ts:113`).
- **P38-02, "B reads exactly as A on screen".** Holds: `rejectDiscovery` sends the page nothing, so no window opens.
- **Restored rows' class.** `restoreRow` stores the backup's `classId` as given; the restore refresh replaces it from the chain (`readChainToken`) and keeps the backup's values when its read fails or is late, with no retry (`refreshRestoredToken`).
- **Name and symbol are stored as read.** Holds: `buildToken` copies them; `restoreRow` parses the backup row with `TokenSchema` (`z.string()`).

## Collision map (2026-10-17, 19:0xZ)

| Lane | Files it edits that this plan touches | Consequence |
|---|---|---|
| fees-display-1 arc 1 (running) | `OperationCard.vue` (the app-set row moves to `AppFeeLine.vue`), `popup/pages/send.vue`, `popup/windows/fee/index.vue`, the e2e regex in `tests/e2e/network/fee-sponsor-funding.test.ts` | the fee word, the strip caveat and the identity line wait for arc 3 |
| call-vocabulary-1 (planning) | `call-surface.ts` titles (`rowTitle`, `authwitTitle`) | arc 3 merges `dev` first; the label mark edits `callSurface` and `CallArguments.vue` only |
| sheet-1, onboarding-3, ui-dedupe-1, test-infra-1, ci-dedupe-1, type-roles-coverage arc 2 | none of the files below | none |

Arc 1's files (`wallet-sdk/background.ts`, a new `wallet-sdk/dapp-origin.ts`, their tests) and arc 2's (`token/service.ts`, `execution/service.ts`, `execution/models/index.ts`, `dapp-interaction/approval-delta.ts`, `dapp-interaction/service.ts`, `popup/windows/execute/index.vue`) are in no running lane's change map.
