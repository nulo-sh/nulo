# Third-party notes lost after a backup import

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The PXE refuses to sync an account it holds no keys for (`packages/aztec-runtime/src/pxe/scope-guard.ts`, called from six methods of `packages/aztec-runtime/src/pxe/service.ts`), and the service worker registers the refused op's own accounts and retries it once (`packages/aztec-runtime/src/pxe/client.ts`, `apps/extension/src/wallet/services/pxe/scope-registrar.ts`).
- **Open items**: a report to upstream of the Aztec behaviours behind the loss, and how recovery advice, or an in-place recovery, reaches installs already hit, tracked in #148.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Guard the one seam every sync crosses, not the call sites that exist today. `PxeService` checks, first thing inside `getNotes`, `simulateTx`, `proveTx`, `profileTx`, `executeUtility` and `getPrivateEvents` (the only upstream entry points that reach the contract sync), that every scope is an account `pxe.getRegisteredAccounts()` returns, and throws `PxeScopeUnregisteredError` before the PXE does any work. The service worker's PXE client recognises that class, never its text, registers the scopes the op itself sent and retries once with the same arguments. No screen changed.

Rejected: refusing without registering, which would fail calls that used to succeed, such as a dApp's `getPrivateEvents` naming a second session account; registering every account up front, which misses dApp scopes and accounts written later and adds an offscreen call to every op; registering at each call site, where the next call site is the next bug; and repairing the cursor, since no public PXE API deletes it and writing the fact store would tie the wallet to upstream's private storage layout.

## Why

After a full-backup import, the incoming-transfer scan polls every visible account at once and every 30 s, while the restored balance projections register the token and then each account: within seconds on a sandbox, much later on a slow node. A scan that lands in between runs the token's sync for an account the PXE has no keys for. The PXE only warns, and the HandshakeRegistry sync drops each handshake it cannot decrypt and still advances that account's cursor, so every later sync starts past it. A note a third party sent is handshake-delivered, because the wallet sets no tagging hook, so it never appears in that PXE store. Fee juice and self-sent notes survive: their tag secrets are recomputed on every sync.

## What shipped

- The guard runs under the chain write lock that the sync then holds, and the PXE never unregisters an account, so its answer cannot go stale. `simulateTx` checks before registering the stub account class, `proveTx` before marking the active proof. The offscreen logger demotes the refusal to debug by class.
- The registrar resolves each address through `AccountService.getAccountContract` for the op's profile and chain, so only the profile's own accounts register, and it refuses a chain whose deletion has started (`NetworkService.isChainLive`) before and after registering. Registration and retry carry the op's captured PXE generation, so a profile deleted and re-imported under the same id in between is refused offscreen. The store-key recovery runs inside each attempt, a registrar failure propagates as itself, and a second refusal is final.
- A dApp sees the final refusal as `PXE_SCOPE_UNREGISTERED` with a constant message and no details (`apps/extension/src/wallet/services/execution/rpc-cancel.ts`, `apps/extension/src/wallet/services/wallet-sdk/error-envelope.ts`), and no address reaches a log line. A dApp approved for a second account can no longer hide that account's handshakes with one `getPrivateEvents` call: the call registers the account first or is refused.
- Every other entry point is covered without a change of its own: onboarding, seed and account-file imports, a new derived account, an added network, a profile switch onto a chain not yet booted, and browser or offscreen restarts.
- The import e2e (`apps/extension/tests/e2e/network/import-handshake-note.test.ts` in CI, and `apps/extension/tests/e2e/network/import-handshake-note-matrix.test.ts` locally for the Settings delete and a passkey profile) holds the receiver's projections between the token and the account registration with an e2e-only gate (`apps/extension/src/e2e/projection-gate.ts`), built only into proverless test builds and checked absent from release builds, and requires the scan to find the note inside the hold. It fails without the fix and passes with it on Chrome and Firefox.
- Unit tests cover the refusal per method, the retry contract (`packages/aztec-runtime/src/pxe/client-scope-registrar.test.ts`) and the registrar. `packages/aztec-runtime/src/pxe/handshake-delivery.sources.test.ts` pins the three upstream behaviours, and the `aztec-update` skill has every bump confirm that upstream's contract sync is still reached only through the six guarded methods.
- No wallet action rewinds the cursor of an install already hit. Recovery is to export a full backup, delete the profile and import the backup on a fixed build: the delete erases the profile's PXE stores, and a backup carries no PXE note state, so one exported from the affected install works as well as an older one. Removing and re-adding the network also erases the store but deletes that chain's accounts and imported keys, so it is not offered.

## Lessons

### handshake-cursor

On Aztec 6.0.0-rc.1, a PXE sync of an account whose keys the PXE does not hold logs only a warning, and the HandshakeRegistry sync inside it advances that account's cursor past every handshake it scanned, decrypted or not. One such sync hides every handshake-delivered note from that PXE store for good, since no public PXE API rewinds the cursor. Only a gated sandbox shows it: on a local network the restored projections register every account within seconds, before the next scan, so a repro that only waits passes on the unfixed code. The e2e holds the projection between the token and the account registration, which makes the slow-node ordering deterministic.
