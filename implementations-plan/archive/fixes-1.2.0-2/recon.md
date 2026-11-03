# fixes-1.2.0-2 recon

Read at `origin/dev` `ea282b7bc` by one Sonnet explorer and the planner. Paths are repo-relative.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Chain identities | `apps/extension/src/utils/chain-ids.ts:34-38` `CHAIN_IDS.{TESTNET, MAINNET, SANDBOX}` (685146337, 2070860441, 0) | reuse-as-is |
| A per-chain list of protocol fee payers | none. Searched `Record<number`, `Map<number`, `by chain`, `chainId` tables in `apps/extension/src`, `packages/*/src`; `services/fpc/` holds no chain-keyed data | build new: one light module the service, the fee card and the e2e seed helper all import |
| A light FPC module both shells import | `services/fpc/private-fpc-address.ts`, imported by the popup (`tx-detail-helpers.ts`, `windows/execute/fee-figure.ts`) and the worker (`execution/fee-reask.ts`) | precedent for the new module's place; `protocol-fpcs.ts` imports the artifacts, so the popup cannot take it |
| Discovery | `services/fpc/service.ts:145-230`: `getFpcs(chainId)` derives both canonical addresses, discovers whichever row is missing, on every chain; its only caller of `discoverProtocolFpcs` | adapt: gate the Sponsored half on the list |
| Removing a protocol row | `deleteFpc` refuses protocol rows (`service.ts:410-424`); `clearChainState` deletes a whole chain under the lock with `purgeRows` and `onFpcDeleted` | adapt the `clearChainState` pattern for one row |
| The picker's rows | `popup/components/modules/send/fee-helpers.ts:204-245` `buildFeeMethods`: a sponsor row per stored Sponsored FPC, and while the FPC list is unread a "Sponsored" placeholder on every chain (`withLoadingRows`) | adapt the placeholder; the rows follow `getFpcs` |
| Default pick | `fee-helpers.ts:272` `defaultSponsor`, `composables/useFeeSelection.ts:186-191`: the app windows fall back to Nulo's sponsor, else nothing; Send walks its privacy order (`fee-privacy.ts:108-117`) | reuse-as-is |
| Saved picks naming a gone row | `useFeeSelection.ts:183-191`: a pick that no longer resolves falls back and is never pruned on read | reuse-as-is |
| e2e protocol rows | `tests/e2e/helpers/fpc-seeds.ts` `seedProtocolFpcs` stores both rows under the active chain; users: `security-reset.test.ts:44-46` and `type-roles.test.ts:1094-1099` (new profile, so Mainnet), `send-keyboard.test.ts:325-366` (switched to Testnet by `registerOnListChain`) | adapt: seed what discovery writes on the scope's chain |
| Captures | `tests/e2e/fixtures/shots.ts` `shotSend` under `NULO_E2E_SHOT_DIR`; earlier PRs link committed PNGs under `implementations-plan/<plan>/screenshots/` by blob permalink (#1625, #1621) | reuse-as-is |
| Batch cap | `services/network/seeds.ts:97-115` `BATCH_CAPS` (both dRPC origins 3) and `maxBatchSizeFor`; `node-factory.ts`; `packages/aztec-runtime/src/adapters/aztec-node-factory-adapter.ts:69-130` threads it into every client | reuse-as-is; change the two values and the comment |
| Live batch check | `apps/extension/scripts/seed-identity.ts:20-22` sends `maxBatchSizeFor(seed.rpcUrl) ?? 1` calls in one tick, which the client coalesces into one request; nightly `seed-identity-live` (`.github/workflows/nightly.yml`) runs it | reuse-as-is: it follows the value |
| Cap tests | `seeds.test.ts:15-20` (`toBe(3)`), `node-factory.test.ts` (8 calls → `[3, 3, 2]`), `scripts/seed-identity.test.ts:50-74` (`[3]`, `[3, 3, 2]`), adapter test `:160-180` (an injected cap of 3, no dRPC value) | adapt the first three |

## Collisions and absences

- `service-create.test.ts` runs discovery on `chainId: 1`, which is on no list: its discovery tests move to `CHAIN_IDS.TESTNET`.
- No doc states the cap (searched `drpc`, `maxBatch`, `batch cap`, `check:seeds` in `*.md` and `.claude/skills`); only the `seeds.ts` comment does. `implementations-plan/rpc-proxy-1/` records the 3 as that plan's history and stays untouched.
- `packages/aztec-runtime/src/pxe/known-artifacts.ts` registers the SponsoredFPC class in every PXE; it serves address naming and dApp calls, not the picker, and stays.
- No closed `known-limit` issue covers either area (`gh issue list --state closed --label known-limit --search "sponsored fpc"`, `"batch"`).
