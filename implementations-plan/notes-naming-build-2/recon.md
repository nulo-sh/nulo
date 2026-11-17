# notes-naming-build-2: recon

Read inline at `33906a052` (no Explore agent: the render lanes' notes and the L1 prototype at `4370e5139` had mapped the surface; every line below was re-read against the tree).

## The service (`apps/extension/src/wallet/services/note/service.ts`)

- `readNotes` serves both `getNotes` (the notes page) and `getNotesRaw` (the incoming-transfer poll). It resolves a class id per contract once per batch (`classIdByContract`), loads the static schema map best-effort (`loadNoteSchemasSafe`), and parses each note inside its own `try`, a throw becoming a `renderError` note.
- A note sets `type` and `contractName` only from a matched schema; nothing sets `location` today, so on dev a custom note is "Custom Note", the 4+4 span and raw items.
- `pxeService.getContractArtifact(network, classId)` resolves through `packages/aztec-runtime/src/pxe/artifact-registry.ts`: the compiled-in bundle, then this PXE, each verified against the class id. No network fetch.
- `ContractArtifact.storageLayout` is `Record<string, { slot: Fr }>` (`@aztec-labs/stdlib` 6.0.0 `abi.d.ts`); `canonicalSlotHex` is the schema map's key form.
- `fetchKnownContractsNotes` skips addresses of 6 or less, so protocol contracts never list here.

## The schema table (`packages/aztec-runtime/src/pxe/note-schemas.ts`)

Four classes: `noir-contracts.js` Token "Aztec Token" (slot 0x3), NFT "Aztec NFT" (0x7), aztec-standards Token "Token (AIP-20)" (0x7), Private FPC "Private FPC" (0x1).

## The reader and the chip

- `utils/contract-level.ts` `readContract(reader, chainId, address)`: a signed flag (once mapped), the two pinned fee contracts, the three protocol contracts, then `pending` until the list answers, then the listed entry or `none`.
- `components/composite/contract-chip.ts` `contractChipOf(reading, address, { selfName })`: unverified reads the 8+4 short address, title "Unknown contract", one line from `uncheckedLines(selfName)` (#1837's copy); a listed token its symbol with mark and solid seal; pinned ones "Private Fee Juice" or "Sponsored"; flagged the short address with "Nulo flagged this token as a scam".
- `ContractChip.vue` puts its `testid` prop on the label span; a pending chip holds behind skeletons for at most 1 s.
- `composables/usePrices.ts` `useTokenFlags(priceService)`: the network-free list read and the worker's broadcasts, `dispose()` removes both listeners. The approval window disconnects the client, then disposes.

## The page (`popup/pages/settings/developer/account-state/notes/index.vue`)

- `displayNotes` builds each card in `buildDisplayNote` inside a per-note `try`; a throw becomes a fallback card with an empty `contractTrim`.
- `filteredDisplayNotes` searches `contractTrim`, type, `contractName`, `location`.
- The header: the type (plus " · " name in secondary ink), and `<span data-testid="note-contract">` with the 4+4 trim; a `< 359px` rule wraps it.

## E2E and the inventory

- Only `tests/e2e/network/type-roles-windows.test.ts` opens the notes page: it waits for a `note-contract` reading `trimAddress(pull, 4, 4)`, then sweeps "a note (network)" (`display.contractTrim`, role `meta`) and "a note exists (network)" (`record-value`). The pull token is `@aztec-labs/noir-contracts.js/Token` (`tests/e2e/fixtures/aztec.ts` `deployDelegatedPullRig`), a table class on an address no list names.
- `apps/extension/scripts/type-roles/inventory.test.ts` keys each identifier site by its template `branch`; a re-wrapped site moves.

## Closed limits searched

`gh issue list --state closed --label known-limit --search "notes page"`: nothing on this surface.
