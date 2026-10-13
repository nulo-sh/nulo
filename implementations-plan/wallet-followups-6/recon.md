# Recon: wallet-followups-6

Base: `origin/dev` at `36c43155`. Three read-only Explore agents (Sonnet): one batched reuse sweep (seven capabilities), one map of the dApp ingress, one map of the token chain purge and the e2e error arrays. The planner re-read every cited site and measured the wire sizes below. Paths are repo-relative.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| A byte bound on a content-script message | None. Searched `MAX_.*BYTES`, `MAX_.*SIZE`, `byteLength`, `TextEncoder().encode(`, `.length >` under `apps/extension/src/wallet/services/wallet-sdk/`, `apps/extension/src/content-script/`, `packages/extension-messaging/src`, `packages/wallet-bridge/src`. The relay has count and age caps only (`content-message-relay.ts:44-53`); the discovery queue has count caps (`background.ts:695-698`). Byte caps exist only off this path (`MAX_BACKUP_FILE_BYTES`, `MAX_CONTACT_IMPORT_BYTES`, `ACCOUNT_STATE_CAPS`). | build new: one constant and one schema bound in `content-script-validator.ts` |
| Where an envelope's shape is refused | `validateContentScriptMessage` (`content-script-validator.ts:97-114`), called by `admitContentMessage` (`background.ts:369-420`, drops `invalid` with a debug line) and the pre-boot relay (`content-message-relay.ts:92`) | adapt: bound `content` for `secure-message` there |
| The invalid-request envelope | `InvalidWalletArgumentsError` (`packages/extension-messaging/src/errors.ts:284-295`) → `-32602` with the constant message (`error-envelope.ts:41`, `:55-60`) | reuse as-is (for #331) |
| Refusing a value shape the wire never carries | `assertNoOwnToString` (`packages/wallet-bridge/src/wallet-schema-args.ts:57-65`), an iterative walk inside the pass/fail parse | adapt: same file, same position in the parse, for non-hex address encodings |
| Canonical args from the parse | None. `assertWalletSchemaArgs` discards the parsed value by design (`wallet-schema-args.ts:31-36`; repeated at `method-descriptors.ts:79`). Searched `parseArgs`, `parsedArgs`, `canonical`, `parseWithOptionals`, `getSchemaParameters`. | see plan § Decision ledger, D-331 |
| A method-name check | `assertKnownMethod` (`method-descriptors.ts:338-342`); its safe sibling `describeWireMethod` already guards `typeof` (`external-id.ts:61-63`) | adapt |
| The refusal log level | `isExpectedRefusal` (`background.ts:1333-1341`); pinned by `background.refusal-log.test.ts` (scope `:305`, capacity `:327`, schema `:342`; no unsupported-method case) | adapt |
| Identity-checked delete | No atomic compare-and-delete (`entity_storage.ts`, `purge-rows.ts:32-48` say so). Idioms: the bytes re-read in `purgeMalformedRows` (`purge-rows.ts:78`), the row re-read in `resumeWritten` (`token/service.ts:506-509`), the owned ticket (`withTokenLock`, `:530-538`) | adapt: a re-read of the row's owner and chain, delete issued in the same turn |
| e2e error arrays | Recorded by `recordPageErrors` (`tests/e2e/fixtures/extension.ts:1215-1237`), attached by `waitForPopup` (`fixtures/popups.ts:66`); no shared assert helper (searched `expectNoErrors`, `assertNoErrors`, `expectClean`) | reuse as-is: two inline `expect`s, as `connect-dapp.test.ts:25-26` |
| Wire-shaped fixtures | `packages/wallet-bridge/src/testing/wire.ts` (`wireAddress`, `wireCall`, `wirePayload`, `wireArtifact`) | reuse as-is |

## dApp ingress (#345, #332, #331)

- Path: page → `ExtensionWallet.postMessage` encrypts `jsonStringify(message)` (`wallet-sdk/src/extension/provider/extension_wallet.ts:242-252`) → content script relays `{origin: "content-script", type: "secure-message", sessionId, content: {iv, ciphertext}}` (both base64 strings) → `content-message-relay.ts` → `admitContentMessage` (subframe, validator, stale session) → upstream `handleMessage` → `serializeDecryption`'s wrapper (`background.ts:618-625`) → upstream `handleEncryptedMessage` decrypts and calls `onWalletMessage`.
- **The `messageId` is inside the ciphertext.** No wallet code can address a reply to a message it has not decrypted. Before the decrypt the wallet can drop the message or end the session; the standard error envelope needs the decrypt.
- `content-script-validator.ts:51-59`: `content: z.unknown().optional()`. Shape only, no length (claim holds).

### Measured wire sizes (planner, 2026-10-13)

Each artifact loaded through `loadContractArtifact`, wrapped as the SDK wraps a call (`{type, args: [instance, artifact], messageId, ...}`), serialized with `jsonStringify`, then sized as the SDK's AES-GCM output in base64: `4 * ceil((utf8Bytes + 16) / 3)`. 44 artifacts scanned (`@aztec-labs/noir-contracts.js/artifacts`, `@aztec-foundation/aztec-standards/target`).

| Call | Plaintext bytes | Ciphertext characters |
|---|---|---|
| `registerContract`, noir-contracts `Token` (largest) | 6,116,730 | 8,155,664 |
| `registerContract`, aztec-standards `TestLogic` | 5,793,126 | 7,724,192 |
| `registerContract`, aztec-standards `Token` (the playground's) | 4,000,995 | 5,334,684 |
| `registerContract`, `PrivateFPC` | 2,072,089 | 2,762,808 |
| `registerContract`, `SponsoredFPC` | 865,556 | 1,154,096 |
| Any call without an artifact (7-call multicall `sendTx`, manifests, grants) | a few KB | under 10,000 |

The playground sends artifacts through the wallet channel (`apps/playground/src/sections/phase.ts:176,180`, `transactions.ts:146,206,210`). No fixture carries non-empty `authWitnesses`.

### The parse and its readers (#331)

- `schemas.AztecAddress` (`stdlib/src/aztec-address/index.ts:194-201`) admits, in union order: a hex string (`/^(0x)?[a-fA-F0-9]{64}$/`, either case), a base64 string decoding to 32 bytes, a `{type: "Buffer", data: [...]}` object, a `Buffer` (not reachable from JSON). The SDK's `jsonStringify` writes an address as its lower-case `0x` hex and turns every Buffer-shaped object into base64 (`foundation/dest/json-rpc/convert.js:14-29`), so an SDK client never sends the other two at an address position.
- Raw readers after the parse: `dispatcher.ts:329, 542, 612, 616, 648` (`String(args[n])`), `:652` (`content.caller`, `content.contract` copied into the action); `method-scope-checkers.ts:76, 80, 86, 113, 124, 156, 168, 186, 255, 260, 284, 298` (`String(...)` of an address-typed argument; `:90` reads a class id, `:270` a grant's own list); `OperationActionRow.vue:17-47` (`AddressDisplay` of action fields; the prop is typed `String`, so Vue only warns); `authwit-discoverer.ts:152-210` (`AztecAddress.fromStringUnsafe`).
- Claim beyond the issue: a 44-character base64 address passes the parse as well; every reader above then reads a non-hex string (`fromStringUnsafe` decodes it as hex, so a wrong or short buffer).

### `assertKnownMethod` (#332)

- `method-descriptors.ts:338-342` is typed `string` but gets `message.type` from the decrypted JSON. `Object.hasOwn(METHOD_REGISTRY, {toString: "x"})` throws `TypeError` in `ToPropertyKey`; the catch in `handleWalletMessage` answers with the unclassified constant and logs at `error`. Claim holds.
- `describeWireMethod` (`external-id.ts:61-63`) already returns `[${typeof value}]` for a non-string; the log lines do not throw.
- `queuedFailureKind` (`queued-journal.ts:284-291`) does not list `UnsupportedMethodError` either; it needs no change: only `sendTx` creates a queued row, and an unsupported method is never `sendTx`.

## Token chain purge (#262)

- `clearChainState` is at `token/service.ts:228-255` (the issue's `:200-216` moved). It drains `pendingWrites`, snapshots `getValues()` filtered by `(profileId, chainId)`, then `purgeRows` deletes each by id and emits `onTokenDeleted` for the snapshot row.
- Reached from `NetworkService.deleteNetwork` (`network/service.ts:542-566`, network lock held, reservation set first) and `NetworkService.purgeForProfile` (`:943-960`).
- Ids: `nextNumericId` is max + 1 (`id-allocators.ts:17-30`), so deleting the highest id frees it for the next add or restore.
- Every other token-row writer runs under `withTokenLock` and `track` (`:451-498`, `:649`, `:880`, `:934-940`). The sweep at `:252` is the only unguarded by-id delete.
- Balances survive a wrong token delete: `rowMatchesToken` matches id, profile, chain and contract (`token-balance/balance-identity.ts:16-17`). Only the token row is lost, and the emit names the old row.
- Test seam: `service.test.ts` wraps `api.storage.local.remove` to park a delete (`:941-961`); the closest template is `:964` (the profile purge's freed-id case).

## e2e error arrays (#336)

The eight files the issue names exist, and each asserts one array:

| File | Asserts | Lines |
|---|---|---|
| `tests/e2e/network/execute-scope-account.test.ts` | `consoleErrors` | 87, 130, 165, 221 |
| `tests/e2e/network/execute-scope-chain.test.ts` | `consoleErrors` | 41, 68, 86 |
| `tests/e2e/network/delete-after-prove.test.ts` | `pageErrors` | 46, 77 |
| `tests/e2e/network/snack-placement.test.ts` | `pageErrors` | 369, 383, 391, 414, 465, 474, 511 |
| `tests/e2e/network/connect-one-window.test.ts` | `pageErrors` | 176, 208 |
| `tests/e2e/network/connect-verify-mismatch.test.ts` | `pageErrors` | 61, 97 |
| `tests/e2e/own-window.test.ts` | `pageErrors` | 79 |
| `tests/e2e/rows.test.ts` | `pageErrors` | 310, 364, 401, 447, 476, 627 |

Beyond the issue: about 18 more files assert `pageErrors` only (among them `account-import-export`, `backup-migration`, `sw-resilience`, `passkey-paths`, `network/fiat-send`, `network/imported-account-execution`), and some assert both at unequal counts (`endpoints`, `navigation`, `settings-crud`).

## Collisions

- Draft PR #347 (`dapp-dispatch-hold`) edits `background.ts` (`onWalletMessage`, `handleWalletMessage`'s signature, not `isExpectedRefusal`), `background.refusal-log.test.ts` (its `refuse` helper) and `connect-one-window.test.ts` (imports and a helper, lines 5-90 of the file; no assertion line). No other open PR touches a lane file.
- #329 (`lane:tokens-and-balances`) concerns upper-case hex at the popup's token add; canonicalizing dApp addresses to lower case would reach its owner-signed surface.
- The parse runs after the capability check on purpose (`dispatcher.ts:233`): an origin with no grant cannot make the worker parse a large payload.
