---
plan: popup-dedupe-1
tier: light
status: approved by the panel (Codex R3 approve); arc 1 next
issues: "#1470 (arc 1, phase 1); #1449 (arc 1, phase 2)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high audit round trip + Opus Plan leg
base: origin/dev at 4b250dfe4
trunk: dev
post_implementation_hardening: not scheduled
---

# popup-dedupe-1: one home for Send's side rule and for the entity forms' shared rules

One arc, one PR against `dev`, no behaviour change. Phase 1 gives Send's side rule one helper (#1470). Phase 2 routes the entity forms' remaining inline rules through shared helpers (#1449). Each variant no test covers gets a pin before its move. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are under `apps/extension/src/` unless they name another root.

## Outcome & Quality Bar

- **For whom**: the next person who changes what a Send side or an entity form accepts.
- **Excellent**: (1) each rule has one definition, and every reader calls it; (2) every surface renders and accepts what it did at the base: the existing tests pass unedited, and each variant they miss has a pin.
- **Good enough**: rules that behave the same and have no shared helper (the blank guards, the "changed?" checks) stay as they are.

## Findings (traced in code; recon.md has the lines)

- **#1470**, demonstrated: one rule, five copies in two files, plus a dead sixth (`SelectTokenCard`'s `isTokenRestricted`: no template, test or story reads it). Consequence: a capability change must edit every copy in step.
- **#1449**, demonstrated, narrowed since filing. #1543 shipped the "Already exists" part. Still open: "Already added" and "Invalid address" typed at each producer, comparison and display; four reducer copies; the private 32 and its four copies; the `< 5` URL floor three times. Claims that did not hold: `isAvailableToAddSender` has no duplicate check left to absorb (#1580 made it read the shared computed); New token's `toLowerCase()` is a broader match a restored row needs, not a stray copy of `sameFieldAddress` (F6).

## Assumptions

**Facts**
- F1. #1470's sites are `popup/pages/send.vue:190`, `:194-200`, `:204`, `:208-214`, `:625-629` and `components/composite/send/SendTypesCard.vue:15`, `:22`. `popup/pages/send-sides.ts` already exists (`openingSendSide`).
- F2. `SendTypesCard` is L3. CLAUDE.md's layer model forbids its import from L6 pages; Biome's composite override does not enforce it (it bans stores and clients). No production file under `components/composite/` imports `@/popup/**` (only `send/AmountCard.test.ts:5` does). `components/composite/send/publish-facts.ts` is a Send rule that `send.vue` imports from there.
- F3. Forced side: "private" when public transfers are absent, else "public" when private transfers are absent, else none. The receiver's preselect reads balances; its forced side reads transfers. A scratch harness over the base code confirmed all 16 flag sets and `{}`.
- F4. Tests pin two variants: Edit FPC's "Invalid address" for 63 digits against New FPC's "Invalid FPC address" (`EditFpcPopup.test.ts:356`, `NewFpcPopup.test.ts:287`), and Edit profile's case-only `isUnchanged` (`EditProfilePopup.test.ts:382`).
- F5. The FPC service announces every network's rows (`wallet/services/fpc/service.ts:399`, `:416`, `:477`). The FPC popups ignore an update for an unlisted id, so another network's update stays out of the duplicate check.
- F6. A restored token keeps its backup's contract spelling: `TokenSchema.contract` is `z.string()` (`wallet/services/token/spec.ts:65`; `service.ts:1077-1078`). So a `0X…` row matches New token's `toLowerCase()` and not `sameFieldAddress` (Codex R1).
- F7. `src/utils/` is an auto-import dir. CI's `_build-extension.yml:119` fails when the build changes `src/types/`.

**Inferences**
- I1. `SelectProfilePopup`'s add replaces a listed id (verified). Its cause is not traced, so its comment states the contract. Nothing reads the array's identity: the `v-for` and `:59`'s `.some()` read through the ref, and `:114`/`:116` already replace it.
- I2. `connected-apps` sets the carried logo on the event's object after storing the row. Setting it before renders the same: Vue renders after the handler returns. The previous logo is read before the row is replaced.

**Asks**
- A1. #1449 is labelled `enhancement`, and its body names no decision record (#1470's names P94-03). Evidence: decision page 94 lists it as filed from the owner's harden run (Q-003), and the orchestrator's spawn names it ("two issues (#1470, #1449), one arc"). Working assumption: that launch is the record. The final report names it for the orchestrator to confirm.

## Architecture & Implementation

- **Phase 1 (#1470).** `git mv` `popup/pages/send-sides.ts` and its test to `components/composite/send/` (F2). Add three pure functions over `{ hasPrivateTransfers?, hasPublicTransfers?, hasPrivateBalances?, hasPublicBalances? }`: `forcedSide(token): SendSide | null` (F3), `canSwitchSender(token)` (both transfers) and `canSwitchReceiver(token)` (both balances).
  - `send.vue`: each initializer keeps its guard and its preselect condition verbatim, `keepSide` and `cacheStore.preselectedBalanceType &&` included, with `canSwitch…` in place of the flag pair. Then it applies `forcedSide` when that is not null. The watch keeps its two sources and its timing, and its body applies `forcedSide` to both sides.
  - `SendTypesCard` returns on `!canSwitch…`. `SelectTokenCard` loses `isTokenRestricted`.
- **Phase 2 (#1449).**
  - Verdicts: `utils/entity-rules.ts` adds `ALREADY_ADDED` and `INVALID_ADDRESS`, and its header widens to "the entity forms' shared rules". Every producer, comparison and display reads them, templates by interpolation, as `ContactFormFields.vue:58` shows `ALREADY_EXISTS`. "Already added": `NewFpcPopup.vue:55`, `:65`, `:184`; `EditFpcPopup.vue:52`, `:91`, `:283`. "Invalid address": `NewFpcPopup.vue:36`; `EditFpcPopup.vue:51`, `:282`; `NewTokenPopup.vue:45`, `:56`, `:345`; `NewSenderPopup.vue:66`; `ImportContactsPopup.vue:49`; `utils/contact-rules.ts:42`; `ContactFormFields.vue:54`. Those forms reuse the contact form's words on purpose (`NewFpcPopup.vue:35`). "Invalid FPC address" and "Invalid sender address" are each one form's own words, so they stay literal.
  - Reducers: `contactListReducers` becomes `entityListReducers(list, { appendUnlistedUpdate = true } = {})`. Its four callers are renamed, with no alias. New FPC passes `{ appendUnlistedUpdate: false }`, with one line of why (F5). Edit FPC does the same and wraps the edited row: an update also refreshes `fpcToEdit`; a delete of the edited row closes and toasts, then returns before the list changes. `connected-apps` wraps add and update for the logo (I2). `SelectProfilePopup` routes add and update to `onUpdated`, with one line stating the contract (I1), and delete to `onDeleted`. Each `.add(...)` registration moves below the reducer object it names (`SelectProfilePopup.vue:31-33`, `connected-apps/index.vue:47`).
  - Limits: `utils/profile-name.ts` exports `PROFILE_NAME_MAX` (the private constant, renamed) and `profileNameTaken(candidate, existing)` (`useProfileNameField`'s `isDuplicate`, moved). Readers: `ProfileNameField.vue:25`, `EditProfilePopup.vue:154`, `useProfileNameField.ts:102`, `useFullBackupImport.ts:165`, and Edit profile's two collision checks, whose `otherProfileNames` then holds raw names (its comment at `:30-34` follows). `isUnchanged` stays, with one line of why (F4).
  - URL floor: `utils/entity-rules.ts` exports `RPC_URL_MIN_LENGTH = 5`. The three popups read it. `NewNetworkPopup.vue:67`'s empty check goes, since the floor implies it.
  - Commit the regenerated `src/types/auto-imports.d.ts` and `src/types/.eslintrc-auto-import.json` (F7).
- **Files**: phase 1: `components/composite/send/{send-sides.ts,send-sides.test.ts,SendTypesCard.vue}`, `popup/pages/send.vue`, `popup/components/modules/send/SelectTokenCard.vue`. Phase 2: `utils/{entity-rules,entity-list,entity-list.test,profile-name,profile-name.test,contact-rules}.ts`; `popup/components/popups/{NewFpc,EditFpc,NewToken,NewSender,ImportContacts,NewContact,EditContact,SelectProfile,EditProfile,NewEndpoint,EditEndpoint,NewNetwork}Popup.vue`, with the tests of NewFpc, EditFpc and SelectProfile; `popup/components/modules/settings/contacts/ContactFormFields.vue`; `popup/pages/send.vue`; `popup/pages/settings/connected-apps/index{.vue,.test.ts}`; `components/composite/ProfileNameField.vue`; `composables/{useProfileNameField,useFullBackupImport}.ts`; `src/types/*` (generated).

## Decision ledger

- D1. The helper lives in `components/composite/send/` (F2). Rejected: `popup/pages/` (an upward import from the card), a second file beside the card (two homes for one name), `utils/` (a Send-only rule). Both legs agreed.
- D2. Three functions, not one capability object: each call site reads one answer, as `openingSendSide` does. The "neither transfer" check (recon) is another rule and stays out. Both legs agreed.
- D3. The pin is a literal table of the 16 flag sets plus `{}`, committed before the call sites move. A scratch harness under `~/.cache/nulo-backlog/popup-dedupe-1/` checks its rows against the base code and is logged in `lessons/phase-1.md`, never committed: a committed copy of the old code would be a second home.
- D4. A boolean option, not a second function: two behaviours, each with callers. New FPC and Edit FPC keep "ignore", because "append" would widen known limit #529 to updates (F5). No alias, so one name holds. Select profile's delete moves to `withoutId` (Opus R1). Codex R1 asked to keep its splice and pin the array's identity. Rejected: no reader holds the array (I1), and the add's replace rules out duplicate ids. So the move changes nothing, and a kept splice would be the copy the issue names.
- D5. `RPC_URL_MIN_LENGTH` goes in `entity-rules.ts`. Rejected: `popup/components/popups/endpoint-error-text.ts` (a module for error copy); the issue's `isPlausibleRpcUrl` ("plausible" overstates a length floor).
- D6. Left out, each with its reason:
  - New token's `toLowerCase()`: a deliberate, broader match its comment explains (F6, Codex R1).
  - The issue's `nameTakenError`/`addressTakenError`: superseded by #1543's `ALREADY_EXISTS` and `sameStoredName`. Each form keeps its own comparison, so the contact and stored-name contracts stay apart.
  - `accounts/import.vue:66-67`: already reads `sameStoredName` and `sameFieldAddress`.
  - Send's recipient hint (`popup/components/modules/send/RecipientField.vue:241`): Send's own field, not an entity form.
  - The blank guards, the "changed?" checks and the stored-name `.trim()` calls: they behave the same, with no helper or an equal one (`storedNameKey`).
  - `maxLength="25"`: no rule reads it back.
  - `useEntityCrud` and the other reducers outside the popups: other contracts.
- D7. No new e2e: the move changes nothing a browser can see. The component tests are the witnesses. The smoke and network specs below reach Send, the FPC, network and endpoint forms, Edit profile, Select profile and the contact forms. Connected apps and New sender rest on their component tests (both legs).
- D8. No untrimmed text assertion for the interpolated verdicts (Codex R1). Rejected: `" {{ X }} "` renders the same text as `" X "` (Opus R1), and the plan claims the same words, not the same whitespace.

## Security & Adversarial Considerations

- **Threat**: none new. The forms' duplicate checks are user-experience guards; the worker owns the stored rows. Service events arrive over the wallet's own port, but their payloads can carry backup strings or dApp metadata, which this change only stores and compares as today. No message, storage shape, permission, log line or dependency changes.
- **Hostile rows**: a restored backup's token row may carry any contract string (F6). New token's comparison is unchanged, so such a row matches as today.
- **Regression risk**: a variant flipped in the move. Each one the existing tests miss has a pin before its move.

## UI impact

None. The Send From and To toggles, the token picker's row, New and Edit FPC, Import token, New sender, the contact forms, Import contacts, New and Edit endpoint, New network, Edit profile, the profile name field, Select profile and Connected apps render and accept what they did at the base. The orchestrator's lane brief: "UI impact: none; a behaviour difference the move uncovers is a bug fix named in the PR, and anything visible stops for the owner (OWNER-ASKS.md)".

## Phase 1: Send's side rule (#1470)

- Commit 1: the `git mv`, the three functions and their table test, green. Run the scratch harness against the table (D3) and log the result.
- Commit 2: route the five sites and the card, and delete `isTokenRestricted`. Edit no existing test.
- **Assumptions**: F1–F3.
- **Gate**: `bun run lint`, `bun run typecheck:all`: exit 0. From `apps/extension`: `bun --bun vitest run src/components/composite/send src/popup/pages/send src/popup/components/modules/send --retry=0`: green at both commits.

## Phase 2: the entity forms' rules (#1449)

- Commit the component pins first. Each is green at the base and passes unedited after the move:
  - `NewFpcPopup.test.ts`: an update for an FPC the opened read did not list leaves its name free. Control: an update that renames a listed FPC makes that name "Already exists".
  - `EditFpcPopup.test.ts`: an unlisted update leaves its name free; an update of the edited row refreshes it; deleting the edited row emits `onClose`, toasts "FPC was deleted" and leaves the row in the list (the early return).
  - `SelectProfilePopup.test.ts`: an add for a listed id leaves one row for it, with the new name.
  - `connected-apps/index.test.ts`: capture the add and update handlers. An add shows its `logo` as `logoBlobUrl`. An unlisted update is appended with its logo. A listed update keeps the logo the row shows.
- Then the moves, one commit per concern (verdicts; reducers; limits; URL floor). Two unit tests land with the code they test, since neither name exists at the base:
  - `entity-list.test.ts`, with the reducers: with `appendUnlistedUpdate: false`, an update for an unlisted id leaves the list unchanged. Control: a listed id is replaced in place.
  - `profile-name.test.ts`, with the limits: `profileNameTaken` takes a case or NFKC variant as taken, and a different name as free. `useProfileNameField.test.ts` passes unedited, which proves the extraction.
- Then `bun run build` and the regenerated types.
- **Assumptions**: F4–F7, I1, I2.
- **Gate**: lint and typecheck as above. From `apps/extension`: `bun --bun vitest run src/utils src/composables src/components/composite src/popup --retry=0`: green. No existing test is edited, except the rename in `entity-list.test.ts`.

## Arc gate (before the review loop)

- `bun run audit:vue`, `bun run test:all`: exit 0. After the build, `git status --short apps/extension/src/types` prints nothing.
- Smoke, from `apps/extension`: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:chrome`, then `env -u EXTENSION_PATH NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/settings-crud.test.ts tests/e2e/endpoints.test.ts tests/e2e/profile-rename.test.ts tests/e2e/auth-flows.test.ts tests/e2e/contacts.test.ts tests/e2e/contacts-import.test.ts tests/e2e/send-keyboard.test.ts tests/e2e/send-picker-add.test.ts --retry=0`: pass.
- Network, from the repo root: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/transfers.test.ts --retry=0`: pass.
- No Firefox twin: nothing touches `tests/e2e/fixtures/**`, focus, windows, user activation or WebAuthn.
- `bun run check:plans` after staging: exit 0.

## Delivery

One arc, one PR, no stack (D-orch-1). Branch `popup-dedupe-1-a1` off `origin/dev` carries the plan commit. Before the PR opens, merge `origin/dev` and rerun the arc gate's fast layers. Title: `refactor(popup): one home for send's side rule and the entity forms' shared rules` (81 characters). Body: what changed and why, the validation runs, no e2e wall-clock (no scenario added), `Closes #1470` and `Closes #1449`. Open it without labels. `dev` is frozen for the 1.2.0 promote until #1671 merges; the orchestrator decides the merge.

## Post-implementation

The execution contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard), read at `4b250dfe4`. Plan-specific values:

1. No diff review (`code_review: off`).
2. The review loop runs once over the arc diff from `4b250dfe4`, after the arc gate: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`. Log each round in `lessons/phase-2.md`. Stop after three rounds that still have material findings.
3. Delivery as above, then `gh pr checks <n> --watch`.
4. Close-out as the PR's final commits: the Outcome (closes #1470 and #1449; known limits: none expected), lessons, `STATUS.md` deleted, the `git mv` into `archive/` in its own commit, and the index line moved.
5. Teardown after the merge: `agent-worktree done popup-dedupe-1 --merged`.

Seeds (not run): `/goal Implement implementations-plan/popup-dedupe-1/plan.md arc 1 to an open PR` · `/loop Babysit popup-dedupe-1's PR to merge, then tear down`.

## Panel verdicts

| Round | Verdict | Accepted | Rejected |
|---|---|---|---|
| Codex R1 | approve with changes | F6 corrected, New token left as is; pins for the wrappers (logo, Edit FPC's own row); D7 narrowed; A1 made explicit | keeping Select profile's splice (D4); an untrimmed text assertion (D8) |
| Codex R2 (resumed) | approve with changes | unit tests land with the names they test; Edit FPC's delete pin also checks the early return; F2 says "production file"; recon's contract spelling corrected | a close-before-toast order assertion (both run in one synchronous handler; no consequence) |
| Codex R3 (resumed) | approve | the R2 fixes verified; no new defect | none |
| Opus R1 (Plan) | approve with changes | the two missed "Invalid address" displays; Edit FPC, connected-apps and reducer-option pins; smoke specs swapped (`accounts` out; `auth-flows`, `contacts`, `contacts-import` in); F2 restated; D6's issue items; verbatim preselect guard; registration order; header and comment updates | dropping #1449 for want of a record (A1 keeps it on the orchestrator's launch) |
