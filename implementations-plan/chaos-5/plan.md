---
plan: chaos-5
tier: light (the orchestrator's spawn: one Codex audit round-trip and the Opus Plan leg)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at a4da1f36f
trunk: dev
status: approved
issues: "#1157 (the browser items #1301, #1324 and #1331 left)"
post_implementation_hardening: not scheduled
---

## Goal

Close #1157's last items: the races its comments of 2026-10-28 leave to the browser. Test files, test helpers and test docs only; a product fault found is filed, never fixed. `E` is `apps/extension`, `PC` is `E/tests/e2e/helpers/profile-chaos`, `PS` is `E/src/wallet/services/profile`. Recon, with each item's search trail: [recon.md](recon.md). Over the light target (150 lines) because ten items each carry a landing and a reason.

## Outcome & Quality Bar

- **For whom:** a maintainer who changes the Unlock method page, the account file page, the passkey window or the restore commit, and meets a red seed or a red test.
- **Excellent:** (1) every item's browser form is driven where a browser can drive it honestly, and its failure mode is also held at the cheapest layer that can; (2) every never-happens check has a success control and a break that turns it red; (3) a red names its seed, step and oracle and replays from the seed alone.
- **Good enough:** an item a cheaper test already holds in full gets a disposition line naming that test.

## The items (recon.md § The item list)

| # | Item | Landing | Why |
|---|---|---|---|
| S1 | A delete racing a method change, as pages | arc 1, catalog: `raceMethodChangeElsewhere` `{ competing: "delete" }`, both browsers | the delete's session end reaching another page while its card is open; the composition test holds the service, the component test fakes the store. A lock's session end is already driven (`raceLockDuringMethodChange`); the delete stays because it costs one branch of S2's driver |
| S2 | A second window's method change racing one | arc 1, the same action, `{ competing: "change" }` | as S1, through the profile update fanned out to another page |
| S6a | A change of the profile's unlock during the account file export | arc 1, catalog: `raceMethodChangeDuringExport`, Firefox (`ceremonyOffAnchor`) | the update reaching an export page that holds an approval; either change starts the page over before Save (D15). Chrome cannot approve the export on a second page: stated in the caps |
| S6b | A network switch during the account file export | known limit, closed issue | a switch reaches no other window (F7): the page keeps the network it shows, and its file names that network's account. A reset completion does reach every window (`E/src/popup/reset-completion.ts:29`) and is the network lane's. The trace shows no wrong export; propagation would be a product change |
| S3 | A discovery answered with another profile's credential in the passkey window | arc 2, e2e: one Firefox test in `toolbar-panel.test.ts` | the service's PATH B branch is held (`PS/service.integration.test.ts:780-797`, over its `FakePasskeyService`); the window page, the real `PasskeyService` and Firefox's authenticator meet only in the browser. Chrome has no PATH B (F1) |
| S4 | `prfSalt` rewritten while the passkey window's prompt waits | arc 2, the same test, and one assertion at `PS/service.integration.test.ts:1177` (the window is told `failed`) | as S3; the brief's list omitted it, the second comment names it |
| S5 | A discovery in the passkey window cancelled after the authenticator answered | known limit, closed issue; held at the boundary | the page receives an answer in the turn the authenticator gives it, and the window hides Cancel while it finishes (`E/src/popup/windows/passkey/index.vue:150-152`): only a close can race the hand-over, by timing. Each ordering is pinned: a close while the answer is built (`passkey/service.test.ts:187`), a newer request then (`:200`), a close after the hand-over, which the step outlives (`passkey/service.test.ts:98`, `window-manager/window-manager.test.ts:382`) |
| S7 | A restore under a passkey racing a second restore | arc 2, integration: `PS/service.integration.test.ts` | the race is the facade lock around the duplicate check; the page's guard is page-local by design, a declined passkey restore's credential is closed limit #1151 |
| S8 | Two 64 MiB picks with Import between them | disposition: held | Import overtaking a pick is pinned with deferred reads (`useFullBackupImport.test.ts:2270,2290`, `useRestoreAgain.test.ts:312`, recon.md S8); size only widens the window in real time |
| S9 | Restore again offered an earlier passkey backup, refused | disposition: held | `useRestoreAgain.test.ts` refuses it at the pick, at decrypt and at Restore, beside a control; `restore-again.test.ts:147` shows the error |
| S10 | Firefox's contacts chooser cancelled under load | disposition: #1222 | the item records headless Firefox's own cancel arriving late at load near 120, the test wait #1222 owns |

## Assumptions

**Facts** (recon.md § Facts, at `a4da1f36f`):
- F1. PATH B runs only from Firefox's toolbar panel (`E/src/utils/browser-surface.ts:11-13`); the chaos anchor is a tab, so every seeded step runs PATH A. `toolbar-panel.test.ts` drives the window (refuse the first prompt, then Try again, `:349-357`).
- F2. After the answer, PATH A and PATH B run one body (`PS/service.ts:879-897`, `:946-1013`); the window boundary is `PasskeyService` (`E/src/wallet/services/passkey/service.ts:106-183`).
- F3. The service's PATH B branch is driven by `PS/service.integration.test.ts` over a `FakePasskeyService` (`:137-194`): a discovery of another profile's credential (`:780-797`), an answer at another input (`:1141`, `:1192`), a row's input changed while its passkey is asked (`:1177`, which checks no session but not the window's outcome).
- F4. `holdNextGet` calls the real `get` only on release and rejects on abort (`E/tests/e2e/fixtures/passkey.ts:227-262`); `abandonCeremony` holds a prompt on a second page on both browsers (`PC/drivers.ts:610-630`).
- F5. The Unlock method page resets, rejecting its open card with no toast, on another window's update or a session end while no commit is in flight (`E/src/popup/pages/settings/security/unlock-method.vue:85-120,152-163`). The account file page resets on a type change, a profile switch or a lock, and drops a failed Save's answer with an error toast (`export/account.vue:153-176,252-262`).
- F6. Restore commits run under the facade lock with the duplicate check inside it; the name suffix is read before it (`PS/service.ts:2413-2467`, `:2332-2343`).
- F7. `appStore.network` crosses no window (`E/src/utils/guarded-network-activation.ts:11-17`; `onActiveNetworkChanged` has no popup subscriber); `exportAccount` reads only its arguments (`E/src/wallet/services/account/service.ts:677-722`).
- F8. `checkAnswers` checks a step's answers only when the driven outcome is one the step allows (`PC/prf-capture.ts:115-123`).

**Inferences** (each checked in the phase named; a failure stops it and is logged):
- I1. B's update or delete reaches A's page and aborts its held card within the step's settle bound, on both browsers (1.1). A card that outlives it is a finding (D10).
- I2. A new action outside the in-process surface leaves seed 8001 and every in-process plan unchanged (chaos-4 D1); the fixed-set coverage test proves it (1.1).
- I3. Two concurrent restores with `allowDuplicate` both read the names before either commits and take one name (2.2).
- I4. B's committed change reaches A's `appStore.profile` through the session's in-place reopen (`onActiveProfileChanged`, `PS/service.ts:322`; `app.vue` has no `onProfileUpdated` handler), so a change to a password resets A's account file page before Save, as its comment says (`export/account.vue:160-167`) (1.2). If it does not, Save is refused instead: a finding by D10, not a failure of the step's safety.
- I5. A discovery with one credential on Firefox's virtual authenticator answers with no chooser (2.1).

**Asks:** none for the owner: no surface changes ([OWNER-ASKS.md](OWNER-ASKS.md)). For the orchestrator: the brief allows a catalog action, an e2e sequence, a README statement or a closed known limit; S8 and S9 are dispositions on existing tests and S10 is #1222's (D9). Working assumption: approved with the plan, and each is restated on #1157.

## Architecture & Implementation

**Arc 1, the races** (`PC/model.ts`, `PC/unlock-method.ts`, `PC/accounts-io.ts`, `PC/drivers.ts`). Both races hold a page A on a second page and run the competitor B on the anchor, where Chrome serves every ceremony (D3). B runs the existing `changeUnlockMethod` or `deleteProfile` (`via: "settings"`) driver under a derived step, `B = { action, params, expect }` with the competitor's own expectation, so B must settle `committed` and `checkAnswers` binds its credentials (F8, D4).
- `raceMethodChangeElsewhere: { competing: "delete" } | { competing: "change"; change: ParamsMap["changeUnlockMethod"] }`, weight 1, on an open passkey profile; `change.current` is `approve`. A opens Unlock method, holds the current passkey's `get` (`holdNextGet`, `watchPromptAbort`) and presses `unlock-method-use-password`. Control: A's prompt is reached and not ended before B starts. After B: A's prompt ends within the settle bound, A shows no error toast and no `unlock-method-error-text`, and A's errors are watched for O4; then A closes with its hold unreleased (D4). A prompt still waiting is reported `committed`, so O5 fails. Expectation: outcome `cancelled`; B's world, writes and settle; sources B's plus `METHOD_DROPS_PROMPT` and `METHOD_ENDS_WITH_SESSION` (delete) or a new cite of `onChangedElsewhere` (change). `endsOf` adds the delete's session end.
- `raceMethodChangeDuringExport: { password: SecretRef; change: ParamsMap["changeUnlockMethod"] }`, weight 1, invalid without `ceremonyOffAnchor` or an exportable account. A opens the account file page, approves with the passkey (bound by `answeredCredentials`) and types the file password; B changes the unlock; A has the bound to start over, then Save is pressed if still offered. Either change: A starts over before Save (`cancelled`, no file, D15). Expectation: B's world and writes, the file password's secret spent, no held file.

**Arc 2, the passkey window and restores.** One Firefox test in `E/tests/e2e/toolbar-panel.test.ts`, on its panel helpers (`stepFromDyingPanel`, `refuseInWindow`, a control page that moves no focus). Its readings (rows, the session) are judged with `checkProfiles` and the salt-home clause of `PC/checkers.ts`, whose break fixtures the model test holds. Nothing is injected into the window: S3 needs none, and S4's edit lands from the control page while the window waits on Try again. Restores: two `restore()` calls in `PS/service.integration.test.ts`, the first commit held by a one-shot gate on its `assertPrfSaltUnusedHoldingLock` until the second has called `runExclusive`.

**File map.** Arc 1: `PC/model.ts`, `PC/unlock-method.ts`, `PC/accounts-io.ts`, `PC/drivers.ts`, `E/scripts/e2e/profile-chaos-model.test.ts`, `E/tests/e2e/README.md` § Chaos runs. Arc 2: `E/tests/e2e/toolbar-panel.test.ts`, `PS/service.integration.test.ts`, `E/tests/e2e/README.md` § Chaos runs. No `src` change.

**Not taken:** a param on `raceLockDuringMethodChange` (a lock race named for a delete misleads); A on the anchor (Chrome serves B's ceremonies there only); PATH B in the seeded e2e model (the anchor would have to be the panel); a second PATH B harness in process (the integration file already drives the branch, Opus 1); a hold injected into the passkey window (it would make a state no person reaches, S5); cross-window network propagation for S6b (a product change, D11); 64 MiB fixtures (D9).

## Decision ledger

| Id | Decision | Alternatives | Why |
|---|---|---|---|
| D1 | Every browser form a browser drives honestly lands as a catalog action or a targeted e2e; its failure mode is also held at the cheapest layer that can hold it | cheaper layers only (draft 1) | the brief asks for the browser forms; CLAUDE.md § E2E budget asks each to name what a cheaper layer cannot hold (Codex 1) |
| D2 | Two new actions, `raceMethodChangeElsewhere` and `raceMethodChangeDuringExport` | a `competing` param on `raceLockDuringMethodChange`; one action for both pages | a lock race named for a delete misleads; recorded lists keep their meaning; the two pages differ in schedule and outcome |
| D3 | A is a second page, B the anchor; S1/S2 on both browsers with no `ceremonyOffAnchor` gate; S6a needs it | A on the anchor | B's ceremonies run on the anchor only on Chrome; A's held `get` never reaches an authenticator (F4); S6a's A must answer a prompt |
| D4 | B runs under its own derived step (`ACTIONS.changeUnlockMethod.expect(before, change, caps)` or the delete's): it must settle `committed`, and its ceremonies bind. A is judged on its own: reached and not ended before B; ended after B; its toast and error line read before it closes; its errors watched for O4. A prompt still waiting is reported `committed` and A closed without a release | B under the race's step; releasing A | F8 (Codex 4, Opus 2); a released `get` on a Chrome page with no authenticator waits out WebAuthn's timeout, so A closes held, as `abandonCeremony` does (Opus 6) |
| D5 | A's outcome is `cancelled` with no toast (F5) | `refused` with the stale toast | the stale toast is the service's answer to a change already sent, which the composition test holds; a toast here means the page fence failed |
| D6 | PATH B: the integration file's existing tests plus one assertion, and one Firefox panel test | an in-process PATH B harness (draft 2); PATH B in the seeded model | Opus 1: F3's tests already drive the branch; Codex 2: the real `PasskeyService` and the window page meet only in the browser, which F1 limits to Firefox |
| D7 | S7 in the integration file: the first commit held inside the lock (at its `assertPrfSaltUnusedHoldingLock`, `PS/service.ts:2481`) until the second restore waits on it; assertions independent of order; break: serialization bypassed with the duplicate check real, the hold opened after the second's check passes | a planned list; a break that spies the duplicate check away; one release point for both | the in-process model holds no backup file; Codex 6, Opus 4: the password seal's PBKDF2 orders the two by itself, and spying the check proves the predicate, not the lock; final Codex 2: without the lock, the second still hashes before it reads rows (`:2333-2335`), so released early the first's write can win and the break passes by timing |
| D8 | Campaign seeds 9001-9010 per browser; hand lists for each competitor and change kind | reuse 7001+ | the catalog change redraws every e2e seed (chaos-3 D11); a weight-1 action is not drawn by every seed |
| D9 | S8, S9 get disposition lines naming the tests that hold them; S10 is #1222's; S5 is a closed known limit | e2e copies; 64 MiB files; a held answer in the window | Codex looks-fine; their orderings are pinned with deferreds, and size adds timing only. S5's browser state cannot be reached honestly (§ The items) |
| D10 | A product fault is an issue (seed and step, or the test's name) or a private draft advisory, never fixed here; I3 is filed by its consequence, never asserted | fixing it; a test pinning it | the brief; Codex 6 |
| D11 | S6b is a closed `known-limit` issue: the export page keeps its network; reopen on cross-window network convergence or a report of a file for a network the person did not choose. The comment at `export/account.vue:177`, which names another window's switch, is an open issue of its own | a sync between windows; the comment inside the closed limit | adding propagation is a lifecycle and coordination change the brief excludes (Codex 5); a closed issue holds no open work (Opus 8) |
| D12 | No network chaos run | a hand list on the network file | the races have no dApp, gate or chain step, and their outcomes open no profile, so `placeOpened` never runs (`PC/run.ts:484`) |
| D13 | Arcs 1 and 2 say Part of #1157; `Closes #1157` goes only on the PR that carries the close-out, once S5's and S6b's limits, the comment's issue and the #1157 comment are filed | close in arc 2 | #1157 must not close before its accounting exists (final Codex 4) |
| D14 | Accessibility: none | | no product file changes |
| D15 | S6a: a change to a new passkey also starts the account file page over before Save (`cancelled`), as a change to a password does; no `FileRef` in its params, since no file is made | `refused` at Save (draft 3) | the tree: the change reopens the session in place, the window's bootstrap that follows clears `appStore.network` (`E/src/composables/useProfileBootstrap.ts:153`), and the page's network watcher (`export/account.vue:180`) resets a passkey profile's unmade file. Seen on Firefox at 1.2. The watcher fires on every re-bootstrap, not only another window's switch, which the D11 comment issue records |

## Phases and gates

Every gate also runs `bun run lint` and `bun run typecheck:all` (exit 0). `T` = `cd apps/extension && bun --bun vitest run --retry=0`. `C` = `NULO_E2E_CHAOS=1 NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/profile-chaos.test.ts --retry=0` on the armed smoke build, each browser (`NULO_E2E_BROWSER=firefox`).

**Arc 1.**

**1.1 `raceMethodChangeElsewhere` (S1, S2).** ✓ `invalid` calls `ACTIONS.changeUnlockMethod.invalid` and requires `approve`, so Chrome's slot count holds. Model test: `mintsAt` and `newVariant` learn the race; preconditions and replay on the three caps; each variant (`delete`, `change:new-passkey`, `change:password`) drawn within 1,000 seeds on each; `endsOf`; breaks: A `committed` fails O5, B not committed fails the step. Estimate a step: 15 s Chrome, 20 s Firefox.
Gate: `T scripts/e2e/profile-chaos-model.test.ts` and `T src/wallet/services/profile/profile-chaos.composition.test.ts` green (I2). `C` with `NULO_E2E_CHAOS_ACTIONS` hand lists (delete; a change to a new passkey; a change to a password), green on both browsers, each step's time recorded. A scratch run in which A's request signal never aborts (A's `AbortController.prototype.abort` made a no-op before B) turns O5 red, recorded in lessons/phase-1.md, never committed: a hold that only ignores the abort still lets `watchPromptAbort` see it (`PC/ui.ts:375-385`).

**1.2 `raceMethodChangeDuringExport` (S6a).** ✓ The same model-test cases, Chrome's reachability list naming it unreachable. Estimate a step: 30 s Firefox.
Gate: as 1.1 on Firefox, both change kinds; Chrome plans never draw it.

**1.3 Campaign and record.** README § Chaos runs: the two races, what Chrome cannot drive, S6b's limit.
Gate: the model test 30 consecutive runs at retry 0; `C` with `NULO_E2E_CHAOS_SEED=9001 NULO_E2E_CHAOS_RUNS=10` on each browser at retry 0, each seed green or red only on a filed finding, per-seed time against chaos-3's 54 s and 76 s; `bun run test:all` once; `bun run check:plans` after staging.

**Arc 2.**

**2.1 The passkey window on Firefox (S3, S4).** One test: from the dying panel, a profile on the passkey another profile holds (the only one on the authenticator, so no chooser): its row names that credential at a salt of its own, and both profiles open. Then its unlock with `prfSalt` rewritten from the control page while the window waits on Try again, through `withDyingPanel` directly (`stepFromDyingPanel` waits for a session): the window reaches `step-failed`, not the refusal's `failed` (`E/src/popup/windows/passkey/index.vue:85,94`), no session write lands during the attempt, the row is put back byte for byte, and a control unlock opens. Add `expect(passkeys.outcomes.at(-1)).toBe("failed")` at `PS/service.integration.test.ts:1177`. Estimate: 90 s on Firefox, 0 on Chrome (skipped).
Gate: `NULO_E2E_BROWSER=firefox bun run test:e2e -- tests/e2e/toolbar-panel.test.ts --retry=0` green twice, the file's time before and after; `T src/wallet/services/profile/service.integration.test.ts` green.

**2.2 Concurrent restores (S7).** D7's schedule, the two restores on distinct fresh salts and destination ids so no other collision answers: with the lock, the first commit's hold opens once the second has called `runExclusive`, and there is one row and one `DuplicateWalletError` whatever the order; control, two phrases both commit; break, `runExclusive` made a pass-through and the hold opened only after the second's real duplicate check has passed, gives two rows. Then I3: record the names in lessons/phase-2.md and comment on #1206 if its reopening condition matches, else file by D10; no probe is committed.
Gate: `T src/wallet/services/profile/service.integration.test.ts` green.

**2.3 Record.** README § Chaos runs: the passkey window's two forms, S5's limit. Gate: `bun run test:all`; `bun run check:plans` after staging.

## Security & Adversarial Considerations

- **Threat model:** test code only. The risk is a green that proves nothing: a card that never aborts read as cancelled (reported `committed`, D4), a competitor that did not land (judged by its own step, D4), a PATH B fake that answers whatever the service expects (the Firefox test runs the real `PasskeyService`, D6), a race whose lock is never contended (the hold, D7). Each never-happens check has a control and a break.
- **Stored rows are hostile input:** S4 rewrites a row field under the service, as the existing row faults do, and puts it back byte for byte.
- **Secrets:** random per run; records and logs carry symbols only.
- **Findings:** an exploitable-looking fault goes to a private draft advisory and stays out of tests, plans and PR bodies until published.
- **Supply chain:** no new dependency.

## UI impact

None: no product file changes.

## Delivery

A `gh stack` on `dev`: arc 1 on `worktree-chaos-5`, arc 2 on `chaos-5-a2`, the close-out as the docs-only top layer `chaos-5-close-out` (or arc 2's last commits if the orchestrator says so, as chaos-4 D21). Each PR opens without labels after its gates and its Codex loop.
- Arc 1: `test(profile): the chaos model races a delete or a method change against an open page` (85 characters); Part of #1157.
- Arc 2: `test(profile): the passkey window's discovery and refusal on Firefox, and concurrent restores` (92 characters); Part of #1157. The close-out PR: `Closes #1157` (D13).
- Bodies: what changed and why, each item's landing, the gates with outcomes, each added scenario's failure mode and estimated then measured time, each browser's suite time before and after (the chaos files skip unarmed, so their CI time is unchanged; arc 2 adds the Firefox smoke lane's one test).

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `a4da1f36f`, with:
- Loop per arc, while it is the stack tip: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; the prompt carries the arc's diff, this plan, the arc map ("arc N of 2; arc 2 adds the Firefox passkey-window test and concurrent restores, no catalog change"), the adversarial ask and the standard's two rules verbatim. One Opus review (`Agent`, `opus`, `general-purpose`) beside round 1. Three rounds at most. Then one fresh session over the net diff from `a4da1f36f`.
- `/code-review`: off.
- Close-out: merge `origin/dev`, read `index.md` and `lessons.md`; the Outcome; lessons; S5's and S6b's known-limit issues and the comment's open issue (D11); the #1157 comment (each item's landing, S10 to #1222); `STATUS.md` deleted; `git mv` into `archive/` in its own commit; `bun run check:plans`.
- Teardown once the close-out merges: `agent-worktree done chaos-5 --merged --trunk dev`; a `/loop` checks each firing, a `/goal` arms one wait after its report.

## Review verdicts

Each finding was checked against the tree; detail in [lessons/phase-0.md](lessons/phase-0.md).

- **Codex, round 1:** reject; 7 findings, all accepted. The browser forms stay in scope (D1); PATH B goes through the real `PasskeyService` (D6); S5's orderings, the hand-over included (S5); B under its own step and A judged on its own (D4); S6b a known limit, S6a driven (D11, S6a); S7's break contends the lock (D7); runtime estimates per scenario and the redundant full-suite runs dropped (gates). Looks fine: S8, S9, S10, D2, D3, D12.
- **Opus Plan leg:** conditional approve; 9 findings, 8 accepted, 1 narrowed. PATH B's service branch is already driven over a `FakePasskeyService`, so the in-process harness is dropped and one assertion added (F3, D6); B under its own step (D4); the model test's `mintsAt` and `newVariant` learn the race (1.1); S7's hold forces the overlap (D7); estimates per browser (1.1, 1.2); A closes held (D4); `invalid` reuses the change's (1.1); the export comment is its own open issue (D11); the orchestrator Ask (Asks). Narrowed: S5 becomes a closed limit rather than an in-process case, since no person can cancel once the window holds an answer (S5).
- **Codex, final fresh pass:** conditional approve, then approve once its conditions were folded in (the resumed session); 4 findings, all accepted. The arc 1 break stops A's signal from aborting, since a hold that ignores the abort still lets the probe see it (1.1); S7's break opens the hold after the second's real check, on distinct salts and ids (D7, 2.2); S4 runs through `withDyingPanel` and asserts `step-failed` (2.1); `Closes #1157` only with the close-out (D13). Looks fine: arc 1's schedule on Chrome, both pages' outcomes and I4, the service's snapshot of the row before the window (`PS/service.ts:949-959`), S5's limit; I5 kept as an inference until 2.1.

## Seeds

```
/goal Every phase in implementations-plan/chaos-5/plan.md marked ✓, each backed by its gate reported passing in the transcript; LESSONS_FILE printed per phase; the Codex loop converged per arc and in the cross-arc pass (a resumed pass reporting no new material finding, quoted); the stack and its close-out on GitHub, opened after the loops; `bun run test:all` and `bun run lint` exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/chaos-5 forward per its plan.md and the README's Post-implementation standard: reality check from plan.md and lessons/ (the archived path present on dev means merged: tear down and stop); next pending step; fast gates after each edit; Codex consult instead of waiting; five failures on one step: reassess with Codex; never merge.
```
