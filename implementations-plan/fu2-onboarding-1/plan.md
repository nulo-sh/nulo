---
plan: fu2-onboarding-1
tier: light
status: arc 1 phase 1 green; review loop next
issues: "#1512, #1515 (arc 1); #1511 (arc 2); #1513, #1514, #1516 (arc 3)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex gpt-6.1-sol high audit round trip + Opus Plan leg; final fresh Codex pass
base: origin/dev at 1e6c5bc1f
trunk: dev
post_implementation_hardening: not scheduled
---

# fu2-onboarding-1: the phrase check, the done line, Back on You're in, Create profile, the passkey text, the popup before setup

Six signed picks of decision page 93 (First users lab 1, signed 2026-11-02), in three arcs. Arc 1 ships what the owner wrote word for word: Ready's new line and Back that stays on Ready. Arc 2 is the three-word phrase check, whose strings wait on OA-2. Arc 3 is what the create choice says and the popup before setup, with OA-1, OA-3 and OA-4. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are under `apps/extension/`.

## The issues, checked

No issue existed for any item; the planner filed one each (ux), titled as the lab saw it, body the signed pick.
- **#1511 (P93-16) demonstrated by trace.** `create.vue:157-160`: "I saved it" calls `markGetStarted(createdId, "phraseSaved")`, then routes to Ready. Nothing checks the words.
- **#1512 (P93-17) demonstrated.** `done.vue:95` is the line; `:98` is the tagline Welcome shares.
- **#1513 (P93-30) demonstrated.** `create.vue:184-185` titles the page `Create` / `Wallet` under Welcome's "Create profile".
- **#1514 (P93-31) demonstrated.** Two texts: `create.vue:245` and `popup/pages/profile/new.vue:126`. One link component serves four pages: `PasskeyReuseLink.vue:24`.
- **#1515 (P93-49) traced; arc 1 reproduces it first.** Back from Ready re-enters Create's entry. Create mounts a fresh form, `onMounted(clearFlowPath)` drops the mark, and with a profile present the name field pre-fills "Profile 2".
- **#1516 (P93-64) held in part.** The popup closes at once (`wallet/utils/onboarding-tab.ts:106-111`). The trigger is not the Terms but "no profile and onboarding not completed", so it also holds on Welcome and on Create's form. The fix covers that whole state.

## Outcome & Quality Bar

- **For whom:** a first-time person in the onboarding tab, and the same person who clicks the toolbar icon before finishing.
- **Excellent:** a person who wrote the phrase passes the check in three picks and one press. Do it later is as short as today. The check never holds or shows the whole phrase, and never logs a word. Back on Ready stays on Ready. The popup says where to go and goes there.
- **Good enough:** every string is the owner's, or waits on an ask with its form named. No other screen change.

## Assumptions

**Facts** (verified at `1e6c5bc1f`; citations in recon)
1. The six picks, quoted in § UI impact, are the owner's sign-off (lane brief, page 93 record).
2. `create.vue` runs the stages `form | phrase | closed` (`:45`). A lost session leaves the phrase for Ready (`:60-70`). A reload after the create resumes at Ready (`app.vue:57-70`). There, #1387's unsaved line reads the Get started flags (`done.vue:25-30`).
3. vue-router 5.2.0 undoes an aborted pop with `routerHistory.go(-info.delta, false)` (`dist/vue-router.js:1417-1427`). `app.vue`'s resume onto Ready is a duplicate navigation and runs no leave guard. `onBeforeRouteLeave` is auto-imported; no guard returns `false` today.
4. The manifest has no `tabs` permission; `tabs.get`, `tabs.update` and `windows.update` by id need none. `openOrFocusOnboardingTab` focuses the id it tracked in `chrome.storage.session`, or opens a fresh tab when that id is gone (`onboarding-tab.ts:49-79`).
5. "I saved it" runs in two smoke specs (`onboarding-tab`, `keyboard-guards`) and the chaos driver (`tests/e2e/helpers/profile-chaos/drivers.ts:217`). The chaos model cites `create.vue:146,159,178` (`helpers/profile-chaos/model.ts:371-373`), and `scripts/e2e/profile-chaos-model.test.ts:792` fails on a citation that moved. No CI lane runs profile chaos. No spec navigates the onboarding tab inside its document after Ready. No network spec reaches the phrase step.
6. No glossary term sits on these screens. `REDACTED_KEYS` (`wallet/logger/utils.ts`) holds `mnemonic` but no key for a phrase word, so a new type that holds words names its fields and adds them there (CLAUDE.md § Logging policy).

**Inferences.** I1: a phrase has at least four distinct words in every realistic case; the builder is bounded and total with fewer. I2: jsdom with a real hash router runs Back (`steps.test.ts:54-83`, `resume.test.ts:137-152`); that it also runs the pop undo is unproven until D10's arc 1 test, and D11's browser step is the witness. I3: register's predicate waits on any migration (`utils/storage.ts:68-70`), behind the migration barrier, and can reject.

**Asks.** OA-1 (arc 3), OA-2 (arc 2), OA-3 (arc 3), OA-4 (arc 3). Arc 1 depends on none.

## Decisions

- **D1 (arc 1).** `done.vue`'s line becomes the owner's sentence. The tagline stays: "Welcome keeps its lines; the done screen's line" names the one line people stopped on.
- **D2 (arc 1).** `done.vue` adds `onBeforeRouteLeave(() => false)`. Every in-document way off Ready is refused, and vue-router restores the URL of a Back or a typed hash. Two cases escape the restore: a typed `#/`, whose `/` redirect record vue-router's pop handler never rolls back, and a second Back faster than the restore (known limit #1539). Open wallet changes no route; a reload resumes at Ready as before.
- **D3 (arc 2).** The check is a stage of `create.vue` between `phrase` and Ready: `form | phrase | check | closed`. "I saved it" builds the questions, clears `words`, opens the check and marks nothing. A pass marks `phraseSaved`, then leaves for Ready. The check's Do it later leaves unmarked; the phrase step's is unchanged. A lost session leaves the check as it leaves the phrase. A reload resumes at Ready with #1387's line. No route, no new step cell. The model's three citations move to the new lines, "saved" to the pass.
- **D4 (arc 2).** The pure module `src/onboarding/phrase-check.ts` has `buildPhraseCheck(words, randomIndex = cryptoRandomIndex)`. It picks three distinct positions, ascending. Each `PhraseQuestion { position, phraseWord, phraseChoices }` holds its word and up to three decoys, shuffled. A decoy is a distinct phrase word other than the answer; the builder shuffles the candidates once and takes three, so it is bounded. `cryptoRandomIndex` draws from `crypto.getRandomValues` with rejection sampling. `isPhraseCheckPassed(questions, phrasePicks)` is the pass test. Decoys from the phrase demand the order, which a restore demands, and need no wallet-core export.
- **D5 (arc 2).** `src/onboarding/components/OnboardingPhraseCheck.vue` takes `questions` and `path`, and emits `passed` and `later`. Each question is a `fieldset` with a `legend` and a testid carrying `data-position`. It holds native radio inputs with their own `name`, drawn as chips under `translate="no"`, as `RecoveryPhraseGrid` does. There is no `<form>`, so Enter submits nothing. Confirm is disabled until three picks and takes `refuseRepeatEnter`. A wrong Confirm shows the refusal (`txt-danger`, `role="alert"`), and the next pick clears it. On mount the page scrolls to the top and focuses its title, as the phrase step does. No countdown, no Copy, no way back to the words. **Accessibility call** under the owner's 2026-10-19 delegation: native radios, not a roving tablist. They give the rule's aim (one Tab stop, arrows) with answer semantics; `AuthMethodTabs` switches content and is fixed at two. Verify Tab, Shift+Tab, arrows and Space on both browsers.
- **D6 (arc 2).** `REDACTED_KEYS` gains `phraseWord`, `phraseChoices`, `phrasePicks` and their kebab spellings, after a check that no log names them.
- **D7 (arc 3).** `create.vue`'s header `sub` becomes `Profile`. The submit label and Import's title follow OA-1.
- **D8 (arc 3).** `src/utils/passkey-choice.ts` exports `PASSKEY_CHOICE_TEXT`, as `recovery-phrase-warnings.ts` shares its copy; Create and the popup's new profile render it. `PasskeyReuseLink.vue`'s one text becomes the owner's link text, on the pages OA-4 settles.
- **D9 (arc 3).** `redirectToOnboardingTabIfNeeded` becomes the predicate `setupWaitsInTab(store)`, with no side effect. `register.vue` renders nothing until it settles; a rejected read renders the normal page, as a failed redirect leaves it today. When it holds, the hero and its two buttons give way to the owner's sentence and one button; the brand and the Terms footer stay. The button runs `openOrFocusOnboardingTab()`, then `window.close()`. A failure logs `{ error }` at debug and leaves the popup open. `import.vue` and `profile/new.vue` replace to `/popup/register` when it holds. The no-tab case follows OA-3. A tracked id the person navigated elsewhere is known limit #1536.
- **D10 (tests; each red on base, then green).** Arc 1: `done.test.ts` pins the whole line; a real hash router shows Back stays on Ready and `location.hash` returns, with a control route that leaves. Arc 2: `phrase-check.test.ts` covers positions, choices, decoy source, a phrase of few distinct words, and each refused pick class. `OnboardingPhraseCheck.test.ts` covers at most 12 words and no whole phrase, Confirm's gating, the refusal, the pass, Do it later, title focus and a repeat Enter. `create.test.ts` covers the check opening unmarked with `words` cleared, the pass marking and routing, Do it later, and a lost session. Arc 3: `create.test.ts`, `new.test.ts` and `PasskeyReuseLink.test.ts` pin the texts. `onboarding-tab.test.ts` (unit) pins a predicate with no `tabs` or `close` call. `register.test.ts` covers the block, the button's order, a rejected read and the normal page; `import.test.ts` and `new.test.ts` cover the replace.
- **D11 (e2e; no new scenario).** Arc 1: `onboarding-tab.test.ts`'s password scenario calls `history.back()` from an evaluate that resolves on the first `popstate`. It then waits for Ready's hash and asserts no Create page and one profile. A real browser's history is the only witness, estimated +0.5 s per browser. Arc 2: `passPhraseCheck(page, words)` in `tests/e2e/fixtures/profiles.ts` reads the questions by testid and `data-position`. It serves `onboarding-tab.test.ts` (password and passkey), `keyboard-guards.test.ts` (Enter on I saved it opens the check; the pass records the flag) and the chaos driver, estimated +1.5 s per browser. Arc 3: the popup scenario asserts the block and a popup still open once it renders. The button then brings the tab and closes the popup; only a real popup shows `window.close()` and tab focus, ±0 s. On Firefox it drives the toolbar panel through the existing panel helpers and reads the closure and the tab's focus from a control page; on Chrome it keeps the popup document in a tab and says so.

## Architecture & Implementation

| Arc | File | Change |
|---|---|---|
| 1 | `src/onboarding/pages/done.vue` (+ test), `tests/e2e/onboarding-tab.test.ts` | D1, D2, D11 |
| 2 | `src/onboarding/phrase-check.ts`, `components/OnboardingPhraseCheck.vue`, `pages/create.vue` (+ tests) | D3-D5 |
| 2 | `src/wallet/logger/utils.ts` | D6 |
| 2 | `tests/e2e/fixtures/profiles.ts`, `onboarding-tab.test.ts`, `keyboard-guards.test.ts`, `helpers/profile-chaos/{drivers,model}.ts` | D3, D11 |
| 3 | `src/onboarding/pages/create.vue`, `src/onboarding/pages/import.vue` (OA-1), `src/popup/pages/profile/new.vue`, `src/utils/passkey-choice.ts`, `src/components/composite/PasskeyReuseLink.vue` (+ tests), `helpers/profile-chaos/model.ts` | D7, D8 |
| 3 | `src/wallet/utils/onboarding-tab.ts`, `src/popup/pages/{register,import}.vue` (+ tests), `tests/e2e/onboarding-tab.test.ts` | D9, D11 |

Alternatives not taken: the check as a route (a reload or a typed URL could reach it, and the words live only in Create's ref); BIP39 decoys (recognition passes without the order, and wallet-core would export its list); the check keeping `words` (it never needs them after the questions); the redirect in `popup/route-guard.ts` (its cold boot would gain a storage read); finding the tab with `runtime.getContexts` (absent on Firefox here).

## UI impact

Sign-off: decision page 93, signed 2026-11-02. P93-17 B "Welcome keeps its lines; the done screen's line becomes “Your wallet is ready. Open it to get your address and your first token.”"; P93-49 B "Onboarding's history ends at “You're in”: Back stays there, and its one way on is “Open wallet”."; P93-16 B "A short check: pick 3 words by their position from shuffled choices before “You're in”, with “Do it later” kept."; P93-30 B "The Create page's title becomes “Create profile”, so button and page agree, and “Account” stays for an address inside a profile."; P93-31 B "One text in both places: the onboarding sentence plus “It unlocks Nulo on this device. Your recovery phrase is what restores it.”, and the link reads “Use a Nulo passkey I already have”."; P93-64 B "The popup shows “Finish setting up Nulo in its tab” with a button that brings that tab forward."
- **Arc 1:** Ready's line reads the owner's sentence; Back on Ready stays there. Nothing else.
- **Arc 2:** the check, with OA-2's strings (what ships now: its option A). Ready is reached as today; the phrase step's look is unchanged.
- **Arc 3:** Create's title `CREATE PROFILE`. The passkey text on Create and on the popup's new profile reads the onboarding sentence plus the owner's two sentences. The link reads the owner's text on the pages OA-4 settles. The popup before setup shows `Finish setting up Nulo in its tab` (no full stop, as written) and the button OA-3 settles.
- Captures (light, Chrome) before and after of each surface go in `screenshots/` and the PR bodies.

## Security & Adversarial Considerations

- **Secrets:** the 24 words leave memory when the check opens; it holds three answers and at most nine decoys (12 phrase words, 3 with positions). Their fields are redaction keys, and no log line takes a word, a pick or a question. Clearing a reference is not heap erasure, as today.
- **Randomness:** `crypto.getRandomValues` with rejection sampling. The check is a nudge, not an authorization: a wrong pick withholds only the mark.
- **Trust boundaries:** none new. No message, stored shape, permission, dependency or CSP change; `phraseSaved` is an existing flag. Back's refusal is in-document only. A typed `#/`, or a second Back faster than the router's restore, can leave the URL on an entry without Ready's mark while Ready shows; a reload there opens Welcome (known limit #1539).
- **Known limits:** #1536 (a tracked tab id the person navigated elsewhere); #1539 (a typed `#/`, or a fast double Back, leaves Ready's URL off Ready).

## Phase 1 (arc 1): Ready's line and Back ✓

1. On base, add D11's Back step to `onboarding-tab.test.ts`; run it on Chrome and require the Create page (the reproduction). Record it in lessons. Time the unchanged `onboarding-tab.test.ts` once per browser.
2. Add D10's arc 1 tests; require each red on base. Commit. Make D1 and D2. Require all green. Commit.
3. Capture Ready before and after with a scratch spec under `~/.cache/nulo-backlog/fu2-onboarding-1/capture/`; delete it and require nothing untracked under `tests/`.

**Gate**, from the root: `bun run lint`; `bun run typecheck:all`; `(cd apps/extension && bun --bun vitest run src/onboarding --retry=0)`; `bun run test:all`. Build armed: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`, then `build:firefox` the same way. `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/onboarding-tab.test.ts tests/e2e/keyboard-guards.test.ts tests/e2e/legal-acceptance.test.ts --retry=0`, then with `NULO_E2E_BROWSER=firefox`. `bun run check:plans` after staging. Pass: every command exits 0 at retry 0; step 1 red on base.

## Phase 2 (arc 2): the phrase check

Build with OA-2's option A unless the owner answered first. Add D10's arc 2 tests (red on base), make D3-D6 and D11's arc 2 changes, and capture the check. **Gate:** Phase 1's commands with `src/wallet/logger` added to the vitest list and `tests/e2e/passkey-retry.test.ts` added to the smoke files. On each browser, also run one `NULO_E2E_CHAOS=1` replay of `tests/e2e/profile-chaos.test.ts` whose `NULO_E2E_CHAOS_ACTIONS` lists one `onboardingCreate` with `answer: "saved"`, refs shaped as a recorded plan's. Pass as Phase 1.

## Phase 3 (arc 3): Create profile, the passkey text, the popup before setup

Build with the "what ships now" form of OA-1, OA-3 and OA-4 unless answered first. Add D10's arc 3 tests (red on base), make D7-D9, re-cite the chaos model, and capture Create (passkey tab), the popup's new profile, an import page's link and the popup before setup. **Gate:** Phase 1's commands with `src/popup/pages src/wallet/utils src/utils src/components/composite` in the vitest list, and smoke `onboarding-tab`, `auth-flows`, `passkey-paths`, `registration`, `security-reset` and `legal-acceptance` on both browsers. Pass as Phase 1.

## Delivery

- Arc 1: `fu2-onboarding-1-a1`, off this plan's commit. PR `fix(onboarding): ready's line in plain words, and back stays on ready` (69 characters), `Closes #1512`, `Closes #1515`.
- Arc 2: `fu2-onboarding-1-a2`, stacked on arc 1 (off `dev` if arc 1 has merged). PR `feat(onboarding): a three-word recovery phrase check before ready` (65), `Closes #1511`.
- Arc 3: `fu2-onboarding-1-a3`, stacked the same way. PR `feat(ui): create profile, one passkey text, a popup that points to the setup tab` (80), `Closes #1513`, `Closes #1514`, `Closes #1516`.
- Close-out: the docs-only top layer `fu2-onboarding-1-close-out`. Stack with `gh stack`; PRs ready, base `dev`, no label at creation. An arc whose asks are open is still opened; its body names them, and its merge waits for the orchestrator.
- Each body: what changed and why; the claims that did not hold; the sign-off quotes and each ask's state; the captures (`?raw=true` at the head SHA); the touched e2e files' local times and each browser's smoke suite wall-clock from CI, before (the latest green run of the same workflow on another PR) and after; runs and outcomes; the accessibility calls under the owner's 2026-10-19 delegation; ending `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Commits: conventional, lower case, signed, ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The arcs share `create.vue` and `onboarding-tab.test.ts`, so no lanes.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `1e6c5bc1f`. Specific here:
- Step 1 is absent (`code_review: off`). Step 2 runs per arc at its boundary over `git diff <arc base>...HEAD`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, and one Opus 5.5 diff review (`general-purpose`) beside round 1. After arc 3, one fresh Codex session over the net diff checks cross-arc issues. Prompts go under `~/.cache/nulo-backlog/fu2-onboarding-1/`. Hard stop at three rounds; log each round in `lessons/phase-N.md` and § Audit verdicts.
- Approval boundary (a plan change; stop): a string outside § UI impact and the asks, a way back from the check to the words, a countdown on the check, a new route, a new permission, a log line with a word.
- Close-out: the Outcome (`Known limits: #1536, #1539`); an ask still open filed as one `owner-decision` issue; lessons promoted within the 8 KiB budget; `STATUS.md` deleted; `git mv` into `archive/`, index line moved. Teardown after the merge: `agent-worktree done fu2-onboarding-1 --merged`, trunk `dev`; the archived plan is `implementations-plan/archive/fu2-onboarding-1/plan.md`.

## Audit verdicts

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| plan 1 | Codex, gpt-6.1-sol (session 01a19d3f) | conditional approve | the check's strings and the no-tab case go to the owner (OA-2, OA-3); a rejected predicate read renders the normal page; the D5 accessibility call recorded; a bounded decoy builder with a few-words test; `translate="no"`; the suite wall-clock from CI; the tracked id a known limit (#1536) | a full local smoke before each PR: the lane brief's gate names the touched files, and CI's required smoke lanes run the whole suite on every PR |
| plan 1 | Opus 5.5 (Plan) | conditional approve | the same two asks plus OA-4 (the link on the import pages); the chaos model's citations and one chaos replay per browser; the redaction keys; questions built in `create.vue` and `words` cleared; the Back step through `history.back()` on `popstate`; no `<form>`, testids and `data-position`; the known limit | none |
| final 1 | Codex, gpt-6.1-sol, fresh (session 01a19d52) | **approve** | I2 narrowed (the cited tests run Back, not the undo); arc 3's popup step drives Firefox's toolbar panel | none |

## Seeds (not run; orchestrator-owned)

```
/goal Phases 1-3 of implementations-plan/fu2-onboarding-1/plan.md marked ✓ with their gates passing in the transcript; each arc's Codex loop (gpt-6.1-sol, high) converged; three ready stacked PRs against dev closing #1511-#1516; bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/fu2-onboarding-1 per its plan.md and the README § Post-implementation standard at 1e6c5bc1f: run the gates, decide open questions with Codex (gpt-6.1-sol, high), open each arc's PR, never merge, never change copy beyond § UI impact and the asks' named forms; stop once checks are green and report.
```
