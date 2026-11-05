# nightly-smoke-1 recon

Base: `origin/dev` at 87d04118e. One Explore agent (sonnet) and direct reads; every claim below was checked against the tree.

## Facts

- **R1. Where the run failed.** Nightly run 40855856754 (`dev` at af025cfb5): both `smoke-against-artifact` jobs fail `send-picker-add.test.ts` at line 38, `waitForSelector(select-token-add-token-flagged)`, after 15 s. Chrome file 22.5 s, Firefox 29.5 s. Both jobs run with `NULO_E2E_ARTIFACT_RUN: 1` (job log).
- **R2. The mode switch.** `_extension-smoke-e2e.yml:77` sets `NULO_E2E_ARTIFACT_RUN=1` whenever `artifact_name` or `extension_path` is set. `nightly.yml:317-356` passes `artifact_name` to both smoke jobs. `global-setup-smoke.ts:59-66` turns it into `provide("liveLeg", true)` and skips the armed-build check.
- **R3. The held list per mode.** `fixtures/token-list.ts:223-241` (`heldListStorage`): a source run signs `E2E_LIST_TOKENS` + `E2E_LIST_FLAGGED` with a per-run key; an artifact run stores `infra/token-list/public/v1/list.json`, the only list a release build's pinned keys accept.
- **R4. The published list flags nothing.** Its payload (sequence 1792881300) has four Testnet tokens and `"flagged":[]`; so does `infra/token-list/list.source.json`.
- **R5. The flag's only source.** `TokenList.vue:97` (`addFlagged = props.isFlagged(addCandidate)`) ← `SelectTokenPopup.vue:51` (`prices.isFlagged`) ← `usePrices.ts:135` (`isFlaggedToken(list.flaggedTokens)`) ← `price/service.ts:301-305` (`flaggedKeysOf(list?.flagged ?? [])`) ← the verified token-list snapshot. No other source exists. So with R4, no add row can carry the flag in an artifact run: the failure is deterministic, not a flake.
- **R6. The house split.** `token-list.test.ts:98` runs the list's behaviour, its flagged rows included (lines 151-185), under `describe.skipIf(inject("liveLeg") === true)`; its header says why (an artifact build pins the production keys). `shipped-token-list.test.ts:125` is the artifact-only leg. `skipUnlessListPrices` (`fixtures/token-list.ts:214-219`) skips a test whose held list prices no Testnet token.
- **R7. Only S1 is unguarded.** No other smoke spec reads `E2E_LIST_FLAGGED` or asserts a flagged testid outside the source-run describe. (`helpers/activity-seeds.ts:45,58` hands fixture-list token addresses to specs in both modes, for other purposes.) Network specs sign their own lists (`network/register-token.test.ts:118`).
- **R8. S1's shape.** One test on the file-scoped `listedExtension` fixture: seed a priced token, open Send, open the picker, paste `E2E_LIST_FLAGGED[0]` in mixed case (flag on an enabled add row), paste `UNLISTED` (flag gone), press the add row, New token opens with the address, Escape back onto the picker (query, add row, focus), Escape onto Send (token and recipient kept). #1342 measured 15.8 s Chrome / 18.8 s Firefox and named three failure modes, one of them "the verified list's flag never reaches a pasted address".
- **R9. The existing flagged spec ends in the picker.** `token-list.test.ts:151-185` (`listedExtensionPerTest`, Testnet refused) seeds `E2E_LIST_FLAGGED[0]` as a held "SCAM" row, then checks the warning on Home, Holdings, the token page, the Send banner and the picker row (`select-token-flagged`). The picker draws its search field once the balance rows load (`SelectTokenPopup.vue:153`, `TokenList.vue:117`), which the picker-row check proves; the profile holds no other token, so a pasted valid address no row matches gets the add row (`TokenList.vue:92-96`).
- **R10. Valid addresses.** `isValidAztecAddress` (probe on this tree): `0x…a1`, `a2`, `f1`, `f3` and `0x12…02` are curve points; `0x…f2` is not, so a second flagged pair cannot be `f2`. `0x12…02` already appears twice (`send-picker-add.test.ts:14`, `network/holdings.test.ts:29`).
- **R11. Docs.** `tests/e2e/README.md:65` defines the held list ("flags one Testnet pair no spec holds unless it seeds it"). `.claude/skills/e2e-testing/SKILL.md:916-921` gives the release-shaped smoke recipe. Flake-ledger row 44 is the same class of defect (a smoke wait that held only for the source run's list).
- **R12. lessons.md is full**: 8191 of 8192 bytes.

## Reuse map

| Need | Reuse |
|---|---|
| Source-run-only list behaviour | `token-list.test.ts`'s `describe.skipIf(liveLeg)` and its flagged test (R6, R9) |
| A second flagged pair | `E2E_LIST_FLAGGED` in `fixtures/token-list.ts`; `fixtureToken`'s address shape |
| An unflagged, unheld, valid address | `E2E_LIST_TOKENS[1].address` (`0x…a2`, R10), no new literal |
| Paste and wait helpers | `replaceInputValue` (S1 imports it; `token-list.test.ts` must add it), `shotSend`, `VISIBLE` |
| Release-shaped run | the skill's recipe (R11) |
