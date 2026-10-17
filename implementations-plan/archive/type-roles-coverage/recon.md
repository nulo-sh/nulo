# Recon: type-roles-coverage (#366)

Base: `origin/dev` at 8459699c. Three Sonnet explorers (smoke reachability, network reachability, harness and budget), each load-bearing claim re-read by the planner. Nothing was run.

## Counts at the base (the issue's figures moved)

`apps/extension/scripts/type-roles/identifier-sites.expected.json` holds 120 entries: 15 `none`, 15 `unreachable`, **90 live**. The issue (filed at 111 / 10 / 15 / 86) predates #426 (explorer links), #486 (stale-network takeover) and #437 (which closed #365).

| | live | observed | unobserved |
|---|---|---|---|
| states without the `(network)` suffix (smoke) | 56 | 7 (`type-roles.test.ts`) | **49** |
| states ending in `(network)` | 34 | 14 (`network/type-roles-windows.test.ts`; #437 added the raw field) | **20** |

`coverageOf` (`tests/e2e/fixtures/type-roles.ts:583`) takes `{ sites?, surfaces? }` and no spec calls it. The `(network)` suffix is the expected file's own marker for a state the network suite seeds; `surfaces.expected.json`'s per-surface `suite` field is the old board's and does not line up with site states (`popup-settings-connected-apps-id` is `smoke` there, its three site states are `(network)`).

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Observe a state | `observeIdentifierSites` + `expectSitesClean`; `expectPageClean(page, label, states)` (`type-roles.test.ts:228`) already loops states | reuse as is |
| Coverage count | `coverageOf(observations, { sites })` | reuse as is; pass the smoke-owned sites |
| Cross-test aggregation in one file | none (searched `afterAll`, top-level arrays, `summary` under `tests/e2e`; every `afterAll` is cleanup) | build new: one module-level array in the spec |
| Ownership split smoke / network | none | build new: one exported predicate in `fixtures/type-roles.ts`, used by both specs |
| Tx seeds | `seedTransaction` (`helpers/activity-seeds.ts:73`): writes `nonce: "0"` and one user call; no `block`, no call extras | adapt: optional `block`, optional call fields (`chunkNonce`) |
| Receipt, journal seeds | `seedPublicReceipt` (`:160`, `from` = `0e×32`, block 1, hash must sit under the BN254 modulus), `seedJournalRecord` (`:200`, recipient = the account) | reuse as is |
| Unnamed FPC row | `helpers/fpc-seeds.ts` writes named protocol rows only | adapt: one optional-name row writer; the site's selector also matches named and synthetic rows (`FpcRow.vue:34`) |
| Token import in flight | none (searched `token_import`, `token-import-row`) | build new: one journal row writer beside `seedJournalRecord`, used after the restart (the boot sweep fails an older in-flight row, `operation-journal/reaper.ts:141-152`) |
| Authwit records (`encoded_call`, `message_hash`, `intent`) | only `kind: "call"` rows, through a backup (`network/backup-restore-integrity.test.ts:99`) | build new: raw `auth-registry` rows; `getAuthwits` reads storage (`auth-registry/service.ts:199`) |
| Explorer off | `navigateToSettings(page, "privacy")` → `explorer-trigger` → `explorer-none-btn` (`send-outcome-rows.test.ts:172`) | reuse as is |
| Developer mode | `setDeveloperMode` (`fixtures/helpers.ts:2158`) | reuse as is |
| Stale takeover | `seedStaleNetwork`, `takeoverScreen` (`helpers/stale-network.ts`; flow at `stale-network.test.ts:83-100`) | reuse as is |
| Contacts, import file | `addContact` (`fixtures/helpers.ts:847`), `contactsFiles`, `pickContactsFile` (`helpers/contacts.ts`; flow `contacts-import.test.ts:156,224`) | reuse as is |
| Account file preview | `exportAccountBody`, `previewImport` (`helpers/account-io.ts`) | reuse as is |
| Hide an account | inline only (`accounts.test.ts:117-141`) | inline again (two uses) |
| TxDebugPanel toggle, "Show metadata" item | no `data-testid` (`TxDebugPanel.vue:29`, `tokens/[id].vue:255`) | add a testid each (CLAUDE.md § testid rule) |

## Smoke states (49), cheapest first

- **Already rendered, pure assertion (7):** Header address on Home (`Header.vue:223`: hidden only on register and `windows-*`), Receive, the tx detail's hash link, nonce and user call, Activity's row hash with an explorer, Manage accounts' address.
- **Seeded test, new navigation or seed (26):** tx with a block; a public receipt (Activity row + received detail: from, to, tx link, block link); a journal record (recipient link); token metadata (3); New token; an in-flight import with no name; explorer None, then the six "without an explorer" twins; Developer mode, then the debug hash and a call's chunk nonce; the three authwit kinds (5); the stale takeover's A3 (last: it takes over the popup and needs a locked wallet, which the test already ends on).
- **Send / Settings test (16):** contact suggestion, chosen card, revealed card; Contacts row; import popup (new row, address change); an unnamed FPC row, Edit FPC (2), New FPC; New sender; Profile id; Export account list; a hidden account; the Import account preview.

The smoke wallet is on Testnet; aztecscan is the only explorer and is on by default (`src/wallet/constants/explorers.ts`), so "without an explorer" means the setting at None, set after every explorer-on state.

## Network states (20)

- **Moved to smoke at planning:** the `call` authwit record (`record-caller`, `record-contract`, state "a public authwit granted (network)"): `AuthwitCard.vue:34` renders it from a stored row. Connected-app states stay here: dApp sessions carry a MAC (`dapp-session/spec.ts:64`).
- **Inside existing windows tests:** a decoded field parameter (row 1 already renders it), `registerToken` (+ "an operation other than a send, with an account"), `createAuthWit` for an intent (2), the connected-app detail after a grant.
- **New window flows:** an imported token's transfer (`to`, explicit `from`); a contract-scope grant's detail; the Send review sheet (needs `tokenReadyExtension` and an estimate).
- **A landed tx each:** a private note (2), a registered contract, a registered sender, an incoming transfer from an unknown sender (`incoming-transfers.test.ts` C2 seeds it and is documented as not opening the prompt).
- **No path through the generic playground today:** a send's non-zero authwit nonce on `execute-op-transfer-nonce-value` (the Send button hard-codes 0n), a sender of kind `account` (every playground transfer takes `from`), a concrete class scope (bundles emit `classes: "*"`).

## Harness and budget facts

- Smoke: `vitest.e2e.config.ts`, one fork per file, tests in definition order, `retry: 2` unconditional, `testTimeout` 60 s. CI shards by file (3 shards per browser), so one file is always whole in one job; job cap 30 min.
- `skipUnlessListPrices` (`fixtures/token-list.ts:204`) never skips on PR lanes (the fixture list prices Testnet tokens); an artifact run (nightly, release) skips the seeded test if the published list prices no Testnet token.
- Baselines (PR runs, 2026-10-16): `type-roles.test.ts` 41.8 s on Chrome (run 38890651617, shard 1/3, Chrome job envelope ~12 min), 68.4 s on Firefox (run 38889987097, envelope ~17 min). The reporter prints per-file durations only.
- Network: 5 proverless shards per browser, retry 0, job cap 30 min, stall watchdog 10 min; `type-roles-windows.test.ts` runs in the shard pool on both browsers.

## Collisions

- `e2e-private-transfer` (#165) adds a playground private-transfer control and touches `network/tx-transfer-row.test.ts`; arc 2's transfer states sit in another file.
- `execute-popup-readability` (#508) may redesign the execute window, which moves `windows-execute` sites: arc 2 rebases onto whatever lands first.
- Any lane that adds an identifier site after arc 1 must observe it (that is the point of the coverage test).
- Closed known limits: none match "type role" (`gh issue list --state closed --label known-limit --search "type role"`).

## Absence claims (search trails)

- No cross-test aggregation or completeness assertion in e2e: `afterAll|beforeAll|summary|coverage|unobserved` under `apps/extension/tests/e2e`.
- No smoke spec seeds an authwit record, a tx block, a `chunkNonce`, an unnamed FPC or a token import: `record-selector|record-hash|authwit`, `tx-block|block:|chunkNonce`, `edit-fpc|new_fpc|fpc-address-input`, `token_import|token-import-row` under `apps/extension/tests`.
- No spec opens the developer notes or contracts pages, the token metadata popup, `new_sender`, or the recipient card: `note-contract|account-state/notes`, `token-metadata`, `new-sender|new_sender`, `recipient-card|recipient-suggestion`.
