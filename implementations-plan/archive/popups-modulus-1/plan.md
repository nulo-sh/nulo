---
plan: popups-modulus-1
tier: light
status: completed
issues: "#1452"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high audit round trip + Opus Plan leg
base: origin/dev at 3af5f7840
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-11-01.
- **Status:** completed, delivered in #1500 (closes #1452); the merge is the orchestrator's call.
- **Shipped:** `isHex32` and `BN254_FR_MODULUS` in `@nulo/wallet-core/utils`, `tokenKey` in `@nulo/token-list`; the four regex copies, the decimal modulus literal, `isValidHex` and the per-site key spellings removed, every key byte-identical for its admitted inputs. New FPC, Edit FPC, New token and New sender refuse a value at or above the modulus with "Invalid address" (P94-17 A); captures in `screenshots/`.
- **Kept as designed (D5):** `send-submit.ts`'s `/i` regex (accepts `0X`); token-list's own modulus copy (its signer imports nothing); `token-flag.ts`'s local missing-`0x` tolerance.
- **Lessons:** none promoted. `lessons.md` is at its 8 KiB budget and both gotchas are local: `NewTokenPopup.test.ts` now unmounts its wrappers, and a stale auto-import file fails the build (`lessons/phase-1.md`, `lessons/phase-2.md`).
- **Known limits:** none.
- **Open items:** #1499 (a pre-existing New sender bug found in review).
- **Seeds retired:** the `/goal` and `/loop` seeds below are not to be run.

# popups-modulus-1: one hex shape, one field modulus, one token key; three popups refuse a value at or above the modulus

#1452 (quality harden at `51ea220b1`): the 32-byte hex shape, the BN254 field modulus and the `chainId:contract` token key are re-declared per module, and the fee-payer, token and sender popups accept a value at or above the modulus. Recon: [recon.md](recon.md). Paths are under `apps/extension/src/` unless they name a package.

## Outcome & Quality Bar

- **For whom**: a person who pastes an address into New FPC, Edit FPC, New token or New sender; a maintainer who changes what counts as a valid address or a token's identity.
- **Excellent**: (1) a value at or above the modulus is refused in the field, with the contact form's words, before any request; every other value reads as it does today; (2) the shape and the token key each have one definition, and the modulus one shared home beside the two copies that must stay (token-list's signer copy, upstream `Fr.MODULUS`), all pinned equal; every key a site builds is byte-identical to today's, the persisted seed marker included.

## Assumptions

**Facts** (recon.md has the line references)
- F1. `isValidHex` builds a `RegExp` per call; no caller passes its `length`; its callers are `aztec-address.ts`, `token-search.ts` and the four popups. Four more modules declare the same either-case shape: `transfer-intent.ts`, `explorers.ts`, aztec-runtime `public-events.ts` (a block hash), wallet-bridge `field-address.ts`. `send-submit.ts` also accepts `0X`.
- F2. `@nulo/token-list` already exports `BN254_FR_MODULUS`, pinned to `Fr.MODULUS`; token-list is a dependency-free leaf, so that copy stays. The issue missed it. `aztec-address.ts` hand-copies the modulus in decimal.
- F3. The popup bundle already holds wallet-bridge's `isFieldAddress` and the foundation field module (PopupManager imports both FPC popups statically, and they import `sameFieldAddress`). `Fr.MODULUS` is a static bigint.
- F4. Refusal text today: New FPC "Invalid FPC address"; Edit FPC and New token "Invalid address"; New sender "Invalid sender address". The contact form says "Invalid address" for every invalid value, the modulus included.
- F5. The token key's seven spellings all lower-case the contract except `pricedTokensOf` and `pairKey`, whose inputs `parse.ts` already holds lower case; only `token-flag.ts` adds a missing `0x`. A stored row's `contract` is `z.string()`.
- F6. The seeder's marker is keyed by `seedKey`; `seeder.list.test.ts` reads it at the harness's literal `` `${CHAIN_ID}:${CONTRACT}` ``, so a changed key reds those tests.

**Inferences**
- I1. Today a value at or above the modulus reaches the service, which fails when it builds an address (`fpc/service.ts:302,376`, `token/service.ts:779`, `account-state/service.ts:144`; the field constructor refuses it): a late generic error. Traced by Codex R1; the services stay the authority.
- I2. A stored FPC row at or above the modulus needs a hand-built backup (`fpc/spec.ts:55` accepts any string). Its Edit FPC would now show "Invalid address" on open, as a malformed stored address does today; a rename still saves, since `EditFpcPopup.vue:106` checks the address only when changed. That stays: blocking the rename would be a change the owner did not sign (Codex R1).
- I3. A key that only lower-cases (no `0x` added) gives every site's exact string today for every input that site admits: `seedKey`, `defaultKey`, `getPriceMapEntry` and `findToken` lower-case already; `pricedTokensOf` and `pairKey` take only `parse.ts`-validated lower-case addresses, so an upper-case entry built by hand would change bytes there, a condition the wallet does not support (Codex R1).

**Asks**: none. The product question is decided (UI impact). [OWNER-ASKS.md](OWNER-ASKS.md).

## Architecture & Implementation

- **Shape and modulus** (new `packages/wallet-core/src/utils/field.ts`, exported from the `utils` barrel): `isHex32(value: string): boolean` over a module-private `HEX_32 = /^0x[0-9a-fA-F]{64}$/`, and `BN254_FR_MODULUS`. No import. Users: `aztec-address.ts` (both; the decimal literal goes), `token-search.ts`, `transfer-intent.ts`, `explorers.ts`, `public-events.ts`, `field-address.ts` (keeps `Fr.MODULUS`; its header names both imports). `isValidHex` is deleted, its doc example in `useFormState.ts` follows, and the two generated auto-import files are regenerated by the build.
- **Popups**: the field-range check is wallet-bridge's `isFieldAddress`. A value that fails `isHex32` keeps today's text; one that passes `isHex32` and fails `isFieldAddress` reads "Invalid address". Submit stays off for both. New token and Edit FPC already say "Invalid address": New token's validator (`:44`) takes `isFieldAddress`, and Edit FPC's validator (`:51`) and the computed that drives its warning (`isAddressValid`, `:92`) both do. New FPC and New sender gain the second branch before the duplicate check; New FPC's warning (`:57`, `:174`) renders whichever text the field holds, and New sender's already renders `error.title`.
- **Token key** (`packages/token-list/src/parse.ts`, exported from the index): `tokenKey(chainId: number, contract: string): string` = `` `${chainId}:${contract.toLowerCase()}` ``; it validates nothing and adds no `0x`. Callers: `pairKey`, `seedKey` (deleted, calls go to `tokenKey`), `defaultKey`, `pricedTokensOf`, `getPriceMapEntry`, `findToken` (both sides through `tokenKey`), and `token-flag.ts`'s `keyOf`, which first restores a missing `0x` (`/^0x/i` stripped, `0x` prepended), its tolerance kept local.
- **File-level change map**: add `packages/wallet-core/src/utils/field.ts` and `field.test.ts`; edit `packages/wallet-core/src/utils/index.ts`, `packages/token-list/src/{parse,index,parse.test}.ts`, `packages/wallet-bridge/src/field-address.ts`, `packages/aztec-runtime/src/pxe/public-events.ts`, `utils/{string,aztec-address,aztec-address.test,token-search,transfer-intent,token-flag}.ts`, `wallet/constants/explorers.ts`, `composables/useFormState.ts`, `wallet/services/token/{seeder,service}.ts`, `wallet/services/price/price-map.ts`, `popup/components/modules/general/home-slots.ts`, the four popups and their tests, `types/auto-imports.d.ts`, `types/.eslintrc-auto-import.json`.
- **Not taken**: see the decision ledger.

## UI impact

New FPC, Edit FPC, New token and New sender: a typed or pasted address at or above the modulus shows "Invalid address" beside the address field and keeps submit off (on Edit FPC, when the address was changed; an unchanged stored one shows the warning and a rename still saves, I2). On New FPC and New sender a malformed value keeps "Invalid FPC address" and "Invalid sender address"; nothing else on the four popups changes. Sign-off: decision page 94, P94-17 (signed 2026-11-01), option A: "Yes: the three popups refuse a value at or above the modulus with the wording the contact form uses today." The PR body carries before/after captures of New FPC and New sender (the two whose refusal text differs by case) refusing the modulus value, light theme, Chrome.

## Security & Adversarial Considerations

- **Trust boundary**: text a person types or pastes. New token's only pre-fill is the person's own search text, which Holdings and the Send picker offer only after `isValidAztecAddress` (`TokenList.vue:93-95`, `holdings.vue:110`, `SelectTokenPopup.vue:84`); no dApp path opens it. The field check is a convenience: the services' address constructors stay the boundary (I1). No new input path, storage or log line.
- **Identity keys**: every key keeps its bytes (I3, F6), so a flag, a price or a seed marker cannot move to another token; a row with junk after its contract stays unflagged (closed known limit #511). The persisted marker needs no migration.
- **Modulus integrity**: `BN254_FR_MODULUS` is pinned to `Fr.MODULUS` in `aztec-address.test.ts` and by a known-answer value in its own test; token-list's copy keeps its pin.
- Crypto, supply chain, permissions: no change; no new dependency; layer order kept (wallet-core imports nothing; token-list stays a leaf).

## Phase 1: one shape, one modulus, one token key (no visible change) ✓

- Add `field.ts`, `tokenKey`, and move the callers as above, the four popups' shape checks included (`isValidHex` → `isHex32`, behaviour unchanged). Delete `isValidHex`; regenerate `types/auto-imports.d.ts` and `types/.eslintrc-auto-import.json` with a build (`dtsMode: "overwrite"`) and commit both.
- **Tests**
  - `field.test.ts`: `isHex32` accepts 64 digits in either case; refuses 63 and 65 digits, `0X`, no prefix, a non-hex digit, a space. `BN254_FR_MODULUS` equals the decimal known answer.
  - `aztec-address.test.ts`: `BN254_FR_MODULUS` equals `Fr.MODULUS`; the existing boundary and agreement tests stay.
  - `parse.test.ts`: `test.each` of the sites' inputs with the literal key each gets: a list address, the same in upper case, a `0X` prefix, no prefix (stays without `0x`). Success control: `pairKey` dedupe still refuses a repeated pair.
  - Existing, unchanged, as the byte-identity proof: `seeder.list.test.ts` (persisted marker, F6), `token-flag.test.ts:19` (missing `0x`), `composables/usePrices.test.ts:27,180` (an upper-case price lookup), and the `home-slots`, `field-address`, `public-events`, `explorers` and `transfer-intent` tests.
- **Validation gate**
  - `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`: exit 0. `git grep -n isValidHex -- apps packages` prints nothing.
  - At retry 0: `bun run --cwd packages/<p> test -- --retry=0` for `wallet-core`, `token-list`, `wallet-bridge`, `aztec-runtime`; from `apps/extension`, `bun --bun vitest run src/utils src/composables src/wallet/services/token src/wallet/services/token-list src/wallet/services/price src/wallet/constants src/popup/components/modules/general src/popup/components/popups --retry=0`: green.

## Phase 2: the four popups refuse a value at or above the modulus ✓

- Add the range check to the four popups as above. Move each fixture at or above the modulus that a test treats as valid below it (recon.md lists them); a fixture's intent stays.
- **Tests** (each popup's test file, `test.each`, wire-shaped `0x` + 64 hex): the modulus minus one is accepted (no warning, submit on, Enter calls the service); the modulus and the modulus plus one show exactly "Invalid address", submit off, and Enter calls no service; a 63-digit value shows today's text, the same refusal. Edit FPC types into the changed address, and one case keeps a stored address at the modulus: the warning shows and a rename saves (I2). No opener case: New token is pre-filled only after the curve check (Security). Red with phase 1's popup files for the modulus rows only.
- **Validation gate**
  - `bun run lint`, `bun run typecheck:all`, `bun run test`: exit 0.
  - From `apps/extension`: `bun --bun vitest run src/popup/components/popups --retry=0` green; the modulus rows red, and the other rows green, with phase 1's four `.vue` files (`git show <phase-1 commit>:<path>`).
  - Smoke, from `apps/extension`: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:chrome`, then `env -u EXTENSION_PATH NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/settings-crud.test.ts tests/e2e/send-picker-add.test.ts --retry=0`; the same with `build:firefox` and `NULO_E2E_BROWSER=firefox`: every named test ran and passed (a list-prices skip is reported, not counted).
  - No smoke file adds a sender or a working FPC (it needs a node); the network lanes run `senders-advanced`, `type-roles-windows` and `fee-sponsor-funding` on the PR, real addresses below the modulus.
  - `bun run check:plans` after staging: exit 0.
- **Captures** (PR body, not a gate): a scratch Puppeteer spec under `~/.cache/nulo-backlog/popups-modulus-1/`, uncommitted, on armed Chrome builds of the base and the branch: Settings, FPCs, New, the modulus value typed, a 360 × 600 screenshot, light theme; the same for New sender (Settings, Developer, Account state, Senders, `senders-add-btn`; on the network harness if the smoke build cannot list senders). The four PNGs go to `screenshots/`, linked by blob permalink.

No e2e scenario is added: the refusal is a pure field rule the component layer proves exactly.

## Decision ledger

- D1. The modulus lives in `@nulo/wallet-core/utils` beside the shape, as the issue asks; it moves `aztec-address.ts`'s decimal copy to a shared home rather than removing a copy (Opus R1). Not taken: `aztec-address.ts` importing token-list's existing constant (no new declaration, but address validation would depend on the token-list format package, whose copy exists only for the signer's closure).
- D2. The popups use `isFieldAddress`, the predicate the owner was asked about, already in the popup bundle (F3). Not taken: a new extension field predicate on `BN254_FR_MODULUS` (a second implementation of `isFieldAddress`). The curve check (`isValidAztecAddress`) stays the contact and send forms' alone.
- D3. `isValidHex` is deleted, not rewritten: no caller uses `length`, and one name for the shape is the point. `HEX_32` stays module-private: every site calls `.test` only.
- D4. `tokenKey` only lower-cases; `token-flag.ts` keeps its `0x` tolerance (I3). Extending it to `findToken`, prices and Home would change which rows match: out of scope.
- D5. Left as is: `send-submit.ts`'s `/i` regex (it accepts `0X`), the lower-case-only regexes, the log redactor, the `{1,64}` field regexes, `AmountCard.vue`'s watch source.

## Panel verdicts

| Round | Verdict | Accepted | Rejected |
|---|---|---|---|
| Codex R1 | conditional approve | the popups move to `isHex32` in phase 1 and phase 2's red check restores phase 1's files; I3 narrowed to admitted inputs; I1 traced; Edit FPC's unchanged stored address keeps its rename (I2, UI impact); refused rows press Enter and assert no service call | "`bun run test -- <args>` drops the args": with Bun 1.4.2 the filter and `--reporter=verbose` both applied (one file of five ran); a modulus opener case for New token (Opus R1: its only pre-fill passed the curve check) |
| Opus R1 | conditional approve | the same phase re-sequencing; `.eslintrc-auto-import.json` in the change map; Edit FPC's warning computed named; the trust boundary restated; Outcome (2) reworded; `usePrices.test.ts` named and the retry-0 path list widened; a New sender capture | none |
| Codex R2 (resumed) | approve | none; it retracted its `--` claim after re-probing | none |
| Codex fix R1 (arc 1) | approve | two comments: the modulus doc no longer says every hash is below it; `tokenKey`'s doc cut to the stored-shape invariant | none |
| Opus fix R1 (arc 1) | approve | a stale `seedKey` in a seeder comment; `field.ts`'s header and `isHex32` doc tightened; the popups' comment reworded; `field.ts` in the wallet-core README file map | a pre-existing New sender bug (Enter adds an address marked "Already exist"), out of #1452's scope: filed as #1499 |
| Codex fix R2 (arc 1, resumed) | approve | none | none |

## Delivery

- One arc, phases 1 and 2: branch `worktree-popups-modulus-1` to `dev`, `gh pr create`, ready, opened after the Codex loop converges and the gates pass, no label at creation (the extension path filter trips both e2e lanes). Title: `fix(popups): fee payer, token and sender popups refuse an address at or above the modulus` (89 characters). Body: the change, the UI impact with the quote, the captures, the gates with outcomes, no added e2e scenario, `Closes #1452`. The close-out is the PR's final commits.

## Post-implementation

Execution contract: `implementations-plan/README.md` § Post-implementation standard at `3af5f7840`, with these values:

- Step 1 is absent (`code_review: off`).
- Step 2 over the arc's diff from `3af5f7840`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; both verbatim rules and the adversarial ask in every prompt; one Opus `general-purpose` review beside round 1; hard stop at three rounds.
- Steps 3 and 4 as written. Close-out: the Outcome block; lessons promoted with a pruning pass; `STATUS.md` deleted; `git mv` to `archive/popups-modulus-1/` in its own commit; the index line moved.
- Step 5: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/popups-modulus-1/plan.md`, then `agent-worktree done popups-modulus-1 --merged`; the orchestrator's session notices the merge.
- Three failures on one step end the arc as `ARC_FAILED`.

## Seeds (not run; orchestrator-owned)

- `/goal` Phases 1 and 2 ✓ in implementations-plan/popups-modulus-1/plan.md, each gate passing in the transcript; the Codex loop converged on the diff from 3af5f7840 (a resumed pass with no new material point, quoted); a ready PR to dev closing #1452 with the captures; `bun run test` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/popups-modulus-1 from plan.md and lessons/: the next unchecked phase, its gate, the Codex loop, delivery, the close-out; never merge.
