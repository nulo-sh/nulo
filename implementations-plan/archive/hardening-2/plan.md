---
plan: hardening-2
tier: mid
status: completed (#70, #71, #72)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 agents (sonnet); code-review off; Codex at high on gpt-6.1-sol
issues: [16, 26, 18, 19, 23]
base: origin/dev f5ca160
---

## Outcome

- **Date**: 2026-10-09
- **Status**: completed. The three arcs were squash-merged into `dev` in the D-ORD order; this close-out is a docs-only PR on `dev`.
- **Shipped**: three PRs.
  - [#70](https://github.com/nulo-sh/nulo/pull/70), Arc 3, closes #23. The extension pages' CSP has a `default-src 'self'` floor, added one directive at a time while an e2e-only `securitypolicyviolation` recorder ran in every extension context on both browsers. The final policy is `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; img-src 'self' data: blob:; connect-src 'self' blob: https: http:; style-src 'self' 'unsafe-inline'`. Two sources were added on recorded violations: `blob:` in `connect-src`, because Firefox checks `downloads.download` of a blob URL against it (D-23k), and `'unsafe-inline'` in `style-src`, because CodeMirror generates its theme `<style>` (D-23h). zod's JIT is off (`zod-jitless.ts`), since its `eval` probe raised a violation under the old policy too (D-23e). Both browsers' full smoke and network suites passed at retry 0 with zero recorded violations; the recorder's named gaps are in `apps/extension/tests/e2e/README.md` § CSP violations.
  - [#71](https://github.com/nulo-sh/nulo/pull/71), Arc 1, closes #16 and #26. Every dApp call is parsed against a private copy of `WalletSchema` carrying the Nulo RPCs, after its capability check and before its scope check. A refusal is `InvalidWalletArgumentsError` with fixed text, so no argument value reaches a log line or a journal row. `assertAuthRelevantArgShape` and `argsRequestCapabilities` are deleted. The verified-artifact cache is keyed by the artifact object, since one registry serves every PXE runtime's store.
  - [#72](https://github.com/nulo-sh/nulo/pull/72), Arc 2, closes #18 and #19. Migration resume refuses a journal that names no registered migration or strays outside its footprint, keeps it and writes nothing. A corrupt or misfiled tombstone keeps its id reserved and is never resumed under another id. `updateToken` and `onTokenUpdated` are deleted. Both balance writers re-check the purge fence in the tick their write resumes, and both purges run typed, raw, typed, fencing every matched raw row first.
- **Owner answers** (2026-10-08, [OWNER-ASKS.md](OWNER-ASKS.md) § Answers), built in #71:
  - OA-1 **C**: the permission request's header and each known capability type are parsed; an unknown type still reaches the connect window as its "unknown" row.
  - OA-2 **B**: a schema refusal answers `-32602` with `walletErrorCode: "INVALID_PARAMS"` and "The request's arguments do not match the wallet API."
  - OA-3 **B**: a queued send the parse refuses fails with the new `malformed_request` outcome. Row label "Couldn't read request", explanation "The app sent a request the wallet could not read. Nothing was sent."
- **Dropped or deferred**: the ship-now forms of OA-1 to OA-3, superseded by the answers. OA-4 and OA-5 are unanswered, so `connect-src` keeps `http:` and the published patch keeps `z.string()` for `grantPublicAuthwit`'s two addresses. Narrowing `style-src` needs CodeMirror mounted in a shadow root, a UI change. Arc 1's Opus O3 (a Buffer-shaped address with a non-function `toString`) is pre-existing and fails closed. No general `isLive` gate was built (D-18c), and `base-uri` and `form-action` are outside #23. No final cross-arc Codex pass is recorded (see the Status line).
- **Open items**: none kept here; [follow-ups](../../follow-ups.md) took OA-4, OA-5, the `style-src` narrowing, O3, the live hosts a smoke build still contacts, the `bun run dev` run nobody made under the new policy, and the unauthenticated journal (added to the migration-engine entry). Rewritten to what is left: the "Popup closed early" entry (a malformed request now reads "Couldn't read request") and first-party `profileId` trust (`updateToken` is gone). The flake ledger's row 46 landed in the `e2e-testing` skill with #70.
- **Lessons**: none promoted. `lessons.md` sat 28 B under its 8,192 B budget, and each candidate already lives where its next reader looks, or would have paid for itself only by retiring another plan's live entry. The CSP sources' reasons sit at the policy in `manifest.config.ts`; the recorder, its reach and its gaps in `tests/e2e/README.md`; the stale `dist` and the literal build-flag guard in the `e2e-testing` skill; the object-keyed cache at `artifact-registry.ts`. The zod object union that hides a malformed sibling and the squash merge that retargets a stacked PR stay in [phase 1](lessons/phase-1.md) and [phase 3](lessons/phase-3.md).
- **Seeds retired**: the `/goal` and `/loop` in § Seeds are retired. Do not run them.

# hardening-2 — boundary parsing, storage fences, CSP floor

Five hardening findings in three arcs:

- **Arc 1** parses every dApp call against the full `WalletSchema` at dispatch (#16), and keys the verified-artifact cache by the artifact object instead of its class id alone (#26).
- **Arc 2** makes migration resume refuse a journal that does not match its registered migration, keeps a corrupt or misfiled tombstone's reservation (#19), and closes the two deferred restore-race writers (#18).
- **Arc 3** adds a `default-src` floor to the extension pages' CSP one directive at a time, with every extension context's violations recorded (#23).

What a person can notice is listed under UI impact and in `OWNER-ASKS.md`.

Status: closed on 2026-10-09 (see Outcome). Approved by the orchestrator on 2026-10-08 with one reorder (D-ORD): Arc 3, the CSP floor, shipped first as #70; Arc 1 followed as #71 once PR #48 had landed, and Arc 2 as #72, stacked on Arc 3 (D-ORD2). Each arc's Codex loop converged before its PR opened: Arc 1 at round 2, Arcs 2 and 3 at round 3. No final cross-arc Codex pass is recorded: the arcs merged into `dev` one at a time, each once its own loop had converged.

## Outcome & Quality Bar

**For whom.**

- A person whose wallet is connected to a dApp they do not fully trust. A hostile or buggy dApp sends calls; the wallet must refuse a malformed call before any scope checker, handler or popup reads it.
- The same person after a crash, a tampered storage area, or a deletion that raced a restore. Stored state must never steer the wallet into deleting or resurrecting data.
- A store reviewer reading the manifest, and a maintainer who inherits the CSP.

**What excellent looks like.**

1. Every dApp call except the one OA-1 holds is parsed against the schema the reference wallet uses, after its capability check and before its scope check.
   - A refused call reaches no handler and opens no popup.
   - The dApp receives today's generic text.
   - The refusal never carries an argument value into a log line or a journal row.
   - Proven by a refusal row and a success row per method, red on the base through `dispatch` where they should be.
2. A tampered migration journal can no longer choose keys outside its migration's footprint, and the wallet stops at its existing recovery state with storage untouched. A corrupt or misfiled tombstone keeps its id reserved and is never resumed under another id.
3. The extension pages' CSP has a `default-src 'self'` floor. Both browsers' full suites pass at retry 0 with zero recorded CSP violations in every context the recorder is proven to reach, and each directive's outcome is recorded with its cause. A context the recorder does not reach is named, and the claim is narrowed to match.
4. An artifact served from one PXE store is never accepted on the strength of a class id verified against another store's artifact.
5. A maintainer reads one sentence at each changed site that states the invariant.

**What good enough looks like.**

- No new dApp-facing error code ships now (OA-2), no `requestCapabilities` parse ships now (OA-1), and the activity row for a pre-popup refusal keeps today's label (OA-3).
- No general `isLive` framework is built. No `base-uri` or `form-action` directives are added: they do not fall back to `default-src` and are outside #23.
- Arc 3 widens a directive with the narrowest source a recorded violation names, never by changing markup (D-23b).

## Scope

In: #16, #26 (arc 1); #18, #19 (arc 2); #23 (arc 3).

Out:

- A classified dApp error for schema refusals (OA-2).
- Parsing `requestCapabilities` (OA-1).
- A dedicated activity label for pre-popup refusals (OA-3).
- Tightening the published patch schema of `grantPublicAuthwit`'s content (OA-5).
- The display integrity of artifact fields a class id does not commit to (already a follow-up of the security-fixes-1 lane).

### Issue claims checked against the tree

| Issue | Claim | Result |
|---|---|---|
| #16 | Only authorization fields are validated; the custom handlers coerce with `String()` | **Holds** (`dispatcher.ts:200-251`, `:667-730`). The issue's line refs are a few lines off. |
| #26 | The cache is keyed by class id alone; reachability unsettled | **Holds**, and is reachable under store tampering. Within one trusted store the skip is sound: the store's one writer keys each artifact by the class id computed from it. But one `ArtifactRegistry` serves every PXE runtime (one per profile and chain, each with its own store; `pxe/service.ts:200`, `:939-960`), so a class id verified against one store's artifact skips the check for another store's artifact (F-7). |
| #18 | `updateToken` takes no deletion epoch | **Holds**, but `updateToken` has **no caller** in the product: only its RPC registration and its tests reference it. |
| #18 | Balance commits check deletion, ownership and generation with no await before the write | **Holds**, but the deletion check rests on storage applying a context's writes in call order (I-4), and the malformed-row purge pass deletes without fencing (`purge-rows.ts:79`). Both are closed in Phase 5. |
| #19 | Resume trusts the journal's refs | **Holds**, and also its `entries`: any non-reserved key in `entries` is written. Live today: a version-1 journal passes the range check while no migration 1 is registered. |
| #19 | A corrupt tombstone loses its reservation | **Holds**, on both the live path (`profile/service.ts:1517-1520`) and the resume path (`:1587-1590`). Found in audit: a tombstone stored under one id but naming another drives hydration and resume for the named id (`:452`, `:1572`). |
| #23 | No `default-src`; a first floor broke every network e2e | **Holds**. No record names the first attempt's cause (Inference I-7). |

## Assumptions

### Facts

- F-1. No code on the extension path parses dApp args against `WalletSchema`. Upstream's iframe handler parses the same `jsonStringify`-ed bytes with `parseWithOptionals` (recon #16).
- F-2. `wallet-bridge` already depends on `@aztec-labs/aztec.js` and `@aztec-labs/foundation`; Biome lets it import them (`packages/wallet-bridge/package.json`, `biome.json:322-340`).
- F-3. A zod-4 parse transforms values, refuses extra trailing args, accepts `null` for `optional()` args, refuses `requestCapabilities(null)`, and refuses a `batch` leg that names a patched method. A schema transform can throw a plain `Error` that quotes the value: `Fr.fromString` on an over-modulus value (`NM(foundation)/src/schemas/utils.ts:59-63`, `curves/bn254/field.ts:60-61`).
- F-4. The full `requestCapabilities` schema refuses capability types outside the six known ones. The connect window renders those as an "unknown" row with its own copy (`popup/windows/capabilities/build-items.ts`, `unknownRow`). Upstream's batch union includes `requestCapabilities` (`NM(aztec.js)/src/wallet/wallet.ts:622`, `:667`).
- F-5. Every unclassified throw reaches the dApp as "The wallet could not process the request." (`error-envelope.ts`). Every non-scope refusal of a top-level `sendTx` fails its queued activity row as `popup_bound`, which reads "Popup closed early" (`queued-journal.ts:236-245`, `journal-state.ts:250-251`).
- F-6. `dispatcher.test.ts:3080-3084` pins capability-before-arguments for an ungranted `simulateTx`. `method-descriptors.ts:85-88` pins "extra args stay ignored".
- F-7. `ContractStore.addContractArtifact` is the only writer of the artifact map, and both production callers pass no class preimage, so the store key is computed from the artifact (`NM(pxe)/src/storage/contract_store/contract_store.ts:137-165`; `NM(pxe)/src/pxe.ts:468`, `:925`). Nulo reaches it only through `PxeService`'s `pxe.registerContractClass` calls (`packages/aztec-runtime/src/pxe/service.ts:445-447`, `:471-472`, `:616`), which serve dApp registration, backup restore (`account-state/service.ts:411`) and the stub account. Upstream's `getContractArtifact` returns the same object for a class id for the life of its PXE instance (an unbounded in-memory map, `NM(pxe)/dest/storage/contract_store/contract_store.js:132-145`). Nulo's `verifiedClassIds` is a `Set<string>` on the one registry every runtime shares (`artifact-registry.ts:43`, `:143`).
- F-8. `updateToken` has no caller outside its RPC registration and tests. Its event `onTokenUpdated` is subscribed by `token-balance/service.ts:152`.
- F-9. `applyProjectedOk` dispatches `storage.set` in the tick of its fence checks (`balance-job-queue.ts:361-378`). `purgeForTokens` fences each typed row before deleting it, but its malformed-row pass does not (`token-balance/service.ts:537-549`, `purge-rows.ts:79`). The projector runs before the commit's re-read (`balance-job-queue.ts:245`, `:355`).
- F-10. `resumeIfInterrupted` checks only the version range before `restore()` trusts `refs` and `entries` (`migrator.ts:336-350`, `:390-401`).
- F-11. `clearIfSame` keeps a corrupt or other-epoch tombstone, and both callers release the id anyway (`tombstone-repository.ts:59-62`; `profile/service.ts:1517-1520`, `:1587-1590`). `validPayloads()` drops the storage key, so the payload's `profileId` drives hydration and resume.
- F-12. Firefox inherits the base CSP. No test pins the CSP. No page has inline script or a static inline style in its HTML; runtime-generated styles are not covered by this fact.
- F-13. The e2e capture covers fixture-opened pages only (`fixtures/extension.ts:238-252`). Puppeteer's `WebWorker` hears only console API calls and exceptions, not `Log.entryAdded`, where Chrome reports CSP violations. Offscreen documents have no `chrome.storage` (`src/e2e/proof-gate.ts:20`).
- F-14. `test:e2e` never builds: it runs `dist/<browser>` as left by the last build (`tests/e2e/global-setup-smoke.ts:14-18`). `migration.test.ts` and `backup-migration.test.ts` skip unless built with `VITE_NULO_E2E_MIGRATION_FIXTURE=1` and run with `NULO_E2E_MIGRATION_FIXTURE=1` (`migration.test.ts:38`; `.github/workflows/_extension-smoke-e2e.yml:102-150`).
- F-15. Nine extension test files mock `@nulo/wallet-sdk-schema-patch/register` with an empty module.
- F-16. In CSP3, `object-src` falls back to `default-src`; `worker-src` falls back to `child-src`, then `script-src`, then `default-src`. Today's `script-src` already refuses `blob:` workers.

### Inferences (attack these)

- I-1. Stock-SDK traffic, including the playground's custom calls, passes the full parse. Basis: F-1 and the identical serialization. Arc 1's network gate proves it for every method except `isTokenRegistered` and `getWalletFeatures`, which have no network e2e; their unit rows use `jsonStringify`-shaped values. It does not prove every deployed SDK version conforms.
- I-2. Cutting args to the schema tuple's length costs no security, because no reader indexes past the tuple. Phase 1 step 2 verifies it.
- I-3. Running the capability check before the parse leaks nothing: the schema is public, and a capability error depends only on the stored grants.
- I-4. Chrome and Firefox apply one context's `storage.local` writes in call order. Phase 5 no longer depends on it: both balance writers re-check after their write.
- I-5. A tombstone with another epoch cannot arise without storage tampering, because a reserved id cannot be deleted again.
- I-6. The parse runs in the service worker, and the execution layer parses an artifact again in the offscreen PXE. With batch legs parsed only on re-entry, each artifact is parsed once in the worker.
- I-7. The first floor attempt broke network e2e because `connect-src` fell back to `'self'` and blocked every node RPC. Arc 3's recorder will name the cause either way.
- I-8. `securitypolicyviolation` fires in the service worker, the offscreen document, extension pages and Firefox's background page. Phase 6 probes each context and records any gap.

### Asks (each shipped in its safest form now; the owner decides later)

- A-1 → OA-1: parse `requestCapabilities` with the full upstream schema? Ships now: not parsed, also as a batch leg.
- A-2 → OA-2: a classified dApp error for schema refusals? Ships now: today's generic text.
- A-3 → OA-3: what a person sees when the wallet refuses a malformed call before any popup? Built now: the refusal, with today's activity label. Arc 1 merges only after the owner signs off.
- A-4 → OA-4: an `http://[::1]` node URL, if CSP cannot express it. Ships now: `connect-src` keeps it reachable.
- A-5 → OA-5: tighten the published patch schema for `grantPublicAuthwit`'s content? Ships now: unchanged.
- **Arc 1, answered 2026-10-08:** OA-1 C, OA-2 B, OA-3 B (`OWNER-ASKS.md` § Answers). Arc 1 builds those, not the ship-now forms above (D-16j to D-16l).

## Architecture & Implementation

### Arc 1 — boundary parsing and artifact trust

**The parse module.** One new module in `packages/wallet-bridge` owns the parse:

```ts
// packages/wallet-bridge/src/wallet-schema-args.ts
import { WalletSchema } from "@aztec-labs/aztec.js/wallet"
import { getSchemaParameters, parseWithOptionals, schemaHasMethod } from "@aztec-labs/foundation/schemas"
import { applyNuloSchemaPatch } from "@nulo/wallet-sdk-schema-patch/apply"
import type { MethodName } from "./method-descriptors"

/** A refused dApp argument list. Its text is fixed and names only the method: the parser's own
 *  errors quote argument values, and this message reaches journal rows. Unmapped by the dApp error
 *  envelope, so a dApp still receives the generic text. */
export class InvalidWalletArgumentsError extends Error {}

/** Refuses an argument list the reference wallet's schema refuses, after cutting it to the
 *  schema's own arity (extra trailing args stay ignored). A pass/fail predicate: the parsed value
 *  is discarded, so every later layer reads the exact wire args. */
export async function assertWalletSchemaArgs(method: MethodName, args: readonly unknown[]): Promise<void>
```

- **Schema copy.** The module builds one private copy at load: `const SCHEMA = { ...WalletSchema }; applyNuloSchemaPatch(SCHEMA)`. It mutates no global and does not depend on the host's import order. Test mocks of the `register` entry cannot disable it (F-15). `@nulo/wallet-sdk-schema-patch` moves to `dependencies`.
- **Parse.** `parseWithOptionals(args.slice(0, items.length), getSchemaParameters(SCHEMA[method]))`. Every throw, zod's or a transform's, becomes `new InvalidWalletArgumentsError(\`Invalid arguments for wallet method: ${method}\`)` with no `cause`.
- **Fail closed.** A method with no schema entry throws the same refusal.
- **Skipped.** `batch` (each leg is parsed when it re-enters) and `requestCapabilities` (OA-1). The skip set carries one reason per method.
- **The arity guards.** The `argSchema` predicates' existing refusal throws the same class and text, so both refusals log alike.
- **Logging.** `background.ts`' `isExpectedRefusal` adds `InvalidWalletArgumentsError`, so a dApp that repeats a malformed call writes `debug` lines, not `error` lines.

**Guard ladder after the change** (`dispatcher.ts`, `dispatch`):

1. session read (unchanged, once per message);
2. `assertKnownMethod`, then the `argSchema` arity predicate (unchanged; `argsBatch` validates the batch envelope);
3. the batch popup-leg prescan, moved here from `handleBatch` so it still answers before any leg runs;
4. `enforceCapability` (unchanged);
5. **`await assertWalletSchemaArgs(method, args)`** (new);
6. `enforceScope` / `enforceScopeWithSession` (unchanged);
7. route to the handler or build the operation (unchanged).

`enforceMethodAndScope` splits into `enforceMethodAndCapability` (steps 2-4, sync) and `enforceScopeFor` (step 6, sync), with the await between them. Both stay under the complexity budget.

**What the parse replaces.** `assertAuthRelevantArgShape` is deleted. Every field it checks is required by the execution-payload, function-call or address schema, and the parse now runs before any scope checker. For its five methods (`sendTx`, `profileTx`, `executeUtility`, `createAuthWit`, `registerToken`), the order moves from shape-before-capability to capability-before-shape. An ungranted origin that sends a malformed call now gets the capability error (`4100`) instead of the generic text.

**Batch.**

- The outer call is checked by `argsBatch` (envelope) and the popup-leg prescan.
- Each leg re-enters `dispatch()` and runs its own capability check, then its own parse. A leg naming `requestCapabilities` takes today's path.
- An origin with no grants therefore cannot make the worker parse any large argument.
- A batch runs legs in order and stops at the first refusal, as today.

**Revocation during the parse.** The parse reads no authorization state: the session row and grants are captured before it, as today. Popup routes re-read the session after it (`DappInteractionService.execute`, `dapp-interaction/service.ts:419`, `:447`). Execution routes run under the admission fence captured in `handleWalletMessage`. The await is of the same kind as the awaits already between entry and the handler.

**#26.**

- `verifiedClassIds: Set<string>` becomes `verified: WeakMap<ContractArtifact, string>`, mapping an artifact object to the class id it was verified against. `verifyAndCache` skips the recompute only when `verified.get(artifact) === classId.toString()`.
- Cost: upstream returns one stable object per class id per PXE instance (F-7), so each artifact is verified once per runtime, which today's cache already pays after every worker restart.
- Effect: an artifact read from another runtime's store, or deserialized again after an upstream cache miss, is a new object and is verified before use. The `known` branch is unchanged: its map is built from load-time-computed class ids.
- One sentence at the field states the invariant: a skip requires the very object that was verified, because one registry serves every runtime's store.

### Arc 2 — storage fences

**#19 journal.** In `resumeIfInterrupted`, after the `version >= backup.version` branch and before `restore(backup)`, add one check through a private helper `journalMatchesRegistry(backup): string | undefined`. It returns a fixed reason or `undefined`:

- no registered migration has `version === backup.version`: `"names no registered migration"`;
- the set of canonical refs (`root:<root>` / `value:<key>`) differs from the set of the migration's `[...reads, ...writes]`: `"does not match the migration's declared footprint"`;
- an `entries` key lies outside the migration's declared refs (the `footprintKeysFor` predicate): `"holds a key outside the migration's declared footprint"`.

A reason returns `{ kind: "needs-recovery", reason: \`interrupted migration journal ${reason} (version ${backup.version})\`, retryable: false }`. The journal is kept and nothing is written or removed, which matches the engine's stance on a present but invalid backup.

What this does and does not guarantee:

- It confines a restore to the registered migration's footprint.
- It does not authenticate the journal. A forged journal with the right refs and empty `entries` still clears that footprint, and `counted` still steers the retry count. A writer with that access could delete the same keys directly; both are recorded as residuals.
- A shipped migration's footprint becomes immutable: changing it turns an interrupted journal into a non-retryable recovery. The registry header and `template.ts` say so.

**#19 tombstone.**

- `TombstoneRepository` decodes a row as valid only when its schema parses **and** its `profileId` equals the id in its storage key. A misfiled row is treated as corrupt: reserved under its key's id, never hydrated, never resumed, and counted by `corruptIds()`.
- `clearIfSame(id, epoch): Promise<boolean>` returns `true` when no raw key remains for `id`: it removed a matching row, or none was there. It returns `false` for a corrupt row or a row of another epoch, and leaves the row.
- `ProfileService` gets one private helper, `clearTombstoneAndRelease(id, epoch)`, used at both call sites. It releases the reservation only on `true`.
- The in-memory reservation then mirrors the durable raw key, which every boot rebuilds it from. A corrupt raw key reserves its id at every boot until manual recovery.

**#18.**

- `updateToken` is deleted: from `TokenService`, its `rpcMethods` entry, `TokenServiceClient` and `spec.ts`. The `onTokenUpdated` event goes with it: the client's `EventHandler`, the spec entry, `TokenBalanceService`'s subscription and handler (`token-balance/service.ts:152`, `:491-505`), and the test stubs. The `balance-identity.ts:7` comment is reworded.
- Both balance writers become correct whatever order storage applies writes in:
  - After `await this.repo.set(updated)`, `applyProjectedOk` re-checks `isBalanceInvalidated(result.id)`. If the id was invalidated during the write, it deletes the row, fails the task with `"Balance record deleted mid-sync"` and emits nothing.
  - `writeSyncFailure` (`balance-job-queue.ts:209-230`) gets the same post-write re-check and compensating delete, and returns without emitting; it holds no task id, and its callers have already failed the task.
  - One private helper serves both, so the rule lives once.
  - This is safe because a fenced id is never reallocated in the worker's lifetime: creation and restore both allocate through `allocateIdAvoiding` (`balance-repository.ts:68`), so the delete cannot hit a successor.
- `purgeMalformedRows` gains an optional `beforeDelete(storageId)` hook, called synchronously right before `storage.delete`. Both raw passes, in `purgeForTokens` and in `purgeForAccounts` (`token-balance/service.ts:580-587`), pass one hook. It fences `canonicalNumericStorageId(storageId)` and does nothing for a non-canonical key: deleting key `"01"` must not fence the live row `1`. Then every row either purge deletes is fenced before its delete.

### Arc 3 — CSP floor

**Directive inventory.** These are the directives whose fallback reaches `default-src` and that pages use: `connect-src`, `font-src`, `style-src`, `frame-src` (through `child-src`), `media-src`, `object-src`, `manifest-src`. `img-src` and `script-src` are already explicit. `worker-src` falls back to `script-src` first, so the floor does not change it (F-16).

**Target policy** (`manifest.config.ts`; Firefox inherits it). Explicit directives are added one at a time while `default-src` is absent. The last commit adds `default-src 'self'` and drops each explicit directive that then equals it:

```
default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; img-src 'self' data: blob:;
connect-src 'self' https: <http sources>
```

Sources by directive:

- **`<http sources>`.** Every URL `RpcUrlSchema` accepts must stay reachable (`network/spec.ts:161`).
  - Phase 7 probes whether both browsers honour `http://localhost:* http://127.0.0.1:* http://[::1]:*`. The CSP host grammar has no IPv6 literal, so a browser may drop the `[::1]` source.
  - If both honour it, that list ships.
  - Otherwise `http:` ships, which keeps a saved `http://[::1]` URL working, and OA-4 asks whether to narrow it.
- **Presto and CoinGecko.** Covered by `https:` and the loopback sources.
- **Other directives.** A directive gets a `data:`, hash or `'unsafe-inline'` source only on a recorded violation that names it (D-23b).

**Violation recorder** (e2e builds only), following the existing `src/e2e/*-gate.ts` pattern:

- `src/e2e/csp-report.ts`, armed by `VITE_NULO_E2E_CSP_REPORT=1`. It is imported first in every extension entry: the service worker, the offscreen document, and the popup, onboarding and setup pages. Firefox's background page is the worker entry.
- It listens for `securitypolicyviolation`. For each event it records `{ context, directive, blocked, source }`: the blocked URI reduced to its origin by `scrubUrls` (or the browser's keyword, `inline` or `eval`), and the source file, scrubbed the same way, with its line (D-23j).
- It writes to `chrome.storage.session` under `nulo:e2e:csp-violations`. The offscreen document has no `chrome.storage`, so it forwards over its existing runtime channel to the worker.
- Unarmed builds drop it by dead-code elimination.
- `_build-extension.yml` refuses the flag in a release environment and greps release bundles for the marker, like the other e2e stamps.
- `apps/extension/scripts/e2e/agent.sh` and the source-build steps of the smoke and network e2e workflows (Chrome and Firefox) set the flag.
- The check lives in the `close` that `launchExtension` returns (`tests/e2e/fixtures/extension.ts:92`), so it covers every launch, including the migration tests that close their own contexts. Before shutting the browser it awaits the recorder's pending writes in the worker, reads the key, then closes in a `finally`, and fails on any entry.
- Armed runs prove the recorder is live: when the worker's recorder loads it creates the key as an empty list **only if the key is absent**, and every append goes through the same serialized chain, so a later context or a successor worker never erases earlier entries. An armed run (`NULO_E2E_CSP_REPORT=1` at run time, set by the same callers) fails on a missing key. An unarmed run, such as the release-artifact smoke, skips the check.
- A report still in flight from the offscreen document when `close` runs can be missed; the functional failure of the suite remains the backstop there.

**Trade-offs and alternatives not taken.** See the Decision ledger.

### File-level change map

| Arc | File | Change |
|---|---|---|
| 1 | `packages/wallet-bridge/src/wallet-schema-args.ts` | new: `assertWalletSchemaArgs`, `InvalidWalletArgumentsError` |
| 1 | `packages/wallet-bridge/src/wallet-schema-args.test.ts` | new: per-method refusal and success tables |
| 1 | `packages/wallet-bridge/src/dispatcher.ts` | ladder split and await; prescan moved; `assertAuthRelevantArgShape` deleted; arity refusal throws the new class |
| 1 | `packages/wallet-bridge/src/index.ts` | exports `InvalidWalletArgumentsError` |
| 1 | `packages/wallet-bridge/src/dispatcher.test.ts` | ordering, batch, raw-args and base-red tests; fixtures to wire shape; `Malformed …` pins replaced |
| 1 | `packages/wallet-bridge/src/{dapp-grant,account-order}.characterization.test.ts`, `apps/extension/src/wallet/services/wallet-sdk/background.refusal-log.test.ts` | fixtures to wire shape where the parse now refuses them |
| 1 | `apps/extension/src/wallet/services/wallet-sdk/background.ts` | `isExpectedRefusal` adds the new class |
| 1 | `packages/wallet-sdk-schema-patch/src/apply.ts` (+ `apply.pins.test.ts`) | `isGrantAuthwitShape` checks the content object's four keys |
| 1 | `packages/wallet-bridge/package.json`, `bun.lock` | schema patch moves to `dependencies` |
| 1 | `packages/wallet-bridge/README.md`, `CLAUDE.md` (§ Custom RPC schema patch) | the ladder; the bridge patches its own schema copy |
| 1 | `packages/aztec-runtime/src/pxe/artifact-registry.ts`, `apps/extension/src/wallet/services/pxe/artifact-registry.test.ts` | the verified cache keyed by artifact object; one invariant sentence |
| 2 | `packages/wallet-core/src/migration/migrator.ts` (+ test) | `journalMatchesRegistry` before `restore` |
| 2 | `apps/extension/src/wallet/storage/migrations/{index,template}.ts` | "a shipped footprint is immutable" |
| 2 | `apps/extension/src/wallet/services/profile/tombstone-repository.ts` (+ test) | key/payload identity; `clearIfSame` returns whether the key is gone |
| 2 | `apps/extension/src/wallet/services/profile/service.ts` (+ `service.integration.test.ts`) | `clearTombstoneAndRelease` at both sites |
| 2 | `apps/extension/src/wallet/services/token/{service,client,spec}.ts`, `token-balance/service.ts`, `token-balance/balance-identity.ts`, and the test stubs that name `onTokenUpdated` | `updateToken` and `onTokenUpdated` deleted |
| 2 | `apps/extension/src/wallet/services/token-balance/balance-job-queue.ts` (+ tests) | post-write invalidation re-check and compensating delete in both writers |
| 2 | `apps/extension/src/wallet/services/purge-rows.ts`, `token-balance/{balance-repository,service}.ts` (+ tests) | `beforeDelete` hook; both balance raw passes fence first |
| 3 | `apps/extension/manifest/manifest.config.ts` | the policy, one directive per commit |
| 3 | `apps/extension/src/manifest.test.ts` | exact-string pin on both manifests |
| 3 | `apps/extension/src/e2e/csp-report.ts` (+ test), the five entry modules | the recorder |
| 3 | `apps/extension/tests/e2e/fixtures/extension.ts` | the check inside `launchExtension`'s `close` |
| 3 | `.github/workflows/_build-extension.yml`, `_extension-smoke-e2e.yml`, `_extension-network-e2e.yml` (and the Firefox lanes' source-build steps), `apps/extension/scripts/e2e/agent.sh` | arm the flag for source builds; refuse and grep it in release builds |
| 3 | `apps/extension/tests/e2e/README.md`, `FIREFOX.md` | the recorder's reach per browser |
| 3 | `apps/extension/store/remote-code.md` | the `manifest.config.ts:47-49` citation, if the lines move |

### Files another lane also touches

- **PR #48** (security-fixes-1 arc 1, draft) edits `packages/wallet-bridge/src/dispatcher.ts` (imports, `handleRequestCapabilities`, `enforceCapability`), `method-descriptors.ts` (`refusedInBatch` on `grantPublicAuthwit`), `capability-negotiation.ts`, `README.md`, `dispatcher.test.ts`, `stored-grants.test.ts`, `dapp-grant.characterization.test.ts`, and the extension's `background.refusal-log.test.ts`.
  - The overlap is semantic, not only textual. PR #48's new tests reach scope with friendly fixtures (`"0xtok"`, `intent(TOKEN)`), which the parse refuses.
  - **Arc 1 lands after PR #48.** Its Phase 1 converts PR #48's tests to wire shape too.
  - The prescan move keeps PR #48's batch refusal text.
- **security-fixes-1 arc 2** edits `apps/extension/src/wallet/services/profile/service.ts` near `:2572-2650`; this plan edits `:1517-1520` and `:1587-1590`. It also adds `packages/aztec-runtime/src/pxe/artifact-class-id.test.ts`; this plan adds a different file in the same directory.
- **security-fixes-1 arc 3** edits `account/service.ts` and `incoming-transfer/service.ts`; neither is touched here.

The implementer rebases each arc on whatever has landed on `dev` and re-runs that arc's gate.

## Security & Adversarial Considerations

**Threat model.**

- **#16:** a malicious or compromised connected dApp, the primary attacker. It controls every argument of every call, can bypass the SDK with a raw protocol client, and can repeat calls.
- **#19:** tampered `chrome.storage.local`: a hostile journal or tombstone.
- **#18:** a full-backup restore racing a profile deletion.
- **#23:** any content injection into an extension page that the CSP would contain: style or font exfiltration, a remote frame or object, a connection over an unexpected scheme.

**Input validation at the trust boundary (#16).**

- **Coverage.** The parse runs before any scope checker or handler reads the args. Its output is discarded, so no layer sees a value the dApp did not send; a test proves the handler receives the wire strings.
- **No value leaks.** Every throw inside the parse, a transform's plain `Error` included, becomes fixed text with no `cause`. The queued `sendTx` row stores the error message (`failQueuedForError`), and the journal detail page shows it in developer mode. A sentinel test proves no argument value survives.
- **No pre-authorization cost.** The parse runs after the capability check, and batch legs are parsed only after their own. An origin with no grants cannot make the worker parse a large payload; it gets the same `4100` whatever it sends.
- **Fail closed.** The bridge patches its own schema copy and refuses a method with no entry, so neither an import-order change nor a test mock can turn the parse into a pass. The patch's drift check for `grantPublicAuthwit` verifies the content object's keys, not only its arity.
- **Second line.** The custom handlers keep their own checks (`String()` coercion, session-account resolution). `grantPublicAuthwit`'s `caller` and `contract` stay `z.string()` in the published patch (OA-5), next to a function-name string and an ABI argument array; its execution path still validates the addresses it builds from and encodes the arguments against the ABI.
- **Log reach.** Refusals log at `debug`, so a dApp cannot fill every user's log buffer with `error` lines.

**Storage integrity (#19).**

- The resume check runs before `restore()` writes or removes anything, and a mismatch keeps the journal. It never self-heals, in line with the lesson that a failed integrity check must refuse.
- Residual: an in-footprint forged journal, and the trusted `counted` flag (Architecture).
- The tombstone changes can only keep a reservation longer and never resume a misfiled row, following the lesson that a row's identity is anchored on its storage key.

**Race closure (#18).**

- Deleting `updateToken` removes a storage writer and an event from the popup RPC surface.
- Both balance writers compensate after their write, so their correctness no longer rests on storage ordering.
- Every row either purge deletes is fenced first, by its canonical id only.

**Artifact trust (#26).** A tampered PXE store (one runtime's IndexedDB or OPFS) is the attacker. A verified class id no longer vouches for an artifact object it was not computed from, so an artifact from another runtime's store is verified before use. Residual: same-id artifacts that differ only in fields the class id does not commit to.

**CSP (#23).**

- The floor refuses remote stylesheets, fonts, frames, objects and media, and every connection but `'self'`, `blob:`, `http:` and `https:`, in every extension context. Inline styles stay allowed (D-23h); `blob:` reaches no network (D-23k).
- `connect-src https:` stays broad because a person may save any HTTPS node URL. It is containment, not exfiltration control: after a script injection, `https:` remains a channel. The strict `script-src` is the defence there.
- A widened `style-src`, if needed, uses hashes before `'unsafe-inline'`.
- The recorder exists only in e2e builds, and a release-build guard refuses it.

**Least privilege and supply chain.**

- No new dependency enters the lockfile: the schema patch is a workspace package already installed.
- No credential or permission changes.
- The workflow edits only set an e2e build flag on source builds and add a release guard. Arc 3's gate runs `test:ci-gating`, `test:release` and `lint:actions`.

**Crypto.** None added or changed.

## UI impact

- **Arc 1, as signed off by the owner on 2026-10-08 (OA-1 C, OA-2 B, OA-3 B).** Only a dApp that sends a malformed call, which a stock SDK does not, sees any of it.
  - Connect window: unchanged for every conforming dApp, its "unknown" row included. A request with a malformed header, or a known permission type with a bad field, is refused before any window opens.
  - Approval window: a call with malformed fields that used to open it now opens none.
  - Activity: a queued `sendTx` the parse refuses fails its row as **"Couldn't read request"** (the History and Home card, and the record's outcome), with the explanation "The app sent a request the wallet could not read. Nothing was sent." on the record's page, as a scope refusal reads "Not allowed". Nothing else on the row changes. A malformed call outside the grant reads the same, since the parse runs before the scope check. The PR carries the card and the record in both themes.
  - dApp-facing text: one new classified refusal, `-32602` with `walletErrorCode: "INVALID_PARAMS"` and "The request's arguments do not match the wallet API.". Extra trailing arguments stay ignored, as today.
- **CSP: none intended.** A directive that breaks a page's styles, fonts or frames is a defect, fixed by widening that directive with the narrowest source the violation names, never by changing markup (D-23b).

## Implementation phases

Commands use `<WT>` for the worktree root. Every phase records its attempts in `lessons/phase-N.md`.

**Smoke build recipe.** `test:e2e` runs whatever `dist/<browser>` holds (F-14), so every smoke gate builds first:

```
cd <WT>/apps/extension && VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 [VITE_NULO_E2E_CSP_REPORT=1, arc 3] bun run build:<browser>
cd <WT>/apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 [NULO_E2E_CSP_REPORT=1, arc 3] NULO_E2E_BROWSER=<browser> bun run test:e2e -- <files> --retry=0
```

`e2e:agent` builds its own `dist/<browser>`. Run the smoke recipe after any `e2e:agent` run, never before it.

### Arc 1 (layer 2, branch `hardening-2-dapp-parse`, after PR #48 lands): merged as #71

#### Phase 1 — #16: parse every dApp call against the schema ✓

**Arc 1: done 2026-10-09.** Built with the owner's answers, not the ship-now forms steps 4, 8 and 9 name (D-16j to D-16q). Evidence, the I-2 table and the red-on-base results: `lessons/phase-1.md`.

1. Rebase on `dev` with PR #48 merged. Add the module and the ladder step. Run `bun run --cwd packages/wallet-bridge test` and `bun run test`. Record in `lessons/phase-1.md` which existing tests the parse now refuses.
2. Verify I-2. For each parsed method, list every `args[N]` read in the dispatcher, the scope checkers and the handlers. Confirm `N` is below the method's tuple length. Record the table in the lessons file.
3. Write `wallet-schema-args.ts` as in Architecture. Move `@nulo/wallet-sdk-schema-patch` to `dependencies`, then run `bun install`.
4. In `dispatcher.ts`, split the ladder. Put the awaited parse between capability and scope. Move the batch popup-leg prescan ahead of the capability check. Delete `assertAuthRelevantArgShape` and its call. Make the arity refusal throw `InvalidWalletArgumentsError` with its existing text.
5. Add the class to `isExpectedRefusal` in `background.ts`. Export it from `packages/wallet-bridge/src/index.ts`.
6. Tighten `isGrantAuthwitShape` in `apply.ts` to require `caller`, `contract`, `method` and `args` in the content object. Add one incompatible same-arity row to `apply.pins.test.ts`.
7. Convert existing test fixtures to wire shape (hex addresses and fields, full `FunctionCall` objects), PR #48's tests included.
   - A file may `vi.mock("./wallet-schema-args")` only when its subject is downstream logic. Each such mock carries a one-line reason at the mock.
   - `dispatcher.test.ts`'s ordering and boundary sections never mock it.
8. Add `wallet-schema-args.test.ts` with two `test.each` tables over the 18 parsed methods.
   - **Refused:** one malformed call per method, a class the old guards accepted. Examples: a non-hex address, a `FunctionCall` without `selector`, an `Fr` at or above the modulus built from sentinel digits.
   - **Allowed:** one valid call per method; each resolves. Include one row with an extra trailing argument and one with `null` for an optional argument.
   - **Shape.** Build every fixture from real `AztecAddress` and `Fr` values passed through `jsonStringify` and `JSON.parse`, never from friendly literals.
   - **No leak.** Assert each refusal's message exactly. Assert that the error has no `cause` and that its text contains no sentinel digits.
9. Add dispatcher tests:
   - A granted `sendTx` with a malformed payload rejects with the fixed message, and `dappInteractionService.execute` is never called. Control: the wire-valid call reaches it.
   - The handler receives the wire strings, not parsed objects: `execute` gets the same `to` string the dApp sent.
   - An ungranted `simulateTx` with malformed args still rejects with `CapabilityNotGrantedError` (keep the pin at `:3080-3084`).
   - An ungranted `batch` with a malformed `registerContract` leg rejects with `CapabilityNotGrantedError`.
   - A batched `requestCapabilities`, and `requestCapabilities(null)`, behave as today. This pins OA-1's ship-now form.
   - A `batch` with a `registerToken` leg still gets the popup-leg message.
   - A `batch` whose second leg is malformed runs the first leg and then refuses, as today.
10. Prove red on base through `dispatch`, for the newly closed paths only: the malformed-call refusals and the no-leak rows. Copy each onto the base SHA's sources (`git show f5ca160:<path>`), never `HEAD`. Run it. Record that it fails for the expected behavioural reason (the call was routed, or a different error), then discard the copy. The preservation rows (the raw-args row, ungranted `simulateTx`, `requestCapabilities(null)`, the batched `requestCapabilities`, the popup-leg batch, the partial batch) must pass on base too: they guard behaviour the parse must not change.
11. Update `packages/wallet-bridge/README.md` (the ladder). Update `CLAUDE.md` § Custom RPC schema patch: the bridge patches its own schema copy for its parse.

**Validation gate (Phase 1).**

- Commands:
  - `cd <WT> && bun run lint && bun run typecheck:all`
  - `cd <WT> && bun run --cwd packages/wallet-bridge test && bun run --cwd packages/wallet-sdk-schema-patch test`
  - `cd <WT> && bun run test && bun run test:all`
  - `cd <WT> && NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/batch-mixed.test.ts tests/e2e/network/batch-partial-failure.test.ts tests/e2e/network/meta-batch.test.ts tests/e2e/network/meta-getChainInfo.test.ts tests/e2e/network/meta-getAccounts.test.ts tests/e2e/network/cap-request-basic.test.ts tests/e2e/network/cap-window.test.ts tests/e2e/network/scope-refusal.test.ts tests/e2e/network/err-scope-and-cap.test.ts tests/e2e/network/sim-methods.test.ts tests/e2e/network/execute-scope-account.test.ts tests/e2e/network/authwit-variants.test.ts tests/e2e/network/authwit-lifecycle.test.ts tests/e2e/network/tx-sendTx-default.test.ts tests/e2e/network/tx-sendTx-noFrom.test.ts tests/e2e/network/tx-sendTx-multicall.test.ts tests/e2e/network/tx-sendTx-delegated-authwit.test.ts tests/e2e/network/register-token.test.ts tests/e2e/network/contracts-register.test.ts tests/e2e/network/contracts-getMetadata.test.ts tests/e2e/network/contracts-getClassMetadata.test.ts tests/e2e/network/data-addressBook.test.ts tests/e2e/network/data-privateEvents.test.ts tests/e2e/network/data-registerSender.test.ts tests/e2e/network/public-events-capability.test.ts`
- Pass criteria:
  - Every command exits 0, and `bun run lint` reports no complexity-manifest drift.
  - Each newly closed path failed on the base copy for its expected reason; each preservation row passed there.
  - The network files pass at retry 0. This proves I-1 for every method they call.
- Layers: typecheck/lint, unit, network e2e on Chrome. Nothing here touches fixtures, focus, windows or WebAuthn.

#### Phase 2 — #26: key the verified cache by the artifact object ✓

**Arc 1: done 2026-10-09.** As written; evidence in `lessons/phase-2.md`.

1. In `artifact-registry.ts`, replace `verifiedClassIds` with `verified: WeakMap<ContractArtifact, string>` and change `verifyAndCache` as in Architecture. Replace the field's doc-comment with the one-sentence invariant.
2. In `apps/extension/src/wallet/services/pxe/artifact-registry.test.ts`, with the existing fake verifier:
   - **Refused.** Resolve class id X through a `pxe-local` lookup that returns artifact `a` (the verifier accepts it). Then resolve X through a lookup that returns a different object `b` that the verifier refuses. Assert `undefined` and that the verifier saw `b`. This is the cross-store case, and it must fail on the base copy, where the second resolve returns `b` unchecked.
   - **Cached.** Resolving X twice through a lookup returning the same object `a` calls the verifier once.
   - **Same object, other id.** Resolving `a` under another class id calls the verifier again.
3. When the arc's PR opens, post the finding on #26: the shared registry across runtimes (F-7), the change, and the remaining limit (artifacts sharing a class id differ only in fields the id does not commit to, which no recompute catches). The PR body carries `Closes #26`.

**Validation gate (Phase 2).**

- Commands:
  - `cd <WT>/apps/extension && bun --bun vitest run src/wallet/services/pxe/`
  - `cd <WT> && bun run --cwd packages/aztec-runtime test`
  - `cd <WT> && bun run lint && bun run typecheck:all && bun run test:all`
  - `cd <WT> && NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/contracts-register.test.ts tests/e2e/network/contracts-getMetadata.test.ts tests/e2e/network/contracts-getClassMetadata.test.ts tests/e2e/network/tx-sendTx-default.test.ts`
- Pass criteria:
  - Every command exits 0, the network files at retry 0.
  - The refused row fails on the base copy of `artifact-registry.ts`; the cached and other-id rows pass on both.
- Layers: unit, lint, typecheck, network e2e on Chrome (registration, lookups and a prover-on send through the changed path).

### Arc 2 (layer 3, branch `hardening-2-storage-fences`): merged as #72

#### Phase 3 — #19: resume refuses a journal its registry did not write ✓

1. Add `journalMatchesRegistry` and the check before `restore(backup)`, as in Architecture.
2. In `migrator.test.ts`, give each hand-built journal a registered migration whose footprint matches it. Two examples: the `noop` at `:288` gets `reads: [rootRef("acct"), rootRef("newroot")]`, and the value-key test gets its value ref.
3. Add one test per refused class. Each asserts that the result is `needs-recovery` with `retryable: false`, that the journal is still present, and that no other key was written or removed (compare full store snapshots).
   - The version is in range, but no migration has it (`baselineVersion: 3`, migrations `[2]`, journal version 3).
   - The refs differ from the declared footprint: one extra root, and one declared root missing (`test.each`, two rows).
   - An `entries` key lies outside the declared footprint.
4. Keep a success control: a genuine interrupted journal for the registered migration restores and resumes.
5. Add "a shipped migration's footprint is immutable" to the header of `migrations/index.ts` and to `template.ts`'s steps, with the reason.

**Validation gate (Phase 3).**

- Commands:
  - `cd <WT> && bun run --cwd packages/wallet-core test`
  - `cd <WT>/apps/extension && bun --bun vitest run src/wallet/runtime.migration-gate.test.ts src/wallet/storage/migrations/ src/wallet/services/backup/`
  - The smoke build recipe on Chrome, then `migration.test.ts backup-migration.test.ts`
  - `cd <WT> && bun run lint && bun run typecheck:all`
- Pass criteria:
  - Every command exits 0.
  - Both smoke files report 0 skipped.
  - Each new refusal test fails on the base copy of `migrator.ts`.
- Layers: unit, smoke e2e (the 9001 fixture's crash-resume).

#### Phase 4 — #19: tombstones keep their reservation and their identity ✓

1. Make `TombstoneRepository` decode a row as valid only when its `profileId` equals its key's id: `get`, `validPayloads` and `corruptIds`.
2. Change `clearIfSame` to return `Promise<boolean>`, as in Architecture.
3. Add `clearTombstoneAndRelease` to `ProfileService` and use it at both call sites.
4. In `tombstone-repository.test.ts`:
   - A `test.each` over `clearIfSame`: same epoch (true, removed), other epoch (false, kept), corrupt (false, kept), absent (true).
   - A misfiled row (key `@A`, payload `B`) is absent from `validPayloads()`, present in `corruptIds()`, and its id `A` is reserved.
5. In `profile/service.integration.test.ts`:
   - Corrupt the raw tombstone during the purge (the deletion delegate's `runFor` writes garbage to the key). After `deleteProfile`, the id is still reserved and the raw key is present.
   - Control: a clean deletion releases the id and removes the key.
   - A misfiled tombstone at boot neither hydrates nor resumes a deletion of the profile it names, and that profile survives `resumePendingDeletions`.

**Validation gate (Phase 4).**

- Commands:
  - `cd <WT>/apps/extension && bun --bun vitest run src/wallet/services/profile/ src/wallet/services/profile-deletion/`
  - `cd <WT> && bun run lint && bun run typecheck:all`
- Pass criteria: every command exits 0. The corrupt-tombstone and misfiled-tombstone tests fail on the base copies.
- Layers: unit, integration.

#### Phase 5 — #18: close the two deferred writers ✓

1. Delete `updateToken` and `onTokenUpdated` as in Architecture, with their tests and stubs. Reword the comment in `balance-identity.ts:7`.
2. Run `bun run build` so `auto-imports.d.ts` regenerates. Confirm that `git grep -n -e updateToken -e onTokenUpdated -- apps packages` prints nothing.
3. In `applyProjectedOk` and `writeSyncFailure`, add the post-write re-check and compensating delete through one private helper. Keep both functions under the complexity budget.
4. Add `beforeDelete` to `purgeMalformedRows`, and pass the fencing hook from both raw passes (`purgeForTokens`, `purgeForAccounts`).
5. Tests in `token-balance/`:
   - **Typed purge.** Park the commit's re-read after storage returned the row: wrap `repo.get` to await a gate after reading. While parked, run `purgeForTokens([tokenId], profileId)`, as the deletion coordinator does, then release. Assert: no row, the task failed with `"Balance record deleted mid-sync"`, no `onBalanceUpdated`. The test must fail when `invalidateAndDelete`'s fence line is removed; record that check.
   - **Reordered storage.** A `test.each` over the two writers (a projector success and a projector error). Use a fake storage area that applies the purge's delete before the writer's set. Assert that the compensating delete leaves no row and nothing is emitted.
   - **Malformed pass.** A `test.each` over the two purges (`purgeForTokens`, `purgeForAccounts`). Same parking, but the row turns malformed in storage before the purge's raw pass. Assert no row survives the commit.
   - **Non-canonical key.** A malformed row under key `"01"` is purged while row `1` is live and syncing. Row `1`'s commit still writes and emits.
   - **Control.** The same sync with no purge writes the row and emits once.
6. Write the closing rationale for #18 into the arc's PR body.

**Validation gate (Phase 5, and the Arc 2 gate).**

- Commands:
  - `cd <WT> && bun run lint && bun run typecheck:all`
  - `cd <WT> && bun run test && bun run test:all`
  - `cd <WT> && NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/backup-restore-integrity.test.ts tests/e2e/network/backup-migration-roundtrip.test.ts tests/e2e/network/profile-reimport-matrix.test.ts tests/e2e/network/delete-after-prove.test.ts tests/e2e/network/account-balance-orphans.test.ts tests/e2e/network/balance-row-reconciliation.test.ts tests/e2e/network/token-management.test.ts tests/e2e/network/tokens.test.ts`
  - Then, as a separate run (it carries `@requires-proverless`, which `agent.sh` refuses unarmed): `cd <WT> && NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/backup-restore-sw-restart.test.ts`
  - Then the smoke build recipe on Chrome, then `migration.test.ts backup-migration.test.ts security-reset.test.ts`
- Pass criteria:
  - Every command exits 0 at retry 0, and the smoke files report 0 skipped.
  - The `git grep` in step 2 prints nothing.
  - Each fence test fails with its fence removed.
- Layers: typecheck/lint, unit, integration, network e2e (restore and purge), smoke e2e.

### Arc 3 (layer 1, branch `worktree-hardening-2`): merged as #70

#### Phase 6 — record before tightening ✓

1. Pin today's policy in `manifest.test.ts` on both manifests, as an exact string. Each directive commit updates the pin.
2. Add the recorder, its unit test, its imports, the release guard and the flag wiring (Architecture). The unit test proves that an entry recorded before a successor context's recorder loads survives that load. Record each browser's reach in `tests/e2e/README.md` and `FIREFOX.md`.
3. Add the check to `launchExtension`'s `close` (Architecture) as a small helper that takes the reader, so a test with a fake reader proves: an armed run with a missing key fails, an entry fails, an empty list passes, and the browser closes even when the check throws.
4. Probe each context on both browsers with a local build that is never committed:
   - Documents (popup, onboarding, offscreen): a temporary `style-src 'none'`.
   - The worker and Firefox's background page: a temporary `connect-src 'none'`.
   - Check capture at worker startup, and in a successor worker after `stopBackground`.
   - Record each result in `lessons/phase-6.md`.
   - A context counts as covered only when its probe was recorded. A context whose violations never reach the recorder is a named gap: the Outcome narrows the zero-violation claim to the covered contexts, and the functional failure of the suites is that context's only gate.

**Validation gate (Phase 6).**

- Commands:
  - `cd <WT> && bun run lint && bun run typecheck:all && bun run test`
  - `cd <WT> && bun run test:ci-gating && bun run test:release && bun run lint:actions`
  - The smoke build recipe with the recorder armed, full suite, on Chrome and then on Firefox.
- Pass criteria:
  - Every command exits 0, and both full smoke runs pass at retry 0 with today's policy.
  - Each run's `dist/<browser>/manifest.json` CSP equals the pinned string.
  - The probe results are recorded for every context on both browsers.
- Layers: unit, CI-gating, smoke e2e on Chrome and Firefox (the fixtures changed).

#### Phase 7 — one directive at a time ✓

Order: `connect-src`, then `font-src`, `style-src`, `frame-src`, `media-src`, `object-src`, and last `default-src 'self'` with the redundant explicit directives removed. For each directive:

1. Add the directive with the sources the Architecture lists, and update the pin. For `connect-src`, first run the `[::1]` probe: a loopback HTTP server bound to `::1`, fetched from the popup and the offscreen document on both browsers. Record the result. Then choose between the precise sources and `http:` (OA-4).
2. Run the per-directive gate below on both browsers.
3. When a violation is recorded, widen only that directive with the narrowest source it names. For a static `<style>` element or style attribute, that is its hash, with `'unsafe-hashes'` for attributes, on both browsers. Use `'unsafe-inline'` only for dynamic or numerous styles. Re-run. Record the directive, the violation, the source added and why in `lessons/phase-7.md`.
4. Commit the directive by itself: `fix(extension): add <directive> to the extension pages' csp`.

Per-directive gate:

- Commands (Chrome, then the same with `NULO_E2E_BROWSER=firefox`):
  - The smoke build recipe with the recorder armed, full suite.
  - `cd <WT> && NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/connect-dapp.test.ts tests/e2e/network/tx-sendTx-default.test.ts tests/e2e/network/frozen-account-canary.test.ts tests/e2e/network/passkey-execution-canary.test.ts tests/e2e/network/opfs-storage.test.ts tests/e2e/network/backup-restore-integrity.test.ts tests/e2e/network/price-fixture.test.ts tests/e2e/network/networks.test.ts`
- Pass criteria:
  - Every run exits 0 with zero recorded violations.
  - The built manifest's CSP equals the pin.

**Validation gate (Phase 7, and the Arc 3 gate).**

- Commands:
  - `cd <WT> && bun run lint && bun run typecheck:all && bun run test && bun run test:all`
  - `cd <WT> && bun run test:ci-gating && bun run test:release && bun run lint:actions`
  - The smoke build recipe with the recorder armed, full suite, on Chrome and then on Firefox.
  - The network suite split as CI splits it (`pr-extension-network-e2e.yml`), on Chrome and then again with `NULO_E2E_BROWSER=firefox`, one run at a time:
    - Proverless, everything but the five prover-on canaries: `cd <WT> && NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent --exclude tests/e2e/network/transfers.test.ts --exclude tests/e2e/network/tx-sendTx-default.test.ts --exclude tests/e2e/network/frozen-account-canary.test.ts --exclude tests/e2e/network/passkey-execution-canary.test.ts --exclude tests/e2e/network/delete-after-prove.test.ts`
    - Prover-on, the five canaries: `cd <WT> && NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/transfers.test.ts tests/e2e/network/tx-sendTx-default.test.ts tests/e2e/network/frozen-account-canary.test.ts tests/e2e/network/passkey-execution-canary.test.ts tests/e2e/network/delete-after-prove.test.ts`
- Pass criteria:
  - Every smoke and network run passes at retry 0 with the final policy and zero recorded violations, on both browsers. Each built manifest's CSP equals the pin.
  - Read a red honestly: rerun once for a fingerprint in the `e2e-testing` skill's flake ledger, fix anything else.
  - `lessons/phase-7.md` holds one entry per directive.
  - Never run two `e2e:agent` runs in this worktree at once.
- Layers: unit, CI-gating, smoke and network e2e on Chrome and Firefox (prover-on canaries included).

## Decision ledger

**Chosen outline: A, revised by round 1 and the final pass (D-16c and D-26 now take B's side).** The competing outline B was drafted to force a real choice:

> **Outline B (uniform and tolerant).** #16: parse in `background.ts` before `dispatch`, slice extra args to the tuple length, keep `requestCapabilities(null)`, parse `requestCapabilities` fully, keep `assertAuthRelevantArgShape`. #26: replace the class-id cache with an identity-keyed `WeakMap<ContractArtifact, string>`. #18: fence `updateToken` and the balance commit with the deletion epoch through a shared `isLive(profileId, epoch)` helper. #19: at resume, ignore the journal's refs, restore the registered footprint, drop out-of-footprint entries. #23: add `default-src 'self'` first, open every fallback wide, then tighten one at a time.

| # | Decision | Chosen | Rejected and why |
|---|---|---|---|
| D-16a | Where the parse runs | Inside the dispatcher | `background.ts` (B): batch legs re-enter `dispatch()` and would go unparsed. |
| D-16b | Position in the ladder | After capability, before scope | Before capability: breaks the pinned capability-first order (F-6), and an ungranted origin could make the worker parse large payloads. |
| D-16c | Extra trailing args | Cut to the tuple length, then parse (B; round 1) | Refuse them (A, draft): reverses a pinned tolerance, and the stock proxy forwards `...args`, so `wallet.getAccounts(undefined)` arrives as `[null]`. Cutting costs no security once I-2 is verified. |
| D-16d | `requestCapabilities` | Not parsed now, also as a batch leg (OA-1) | Full parse (B): refuses unknown capability types, removing the connect window's "unknown" row, which a person sees. |
| D-16e | Refusal text and class | Existing text; an internal class the envelope does not map, logged at `debug` | A new classified dApp error: a new dApp-facing message (OA-2). A plain `Error`: logs at `error`, so a dApp could fill every user's log. |
| D-16f | `assertAuthRelevantArgShape` | Delete | Keep (B): a second hand-written mirror of the schema, now weaker than the parse before every reader. |
| D-16g | Batch popup-leg prescan | Before the capability check | After the parse: legs are parsed only on re-entry, so the prescan must answer before any leg runs, keeping PR #48's text. |
| D-16h | Patch activation | A private copy patched with `applyNuloSchemaPatch` (round 1) | The `register` side effect (A, draft): nine test files mock it empty (F-15), and it couples the bridge to import order. Rely on the host: same coupling. |
| D-16i | Batch parsing | Envelope only; each leg parsed on re-entry after its capability check (round 1) | The upstream batch union (A, draft): parses every leg before any capability check (pre-authorization cost), parses `requestCapabilities` legs (breaks OA-1), refuses patched read-only legs, and makes a malformed later leg block earlier ones. |
| D-26 | Cache | Keyed by artifact object (B; final round) | Keep the class-id key with a source tripwire (A, draft): sound within one trusted store, but the registry serves every runtime's store, so it vouches across stores; the tripwire watches upstream keying, not that. B costs one verify per artifact per runtime, because upstream returns a stable object per class id (F-7). |
| D-18a | `updateToken` | Delete, with `onTokenUpdated` | Fence it (`captureExecutionFence` at entry, assert before `set`, `isCurrent` after `set` with compensation, as `persistToken`): correct, but it maintains a fence and an event for code no flow runs. Fallback if review rejects deletion. |
| D-18b | Balance commit | Post-write re-check with compensation; fence the malformed pass (round 1) | No code change (A, draft): rests on unproven storage ordering, and the malformed pass deleted unfenced. Deletion epoch (B): redundant with the per-row fence, which covers every deleted row. |
| D-18c | General `isLive` gate | Not built | Two writers, one dead and one fenced per row: no consumer for a framework. |
| D-19a | Mismatched journal | Fail closed, journal kept | Derive and restore the registered footprint (B): silently repairs tampered state, while the engine already fails closed on an invalid backup. |
| D-19b | Tombstone release | Only when the raw key is gone; identity anchored on the key (round 1) | Release always: the bug. Never release before boot: a clean deletion would keep its id reserved for the worker's life. |
| D-23a | Directive order | Explicit directives first, `default-src` last, then drop the redundant ones | `default-src` first (B): the first attempt shows a floor-first change breaks everything at once and hides causes. |
| D-23b | Inline styles | Narrowest source on evidence: hash, then `'unsafe-inline'` (round 1) | Automatic `'unsafe-inline'` (A, draft): wider than a recorded need. Rewrite markup: changes what a screen renders without sign-off. |
| D-23c | Capture | An e2e-only `securitypolicyviolation` recorder in every context, with a release guard (round 1) | DevTools capture through `BrowserDriver` (A, draft): Puppeteer's worker hears no CSP log, persistent attachment changes worker lifecycle, and Firefox's reach is unproven. |
| D-23e | Zod's `eval` probe, recorded under today's policy in the background, onboarding and offscreen (implementation, Phase 6) | Turn zod's JIT off with `src/utils/zod-jitless.ts`, an import-free module every entry imports first, which sets the flag on zod's shared global config | Exempt `script-src` / `eval` in the check: it would hide every other `eval` attempt. Leave it: Phase 6's gate cannot pass at zero violations. `z.config()` from a module that imports zod: its chunk evaluates after a chunk that already built a schema (`lessons/phase-6.md`). |
| D-23f | How the recorder is gated out of release builds (implementation, Phase 6) | Each entry tests `import.meta.env.VITE_NULO_E2E_CSP_REPORT === "1"` as a literal | A constant in `src/e2e/config.ts`, as the other e2e gates do: rolldown splits a module that several entries import into its own chunk before it folds the constant, so the recorder shipped, unused, in an unarmed build. A bare side-effect import: always shipped. |
| D-23g | Who writes the record (implementation, Phase 6) | The background alone; every document forwards over `runtime.sendMessage` | Pages writing `storage.session` themselves (the plan's text): several writers' read-modify-write appends on one key race and lose entries. |
| D-23h | `style-src` sources (implementation, Phase 7) | `'self' 'unsafe-inline'`: CodeMirror's `style-mod` writes a generated `<style>` element in the logs and JSON viewers, recorded on both browsers | The Presto banner's hash alone (tried first): CodeMirror's text is generated and rewritten as themes mount, so no hash names it, and any hash switches `'unsafe-inline'` off. A static `EditorView.cspNonce`: a nonce shipped in the bundle admits any injected `<style>` that copies it. Mounting the editors in a shadow root, where `style-mod` uses `adoptedStyleSheets`: changes the viewers' markup and styling, a UI change. |
| D-23i | Checking a launch that reloads the extension (implementation, Phase 7) | `ExtensionContext.checkCspViolations()` before the reload; the close after it only closes | The check at close (phase 6): on Firefox the in-place reload's boot took the migration retry token while the check held the browser open, and the close killed that run midway. |
| D-23j | The recorded entry's shape (implementation, Phase 6) | `{ context, directive, blocked, source }` | `{ context, directive, blockedOrigin }` (the plan's text): an inline or `eval` violation has no origin, only the browser's keyword, and the scrubbed source file and line are what names the code to fix or hash. |
| D-23k | `blob:` in `connect-src` (implementation, Phase 7) | Added on Firefox's recorded violation: it checks `downloads.download` of a blob URL against `connect-src`, and every export downloads one | Leave it out (the plan's source list): every Firefox export and backup download broke. A blob URL names data already in memory, so the source opens no network destination. |
| D-ORD | Arc order (orchestrator, 2026-10-08) | Arc 3 first as layer 1 on `worktree-hardening-2`, then Arc 1 (layer 2, a new branch once PR #48 lands), then Arc 2 (layer 3) | The planned order 1-2-3: Arc 1 must wait for PR #48, and Arc 2 overlaps files PR #52 is changing, while Arc 3 touches neither. |
| D-23d | IPv6 loopback | Probe; fall back to `http:` and ask (round 1) | Ship `http://[::1]:*` unprobed: the CSP host grammar has no IPv6 literal, so a saved endpoint could silently break. |

### Arc 2 decisions (implementation)

| # | Decision | Chosen | Rejected and why |
|---|---|---|---|
| D-ORD2 | Arc 2's base (orchestrator, 2026-10-09) | Stack on layer 1 (`worktree-hardening-2`, Arc 3), with `origin/dev` merged in | On layer 2 as the Delivery table says: Arc 1 waits on its own PR, and Arc 2's files (`wallet-core` migrator, `profile/`, `token/`, `token-balance/`) do not overlap Arc 1's (`wallet-bridge`, `pxe/artifact-registry`). |
| D-19d | The refusal text of a mismatched journal (review round 1) | The engine's existing invalid-journal result, one text for every check | The three reasons in Architecture: `MigrationBarrier.vue` renders the engine's reason verbatim (`runtime.ts` stores it as the blocked detail), so each would be new copy on the recovery screen, outside this plan's UI impact. Which check refused is a storage-forensics detail. |
| D-18d | Where the raw purge pass fences (review round 1) | `onMatch`, for every matched row before its bytes re-check | `beforeDelete`, right before the delete (Architecture): a commit that rewrote a malformed row's bytes between the snapshot and the re-read was spared unfenced and survived the purge. Safe early: the balance allocator never hands out an existing key or a fenced id, and the raw passes hold the allocation lock. |
| D-18f | A raw-pass row a commit rewrote valid meanwhile (review round 2) | A second typed pass after the raw pass, both purges sharing one helper | Fence-only (round 1): a commit that finished before the hook ran left the row valid, in scope and fenced. A raw pass first: its predicate also matches valid rows, which it would delete without the delete event. |
| D-18e | The post-write re-check's shape (review round 1) | Inline in each writer, in the tick the write resumes; a sync helper returns the compensating delete or `undefined` | An awaited helper (as first built): its return hop let a purge fence and delete the row between the check and the caller's emit. |
| D-19c | An engine-namespace key in a journal's `entries` (Phase 3) | Refused with the other out-of-footprint keys | Filtered at restore as before: the journal is then not one the engine wrote, and the check refuses rather than repairs (D-19a). `restore()` keeps its filter as defence in depth. |

**Unresolved disagreements.**

- None open. D-26 was split in round 1: Opus judged B marginally stronger, Codex judged A stronger since neither authenticates persisted bytes. The final Codex pass judged B marginally stronger as runtime defence and A defensible only under a trusted store. Checking the tree settled it: one registry serves every runtime's store, and upstream's stable per-runtime objects make B cheap. B adopted.

### Arc 1 implementation decisions (2026-10-09)

| # | Decision | Chosen | Rejected and why |
|---|---|---|---|
| D-16j | `requestCapabilities` (owner, OA-1 C) | Parsed: the header, each entry an object with a string `type`, known types through `CapabilitySchema`, then the wallet's own `projectRequestedCapabilities`; unknown types pass to the window; `requestCapabilities(null)` still asks for nothing | Skipped (D-16d, the ship-now form): superseded. Refusing `null` (Codex, design consult): there is no header to parse, it opens and grants nothing, and an existing pin made the tolerance deliberate. |
| D-16k | Refusal class and text (owner, OA-2 B) | `InvalidWalletArgumentsError` (`INVALID_PARAMS`) in `@nulo/extension-messaging/errors`, rebuilt across the transport; the envelope answers `-32602` with one constant message | The class in `wallet-bridge` (the plan's file map): the envelope classifies it and `REBUILT_AS` rebuilds it, both on the messaging layer. The unmapped class (D-16e): superseded. |
| D-16l | The refused row (owner, OA-3 B) | A new journal outcome, `malformed_request`, labelled "Couldn't read request" | "Popup closed early" (the ship-now form): superseded. |
| D-16m | Arity refusals | The parse's class and text, so `INVALID_PARAMS` on the wire | The unclassified constant: two answers for one fault. |
| D-16n | Envelope mapping | The four constant-message envelopes as one table | A fourth `if`: over the cognitive budget. A suppression: forbidden. |
| D-16o | `argsRequestCapabilities` | Deleted | Kept: an arity refusal ahead of a method with no capability check, and the parse covers its shape. |
| D-16p | Test fixtures | Converted to wire shape in place, with helpers exported as `@nulo/wallet-bridge/testing`; no file mocks the parse | `vi.mock` per file (allowed by step 7 for downstream subjects): no file needed it once the helpers existed. |
| D-16q | Parse tables | 15 refused rows (every method that takes an argument) and 20 allowed rows (every registry method) | 18 rows each (step 8): `requestCapabilities` is now parsed, and a method with an empty tuple has nothing to refuse. |

## Audit verdicts

### Round 1 — Codex (gpt-6.1-sol, high; session `01a11cf4-4932-7f03-8f4e-47aed7c75ef7`)

**Verdict: conditional approve** (with conditions: fence raw balance purges, repair CSP validation, bound batch parsing, obtain owner approval for changed behavior).

| # | Sev | Finding | Resolution |
|---|---|---|---|
| C1 | High | The malformed-row pass deletes without fencing; "every deleted row is fenced" is false | **Accepted.** Verified (`purge-rows.ts:79`). The `beforeDelete` hook fences first (D-18b). |
| C2 | High | `batch` is capability-exempt, so its union parse lets an ungranted origin force large parses | **Accepted.** Envelope-only batch check; legs parsed after their own capability check (D-16i). |
| C3 | High | The capture proof cannot work as drafted: the worker shows no style violation, and page listeners do not prove browser-diagnostic coverage | **Accepted.** Recorder per context (D-23c). Probes by context type: style for documents, fetch for the background. Startup and successor-worker checks. |
| C4 | Medium | `http://[::1]:*` is not a portable host source; `object-src` does fall back to `default-src` | **Accepted.** Probe plus OA-4 (D-23d); fallback statement corrected; directive inventory added. |
| C5 | Medium | `isGrantAuthwitShape` accepts any object, so the drift guarantee is overstated | **Accepted.** The four content keys are checked; one pins row. |
| C6 | High | A forged in-footprint journal still clears its footprint; `counted` steers retries; a misfiled tombstone targets another profile | **Accepted.** The guarantee is restated as footprint confinement, with the residuals recorded. Tombstone identity anchored on the key (D-19b). |
| C7 | Medium | The new await needs a revocation regression test (moderate confidence) | **Rejected, with verification recorded.** The parse reads no authorization state. Popup routes re-read the session after it (`dapp-interaction/service.ts:419`, `:447`), and execution routes run under the admission fence. A unit test with a mocked interaction service would prove only the mock. |
| C8 | Medium | Owner asks omit behaviour the outline changes (popup suppression, strict args, batch semantics) | **Accepted in part.** Cutting args and envelope-only batch remove the args and batch changes. Popup suppression and the activity label are OA-3, shipping as the lane brief directs, with the before/after recorded. |
| C9 | Medium | Tests that pass without proving: projector parked "after the re-read" is impossible; a missing module is not base-red; storage ordering unproven; `git grep` hits the plan | **Accepted.** The re-read is parked after storage returns; mutation checks; base-red through `dispatch`; post-write compensation removes the ordering dependency; `git grep` scoped to `apps packages`. |
| C10 | Medium | Blanket style widening needs a narrower rule; broad `https:` remains a channel after injection | **Accepted.** Hash first (D-23b); the containment residual is stated. |

### Round 1 — Opus 5.5 (Plan agent)

**Verdict: conditional approve** (with conditions: fix findings 1 through 6; send findings 4, 5 and 8 to the owner as asks).

| # | Sev | Finding | Resolution |
|---|---|---|---|
| O1 | High | Smoke gates can pass untested: `test:e2e` never builds, and the migration files skip without fixture flags | **Accepted.** Verified (F-14). Smoke build recipe; pass criteria require the built manifest's CSP to equal the pin and 0 skipped. |
| O2 | High | The outer batch parse precedes leg capability checks and ships OA-1 option B for batched `requestCapabilities` | **Accepted** (same fix as C2; D-16i). Tests pin both. |
| O3 | Medium | A transform's plain `Error` quotes the value and could reach the journal row | **Accepted.** Every throw becomes fixed text without `cause`; an over-modulus sentinel row. |
| O4 | Medium (owner) | "UI impact: none" is wrong: "Popup closed early" for a refusal with no popup; scope refusals move label; the approval window no longer opens | **Accepted.** OA-3 and the UI impact section rewritten. The refusal itself ships as the lane brief directs; the final pass made layer 1's merge wait for the owner's OA-3 sign-off. |
| O5 | Medium | Refusing extra args is a compatibility change; `isTokenRegistered` and `getWalletFeatures` lack network e2e | **Accepted.** Cut to the tuple length (D-16c); I-1 scoped; unit rows use `jsonStringify` shapes. |
| O6 | Medium | Puppeteer's worker hears no CSP violations; Firefox's reach unproven | **Accepted** (D-23c, the recorder). |
| O7 | Medium | `connect-src http://[::1]:*` may not work; dev-server HMR is ungated | **Accepted in part.** Probe plus OA-4. The dev server is out of scope: the policy governs built pages, and `bun run dev` is a contributor tool no gate runs. Recorded in `lessons/phase-7.md` if the floor breaks it. |
| O8 | Medium | Side-effect activation breaks under the nine `register` mocks | **Accepted.** Private patched copy (D-16h). |
| O9 | Medium | Deleting `updateToken` leaves `onTokenUpdated` and its listener behind | **Accepted.** Deleted together. |
| O10 | Medium | PR #48 overlap is semantic: its friendly fixtures reach scope | **Accepted.** Arc 1 lands after PR #48 and converts its tests. |
| O11 | Low | `object-src` fallback; `worker-src` falls back to `script-src`; refusals log at `error`; tripwire should pin a single writer; footprint immutability; `counted`; "reserved until next boot" wrong; base-red meaningless for a new module; handlers-get-raw-args test missing; `grantPublicAuthwit` content is `z.string()`; capability-first reorders five methods | **Accepted**, each folded in: F-16 and the inventory, D-16e, the tripwire (later superseded by D-26 B), Phase 3 step 5, the residuals, Architecture wording, Phase 1 step 10, Phase 1 step 9, OA-5, Architecture "What the parse replaces". |

Per-decision views from round 1: both judged A stronger for D-16a, b, e, f and g, D-18a and c, D-19a and b, and D-23a. Opus judged B stronger for D-16c (adopted) and marginally for D-26 (disputed). Both rejected A's D-18b and D-23b as drafted (revised).

### Final — fresh Codex session (gpt-6.1-sol, high; session `01a11d0e-19d5-72d2-a1eb-fcaee9e3201c`)

**Verdict: conditional approve** (with conditions: close the remaining balance race paths, repair validation gates and CSP capture coverage, and require OA-3 sign-off).

| # | Sev | Finding | Resolution |
|---|---|---|---|
| F1 | High | `writeSyncFailure` keeps the storage-ordering dependency: fence before `await repo.set`, no re-check after | **Accepted.** Verified (`balance-job-queue.ts:209-230`). Same post-write re-check and compensating delete through one helper; the reordered-storage test runs over both writers. |
| F2 | High | `purgeForAccounts`' raw pass also deletes unfenced; fence by `canonicalNumericStorageId`, never `Number()` | **Accepted.** Verified (`token-balance/service.ts:580-587`). Both raw passes pass the hook; a non-canonical key fences nothing; a `"01"` vs `1` test row. |
| F3 | Medium | `agent.sh` refuses `@requires-proverless` files unarmed: Phase 5's `backup-restore-sw-restart` and Arc 3's unfiltered full suites cannot run as written | **Accepted.** Verified (`agent.sh:16-34`; eleven marked files). Phase 5 runs that file proverless on its own; Arc 3 runs the suite as CI splits it: proverless without the five canaries, then the canaries prover-on. |
| F4 | Medium | Fixture teardown misses tests that close their own contexts; an absent key passes; probe gaps fall back silently | **Accepted.** Verified (`fixtures/extension.ts:92`, `migration.test.ts:117-201`). The check moves into `launchExtension`'s `close`; armed runs require the recorder's key; a gap context narrows the claim. |
| F5 | Low | "Each refusal and ordering test fails on base" is impossible for preservation rows | **Accepted.** Base-red only for newly closed paths; preservation rows pass on base. |
| F6 | Medium | OA-3 changes behaviour a person notices; "none blocks an arc" bypasses CLAUDE.md's sign-off rule | **Accepted.** Arc 1 is built in the ship-now form, but layer 1 does not merge without the owner's quoted sign-off and a screenshot of the activity row. |
| F7 | Low | OA-5 misstates the schema: `args` is `z.array(z.unknown())` of ABI arguments; only the two addresses are candidates | **Accepted.** Verified (`apply.ts:37-42`). OA-5 and the Security bullet reframed. |
| D-26 | — | Identity keying is marginally stronger runtime defence; A defensible under a trusted store | **Adopted B** after checking the tree (see Unresolved disagreements). |

**Resumed, round 2: conditional approve** (with conditions: preserve recorder history, arm smoke checks at runtime, classify the raw-args test as preservation).

| # | Sev | Finding | Resolution |
|---|---|---|---|
| F2-1 | Medium | A recorder that writes an empty list at load erases earlier entries when another context loads | **Accepted.** Create the key only if absent, serialize appends; a survival test. |
| F2-2 | Medium | The smoke recipe arms the recorder at build time but not the check at run time | **Accepted.** `NULO_E2E_CSP_REPORT=1` added to the recipe's test command for arc 3. |
| F2-3 | Medium | The raw-args row cannot be red on base: base already passes `args[0]` through (`dispatcher.ts:567`, `:572`) | **Accepted.** Moved to the preservation rows. |

**Resumed, round 3: approve.** No new or unresolved material finding.

Confirmed sound by this pass: the prescan move; the shallow schema copy (the patch assigns top-level entries only); the deleted shape checks are covered by the schemas; compensation cannot hit a successor (both creation and restore allocate through the fenced allocator); registry matching confines persisted-journal restores, and no legitimate tombstone writer needs a mismatched identity; worker capture is feasible per the CSP3 reporting algorithm, pending the probes; a synchronous first import keeps listener registration; every named test file exists.

### Arc 1 implementation — Codex round 1 (gpt-6.1-sol, high; session `01a11eff-cd3c-7fd2-8030-8cff62a36738`)

**Verdict: findings** (five), on `f83703f..f2213dd`. Sound per the pass: the ladder order with batch re-entry and the prescan, fail-closed missing entries, the private patched copy, the capability header and known types, refusals without causes or values, the OA-3 copy, the object-keyed cache.

| # | Sev | Finding | Resolution |
|---|---|---|---|
| C1 | Medium | `MessageHashOrIntentSchema` accepts its inner-hash branch first and strips the rest, while the scope check, the window and the signer read the call branch when `caller` is present: a valid inner hash beside a malformed call reached the approval route | **Accepted.** An intent carrying `caller` or `call` must also parse as a call intent (`wallet-schema-args.ts`). Dispatch regression red without the fix. The only object-or-object union in an argument position. |
| C2 | Low | The queued journal reads `opts.from` before the parse; `String()` on `{ toString: "x" }` throws and logs a warning every user keeps | **Accepted.** `requestedSenderOf` returns `""` (no account) for a non-string `from`, which the parse refuses at dispatch anyway; the sender table now asserts no row warns. Red without the fix. |
| C3 | Low | The cache keys the input object while returning the verifier's result: a verifier returning B for A leaves A cached | **Accepted, then revised by O6.** |
| C4 | Low | `artifact-class-id.ts` recommends a class-id-keyed `Set` cache, the #26 mistake | **Accepted.** Comment states the object-and-id rule. |
| C5 | Low | The `ArgGuard` comment repeats itself; helper comments claim values stay unvalidated | **Accepted.** Condensed to the arity contract; stale helper comments deleted. |

### Arc 1 implementation — Opus 5.5 review (general-purpose agent, alongside Codex round 1)

**Verdict: findings** (six), on `f83703f..f2213dd` plus the uncommitted round-1 fixes. Sound per the review: the ladder, no leaks (the message is a registry name, the envelope constant, the journal text fixed), the schema copy, every registry method has an entry, the projection after the parse, the journal wiring (`journal-state.ts` is the only consumer of the kind), the object-keyed cache.

| # | Sev | Finding | Resolution |
|---|---|---|---|
| O1 | High | The activity card's subtitle has no `malformed_request` arm, so the card reads "Transaction failed" and the signed-off label shows only on the record's page; a malformed out-of-scope call's card moved from "Not allowed" to "Transaction failed" | **Accepted.** The card reads "Couldn't read request", as a scope refusal's reads "Not allowed": the owner's row label, unchanged copy. The first build had kept the generic subtitle on a narrow reading of "nothing else on the row changes"; the screenshots show both surfaces. |
| O2 | Low | A raw client sending `args: null` crashed the arity guards with a bare `TypeError`: the unclassified envelope and an `error` log line per call | **Accepted.** A non-array `args` is the parse's refusal before any guard reads it. Pre-existing. |
| O3 | Low | Passing the schema does not make a value safe to `String()`: `AztecAddress.schema` accepts a Buffer-shaped object, and one with an own `toString: 0` throws at a dozen coercion sites, failing closed with the unclassified envelope and an `error` log line | **Deferred**, pre-existing and fail-closed with nothing leaked; the fix is either every coercion site or a whole-tree walk at the parse, both outside this arc. Carried to the close-out's follow-ups. |
| O4 | Low | The I-2 note said no read goes past the tuple; `enforceScopeWithSession` reads `scopes` and `additionalScopes` on every method | **Accepted.** `lessons/phase-1.md` corrected: those reads can only refuse, so the cut stays safe. |
| O5 | Low | Stale comments: the verifier's cache advice, the guards' "unvalidated", the checker's "unvalidated wire data", a garbled batch sentence, the README's "once per message", `apply.ts` naming only the singleton | **Accepted.** All corrected. |
| O6 | Low | Caching the verifier's returned object (C3's fix) would vouch for an object the verifier never hashed | **Accepted over C3.** The cache stores an artifact only when the verifier returned the object it hashed; a verifier returning another object leaves nothing cached. |

### Arc 1 implementation — Codex round 2 (same session, on `f2213dd..d2f894b`)

**Verdict: findings** (one, low): converged, no material finding. Confirmed each round-1 fix (C1, C2, C4, C5, O1, O2, the playground query) closes its finding; agreed with the C3/O6 resolution and with deferring O3 as a tracked residual (it narrows the claim that every malformed input gets `INVALID_PARAMS`; the failure still closes access).

| # | Sev | Finding | Resolution |
|---|---|---|---|
| C6 | Low | The rewritten scope-checker comment narrates the check and misstates the boundary: the parse refuses a non-string `name` first | **Accepted.** Deleted; the defensive check stays. |

### Arc 3 implementation — Codex round 1 (gpt-6.1-sol, high; session `01a11e54-381a-7dd2-a1ba-a82a128de7e7`)

**Verdict: findings** (four). No release leakage, no externally driven recorder, no directive breakage or unjustified widening, no unrecorded drift found. Fixed in `test(e2e): surface a lost csp record write, …`.

| # | Sev | Finding | Resolution |
|---|---|---|---|
| C1 | Medium | `legal-acceptance.test.ts` (two sites) and `network/backup-restore-sw-restart.test.ts` (two) swallow `ctx.close()`, so a recorded violation in those launches passes | **Accepted.** Verified; those four were the only swallowed context closes. Each now propagates, with its profile cleanup in a nested `finally`. |
| C2 | Medium | A failed append leaves the list unchanged and the flush still answers `true`; a rejected flush is ignored | **Accepted.** The background latches the first lost write and the flush answers it; the reader requires the flush's `true` once the list exists. Every other background `onMessage` listener returns without answering, so the answer is the recorder's. New unit test; it fails when the flush always answers `true`. |
| C3 | Low | `migration.test.ts`'s `afterEach` and `import-dead-rpc.test.ts` skip profile cleanup when the close throws | **Accepted, wider.** Six sites skipped cleanup on a throwing close, two of them a file holding a test master key (`backup-roundtrip`, `network/account-balance-orphans`); each closes in a `try` whose `finally` cleans up. |
| C4 | Low | The recorder header's sentence defending the single flag spends context on a past choice | **Accepted.** Deleted. |

### Arc 3 implementation — Opus 5.5 review (general-purpose agent, alongside Codex round 1)

**Verdict: approve with low-severity follow-ups.** Reviewed through `ac540a9` (Codex round 1's fixes included). Confirmed clean: no path to the recorder from a page, a content script or another extension (`onMessageExternal` is never used, a content script's `sender.url` is its page, `storage.session` keeps trusted-context access); no directive breaks an uncovered path (workers fall back to `script-src`, the Firefox PXE frame is an extension URL, no WebSocket, no `data:` fetch); the flush's answer can only come from the recorder.

| # | Sev | Finding | Resolution |
|---|---|---|---|
| O1 | Low | A close that throws in a `finally` (a read past the budget, an unconfirmed flush) replaces the test's own error | **Accepted as documented.** A per-site guard at every close is not proportionate; `tests/e2e/README.md` § CSP violations states it and the remedy (rerun with `NULO_E2E_CSP_REPORT` unset). |
| O2 | Low | The release grep names only the background's key, so a page recorder shipped alone would pass | **Accepted.** `_build-extension.yml` greps `nulo:e2e:csp-`; neither unarmed dist contains it. |
| O3 | Low | The zod seed's ordering is proven on the armed build only, and its comment says it lands in a chunk of its own | **Accepted, verified.** On unarmed Chrome and Firefox builds the seed is its own chunk and evaluates before zod's `$ZodObject` code in the background, popup, onboarding and offscreen entries (static ESM order; setup loads no zod statically). The comment now states the invariant and why. |
| O4 | Low | Plan drift: the Security bullet still says "non-HTTP connection schemes" are refused, and the record shape changed | **Accepted.** Bullet and Architecture text corrected; D-23j (record shape) and D-23k (`blob:`) added. |
| O5 | Low | Comments: the seed's "imports nothing / every copy of zod", the page recorder's borrowed reason, the check's incomplete failure list, agent.sh's "stamp", the `http:` guard unnamed, a restating sentence in `manifest.test.ts` | **Accepted.** Each rewritten; the `http:` comment names `rpcTransportVerdict`. |
| — | Note | `https:` is redundant next to `http:` (an `http:` source also matches https URLs) | **Kept** for legibility; same reach. |

### Arc 3 implementation — Codex round 2 (same session, on `957af69..d43a198`)

**Verdict: findings** (one, low). C1, C3 and C4 resolved; C2 resolved within a surviving background; no other regression, release-boundary, comment or drift finding.

| # | Sev | Finding | Resolution |
|---|---|---|---|
| C5 | Low | A lost write's latch lives in one background instance: if it is stopped before the check, its successor confirms the flush | **Accepted as a named gap.** Persisting the latch would rely on the storage write that just failed. `tests/e2e/README.md` lists it with the recorder's other gaps, and the unit test's name scopes its claim to that background. |

### Arc 3 implementation — Codex round 3 (same session, on the whole arc)

**Verdict: clean.** No new material finding in `53e77b0...HEAD`; C5 resolved as a named gap; every earlier finding fixed or recorded. The loop converged in three rounds.

### Arc 2 implementation — Codex round 1 (gpt-6.1-sol, high; session `01a11f90-2080-7563-a989-b382c99822fd`)

**Verdict: findings** (two). Confirmed sound: journal check before restore with set comparison, tombstone identity on the key at both release sites, no compensation path onto a successor, canonical-id fencing, complete `updateToken` removal. Fixed in `fix(storage): re-check the balance fence in the emitting tick, …`.

| # | Sev | Finding | Resolution |
|---|---|---|---|
| C1 | Medium | The post-write check ran inside an awaited helper: a purge could fence and delete the row in the hop before the caller completed and emitted, so a purged row was announced | **Accepted, reproduced.** A hop-sweep test (the purges' own fence-and-delete at 0-7 microtasks after each writer's write) failed at 1 hop. The check now runs in the tick the write resumes (D-18e). |
| C2 | Low | The callback doc and the commit's "frozen order" still claimed dispatch order prevents resurrection | **Accepted.** Both, and the service's fence doc, now state the before-and-after checks. |

### Arc 2 implementation — Opus 5.5 review (general-purpose agent, alongside Codex round 1)

**Verdict: approve with findings** (all Low). Confirmed: refusals write nothing and count no attempt; key-anchored tombstones; every fenced id is also deleted; no I/O between the post-write check and the emit with real storage; each test fails for the reason it names.

| # | Sev | Finding | Resolution |
|---|---|---|---|
| O1 | Low | The raw pass skipped a row whose bytes changed between snapshot and re-read without fencing it, so a commit's rewrite of a malformed in-scope row survived the purge | **Accepted** (D-18d), with a call-order unit test that fails with the hook after the re-check. |
| O2 | Low | Fence comments described the storage-ordering guarantee this arc removed; the migrator's "therefore" tied the footprint freeze to the missing authentication | **Accepted** (same as C2); the migrator doc now ties the freeze to the equality. |
| O3 | Low | `CLAUDE.md`'s SFC-ordering example named the deleted `onTokenUpdated` (the plan's grep covered `apps packages` only) | **Accepted.** Now `onTokenAdded`. |
| O4 | Low | `ARCHITECTURE.md` still said a valid backup always restores | **Accepted.** States the registry check and the frozen footprint. |
| O5 | Low | `MigrationBarrier.vue` shows the engine's reason verbatim, so the new reasons were new copy outside UI impact | **Accepted** (D-19d): the refusals reuse the existing invalid-journal text, so the screen reads as an existing state. |
| O6 | Note | Process: `lessons/phase-5.md` untracked, Phase 5 unrecorded, a test being edited | Recorded at the Phase 5 gate. |

### Arc 2 implementation — Codex round 2 (same session, on `311f2fa..833319f`)

**Verdict: findings** (two). C1 and C2 resolved (both writers checked at eight microtask placements). `return await undo` propagates a failed delete and emits nothing; the reused invalid-journal text keeps the non-retryable verdict for every new refusal. Fixed in `fix(balances): sweep a purge's scope again after its raw pass`.

| # | Sev | Finding | Resolution |
|---|---|---|---|
| C3 | Medium | A commit that rewrote a malformed in-scope row valid and finished before the raw pass's `onMatch` ran was unfenced at its post-write check; the bytes guard then spared the row, which survived the purge, fenced | **Accepted, reproduced** with the raw snapshot parked. Both purges now run typed, raw, typed through one helper (D-18f). |
| C4 | Low | `ARCHITECTURE.md` omitted the already-stamped branch, which clears a journal without the registry check | **Accepted.** The rule names both branches. |

### Arc 2 implementation — Codex round 3 (same session, on `6bfd255..6c199fa` and the whole arc)

**Verdict: clean.** C3 and C4 resolved (both purges, both timings, reproduced in memory; foreign-profile rows survive; allocation locking intact). Note, kept as is: a row resurrected between the two typed passes can draw two `onTokenBalanceDeleted` events for one id, and every consumer removes by id idempotently. The loop converged in three rounds.

## Delivery

One `gh stack`, base `dev`, in the D-ORD order. Each layer's PR opens once that arc's gates and its Codex loop have converged; the final cross-arc pass runs before the close-out. Arc 1 rebases on `dev` after PR #48 lands; only layers 2 and up wait for it.

| Layer | Branch | Phases | Stacks on | `/code-review` | PR title (≤ 93 chars) | Closes |
|---|---|---|---|---|---|---|
| 1 | `worktree-hardening-2` | 6-7 (Arc 3) | `dev` | off | `fix(extension): add a default-src floor to the extension pages' csp` | #23 |
| 2 | `hardening-2-dapp-parse` | 1-2 (Arc 1) | layer 1 | off | `fix(dapp): parse every dapp call against the wallet schema at dispatch` | #16, #26 |
| 3 | `hardening-2-storage-fences` | 3-5 (Arc 2) | layer 2 | off | `fix(storage): check resume against its migration, keep tombstone reservations` | #18, #19 |
| 4 | `hardening-2-close-out` | close-out | layer 3 | off | `docs(plans): close hardening-2` | — |

- Start: `gh stack init --adopt worktree-hardening-2` (base `dev`).
- At each arc boundary, after that arc's Codex loop converges: `gh stack add <next-branch>`.
- Delivery: `gh stack sync` if `dev` moved, then `gh stack submit --auto`, then `gh pr edit` each body.
  - Each body states what changed and why, the validation run with outcomes, and the `Closes` lines.
  - Arc 1's body (layer 2) names OA-1 to OA-3 and OA-5, quotes the owner's OA-3 sign-off once given, and attaches the OA-3 screenshot. Arc 3's (layer 1) names OA-4.
  - **Arc 1's layer merges only after the owner's OA-3 sign-off.** If the owner picks another OA-3 option, it lands in Arc 1's layer before that merge.
  - Open each PR without labels. Add `e2e:extension-network` or `e2e:extension-smoke` afterwards only when the path filter would skip a suite the arc needs.
- Close-out: `gh stack add hardening-2-close-out`, the close-out commits, `gh stack submit --auto`, then `gh pr checks --watch` on each PR.
- Merging is the orchestrator's call. Never `--admin`. Never force-push outside `gh stack sync`'s `--force-with-lease` on these branches.

## Post-implementation

Written out for the implementing session; it does not need the blueprint skill.

**Per arc, at its boundary** (after the arc's last phase gate passes, before `gh stack add`):

1. Codex audit. Write the prompt to a file under `~/.cache/nulo-backlog/hardening-2/`. Run `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <WT> high read-only gpt-6.1-sol`. Give it:
   - the arc's diff (`git diff <arc-base>...HEAD`);
   - this plan and its Decision ledger;
   - the arc map: "arc N of 3. Arc 1 parses dApp calls, arc 2 fences storage, arc 3 sets the CSP";
   - the adversarial ask: "What could go wrong? What would an attacker target? What are we trusting that we shouldn't?";
   - the two rules below, verbatim.

   On a quota or 401 error, retry once with `CODEX_ACCOUNT=alejo-icloud`. If that fails, log the failed consult in `lessons/phase-N.md` and continue within scope.
2. Triage. Verify each claim against the repo. Apply accepted fixes, commit, and log the round (verdict, accepted, rejected with reasons) in `lessons/phase-N.md`.
3. Resume the same session with the fix diff: `~/.claude/skills/codex/scripts/resume-codex.sh "" <followup-file> <codex-dir> high`. Repeat until a round yields no new material finding. **Hard stop at three rounds.** If findings are still material after three rounds, stop the arc and report `ARC_FAILED: <arc> <reason>`.

**After all three arcs:** one final cross-arc pass in a **fresh** Codex session over `git diff f5ca160...HEAD`. Ask for seams between arcs, duplication across arcs and drift from this plan. Use the same loop and the same hard stop.

**The no-over-engineering rule** (verbatim in every post-implementation prompt): *"Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."*

**The comment-quality rule** (verbatim in every post-implementation prompt): *"Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."*

**Delivery** per the Delivery section: the first time any PR is opened.

**Close-out** (the stack's docs-only top layer, after the arc PRs exist):

1. Merge `origin/dev` into the close-out branch. Read what other lanes added to `implementations-plan/index.md`, `lessons.md` and `follow-ups.md`; never a union merge.
2. Write `## Outcome` directly after the front matter: the date, the status, what shipped with PR numbers, what was dropped and why, the open items, and the line "The `/goal` and `/loop` seeds below are retired."
3. Promote generalizable gotchas to `implementations-plan/lessons.md`, one line each with a link, under 8 KiB. Dedupe and retire first. Candidates:
   - zod-4 tuples refuse extra args, and a transform throws a plain `Error` that quotes the value;
   - Puppeteer's worker hears no CSP violations, so record them in the page;
   - `test:e2e` runs the last build.
4. Move open items to `implementations-plan/follow-ups.md`: any OA still unanswered, and any directive left wider than planned. Delete entries this lane resolves.
5. Delete `STATUS.md` and `OWNER-ASKS.md` once their content lives in the Outcome and `follow-ups.md`.
6. `git mv implementations-plan/hardening-2 implementations-plan/archive/hardening-2` in its own commit. Repair the links the extra level breaks (`git grep -n hardening-2`). Move the index line to `archive/index.md`.
7. Run `bun run check:plans` on the staged files, then report and wait. Merging is the orchestrator's call.

**Teardown after the merge.**

- Trigger: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/hardening-2/plan.md` succeeds.
- Then run `agent-worktree done hardening-2 --merged`. This session did not enter through `EnterWorktree`, so there is nothing to exit.
- On a refusal, relay its output and stop. Never force.
- Who notices the merge:
  - A `/loop` session checks the trigger on every firing.
  - A `/goal` session arms one background wait after its wrap-up report: `until git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/hardening-2/plan.md; do sleep 300; done`.

## Seeds (draft; finalized after approval; not run by the planner)

Recommended: `/goal`, because completion is visible in the transcript.

```
/goal All phases marked ✓ in implementations-plan/hardening-2/plan.md, each backed by its validation gate reported passing in the transcript; for each phase `LESSONS_FILE=implementations-plan/hardening-2/lessons/phase-N.md` printed; `/code-review` NOT run (code_review: off); the Codex fix loop converged for each of the three arcs and for the final cross-arc pass, each shown by a resumed Codex pass reporting no new material findings, quoted in the transcript; the four-layer gh stack exists on GitHub, opened only after every loop converged (`gh stack view` in the transcript), with the close-out layer's archive-move commit shown by `git show --stat`; `bun run test` and `bun run lint` both exit 0 in the transcript.
```

Alternative: `/loop 15m`.

```
/loop 15m Drive implementations-plan/hardening-2 forward. Never idle. Each firing: (1) Reality check: read plan.md (from the stack's top layer once a stack exists) and lessons/; if implementations-plan/archive/hardening-2/plan.md exists on FETCH_HEAD after `git fetch -q origin dev`, run `agent-worktree done hardening-2 --merged`, report, clear this loop and stop; if the live plan is gone but not on dev, babysit CI only. (2) CI waits are fine; confirm progress. (3) No task in hand: take the next pending step; run lint and the touched package's tests after each edit; commit. (4) Stuck: consult Codex (run-codex.sh … high read-only gpt-6.1-sol) and log the consult in lessons; never merge, never push to main, never expand scope. (5) Same step failed 5 times: reassess with Codex. (6) Phase gate green: paste it, mark ✓, print LESSONS_FILE=…; at an arc boundary run the arc's Codex loop (hard stop at 3 rounds) before `gh stack add`. (7) All phases ✓: final cross-arc Codex pass, Delivery, close-out, `gh pr checks --watch`, report, stop.
```

Use exactly one per session.
