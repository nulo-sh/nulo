# note-owner-1 recon

Read against `origin/dev` at `5c35ca934`, the pinned Aztec line `@aztec-labs/*` 6.0.0-rc.3. One Explore agent (sonnet) swept the wallet's note readers, the PXE client path, the incoming-transfer attribution, the test fakes and the network e2e files; the driver read the PXE and the aztec-nr sources directly. The aztec-nr sources are the copies embedded in the bundled artifacts' `file_map` (a contract artifact carries the Noir source of every file it compiled).

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Pin an upstream behaviour the wallet relies on, so a bump that changes it fails a test | `packages/aztec-runtime/src/pxe/handshake-delivery.sources.test.ts` (PXE `dest/` text and an artifact's embedded Noir source), `stale-anchor.sources.test.ts`, `crs-cache.sources.test.ts` | reuse the pattern as is |
| Record a coupling to an Aztec package for the next bump | `UPDATE.md` § Types coupled to Aztec shapes (the stale-anchor entry names its sources test) | reuse as is: one entry |
| Owner filter on a PXE note read | `NotesFilter.owner` (PXE `notes_filter.ts`), carried by `NotesFilterSchema` (`packages/aztec-runtime/src/pxe/schemas.ts:36-43`) | not needed (see plan D1) |
| A fake PXE that honours scopes and owner | none: `note/service.test.ts:100` returns its list for any filter; the incoming stubs key on contract only (`service.scenarios.test.ts:253`, `service.composition.test.ts:84-375`) | not needed (no runtime change) |
| A network e2e with two accounts of one profile receiving | `account-switch-isolation.test.ts`, `multi-account-from.test.ts` cover switching and sending; none asserts per-account note attribution | not needed (no runtime change) |

Search trail for the absences: `grep -rnE "getNotes(Raw)?\("` over `apps/extension/src`, `apps/extension/tests` and `packages/*/src`; `grep -rniE "two accounts|same profile|second account"` over `incoming-transfer/` and `note/`; `ls packages/aztec-runtime/src/pxe/*.sources.test.ts`.

## The wallet's note readers

| Reader | Call | Needs |
|---|---|---|
| Developer Account state → Notes (`apps/extension/src/popup/pages/settings/developer/account-state/notes/index.vue:120`) | `NoteService.getNotes(network, account)`, every known contract, `active` | every note in the account's scope, owned or not |
| Incoming scan (`incoming-transfer/service.ts:1592`, `scanContract`) | `getNotesRaw(network, account, contract)`, `active` | notes the account owns |
| Incoming reconcile (`incoming-transfer/service.ts:1703`, `readNoteBracket`) | `getNotesRaw(..., "active-or-nullified")` | the same notes, spent ones included |

Both reach `fetchContractNotes` (`note/service.ts:188-194`), `{ contractAddress, status, scopes: [account] }`, then `PxeService.getNotes` (`packages/aztec-runtime/src/pxe/service.ts:440-446`) → `pxe.debug.getNotes`. Balances do not read notes: `token-balance/balance-projector.ts` simulates `balance_of_private`.

A note becomes a receipt only when `parseNoteAmount` (`incoming-transfer/service.ts:2856`) reads `content.value`, which `NoteService.buildContent` fills only for a class and slot in the schema map (`packages/aztec-runtime/src/pxe/note-schemas.ts:61-78`): noir-contracts Token (UintNote), aztec-standards Token (UintNote, every default token), PrivateFPC (UintNote), noir-contracts NFT (NFTNote, no `value`).

## The PXE and aztec-nr behaviour (pinned line)

PXE paths are under `@aztec-labs/pxe` `src/`; aztec-nr paths are the embedded v6.0.0-rc.3 sources.

- `storage/note_store/note_store.ts:52-63`: `addNotes(notes, scope)` keys a note by its siloed nullifier and adds `scope` to its scope set. `:104-198` `getNotes` filters by `owner` and by scope intersection, deduplicated.
- `contract/helpers.ts:9-35`: `syncScope` runs `sync_state(scope)` with execution scopes `[scope]`; `contract/contract_sync_service.ts:150-220` syncs each scope apart. `debug/pxe_debug_utils.ts:64-87`: `getNotes` syncs `filter.scopes`, then reads the store.
- `contract_function_simulator/oracle/utility_execution_oracle.ts:245-256`: `getKeyValidationRequest` throws unless an account in the execution's scopes holds the key.
- `uint-note/src/uint_note.nr:73-82` (the same text in all three UintNote artifacts): `compute_nullifier_unconstrained` reads the owner's nullifier hiding key through that oracle. `aztec/src/messages/discovery/nonce_discovery.nr:98-120`: a note with no nullifier is skipped, so without the owner's key discovery stores nothing.
- `aztec/src/note/note_message.nr:51-55`: `deliver` sends to the note's owner. The four schema classes deliver every note with `deliver` or `partial(to, ctx, to, completer)`.
- Accounts: one frozen Schnorr class, salt 0 (`packages/aztec-runtime/src/account/instantiation-descriptor.ts:26`), each account's secret key from its own account seed (`address-freeze.ts:58-66`), so two accounts of a profile never share keys.

## Collisions and neighbours

- `encryption-at-rest-1` A4 (`origin/encryption-at-rest-1-a4`) and `pxe-cost-1` A1 (#1038) touch `incoming-transfer/` and `token/`; this plan touches neither.
- `e2e-stores-1` (#1063) is merging; no overlap.
- #1043 (test side) made the scenarios stub hand the note to one account, as the PXE scopes it.
- Closed known limits searched (`gh issue list --state closed --label known-limit --search "note scope owner"`): #384, #597, #1034; none covers note attribution.
