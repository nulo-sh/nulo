# popups-modulus-1: recon

One Sonnet explorer plus direct reads, at `3af5f7840` (origin/dev). The issue cites `51ea220b1`; line numbers below are at `3af5f7840`. Paths are under `apps/extension/src/` unless they name a package.

## The 32-byte hex shape

- `utils/string.ts:31-34` `isValidHex(hex, length = 64)` builds a `RegExp` per call: `^0x[a-fA-F0-9]{N}$`. No caller passes `length`. Callers: `utils/aztec-address.ts:25`, `utils/token-search.ts:12`, `NewFpcPopup.vue:45,57`, `EditFpcPopup.vue:51,92`, `NewTokenPopup.vue:44`, `NewSenderPopup.vue:41,54` (all under `popup/components/popups/`); a doc example at `composables/useFormState.ts:88`; the generated `types/auto-imports.d.ts:293,1167` (`src/utils/` is an auto-import dir, `vite.config.ts:113`).
- The same either-case shape, `/^0x[0-9a-fA-F]{64}$/`: `utils/transfer-intent.ts:78`, `wallet/constants/explorers.ts:48`, `packages/aztec-runtime/src/pxe/public-events.ts:392` (a block hash: the same shape, so in scope), `packages/wallet-bridge/src/field-address.ts:7`. Every site calls `.test` only.
- Different shapes, left alone: `popup/pages/send-submit.ts:11` (`/i`, accepts `0X`); lower-case only: `packages/token-list/src/parse.ts:23`, `utils/pinned-tokens.ts:9`, `wallet/services/dapp-interaction/approval-delta.ts:36`, `e2e/chrome-storage-token-seeds.ts:26`; `wallet/logger/utils.ts:284` (unanchored redaction); the `{1,64}` field regexes (`transfer-intent.ts:81`, `tx-amount.ts:28`, `execution/call-decoder.ts:37`).

## The field modulus

- `utils/aztec-address.ts:4` hand-copies it in decimal; `aztec-address.test.ts` pins it by boundary values and by agreement with upstream `AztecAddress.isValid` (node environment, imports `Fr`).
- `packages/token-list/src/parse.ts:18` already exports `BN254_FR_MODULUS` (hex), pinned to `Fr.MODULUS` by `wallet/services/token-list/token-list-pins.test.ts:27`. The issue does not mention it. token-list is a dependency-free leaf (`biome.json` denies `@nulo/*` and `@aztec-*` there; `import-closure.test.ts` pins the signer's closure), so its copy stays.
- `packages/wallet-bridge/src/field-address.ts:12` `isFieldAddress` checks `< Fr.MODULUS`; `Fr` comes from `@aztec-labs/foundation/curves/bn254`, whose `field.js` statically imports bb.js. `Fr.MODULUS` is a static bigint (no wasm start).
- `PopupManager.vue:10-23` statically imports the four popups, and `NewFpcPopup.vue:5` and `EditFpcPopup.vue:4` import `sameFieldAddress` from `@nulo/wallet-bridge`: `field-address.ts` and the foundation field module are already in the popup bundle.
- `packages/wallet-core` has no dependencies; `@nulo/wallet-core/utils` is a barrel (`chain-id` is kept out of it for an import cycle; a constant and a pure predicate carry no initializer). wallet-bridge, aztec-runtime and the extension depend on wallet-core.

## The popups and the contact form

| Surface | Check today | Refusal text today |
|---|---|---|
| New FPC | `isValidHex` | "Invalid FPC address" (`:45`, `:174`) |
| Edit FPC | `isValidHex` | "Invalid address" (`:51`, `:282`; shown whenever the field is invalid, changed or not) |
| New token | `isValidHex` | "Invalid address" (`:44`, `:344`) |
| New sender | `isValidHex` | "Invalid sender address" (`:55`) |
| Contact form | `isValidAztecAddress` | "Invalid address", modulus included (`utils/contact-rules.ts:45`, `ContactFormFields.vue:53`) |

Fixtures at or above the modulus (first hex digit 4 or more) that today's tests treat as valid: `NewSenderPopup.test.ts:56`, `NewFpcPopup.test.ts:67`, `NewTokenPopup.test.ts:149,268,530,561`, `EditFpcPopup.test.ts:30,206,207,333`.

## The token key

| Site | Expression | Persisted |
|---|---|---|
| `wallet/services/token/seeder.ts:786` `seedKey` | `` `${chainId}:${contract.toLowerCase()}` `` | yes: the marker state's key, a sealed row |
| `popup/components/modules/general/home-slots.ts:94` `defaultKey` | `` `${chainId}:${contractOf(contract)}` `` (lower case) | no |
| `wallet/services/price/price-map.ts:44` | `` `${e.chainId}:${e.address}` `` (list entries, lower case by `parse.ts`) | no |
| `wallet/services/price/price-map.ts:56` | `` `${chainId}:${contract.toLowerCase()}` `` | no |
| `utils/token-flag.ts:7` | `` `${chainId}:0x${address.toLowerCase().replace(/^0x/, "")}` `` (adds a missing `0x`) | no (worker sends, popup matches) |
| `wallet/services/token/service.ts:911-915` `findToken` | `chainId ===` and lower-case contract equality | no |
| `packages/token-list/src/parse.ts:101` `pairKey` | `` `${pair.chainId}:${pair.address}` `` (validated lower case) | no |

- A token row's `contract` is `z.string()` (`wallet/services/token/spec.ts:65`): a restored row may lack `0x` or keep upper case. `token-flag.test.ts:19` pins the missing-`0x` match.
- `seeder.list.test.ts:93,141,172` read the marker at the harness's literal `KEY` (`seeder.harness.ts:19`), not through `seedKey`.
- `components/composite/send/AmountCard.vue:358` builds a watch source, not a key that is matched; left alone.
- Closed known limit in the area: #511 (a restored row with junk after its contract shows no scam warning); unchanged here.

## E2E that drive these popups

- Smoke: `tests/e2e/settings-crud.test.ts` (New FPC and New token, invalid input), `tests/e2e/send-picker-add.test.ts` (New token from the picker, `0x12…02`, below the modulus), `tests/e2e/type-roles.test.ts:792` (opens New token).
- Network: `senders-advanced.test.ts` and `type-roles-windows.test.ts` (New sender), `fee-sponsor-funding.test.ts` (New FPC). All type real addresses, below the modulus.
