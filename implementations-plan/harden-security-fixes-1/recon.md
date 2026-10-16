# Recon: harden-security-fixes-1

Three Sonnet Explore agents at `c5e9c8e8` (origin/dev): response bodies and backup rows; dApp ingress, Activity titles and contract artifacts; dependency log levels, the token-list summary and SECURITY.md. The parent re-read every line `plan.md` cites. The source of each item is tracked privately; this file states only what the tree does.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Read a fetch body under a byte cap | `readCapped` in `apps/extension/src/wallet/services/token-list/service.ts:243-268` (module-private, throws the private `DownloadError("oversize")`; content-length precheck, then a counted stream read) | adapt: lift into `packages/wallet-core/src/utils/` (both `aztec-runtime` and the extension already depend on `@nulo/wallet-core`; its biome override allows it); the token-list keeps a two-line mapping to its outcome |
| Other bounded body readers | none. Searched `getReader(`, `content-length`, `MAX_.*BYTES`, `byteLength`, `TextDecoder` over `packages/` and `apps/`: only file-size caps (`MAX_BACKUP_FILE_BYTES`, contacts and account files) and a decompression counter in `utils/files.ts:316` | build new: the one helper above |
| Row-count caps at backup import | none in `normalizeBackupData` (`backup/backup-migration-registry.ts:253-342`). `ACCOUNT_STATE_CAPS` (`account-state/normalize.ts:15-33`) drop and record inside their own normalizer; `MAX_CONTACT_IMPORT_ROWS` (`utils/contacts-export-format.ts:38`) is the contacts-file import, not a backup slice | build new: an optional `maxRows` on the `root` slice descriptor, refused through the existing `{ ok: false, reason }` |
| Allocate many numeric ids under one lock | `nextNumericId` (`wallet/services/id-allocators.ts:17-36`) lists every key per call; `preferOrReallocId` holds an intra-batch `avoid` set for string ids | adapt: a batch form that lists keys once and keeps `nextNumericId`'s rule (canonical, safe-integer max + 1; walk down at the boundary) |
| Strict, bounded content-script envelope | the `secure-message` branch of `ContentScriptMessageSchema` (`wallet-sdk/content-script-validator.ts:71-88`: raw key check, then `z.object` with `.max()`) | reuse the pattern for `discovery-request` |
| Per-sender checks before the SDK sees a message | `admitContentMessage` (`wallet-sdk/background.ts:410-465`) with `ContentWrapperDeps.sessionKnown`, `replyIfStale`, `stale-session.ts` | reuse: one more dep and one more check in the same wrapper; a second `chrome.runtime.onMessage` listener would double-deliver (`buildContentTransport` comment) |
| The origin a session is credited to | upstream `BackgroundConnectionHandler.handleMessage` stores `new URL(sender.tab.url).origin` (or `'unknown'`) on the pending discovery; `handler.getPendingDiscovery(id)` returns it | reuse the getter |
| Wrap the content script's SDK handler | `content.ts` passes `sendToBackground` and `addBackgroundListener` to `ContentScriptConnectionHandler`; no subclass hook upstream | adapt: filter inside those two callbacks |
| Bounded, cleaned wire strings | `sanitizeWireString(s, max)` (`dapp-session/capability-meta.ts:161`), 64 for function names (`popup/windows/execute/humanize.ts`, `background.ts:1201`) | reuse as is |
| A name-only projection of wire calls | `operation-planner.ts:250` maps `exec.calls` to `{ name }`; `primary-method.ts` `methodOf` reads `method ?? name` for wallet-internal shapes (`TxCall`, `Action`) | adapt: the two raw-wire call sites project to `name` first; `methodOf` stays |
| The wallet's own copy of a contract class | `ArtifactRegistry` (`packages/aztec-runtime/src/pxe/artifact-registry.ts:13`); 12 compiled-in artifacts keyed by class id (`known-artifacts.ts`); `PxeService.registerContract` (`pxe/service.ts:435-457`), the one write path for the execution service and the account-state restore | adapt: `known` first; `registerContract` resolves through the registry before it writes |
| Silence a dependency logger | `SILENT_RPC_LOG` (`packages/aztec-runtime/src/adapters/aztec-node-factory-adapter.ts:27-44`) for the single-attempt node client | not needed: the build's `LOG_LEVEL` define reaches every `createLogger`, and `loggers.pxe` governs only the PXE's service logger |
| Rewrite strings in a captured line | `scrubUrls` applied to every string by `trim` (`wallet/logger/utils.ts:183`) | adapt: a sibling for 32-byte hex values, applied by the PXE host frame's capture hook (`offscreen/index.ts:29-35`) |
| A git baseline in the publish summary | `signingChanges` (`infra/token-list/scripts/summary.ts:99-109`), not exported, no test | adapt: export with a repository root; test against a temp repository |

## Sizing and compatibility facts

- **Replies.** A price reply is about 300 bytes for four ids. The PXE's block stream runs tips-only (`@aztec-labs/pxe@6.0.0-rc.3` `block_synchronizer.js:35-40`); `PXE.create` reads block 0's header, and the one block-body read is `incoming-transfer/service.ts:1551`, one block at a time. The largest replies are a contract class (at most 3000 bytecode fields, about 130 KB of JSON), tx effects and tagged logs, realistically under 1 MB each. The node client batches up to 100 calls into one body (`safe_json_rpc_client.js:12`).
- **Discovery wire shape.** The SDK's page message is `{ type: "aztec-wallet-discovery", requestId (UUID), appId, chainInfo: { chainId, version } }`, each chain field a 66-character `Fr` string (`ExtensionProvider.discoverWallets`). The content script wraps it as `content` in an envelope it builds itself. Fixtures differ from the wire: `content-script-validator.test.ts:57` uses `type: "discovery"` and `chainInfo: {}`.
- **Sender fields.** Chrome sets `sender.origin` and `sender.url` on content-script messages; Firefox sets `sender.url`. The unit harness's sender carries only `tab.url` (`background.transport.test.ts:37`). `VITE_NULO_ALLOW_IFRAME_DAPPS` is off in every shipped build.
- **Backups.** `normalizeBackupData` runs on every import, current version included (`backup-migrator.ts:94`); a refusal shows as "Import failed" with its reason (`useFullBackupImport.ts:168-174`). Export has no row limit.
- **Log level.** `bb_private_kernel_prover.js:193` indexes a logger by `process.env.LOG_LEVEL` (gate counts only), so the define stays a bare level name; foundation exports `LogLevels`.
- **Envelope.** The committed `public/v1/list.json` is byte-equal to the signer's order `format, keyId, payload, signature` (`sign.ts:73`). `git log --find-object` lists the squash commit that introduced a blob (probed on #425's blob).

## Collisions and closed limits

- #432 (closed, `known-limit`): the node client's own retry and failure lines stay at warn and error by the owner's choice; the log-level change leaves them as they are.
- #355 (closed, `known-limit`): batched artifact registrations over the message bound. Not touched.
- #371 (closed, `known-limit`): a connected session's pending calls are a count, not a byte budget. Not touched.
- #127 (open, `blocked:external`): a page-chosen discovery id. Not closed here; the key-exchange check narrows what a reused id can reach.
- #514 (open, owner decision): titles by name prefix. Not touched; this plan only chooses which wire key feeds the title.
- Lanes running now: `execute-popup-readability` (`popup/windows/execute/**`: not touched here), `token-list-live-check` (`infra/token-list/**`: the second to merge merges `origin/dev` first), `send-fees-ux` (no overlap).

## E2E that drive these surfaces

Network: `connect-dapp`, `connect-locked-queue`, `session-reconnect`, `session-tabNavigate`, `cold-wake-discovery`, `contracts-register`, `register-token`, `backup-restore-sw-restart`, `tx-sendTx-selfPay`. Smoke has no dApp; the backup and settings suites drive import. No e2e reads a PXE log line (`handshake-delivery.sources.test.ts:25` pins upstream source text only).
