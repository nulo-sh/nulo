---
plan: lock-ux-1
tier: light (mid rules: Codex audit plus the Opus Plan leg)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev 78f5f9171
status: awaiting owner picks
---

# lock-ux-1: five small behaviours the owner picks from pictures

Five `ux` issues, each a product decision: #1158 (auto-lock 0 saves with no confirm), #1192 (the onboarding phrase step has no 5-minute close), #1207 (a saved account file is offered again as if unsaved), #1208 (the duplicate-phrase confirm names one profile of several), #1228 (after a delete, the lock screen opens the chooser). Nothing ships before the owner's pick. [`OWNER-ASKS.md`](OWNER-ASKS.md) holds the options, the copy, the pictures and a recommendation for each; this plan holds how each pick is built.

## Outcome & Quality Bar

- **For whom**: a person in the popup or the onboarding tab, at a moment that holds a secret or a security setting.
- **Excellent**: each screen does what its picture showed, word for word, in both themes; nothing it changes leaves a secret on screen longer, or saves a security setting the person did not mean.
- **Good enough**: the existing components and copy around each change stay as they are.

## Assumptions

**Facts** (verified at `dev` 78f5f9171; detail in [`recon.md`](recon.md)):
1. Auto-lock saves 300 ms after the last keystroke, and an emptied field becomes `0` and saves "never" (`apps/extension/src/popup/pages/settings/lock.vue` watcher; `packages/design/src/ui/Input.vue:219-225`).
2. `ConfirmRequest.callback` runs on Confirm only; the one caller that needs Cancel watches `popupStore.isOpened("confirm")` (`apps/extension/src/composables/useProfileImportFlow.ts:125`).
3. `useSecretCountdown` is scope-disposed and already drives the Settings reveal's 5-minute close (`export/seed.vue`).
4. `export/full.vue` has a `downloaded` state: banner "Saved to your downloads", Close focused; `export/account.vue` has none.
5. `DuplicateWalletError.details` crosses the worker hop as data and names only the first match (`service.ts:2337`).
6. `lockScreenProfile` is the one selection policy, used by `auth.vue`, `boot-session.ts`, `locked-state.ts` and `route-guard.ts`; no profile creation or unlock time is stored.
7. The `profile-chaos` citation test (inside `bun run test`) pins line numbers in `lock.vue`, `auth.vue`, `create.vue` and `profile/service.ts`.

**Inferences** (each arc verifies before building):
- I1. No persisted record holds `DuplicateWalletError.details`, so renaming the field needs no compatibility read (worker and popup ship in one build).
- I2. The extracted promise confirm (D1) keeps `useConfirm.test.ts`'s source scan green: the dialog still opens only through `useConfirm`. (Both reviewers checked: holds.)
- I3. `onPhraseLater`'s route push waits on the legal guard's worker read (`apps/extension/src/onboarding/legal-guard.ts:27`), so the words stay drawn for that read unless the stage closes first. Plausible, unmeasured; the fix is local.

**Asks** (all in `OWNER-ASKS.md`; each blocks only its own arc): OA-1 #1158, OA-2 #1192, OA-3 #1207, OA-4 #1208, OA-5 #1228. Timing ask for the orchestrator: the owner placed #1158 after 1.1.0 and #1192 and #1228 in 1.2.0; `v1.1.0` is tagged, so only #1192 and #1228 wait for the orchestrator's word that `dev` targets 1.2.0.

## Architecture & Implementation (per arc; each built only on its quoted pick)

**Arc 1158, option A (confirm).** `useConfirm` gains `askConfirm(request): Promise<boolean>`, built on `requestConfirm`: true once on Confirm; false when the dialog closes any other way, when another request replaces this one (request identity), or when the scope that called `useConfirm` is disposed, which also closes the dialog if it still shows that request; its watcher stops when it settles. `useDuplicateConfirm` drops its own close-watch for it. In `lock.vue`'s debounced watcher, a settled `0` while the stored timeout is not `0` asks; the answer acts only while the page is mounted and the field still reads `0`: Confirm writes through `updateSessionTtl(0)`, any other answer puts the field back to the stored minutes. A `0` that settles after unmount neither asks nor writes; other values keep today's path. Option B instead adds the line under the field while it reads `0`, with no confirm.
**Arc 1192, option A.** `OnboardingPhraseStep.vue` runs `useSecretCountdown({ autoCloseMs: 5 min, onTimeout: emit("later") })` from mount, so its scope ends with the step. `create.vue`'s `onPhraseLater` closes the stage and clears the words before its push, as `loseSession` does (I3). "Do it later" carries ` · m:ss` and refuses a repeat Enter (`refuseRepeatEnter`), since the link's press moves focus onto it. The Settings ghost link moves out of `SecretCountdownClose.vue` into `components/composite/DisableAutoCloseLink.vue`, shaped like `PasskeyReuseLink.vue` (a `testid` prop, fixed text), used by both. Option B uses the same composable; its "Keep them open" label is the one reason the link would take a slot.
**Arc 1207, option A.** `export/account.vue`'s `fileStatus` gains `downloaded`, set when `handleDownload` succeeds and its run is still current; the banner title reads "Saved to your downloads", the button is Close (`account-close-btn`) running Full Backup's Close (`isToolbarPopup() ? window.close() : goBack(...)`; `goBack` already closes the Firefox own window, `apps/extension/src/utils/page-back.ts:10`), and it takes focus. Option B keeps `account-download-btn` labelled "Download again", outlined, and `canDownload` admits `downloaded`.
**Arc 1208 (either option).** `assertNotDuplicateWallet` filters every live match; `DuplicateWalletError` details become `{ existingProfileNames: string[] }` (repository order); the `spec.ts:314` doc and the `errors.test.ts` fixtures follow. `useDuplicateConfirm` sorts the names with `stringCompare` (the chooser's order, `apps/extension/src/utils/string.ts:58`) and words one name as today, several per the pick.
**Arc 1228, option A.** `lockScreenProfile` returns the last-active profile, else the first openable profile by `stringCompare` name (ties by id), else the first retired one; an empty list stays `undefined`. Its type bound gains `name` and `retired?`, which `boot-session.ts` and `locked-state.ts` propagate. The chooser paths that only an `undefined` with profiles left reached go: `locked-state.ts` `land`'s `openChooser` and its `LockedStateShell` member and `app.vue:319` wiring; `auth.vue` `settleProfile`'s popup branch. The `select_profile` check in `auth.vue`'s selection watcher loses its stated reason ("an open chooser means this screen cleared it"); the arc keeps or removes it on a test of a person-opened chooser meeting a deletion elsewhere. Option B needs a new device-local list of recently active profiles: a stored-shape registration, a golden and a stamp, written beside every `setLastActiveProfileId`. It is new persistent state, so B is an owner decision in itself.

**Trade-offs.** Each arc stays inside its own files, so the five picks are independent. The alternative of one shared "secret screen" policy was rejected: no two of these screens share a mechanism beyond the three reused above.

## Decision ledger

| # | Question | Draft | Codex | Opus | Decided |
|---|---|---|---|---|---|
| D1 | Cancel signal for #1158 A | `askConfirm` in `useConfirm`, used by both callers | yes; define replacement and disposal | yes; `onCancel` fails on replacement, a wrapped `callback` breaks `useLockWallet.ts:75`'s identity check | `askConfirm`, settling false on replacement; act only if the field still reads `0` |
| D2 | Where #1192's timer lives | the step component; timeout = `later` | yes | yes | as drafted, plus I3 in `create.vue` |
| D3 | The ghost link | extract `DisableAutoCloseLink.vue` | yes, label slot | yes, `PasskeyReuseLink` shape | `PasskeyReuseLink` shape; a slot only if B is picked |
| D4 | #1207 state and Close | fourth `fileStatus`; Full Backup's Close | yes | yes | as drafted; set only on a current run |
| D5 | #1208 details | array replaces the field; sort in the popup | yes | yes | as drafted; `stringCompare` |
| D6 | #1228 branches | remove what A makes unreachable | yes; complete the callers | yes; complete the map; retired profiles | full map above; retired last |

Rejected: a second copy of the close-watch (a copy); putting the field back before asking (the field behind the scrim would not match the owner's picture); `onCancel` on `ConfirmRequest` (a replaced request loses it, and it widens a store contract); plain `localeCompare` ("Profile 10" before "Profile 2", unlike the chooser).

Accessibility calls under the owner's 2026-10-19 delegation: the #1192 link is a native button after "Do it later" in Tab order, and its press, which removes it, moves focus to "Do it later"; #1207's Close takes focus when it appears, as Full Backup's does.

## Security & Adversarial Considerations

- **Threat model**: a person at an unattended browser (#1158, #1192), a person's own mistake (#1158's emptied field), a duplicate made unknowingly (#1208). No new trust boundary: every arc is popup-side except #1208's worker-side error detail.
- **#1208**: profile names are the person's own text, rendered by Vue text interpolation (no HTML); the error still carries no key material, and `trim()` logs an error as `{ name, message }` only, so names reach no log line.
- **#1158 A** narrows a widening of the auto-lock window; B informs without blocking. Neither changes the worker's `0 = never` rule.
- **#1228 A** derives the pick from data the popup already lists; it writes nothing. B would add plaintext profile ids at rest beside the existing last-active pointer.
- Crypto, supply chain, least privilege: untouched; no dependency or permission changes.

## Arcs, phases and gates

Every gate: `bun run lint`, `bun run typecheck:all`, `bun run test` (it runs the citation test; each arc updates any `profile-chaos` citation its lines moved), the named unit files, then `bun run audit:vue` (it builds). Before a smoke e2e file, build the armed extension for that browser (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`, or `build:firefox`) and run from `apps/extension` with `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/<file> --retry=0`; the Firefox twin adds `NULO_E2E_BROWSER=firefox`. Pass: every command exits 0.

**Arc 1158** (`settings/lock.vue`, `lock.test.ts`; A also `composables/useConfirm.ts`, `useConfirm.test.ts`, `useProfileImportFlow.ts`). Tests: `askConfirm` gives true once on Confirm, false on Cancel and on a store close, false at replacement with the replaced callback never run, and false at its scope's disposal, which closes its own dialog; a typed `0` and an emptied field (the number `0`) ask and write nothing; Confirm writes `0`; Cancel restores the stored minutes; a field moved during the ask is neither written nor restored; a page that loads with `0` stored never asks; `15` writes with no confirm (success control). The two failure tests that type `"0"` switch to `"15"`. B: the line shows at `0`, not at `15`. E2E: `security.test.ts` on Chrome.
**Arc 1192** (`OnboardingPhraseStep.vue` and a new `OnboardingPhraseStep.test.ts`, `pages/create.vue`, `create.test.ts`, `SecretCountdownClose.vue` and its test, new `DisableAutoCloseLink.vue` and its test at the L3 minimum of 10 cases). Tests, fake timers: the label starts at `5:00`; at 5 minutes `later` is emitted once; the link's press removes the suffix, moves focus to "Do it later", and nothing is emitted at 5 minutes; a repeat Enter on "Do it later" emits nothing, a single one emits `later` (success control); an unmount before 5 minutes emits nothing; `create.vue` clears the words and closes the stage before the route settles. E2E: `onboarding-tab.test.ts` and `keyboard-guards.test.ts`, Chrome and Firefox.
**Arc 1207** (`export/account.vue`, `account.test.ts`). Tests: passkey Save then a good download shows the saved banner and Close and no download button; a failed download keeps Download File; a download that settles after a flow reset does not reach `downloaded`; the password path's first download reaches the same state; Close runs Full Backup's close. E2E: `account-import-export.test.ts`, Chrome and Firefox.
**Arc 1208** (`profile/service.ts`, `profile/spec.ts`, `packages/extension-messaging/src/errors.ts`, `useProfileImportFlow.ts`, their tests, the chaos citation). Tests: two live matches name both (service integration); the round trip keeps the array (`errors.test.ts`); the dialog words one, two and three names per the pick, sorted with `stringCompare`. Gate adds `bun run test:all`. E2E: `duplicate-phrase-import.test.ts` on Chrome.
**Arc 1228** (`lock-screen-profile.ts`, `boot-session.ts`, `locked-state.ts`, `app.vue`, `pages/auth.vue`, their tests, the chooser branch of `openProfileChooser` in `tests/e2e/fixtures/auth.ts`). Tests: several profiles, none last active, give the first openable by name, ties by id; only retired ones give the first retired; an empty list gives `undefined`; one profile and a valid last-active one are unchanged; the pins in `boot-session.test.ts`, `locked-state.test.ts` and `auth.test.ts` (:443, :530-542, :588, :612-626) expect the selected profile, not the chooser. E2E: `security-reset.test.ts` and `auth-flows.test.ts` on Chrome.

No arc adds an e2e scenario: each behaviour is proved at the component or unit layer. **UI impact**: each arc changes exactly the surface its OA names, as its picture shows; sign-off is the owner's quoted pick in the PR body.

## Delivery

One `gh stack` on `dev`. Arcs are built in the order picks arrive; each is the next layer (`gh stack add lock-ux-1-<issue>`), and the docs-only close-out (`lock-ux-1-close-out`) is the top layer. A "keep today" pick builds no arc: the orchestrator closes that issue with the pick quoted. PR titles (at most 92 characters): `fix(settings): ask before auto-lock is set to never`, `feat(onboarding): the phrase step closes itself after 5 minutes`, `fix(backup): an account file once saved says so`, `fix(profiles): the duplicate-phrase confirm names every profile on it`, `feat(lock): after a delete, the lock screen selects a profile`. Each body carries the owner's quoted pick, `Closes #<n>`, the gates run and their outcomes, and both themes' screenshots. Parallelism: the arcs are file-disjoint, but picks, not engineering, set the critical path; no lanes.

## Post-implementation

Execute `implementations-plan/README.md` § Post-implementation standard as it reads at 78f5f9171. Specific to this plan: `code_review: off` (step 1 absent); the review loop runs per arc at its boundary with `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, hard stop at three rounds; the cross-arc pass runs once over the net diff from 78f5f9171; trunk `dev`; slug `lock-ux-1`; nothing merges before the orchestrator's word. Teardown after the close-out merges: `agent-worktree done lock-ux-1 --merged`.

## Audit verdicts

- **Round 1, Codex** (gpt-6.1-sol, high): `conditional approve` (define confirm settlement, complete D6's callers, repair the gates, correct owner-facing claims). Accepted: D6's callers and tests; `askConfirm` settles on replacement and stops its watcher; the debounce outliving the page; the missing `audit:vue` and armed-build steps and the Firefox command; OA-4's "same accounts and funds" does not cover imported accounts; "saved" means the browser accepted the download; `stringCompare`; OA-5's rule also runs whenever no valid last-active profile exists; 32 characters bounds a name, not the list. Rejected: none.
- **Round 1, Opus Plan leg**: `conditional approve` (act only while the field reads `0`; `stringCompare`; complete D6 and ask about retired profiles; add `audit:vue` and the named e2e files). Accepted: all eight findings: the field moved during the ask (demonstrated: focus stays on the input behind the scrim); a `0` settling after unmount; `stringCompare`; D6's full map; retired profiles (now ordered last, disclosed in OA-5); OA-3's download boundary, B's `canDownload` and the current-run check; focus after the link's press, and I3; the gates and test cases. Rejected: none.
- **Round 2, Codex resume** (verification): `conditional approve` with three conditions, all accepted. (1) `askConfirm` also settles false when its calling scope is disposed, closing its own dialog: plausible, and today's `useDuplicateConfirm` shares the gap, which the move closes. (2) "Do it later" refuses a repeat Enter, since focus lands on it from a key press (CLAUDE.md § Keyboard & focus order). (3) OA-5 claimed a retired profile is selected "only when nothing else remains", but a retired last-active profile still wins, as today: OA-5 now limits the retired-last order to the fallback.
- **Round 3, Codex resume** (verification): `approve`. No new material finding.
- **Arc 1158, round 1** (Codex gpt-6.1-sol, high, over `f1183fc43..9dfb28417`): two findings, both accepted. (1) Demonstrated: `0` → question A → `15` → `0` → question B replaces A, A's no restores the stored minutes, and B's Never lock then writes nothing; fixed with one question at a time and a regression test. (2) Two comments narrated; trimmed. Opus diff review, same round: three findings, all accepted. Two page tests could not fail (the debounce never fired after unmount; a late Confirm after unmount was never tried); both now go red without their guard. One stale test header. Rejected: none.
- **Arc 1158, round 2** (Codex resume over `9dfb28417..7adc3eb5a`): `clean`.
- **Arc 1192, round 1** (Codex over `1054f2b08..6ca25aa57`): one finding, accepted: two comments restated their declarations; trimmed. Opus diff review, same round: four findings, all accepted. The countdown's tabular figures sat on the button beside `type--label-section`, which sets `font-variant-numeric: normal` at equal specificity; moved to the countdown span. The repeat-Enter test pressed "Do it later" directly, so it did not depend on the focus hand-off; it now presses the focused element. A link test renamed; a stale option doc in `useSecretCountdown`. Rejected: none.
- **Arc 1192, round 2** (Codex resume over `6ca25aa57..212584dc1`): `clean`.
- **Arc 1208, round 1** (Codex over `f5ae44a44..b931e502e`): `clean`. Opus diff review, same round: one finding, accepted: the two-name test fed names that code-unit order sorts the same way as `stringCompare`, so it could not prove the chooser's collation; the fixture's case now differs. Noted, not taken: no test proves a reserved row is left out of the names, a gap older than this arc.
- **Arc 1208, round 2** (Codex resume over `b931e502e..6ee1a67d7`): `clean`.
- **Arc 1207, round 1** (Codex over `44d1f1e36..c2c51634b`): two findings. Accepted: the focus watcher sat among the handlers; moved after them. Rejected: delete the template's `Steps 4-6` marker, since every stage of the template carries one. Opus diff review, same round: three. Accepted: the protected stage's Download did not refuse a repeat Enter, as Full Backup's does (a failed download re-enables it); added, with a test. The watcher placement (already fixed). Rejected on proportion: clearing the sealed payload once downloaded (page-scoped, cleared at unmount and every reset).
- **Arc 1207, round 2** (Codex resume over `c2c51634b..5b5c07bc1`): `clean`.
- **Arc 1228, round 1** (Codex over `151e2b6b1..b08882d8c`): two findings, both accepted. (1) Demonstrated: an automatic settle returning after another window's pick began loading kept its own pick over that newer one; fixed, with a deferred-read regression. (2) A type comment restated its type; deleted. Opus diff review, same round: three, all accepted. Fixtures in `boot-session.test.ts` and `locked-state.test.ts` made the last-active profile also first by name, so a lost last-active read could not fail them; they now differ. `openProfileChooser` could press the pill over a deleted profile's name, and nothing reopens the chooser now; it waits for a listed name. The TSDoc claimed the chooser's full order; it names the collation only.
- **Arc 1228, round 2** (Codex resume over `b08882d8c..57ac3ee8f`): one finding, accepted. Demonstrated: the round-1 fix (reading last-active after the list) still lost the newer pick when that read rejected or answered the replaced pointer. The settle's pick now gives way to a follow in flight, and the regression keeps the read stale.
- **Arc 1228, round 3, the hard stop** (Codex resume over `57ac3ee8f..0fea2dcc8`): one finding, accepted. Demonstrated: a counter of settles also gave way a profile the person picked after the settle, before its pointer write was heard. Fixed in `2bc10631d`: only the settle's own pick, held by reference, gives way; a second regression covers that order, and each regression goes red against the other's mechanism. No fourth round ran; the cross-arc pass reviews the fix.
- **Cross-arc pass** (fresh Codex session over `78f5f9171..6520d1ece`, plan files excluded): five findings. Accepted: auth page tests left their pages mounted, so a later test's deferred reads could be taken by an earlier page; every mounted page is now unmounted after its test, and the manual listener clears are gone. The recovery phrase constant's comment restated its name; deleted. Not taken, as `dev` behaves the same and filed: a re-pick of the selected profile here, or a pointer that already names the selection, can still lose to another window's pick or to a settle (#1281); Settings' Disable auto-close drops keyboard focus, which the onboarding step's use of the same link hands on (#1282). Not taken: shortening the duplicate-names comment, whose "as the chooser lists them" says why `stringCompare`. The pass found the arc 1228 fix's regression holding.

## Seeds (draft; run none until the orchestrator spawns an arc)

`/goal` Arc <issue> of implementations-plan/lock-ux-1/plan.md built to the owner's quoted pick, its gate passing in the transcript, its Codex loop converged (a resumed pass with no new material finding quoted), its PR open on the lane's stack with the pick quoted and `Closes #<issue>`.
`/loop 15m` Drive the next picked arc of implementations-plan/lock-ux-1/plan.md per its Arcs section and Post-implementation; never build an unpicked option; stop at the open PR.
