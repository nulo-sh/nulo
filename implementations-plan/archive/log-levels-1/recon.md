# log-levels-1 recon

Base: `dev` at `78f5f9171`. One Explore sweep (sonnet) plus direct reads of each issue's code path.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Disconnect rejection matcher | `isClientDisconnectRejection` (`packages/extension-messaging/src/errors.ts:111`), used by `console-forwarding.ts:17`, `wallet/index.ts:76`, `offscreen/index.ts:45` | reuse-as-is |
| Page rejection routing | `installConsoleForwarding` (`apps/extension/src/wallet/logger/console-forwarding.ts`): disconnect at debug, anything else at error; pinned by `console-forwarding.test.ts:47-58` | adapt: export the same rule for Vue's error channel |
| Vue app error handler | none: no `app.config.errorHandler` in non-test `apps/extension/src` (searched `errorHandler`, `warnHandler`) | build new, two lines per entry point |
| Gas reader context fence | `GasBalanceReader.evictGeneration`, bumped by `evictAll()` on every `onActiveProfileChanged` (`session-manager.ts:336` on an open, so a switch; `:416` on a close, so a lock or delete); checked only before the write-back (`gas-balance-reader.ts:208`) | adapt: check it in `legWithRetry` too |
| PXE op failure levels | `PxeService.logOpFailure` (`packages/aztec-runtime/src/pxe/service.ts:975`) demotes `PXE_STORE_KEY_MISSING` (message) and `PxeScopeUnregisteredError` (type); pinned by `service.test.ts:430-458` | adapt: two more demotions |
| Not-synced PXE diagnostic | `isStaleAnchorMessage` (`pxe/stale-anchor.ts:15`) matches `"not-yet-synchronized PXE"`, among two reorg texts; the string is pinned in the installed package by `stale-anchor.sources.test.ts:15-19` | adapt: one exported constant shared by both matchers |
| Purge guard refusal | `PxeLifecycleCoordinator.assertUnchanged` (`pxe/lifecycle-coordinator.ts:40`) throws a plain `Error` whose message is documented as stable; tests match `/purged mid-operation/` | adapt: typed subclass, same message |
| Bootstrap failure handler | `runFencedBootstrap` (`popup/profile-bootstrap.ts`) catches the activation; `trackActivation` (`useProfileBootstrap.ts:67`) turns a superseded failure into `false` | reuse-as-is; fix the gap before it |
| Wrong-password type | `InvalidPasswordError` (`errors.ts:493`), in `REBUILT_AS`, so `instanceof` survives worker to popup | reuse-as-is |
| Passkey refusal types | `PasskeyPrfError`, `PasskeyUnconfirmedError` (`wallet/utils/passkey-errors.ts`), popup-local; `classifyPasskeyFailure` (`utils/passkey-copy.ts:83`) | reuse-as-is |
| "Passkey did not open this profile" | plain `new Error(PASSKEY_DID_NOT_OPEN)` (`profile/service.ts:135,502,970`) | adapt: typed `WalletError` in `REBUILT_AS` |
| Session-ended fence at a catch (prior art) | #1135's fix, `0564b48ce`: `FpcService` catch checks `isFenceLive(fence)` and logs at debug; pinned by `fpc/service-create.test.ts:354-385` | pattern to mirror |
| Level-pinning test idiom | `vi.spyOn(service, "logError")`; `calls.filter(c => c[1] === LogLevel.Error)`; `toHaveBeenNthCalledWith(n, "ui", LogLevel.Debug, …)` | reuse-as-is |

## Collision risks

- A second disconnect classifier: none is added; the Vue handler calls the same matcher.
- `"Profile locked"` and `"Wallet locked"` are load-bearing strings (`require-active-profile.ts:9`): no message changes.
- `logOpFailure` serves both READ and WRITE catches: a demotion applies to both, which is intended for the purge guard.

## Issue claims checked

- #1131: holds. `legWithRetry` (`gas-balance-reader.ts:222-237`) retries with no eviction check; the retry after a lock reads under the next profile's session.
- #1132: holds in mechanism (no `errorHandler`; Vue prints caught errors with `console.error`, which the sniffer forwards at error). The component is still unnamed; the fix does not depend on it.
- #1133: holds. `runActivation` (`useProfileBootstrap.ts:240-247`) attaches to `core.promise` only after `getProfiles()` settles; a rejection of `getProfiles()` leaves `core.promise` unobserved for good.
- #1136: holds. Both callers recover (`block-header-anchor.ts` falls back to the node; `incoming-transfer/service.ts` `readNoteBracket` logs at debug). Line numbers moved: `logOpFailure` is at `service.ts:975`.
- #1178: holds for every site but one. `Failed to create profile:` with `PasskeyPrfError` does not hold at HEAD as stated: `reportCreateFailure` returns on `no-prf` before its log since `fd474075e`; arc 3 traces which error reached that line. `useProfileImportFlow.ts:243` flattens `PasskeyPrfError` into a plain `Error` whose message the import page shows.
- #1216: the call is not named by the issue, and no static candidate read so far rejects with "Profile locked": `refreshSession` and `lockActiveProfile` do not throw it, `useSeedStatus` and `refreshInFlight` catch. Arc 2 names it with a diagnostic build first.

## Closed known limits searched

`gh issue list --state closed --label known-limit --search "log level"`: #901 and #1200 touch logging, neither these paths.
