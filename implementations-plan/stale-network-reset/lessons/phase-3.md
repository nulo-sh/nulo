# Phase 3: guards

## Built

- AccountService: `assertChainUsable(profileId, chainId)` throws `ChainNotSupportedError` at six sites: the top of `createAccount`, `ensureDefaultAccount`, `provisionDefaultAccount` and `importAccount` (before the DEK read), the Nulo_v1 branch of `getAccountContract` (before the derivation, so a quarantined chain never reaches `raiseRuntimeMismatch`), and the top of `loadImportedAccountContract` (before the key is opened). Reads, rename, visibility and exports stay open.
- `TransactionService.purgeForAccounts(addresses, profileId?, chainId?)`: the chain filter applies to the typed purge, the ambiguity marking and the raw malformed pass; `onAccountDeleted` passes `account.chainId` (F11).
- `DappSessionService.purgeForChain(profileId, chainId)`, registered in `init` as a chain-purge subscriber; it reads raw rows by profile like `purgeForProfile` and compares `Number(row.chainId)`, since sessions store the chain id as a decimal string.
- `registerPxeChainGuard` beside the recovery guard; the runtime wires it to `NetworkService.isChainQuarantined`. Profile-bound ops only, so `clearChainState` / `clearProfileState` stay admitted.
- Dispatcher: `dispatcherNetworks(networkService)` wraps `getNetworksRaw` and answers `[]` for a quarantined chain, so the dispatcher's existing empty-network branch throws `CHAIN_NOT_SUPPORTED`.
- Discovery: `NetworkService.servesLiveChain` (= `servesChain` && not quarantined) replaces `servesChain` at the two `served` sites (now `background.ts:880` and `:1256` after dev's drift); `dropStaleSession` keeps the row-based `servesChain`, so a quarantined chain's remembered session is kept (A6). One awaited call per site keeps the tick-pinned discovery tests unedited.
- Seeder: TokenService's seeder `getAccounts` dependency answers `[]` for a quarantined scope, which every seeder path (pass, `ensureSeeding`, continuation) already treats as "no accounts, burn nothing".
- Incoming transfers: `isQuarantined(profileId, networkId)` gates the note scan in `poll` and the public scan in `pollPublic` before any read; the balance-outbox drain still runs. The skip logs at debug.

## Harness changes (no assertion edited)

- 18 test files needed stubs: `isChainQuarantined: async () => false` on NetworkService stubs (account, token, incoming), `servesLiveChain` / `isChainQuarantined` on the wallet-sdk fakes, and a `NETWORK_SERVICE_NAME` stub with `registerChainPurgeSubscriber` wherever a real `DappSessionService` starts. In `dapp-session/service.test.ts` a local `svc` variable shadows the composition-harness helper, so it is imported as `stubService` there.

## Gotcha

- The note and public polls share one in-flight tips read per network (`sharedTips`). Two existing episode tests (`clearProfile/clearChain ends the scope's episodes`) count that read and pass only while both poll paths take the same number of awaits before it. A guard added to one path alone would break them; both skips use the same `isQuarantined` helper for that reason.

## Proof that each guard is load-bearing

- Mutation runs (each guard removed alone, its test file run): all six AccountService sites, the transaction chain filter, the dApp-session subscriber, the PXE guard, the dispatcher adapter, both `servesLiveChain` sites, the seeder adapter and both incoming skips each turn their own test red.

## Gate

- `bun run test`: 767 files passed, 3 skipped; 12217 tests passed; exit 0.
- `bun run lint`: exit 0 (27 pre-existing warnings; complexity baseline OK). `bun run typecheck:all`: exit 0.
