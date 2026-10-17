# storage-privacy-1 recon (dev 13d5f8d0)

Two Explore agents (sonnet) plus the lead's own reads and one browser probe.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Note-row key | `noteRecordId` (`apps/extension/src/wallet/services/incoming-transfer/spec.ts:117`), built at `service.ts:1716,1732,2736` | adapt: new arguments |
| Row-to-note matching | `notesByNullifier`, `movedRows`, `needsBracket` (`note-reconcile.ts:25-44`); `service.ts:1564,1591,1601,1616` | adapt: match on the row id |
| The note's protocol identity | `siloNoteHash`, `computeUniqueNoteHash` (`@aztec-labs/stdlib/hash`); `NoteDao.noteNonce`, `noteHash`, `contractAddress` on the PXE wire | reuse, computed in `NoteService.getNotesRaw` |
| Storage double with a whole-area read | `FakeBrowserApi` (`packages/wallet-core/src/testing/fake-browser-api.ts:292`); `storage.local.get(null)` returns every row | reuse as is |
| Composition harness for this service | `incoming-transfer/service.composition.test.ts` (real service, real repository, `svc()` stubs) | adapt: add one test |
| Note fixtures in the scenario suite | `note()` and `noteRecord()` factories (`service.scenarios.test.ts:478-540`) | adapt |
| Area access level | none: no `setAccessLevel` or `TRUSTED_CONTEXTS` under `apps/`, `packages/`, `scripts/` | build new: one small module |
| Worker-start registration pattern | `registerToolbarPopupMessage` (`wallet/utils/toolbar-popup.ts:54`), `registerContentMessageRelay`, called at module scope in `apps/extension/src/wallet/index.ts:46,54` | reuse the pattern |
| Source pin of a call site | `wallet/services/legal/call-sites.test.ts` | reuse the pattern |

## Note rows: the key and its consumers

- The PXE computes a note's unique note hash, `computeUniqueNoteHash(noteNonce, siloNoteHash(contract, noteHash))`, and takes `noteIndexInTx` as that hash's position among the tx's note hashes (`@aztec-labs/pxe@6.0.0-rc.3` `dest/notes/note_service.js:113-154`). Its note store is keyed by the siloed nullifier, and notes are "written once and never mutated" (`dest/storage/note_store/note_store.js:9,37`). The nonce comes from the tx's protocol nullifier, which leaves out gas settings and call arguments (`@aztec-labs/stdlib` `dest/tx/tx_request.js:51-61`), while `txHash` hashes the kernel's public inputs (`dest/tx/tx.js:135-137`). So the unique note hash, not `(txHash, noteIndexInTx)`, is a note's identity.
- The PXE wire carries `noteNonce`, `noteHash`, `contractAddress` (`packages/aztec-runtime/src/pxe/schemas.ts:11-24`); `NoteService` does not copy `noteNonce` today. Worker code already hashes with `@aztec-labs/stdlib/hash` (`wallet/utils/auth-registry.ts:6`); in a worker, `@aztec-labs/foundation`'s poseidon runs on `BarretenbergSync`, initialised in `runtime.ts:467`. Barretenberg does not load under vitest (`apps/extension/tests/COMPOSITION-TESTS.md` D6).
- Record ids reach the popup: route `/popup/received/:id` (`popup/pages/received/[id].vue:99,193`; built at `app.vue:100`, `utils/activity-rows.ts:157`), `useIncomingTransfers.ts`, `useArrivals.ts`. None parses the id. `pub:` ids already carry `|`, so the new form is URL-safe the same way.
- Arrival rows persist record ids: `nulo:core:incoming-arrivals`, `played: [id, block][]`, each id at most `ARRIVAL_ID_MAX` = 200 characters (`arrival-state.ts:13,28-37`). The new id has the old id's length (a 66-character hash in both).
- `repository.ts:245` clears by the `note:${profileId}|${networkId}|` prefix; the new id keeps it.
- No production code reads `record.noteHash` (written at `service.ts:2745` only). No popup code reads a note record's identity fields (`grep noteHash|nullifier` over `popup`, `components`, `stores`, `utils`, `composables`).
- No log line in `incoming-transfer/` prints a record, an id or a `RawNote`.
- Backups carry no incoming-transfer table (`grep incoming` over `backup/` and `wallet/storage/`: none), and no migration names one.
- `getNotesRaw` is in `NoteService`'s RPC surface but has no popup caller; `getNotes` strips the identity fields (`note/service.ts:69-75`).
- The journal's send expiry (`operation-journal/spec.ts:174`) holds the protocol nullifier of the user's own send, read by `transaction/inclusion.ts:52`; this plan does not touch it.
- `LoggerStore` buffers lines in memory and copies them to the global `chrome.storage.session` only with retention on (`wallet/logger/store.ts:45,94-127`); the offscreen frame logger scrubs 32-byte hex.

## Test surface the key change reaches

`siloedNullifier` occurrences: `service.scenarios.test.ts` 55, `activity-rows.test.ts` 21, `RecentActivityView.test.ts` 10, `service.test.ts` 5, e2e `network/incoming-transfers.test.ts` 5, `storage-codecs.test.ts` 3, `network-reset/service.composition.test.ts` 3, `service.composition.test.ts` 3, `note-reconcile.test.ts` 3, `activity.test.ts` 2, one each in `received-display.test.ts`, `received/[id].test.ts`, `useIncomingTransfers.test.ts`, `useArrivals.test.ts`, e2e `helpers/activity-seeds.ts` (used by `rows.test.ts:383,733`). The scenario suite's `note()` defaults to `txHash "0xtx1"` and `noteRecord()` to `"0xtx"`; pairs matched today by nullifier must keep matching by the new id.

## Local storage access level

- Entry: `apps/extension/src/wallet/index.ts` is the Chrome service worker and the Firefox event page (`manifest.firefox.config.ts`: `background.scripts`). Module-scope registrations run before `ConfigStore`/`LoggerStore` are built (lines 46-59).
- Untrusted contexts: one content script, `src/content-script/content.ts`, isolated world, `*://*/*`, `all_frames`, `document_start`; it calls only `chrome.runtime.sendMessage`/`onMessage`. The upstream relay (`@aztec-labs/wallet-sdk@6.0.0-rc.3` `dest/extension/handlers/`) has no `storage` reference. The built manifest has no `web_accessible_resources` and no sandbox pages. The offscreen document is an extension page.
- Typings: `chrome-types@0.1.439` declares `StorageArea.setAccessLevel({ accessLevel })` (since Chrome 102) and `AccessLevel`. `@types/webextension-polyfill` does not.
- Tests: `tests/vitest.setup.ts` stubs `chrome.storage` as `{}`, so the call must be feature-detected; no test imports `wallet/index.ts`.
- Minimum versions: no `minimum_chrome_version`; Firefox `strict_min_version` 153.

### Browser probe (2026-10-17, the e2e browsers Puppeteer 25.8.0 pins)

A throwaway MV3 extension stored a value, a content script read it, the worker called `chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })`, and the content script read again.

| Browser | API present | Call | Content-script read after | After a relaunch on the same profile, without a new call |
|---|---|---|---|---|
| Chrome 152.0.7977.42 | yes | resolves | refused: "Access to storage is not allowed from this context." | still refused |
| Firefox 153.0.4 | no (`undefined`) | not made | allowed | not run |

## Closed known limits searched

`gh issue list --state closed --label known-limit --search "incoming transfer"` and `--search storage`: #440 to #444 (note-receipt reconciliation), #469, #524. None concerns a row's key or the area's access level.
