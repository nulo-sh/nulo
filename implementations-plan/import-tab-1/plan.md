---
plan: import-tab-1
tier: light
status: plan approved by the panel (Codex r3 approve); arc 1 implementing
issues: none
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high review round trip + Opus Plan leg
base: origin/dev at a46395071
trunk: dev
post_implementation_hardening: not scheduled
---

# import-tab-1: a new profile's unlock is fixed when its run is admitted

The recovery-phrase import and Create read the unlock method and the password once, in the click handler, into the run's own record. The Passkey · Password tabs take no input while the run is in flight, as restore hides its choice. `ProfileService` refuses to create or import a password profile with an empty password. Recon: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md).

## Outcome & Quality Bar

- **For whom**: a person who creates a profile or imports a recovery phrase in the popup or the onboarding tab.
- **Excellent**: (1) the profile is sealed under the method, password and phrase the person pressed Import or Create with, whatever the form does while the run waits; (2) the service writes no password profile without a password.
- **Good enough**: the tabs show the run's choice and take no input until it ends; nothing else on the forms changes.

## Assumptions

- **Facts**:
  - F1 Import: `importSeed` (`useProfileImportFlow.ts:168-185`) is the click handler and `:170` its `existing` check; the reads the change moves are the phrase in `importNamed` (`:190`) and the method and password in `chooseUnlock` (`:235-243`). The duplicate-confirm retry reuses the resolved unlock and words (`:196-198`).
  - F2 Create: `submit` (`useProfileCreateFlow.ts:130-168`) is the click handler; the reads the change moves are at `:146-148` and `:125`. Onboarding's `onCreated` reads the password for the phrase read (`onboarding/pages/create.vue:125`).
  - F3 Restore hides its choice and password fields for the whole run: `ImportFullBackupForm.vue:140` (`!restoreStatus`), with the status set at `useFullBackupImport.ts:675`, before the run's first await, and Back blocked (`backCtaBlocked`). It reaches `chooseUnlock` through `useFullBackupImport.ts:444-446`; its file is out of scope.
  - F4 Service: `createProfile` is at `service.ts:768`; `newRowSeal` (`:2041-2045`) serves `importMnemonic` (`:2029`), `restore` (`:2458`) and `changeUnlockMethod` (`:1400`), and throws "Password is required for password profile" for a missing password, as `restore` does at `:2425`.
  - F5 Every UI path gates a password run on `isNewPasswordValid` (import `:318-320`, create `:109-111`, restore `useFullBackupImport.ts:863-867`), so the service refusal is a backstop no page reaches.
  - F6 The chaos model cites `service.ts` lines (from `:153` on), `useProfileImportFlow.ts:193` (its text too) and `onboarding/pages/create.vue` `:147,:160,:179`; `scripts/e2e/profile-chaos-model.test.ts:792` fails on a moved line, inside `bun run test`.
- **Inferences**: I1 the chaos model draws no empty password (its generators make `Chaos-…` and `Pw-…` values), so no clause changes meaning.
- **Asks**: none open. The disabled tabs are a fade and press state, decided under the owner's 2026-10-19 delegation (D5); no copy changes.

## Architecture & Implementation

- **Import (D1, D2)**: `useImportUnlock` exports the record type `AdmittedUnlock = { method: UnlockMethod; password: string }` and `unlockFor(admitted, display, existing)`, today's `chooseUnlock` body with the record in place of the refs (it still asks the page's passkey card). `chooseUnlock(display, existing)` stays for restore as `unlockFor({ method: unlockMethod.value, password: password.value }, …)`, with one comment: restore hides the choice for its whole run. `importSeed` builds the record and the canonical words after its gate and before the latch, refuses `existing` unless the record says passkey, and hands both to `importNamed`.
- **Create (D3, D4)**: `submit` builds the same record after `isAllowedToContinue` and before the latch; the seal branch, `createProfile(name, admitted.password)` and `reportCreateFailure` read it. `onCreated` gets the record's password as a third argument, which `onboarding/pages/create.vue` names `typed` and uses for its phrase read in place of `password.value`.
- **Tabs (D5)**: `AuthMethodTabs` takes `disabled`: each tab gets the native attribute, `onKeydown` returns early, and the tablist root gets a module class with the Input's fade (`opacity: 0.5; pointer-events: none`). `UnlockMethodChoice` and `NewProfileMethodTabs` declare `disabled` and pass it on; `ImportSecretForm` takes `importing` and passes it as the choice's `disabled`. The pages pass the run flag: both import pages (`isImporting`), `onboarding/pages/create.vue` and `popup/pages/profile/new.vue` (`isCreating`).
- **Service (D6, D7)**: `createProfile` refuses an empty password first, after `ensureInitialized()`; `newRowSeal`'s password branch refuses an empty one as it refuses a missing one. Both throw the existing "Password is required for password profile".
- **Files**: `src/composables/{useProfileImportFlow,useProfileCreateFlow}.ts` and tests; `src/components/composite/AuthMethodTabs.vue` and test; `src/components/composite/import/{UnlockMethodChoice,ImportSecretForm}.vue`; `src/popup/components/modules/settings/new-profile/NewProfileMethodTabs.vue`; the four pages and their tests; `src/wallet/services/profile/service.ts` and `service.integration.test.ts`; `tests/e2e/helpers/profile-chaos/model.ts` (cites only).

## Security & Adversarial Considerations

- **Invariant**: a new profile is sealed under the unlock its run was admitted with, and the service never seals a new password profile under an empty password.
- **Trust boundary**: the page and the service worker are both the extension's own code; the service check holds when a page's gate does not. On create and import it runs before any key derivation or storage write, and `importMnemonic` zeroizes the entropy on the throw (`:2030-2033`).
- **Secrets**: the record holds the password for the run's lifetime only, as the ref already does; nothing new is logged, persisted or sent. The message names the rule, never a value.
- **Crypto, storage shape, permissions, dependencies**: no change.

## UI impact

- **Import a recovery phrase and Create profile, in the popup and the onboarding tab**: before, the Passkey · Password tabs take clicks and arrow keys while Import or Create runs; after, they fade to the Input's disabled look and take none until the run ends. No copy, layout or row changes. The PR body carries before/after captures of one import and one create mid-run.

## Arc 1: phases

### Phase 1: the service refuses an empty new password ✓

- Do D6. Re-stamp the chaos model's moved `service.ts` cites.
- **Test** (`service.integration.test.ts`): `test.each` over `createProfile` and `importMnemonic`: `""` rejects with "Password is required for password profile" and leaves the repository's keys unchanged; the same call with `"pass1234"` resolves and adds one row.
- **Gate**: `bun run lint`; `bun run typecheck:all`; `bun run test`. Pass: exit 0; the refusal rows are red on the base copy of `service.ts`.
- **Result**: exit 0 each, 953 files; both refusal rows red on the base copy. 25 chaos-model `service.ts` cites moved by one or two lines.

### Phase 2: the runs read the form once ✓

- Do D1 to D4. Re-stamp the chaos model's `useProfileImportFlow.ts` cite (line and text) and its `create.vue` cites.
- **Tests** (each asserts the run's success in the same case):
  - `useProfileImportFlow.test.ts`: for both handlers and both methods, a form changed before the run seals leaves it on its admitted method, password and phrase, the duplicate-confirm retry included.
  - `useProfileCreateFlow.test.ts`: the same for create; `onCreated` gets the admitted password.
  - `onboarding/pages/create.test.ts`: the phrase read uses the admitted password.
- **Gate**: phase 1's commands. Pass: exit 0; the new cases are red on the base copies of the two composables and the page.
- **Result**: exit 0 each, 953 files; the six composable cases and the page case red on the base copies. The record is read through `admitUnlock()`, which restore's wrapper shares, so `useProfileImportFlow` stays inside its 80-line budget. The existing `onCreated` call-shape assertions name the new third argument.

### Phase 3: the tabs refuse input while a run is in flight ✓

- Do D5.
- **Tests**:
  - `AuthMethodTabs.test.ts`: disabled, both tabs carry `disabled`; with the active tab focused while enabled, then disabled, ArrowRight leaves the model as it was.
  - One case in each page test (`onboarding/pages/import.test.ts`, `popup/pages/import.test.ts`, `onboarding/pages/create.test.ts`, `popup/pages/profile/new.test.ts`): the tabs are disabled while the run is pending and enabled after it ends.
- **Gate**: phase 1's commands. Pass: exit 0; the `AuthMethodTabs` arrow case is red with the `onKeydown` guard removed.
- **Result**: exit 0 each, 953 files; the arrow case red without the guard, and each page case red without its page's binding.

### Phase 4: browsers and captures

- Captures: a scratch spec in `~/.cache/nulo-backlog/import-tab-1/`, copied into `apps/extension/tests/e2e/` for one run and deleted after. It holds one phrase import and one create on the Password tab mid-run and clips the form, on the base build and on the arc's build. Commit the PNGs under `implementations-plan/import-tab-1/screenshots/`.
- **Gate**:
  - `bun run lint`; `bun run typecheck:all`; `bun run test:all`; `bun run check:plans` after staging.
  - Build each browser with CI's smoke flags: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`, then `build:firefox`.
  - From `apps/extension`: `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/onboarding-import.test.ts tests/e2e/import-paths.test.ts tests/e2e/duplicate-phrase-import.test.ts tests/e2e/registration.test.ts tests/e2e/onboarding-tab.test.ts --retry=0`, then again with `NULO_E2E_BROWSER=firefox`.
  - Pass: every command exits 0. No e2e scenario is added, so no wall-clock is owed.

## Decision ledger

| Id | Decision | Rejected |
|---|---|---|
| D1 | `unlockFor(admitted, …)`; restore keeps a live `chooseUnlock` wrapper (F3) | changing `chooseUnlock`'s signature, which edits restore's file (out of scope) to build a record at its own run start |
| D2 | The record also carries the canonical words read at the click | reading the phrase later: the run could import a phrase other than the one its gate judged |
| D3 | Create keeps its record inline in `submit` | a shared admission helper for two callers |
| D4 | The create run hands its password to `onCreated` (Codex r1-4, Opus 2) | disabling the password fields too: the record already makes an edit inert, and the lane scopes the choice |
| D5 | Native `disabled` on the tabs plus the Input's fade on the tablist | unmounting the choice (a layout jump mid-run); no fade (the tabs would look live and ignore presses) |
| D6 | Empty-only, at `createProfile` and `newRowSeal` (Codex r1-6) | the 8-grapheme rule at every seal (Opus): coherent, but a wider service contract, the strength rule is out of the lane's scope, and restore decodes its material before it seals; `changeProfilePassword` (no read after an await, `change-password.vue:69-74`) |
| D7 | The existing "Password is required for password profile" | "The new password needs at least 8 characters" (the full rule's message); a typed error (no screen reads it, F5) |

## Review verdicts

| Round | Verdict | Accepted | Rejected |
|---|---|---|---|
| Codex r1 | reject | 1 (committed text keeps to the change and its guarantee), 2 (restore leaves the service test), 3 (cite text and line; the wrapper's comment), 4 (D4), 5 (success twins; the retry after an edit), 6 (D6 empty-only, D7) | none |
| Codex r2 | conditional approve (with conditions: keep the tests' timing out of the committed plan) | 1 (Phase 2's test lines state only the guarantee) | none |
| Codex r3 | approve | none | none |
| Opus Plan | conditional approve | 1 (as Codex 2), 2 (D4), 3 (the tab tests exercise the guard), 4 (the derivation sentence covers create and import only), 5 (F4, F6, `unlockFor` not called pure) | D6's 8-grapheme rule: Codex r1-6's scope argument is stronger |

## Delivery

- **Arc 1**, the only arc: branch `worktree-import-tab-1`, one PR to `dev` with `gh pr create`, opened ready after the Codex loop converges and the gates pass, with no labels.
  - Title: `fix(profiles): the unlock method is fixed at submit and an empty password is refused` (85 characters).
  - Body: what changed and the behaviour it guarantees, the captures, the gates with outcomes, the accessibility call under the owner's 2026-10-19 delegation (D5). It closes no issue.
- The close-out lands as the PR's final commits.

## Post-implementation

Execution contract: `implementations-plan/README.md` § Post-implementation standard at `a46395071`, with these values:

- Step 1 is absent (`code_review: off`).
- Step 2: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` on the arc's diff from `a46395071`, resumed with `resume-codex.sh`. Both verbatim rules and the adversarial ask go in every prompt. One Opus `general-purpose` review runs beside round 1. Hard stop at three rounds.
- Steps 3 and 4 as written. The close-out moves this folder to `archive/import-tab-1/`.
- Step 5: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/import-tab-1/plan.md`, then `agent-worktree done import-tab-1 --merged`. The orchestrator's session notices the merge.
- Three failures on one step end the arc as `ARC_FAILED`.

## Seeds (not run; orchestrator-owned)

- `/goal` Arc 1 phases ✓ in implementations-plan/import-tab-1/plan.md, each gate passing in the transcript; the Codex loop converged on the arc's diff (a resumed pass with no new material issue, quoted); a ready PR to dev; `bun run test` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/import-tab-1 from plan.md and lessons/: next unchecked phase, its gate, the Codex loop, delivery; never merge.
