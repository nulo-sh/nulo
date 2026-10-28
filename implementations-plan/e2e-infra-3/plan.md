---
plan: e2e-infra-3
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 78f5f9171
trunk: dev
issues: "#1123, #1210, #1222 (arc 1); #1111 (arc 2)"
budget: one Explore recon agent (sonnet); one Codex audit (gpt-6.1-sol, high) with its resumes; one Opus Plan leg; a fresh final Codex pass
post_implementation_hardening: not scheduled
---

# e2e-infra-3: e2e gaps and Firefox-side flakes

Two arcs, stacked against `dev`: test infrastructure plus two invisible product attributes. Arc 1 makes three e2e checks wait for states the product reaches (#1123, #1210, #1222). Arc 2 puts `bringToFront` and `setViewport` behind `BrowserDriver` and moves the Firefox pin to Puppeteer's (#1111). Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Size: over the light target, because arc 2 is a browser bump with its own spike.

## The findings and what held

- **#1123 `current`: demonstrated by trace, consequence real.** After `waitForHash("#/popup/general")` the sheet's first status read (`LegalAcceptanceSheet.vue` `onBeforeMount`) can still be in flight, so `isSheetPresent()` is false whatever the verdict. A build that wrongly raises the sheet over a current acceptance would pass the update scenarios: a wrong screen for every updated user, unguarded. Where `answerArrival` follows and an arrival shows, `networkArrivalView` requires `legalSheet === false` (`network-arrival.ts:29`); where none shows (every sealing release), nothing does.
- **#1123 `missing`: holds.** No record gives the `review` variant, so `waitForSheet(page, "changed")` times out after 15 s with a misleading message.
- **#1123's "When" no longer holds.** Terms 1.2 is material and is in `dev` and `v1.1.0` (`packages/legal/src/manifest.ts:25-32`), so the v1.0.0 recording (Terms 1.1) is now stale and its replay takes the `changed` path. The first `current` replay will be v1.1.0's. The release runbook records it after each stable release (`.claude/skills/release/SKILL.md` step 1), so this lane does not. Arc 1 proves the `current` branch in smoke instead (D2) and still runs the v1.0.0 replay.
- **#1210: demonstrated by trace; seen once on Firefox and once on Chrome under load.** `expectFitsNarrow` records the page at its own width, then compares at 240 px. While Send's fee read is pending with no saved pick, the card shows `send-fee-method-checking` and the "Available" row (`FeeMethodSelector.vue:56-60`, `FeeMethodRow.vue:28-30`). With no node (smoke), the read ends as "Select method" plus the `fee-init-degraded` notice, which replaces the row. An end between the two reads reports both texts "gone". Test-only consequence: a correct page reds required smoke.
- **#1222: the flake is seen twice (load near 120); the cause is plausible but unverified.** Nothing in the suite dismisses pickers: Firefox 153 dismisses them only under `remote.bidi.dismiss_file_pickers.enabled` (default false), so the `cancel` comes from the native headless picker, whose latency nothing bounds. Phase 3 measures before anything ships.
- **#1111: holds.** Puppeteer 25.14.0 pins `stable_158.0` (`puppeteer-core/lib/puppeteer/revisions.js`). On 158, BiDi `setViewport` and `activate` resolve their context without privileged scope, so they refuse an extension page. The inventory is 36 `bringToFront`, 27 `setViewport` and 3 `viewport()` calls in 32 files under `tests/e2e`, 28 of them specs (recon.md), against the issue's 27 specs.

## Outcome & Quality Bar

- **For whom:** every contributor whose PR runs the required smoke lanes, and whoever bumps Firefox or Puppeteer next.
- **Excellent:** (1) each changed check passes or fails on a product state, never on a race or a bound, and its never-happens assertion is shown red on a broken page; (2) after arc 2 the Firefox pin equals Puppeteer's, and no direct `bringToFront`, `setViewport` or `viewport()` is left outside `fixtures/browser/`.
- **Good enough:** no new e2e file; S7 grows by two reloads; FIREFOX.md's version tags are re-verified, not rewritten.

## Assumptions

**Facts** (at the base):
- F1. The shell holds the sheet's verdict in `legalSheetShown` (`app.vue:120`): undefined until the first verdict, and again on unmount. The wrapper already exposes e2e state attributes (`app.vue:607-610`).
- F2. `answerUpdatedTerms` has four call sites in three files (recon.md); each is followed by `answerArrival`. Every one but the chaos run's reaches Home by an in-app navigation; the chaos run calls it on whatever settled route its last step left (`profile-chaos/run.ts:488-493`).
- F3. The sheet's status starts `loading` (no verdict). If its read lands before the router's first navigation ends, the sheet judges the start location, whose meta is empty, and the verdict is `false` (`legal-sheet.ts:27`). An in-app navigation finalizes the hash and `currentRoute` in one task (vue-router 5.2.0), and Vue patches the DOM in a microtask, before any later page evaluation; after a reload into a preset hash nothing says the first navigation has ended. Traced in Phase 1, both browsers: such a reload lands first on `#/popup/auth` (the guard's answer before the session is checked, `auth-guard.ts`), where the verdict is `hidden`, and reaches the hash's page about 70-280 ms later.
- F4. `expectFitsNarrow` (`fixtures/type-roles.ts:755-777`) already waits out a self-closing success snack before the record pass; 12 spec files reach it.
- F5. `readPending` (`FeeSettingsCard.vue:207`) is exactly "this card's read is in flight". With a saved pick the trigger shows the pick and no Checking, while the "Available" row stays until the read ends (`:203`, `:415-419`). `fee-settings-card` already carries state attributes (`data-origin`, `data-sponsor-funding`).
- F6. Firefox's Remote Agent dismisses a picker through a factory whose `open` calls `done(returnCancel)` at once (`FilePickerHandler.sys.mjs`). 153 arms it by the pref above, when the session starts BiDi; 158 arms it by `unhandledPromptBehavior` with `file` set to anything but `ignore`. `returnCancel` fires the input's `cancel`, which `pickFile` handles (`src/utils/files.ts:116-123`). Firefox asks for a picker only on a click that carries user activation.
- F7. The suite never answers a native picker on Firefox: its `pickFile` feeds the pending input after an evaluated click, which opens none (`fixtures/browser/firefox.ts:605-621`).
- F8. Classic `POST /window` selects the tab and focuses its window (FIREFOX.md, sidebar row). `navigateWindow` and `refreshWindow` already use it on extension pages, also on 158 (#1111's evidence).
- F9. Firefox's own BiDi `setViewport` sets the embedder `<browser>`'s `style.width/height`, calls `synchronouslyUpdateRemoteBrowserDimensions(true)` and waits for the content size; `null` removes both properties (158 `browsingContext.sys.mjs:3060-3095`). `closeTab` (`firefox.ts:748`) already reaches a tab's `<browser>` through `NavigableManager.getBrowserById`. Puppeteer applies `defaultViewport` only in `newPage`, so a window the wallet opened has `page.viewport() === null`.

**Inferences** (each has a gate that checks it):
- I1. Under the same CPU contention, the native picker's cancel is materially slower than the dismissed one (Phase 3, step 1). Pinning two CPUs is weaker than a host at load 120; a null result is inconclusive, not a refutation.
- I2. The arming takes effect on the suite's session, even though `bidi-attach.ts` answers `session.new` itself (Phase 3, step 1; Phase 6 on 158).
- I3. A privileged embedder resize gives Puppeteer's layout, survives a reload and leaves focus where it was, on 153 and 158, or the spike says which route does (Phase 4).

**Asks** (working assumptions; none blocks):
- A1. The v1.1.0 recording stays the release runbook's job; arc 1 does not make it.
- A2. Arc 2's target is Puppeteer's own pin, `stable_158.0`; a later Puppeteer bump moves both.

## Architecture & Implementation

**Arc 1 change map.**
1. `apps/extension/src/popup/app.vue`: a hidden leaf, `<div hidden data-testid="legal-sheet-verdict" :data-verdict>`, carries the verdict as `shown` or `hidden`, marked only while `legalSheetShown` holds one and `legalSheetMayCover` holds for the route. `src/utils/legal-sheet.ts` exports `legalSheetMayCover`, the route half of `shouldShowLegalSheet`, which uses it; its test pins that the two agree on five routes (D1, amended).
2. `tests/e2e/helpers/legal-drivers.ts`: `legalSheetVerdict(page)` waits for `legal-sheet-verdict` to carry `data-verdict` (15 s) and returns the value the wait read. Its TSDoc says the shell marks no verdict on the start location or the lock screen, which a reload passes through. `answerUpdatedTerms` refuses `missing` first, before any page call, with its own error. `current` waits for the verdict, throws when it is `shown`, and then still asserts that no `legal-sheet` is in the page. `stale` is unchanged.
3. `tests/e2e/legal-acceptance.test.ts` S7: after its banner check, `reloadWithLegalState(page, "current")`, and `answerUpdatedTerms(page, { [LEGAL_ACCEPTANCE_KEY]: legalSeedValue("current") })` resolves. Then `reloadWithLegalState(page, "stale")`, and the same call rejects with "raised the Terms sheet": the success control. Neither waits for Home, so the control proves the marker skips the reload's transient routes.
4. `tests/e2e/fixtures/legal.ts` gains `updatedTermsAnswer(entries)`, the pure decision the helper branches on; `apps/extension/scripts/e2e/updated-terms.test.ts` (new) refuses no record and a malformed one, and answers `none` over `current` and `changed` over `stale`. It tests the fixture, not the helper: importing `helpers/legal-drivers` pulls the e2e fixture graph into `tsconfig.scripts.json`, which fails typecheck.
5. `FeeSettingsCard.vue`: `:data-read-pending="readPending || undefined"`. `fixtures/type-roles.ts` `expectFitsNarrow`: the snack wait also waits until no `fee-settings-card` carries it, one selector list with a 50 s bound and a timeout that names what held it. The slowest measured read is 2.74 s (Phase 2), but Send's read is forced, so it may wait out an older gas flight and then fetch, each under `INIT_FETCH_TIMEOUT_MS` (20 s). A second wait would cost about 47 ms per sweep on Firefox. `FeeSettingsCard.test.ts` pins the mark on the saved-pick loading path.
6. Only if Phase 3 shows I1 and I2: `fixtures/browser/firefox.ts` `capabilities()` always adds the dismissal pref, in its own named const beside `permissionRequestPrefs` and out of `FIREFOX_LAUNCH_PREFS`; `scripts/e2e/firefox-driver.test.ts` pins both facts; `toolbar-panel.test.ts`'s comment and FIREFOX.md's panel row say that the session dismisses the picker.

**Arc 2 change map** (once Phase 4 picks the route).
1. `fixtures/browser/index.ts`: `bringToFront(page)`, `setViewport(page, viewport: Viewport | null)` and `viewportOf(page)`, on `BrowserDriver` and as exports. `chrome.ts` passes Puppeteer's calls through unchanged. `firefox.ts`:
   - `bringToFront` is an exclusive classic switch to `contextIdOf(page)`, for extension and dApp pages alike.
   - `setViewport` is the chosen embedder resize, then a wait in the page for `innerWidth`/`innerHeight`. `null` removes the override and records `null` for the page.
   - `viewportOf` returns the per-page entry (a WeakMap) when it `has()` one, `null` included, else `page.viewport()`.
   - `deviceScaleFactor`, `isMobile` and `hasTouch` throw by name; only Chrome-only capture sites pass them.
   - `prepareClick` and `prepareKeys` use the seam. `prepareClick` swallows only what `isTargetGone` matches, and `targetGone` learns "no such window" (with a `firefox-driver.test.ts` case).
2. Every site in recon.md's inventory moves to the seam. `onboarding-tab.test.ts` and `atWidth` restore through `viewportOf`.
3. `scripts/e2e/browser-seam.test.ts`: a `directPageCalls` rule, in the `directReloads` shape, bans `.bringToFront(`, `.setViewport(` and `.viewport(` outside `fixtures/browser/`, with `inAsync` guard cases and a negative case for the seam's own call.
4. `firefox-revision.ts` → `stable_158.0`. If item 6 shipped, the dismissal moves to `unhandledPromptBehavior: { file: "dismiss" }` and the 153 pref goes. Re-verify on 158: FIREFOX.md § Which Firefox, every version-tagged row in recon.md, the e2e-testing skill's lines, `firefox.ts:32`.

### Decision ledger

- **D1** (#1123) A shell attribute, found through a shell testid, is the verdict marker. Its TSDoc limits it to a settled route (F3), and S7 waits for Home. **Amended in Phase 1:** a settled route is not enough, since the lock screen is one (F3's trace), and a wait for Home breaks the chaos run, whose steps can end on Settings (`profile-chaos/ui.ts:298`). The shell marks the verdict only where the sheet may cover the route (`legalSheetMayCover`, shared with `shouldShowLegalSheet`), the only routes where it turns on the acceptance, and S7 drops its Home waits. The mark sits on a hidden leaf with its own testid, so the wrapper never becomes every popup element's nearest testid. The sheet's behaviour is untouched. Rejected: a delay (a time bound); the worker's status (not the popup's read); the arrival (absent for sealing releases); withholding the sheet's verdict until the router is ready (a product logic change for a test).
- **D2** (#1123) The `current` branch is proven in S7's tail, with a stale reload as its success control. Rejected: waiting for the v1.1.0 recording (A1).
- **D3** (#1210) `data-read-pending` on the fee card, waited out in `expectFitsNarrow` beside the snack wait. Rejected: Checking's absence (false with a saved pick, F5); a generic `aria-busy` wait (`TokenCard`, holdings and the takeover hold it for spans nobody measured); a wait in the Send case (the other sweeps stay exposed); ignoring detached elements at compare (hides a real width fate); `aria-busy` on the card (an a11y change made for a test).
- **D4** (#1222) If Phase 3 shows a material difference, the session dismisses pickers. Rejected, by the panel rule: a longer bound; skipping the cancel half on a timeout. The cancel still proves activation, because no picker is asked for without it. An inconclusive Phase 3 ships nothing: #1222 gets a comment with the numbers and stays open.
- **D5** #1222 stays in arc 1 (Opus), because Phase 4 can stop arc 2. Codex preferred all of it in arc 2, to avoid a mechanism that arc 2 replaces; it accepted arc 1 if Phase 3 shows a benefit while arc 2 is uncertain. That is D4's condition. The swap in arc 2 is two lines, with its own arming check.
- **D6** (#1111) `bringToFront` is the classic switch, which Marionette itself uses to focus. `setViewport` mirrors Firefox's own resize, and Phase 4 picks the route. Rejected: a classic window rect (it includes the chrome, it moves focus, and its minimum widths are unverified).

## Security & Adversarial Considerations

Test infrastructure plus two product data attributes. The attributes put on the popup's own DOM what its layout already shows; no dApp script reaches an extension page. The dismissal pref or capability lives only in the automation profile, beside the `--allow-system-access` the suite already passes. No dependency, workflow permission, secret or storage change. The adversarial risk is a check that passes vacuously, so every changed never-happens check carries a control shown red: S7's stale reload, Phase 3's arming probe and paired runs, Phase 4's overflow element.

**UI impact:** none. `app.vue` and `FeeSettingsCard.vue` gain attributes and nothing visible; arc 2 changes no product file.

## Phase 1: the Terms answer (#1123) ✓

**Assumptions:** F1-F3.
1. `gh stack init --adopt worktree-e2e-infra-3`. Make change-map items 1 to 4. Commit. (gh-stack 0.3.0 has no `--adopt`; `gh stack init --base dev worktree-e2e-infra-3` adopts the existing branch.)
2. Build the smoke extension for each browser, with FIREFOX.md's flags (`build:chrome`, `build:firefox`).
3. Red proof (scratch): restore the old `current` branch in the helper, run S7 five times per browser, and count how often the control resolves when it should reject. Restore the new helper.

**Validation gate** (lint, typecheck, unit, smoke e2e on both browsers):
- `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run scripts/e2e/updated-terms.test.ts`: each exits 0, with 3 tests.
- `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/legal-acceptance.test.ts --retry=0`, then the same under `NULO_E2E_BROWSER=firefox`: green, with S7's duration recorded.

## Phase 2: the fee read before the 240 px record (#1210) ✓

**Assumptions:** F4, F5.
1. Measure (scratch): log the time from Send's arrival to the end of its read in `type-roles.test.ts`'s Send flow, 3 runs per browser. Set the bound at 5× the slowest or more, and record it with the numbers.
2. Make change-map item 5. Commit.

**Validation gate:** `bun run lint`; `FeeSettingsCard.test.ts` green; `type-roles.test.ts` on both browsers green; the measurement in `lessons/phase-2.md`.

## Phase 3: the picker answered by the session (#1222) ✓ (inconclusive: no change, #1222 commented)

**Assumptions:** F6, F7; checks I1 and I2.
1. Measure (scratch). Before you start: `trap` kills the two busy loops by pid on every exit.
   - Arming: from privileged scope, `contractIDToCID("@mozilla.org/filepicker;1")` is the native CID without the pref and another one with it.
   - Paired runs: 10 runs of `toolbar-panel.test.ts` on Firefox at the base and 10 with the pref, with the run's process tree on two CPUs (`taskset -c`) and the two busy loops pinned there. Record click to `cancel` per run (median and max), and activation, cancel and input removal apart.
   - Material: the base's median is at least 10× the fix's, or the base passes the 10 s bound while the fix stays under 1 s every run. Anything else is inconclusive (D4).
2. If material: make change-map item 6 and commit. If inconclusive: no change; comment on #1222 with the numbers.

**Validation gate:** the arming probe and the paired numbers in `lessons/phase-3.md`; if item 6 shipped, `cd apps/extension && bun --bun vitest run scripts/e2e/firefox-driver.test.ts` and `toolbar-panel.test.ts` on Firefox are green.

## Arc 1 gate (after Phase 3, on the final head)

- `bun run lint`, `bun run typecheck:all`, `bun run test:all`, `bun run test:ci-gating`: each exits 0.
- `legal-acceptance`, `type-roles` and (if item 6 shipped) `toolbar-panel`: three runs each per browser at `--retry=0`, every run green, counts and per-file durations recorded.
- The full smoke suite once per browser at `--retry=0`: green.
- `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent` over the three network specs that reach `expectFitsNarrow` (`cancel-mid-prove`, `in-flight-send-guard`, `type-roles-windows`), once per browser: green.
- The update replay from v1.0.0 (`tests/e2e/README.md` § In-place update; the candidate from `scripts/e2e/build-update-candidate.sh`), once per browser with `NULO_E2E_RETRY=0`: green.
- `bun run check:plans` after staging.

## Phase 4: the seam's Firefox route (spike, #1111)

**Assumptions:** F8, F9; checks I3. A scratch file, never committed; results in `lessons/phase-4.md`.
1. On 158 (`FIREFOX_PATH`): a classic switch to a popup page and to a dApp page refuses nothing, and `document.hasFocus()` is then true there.
2. On a popup page and a window the wallet opened, try two resize routes: `chromeScript` with `NavigableManager.getBrowserById`, and BiDi `script.callFunction` on a chrome context (`browsingContext.getTree` with `moz:scope: "chrome"`). For each, go null → 240×600 → null, on 153 and 158, and `viewportOf` reads `null` at the end. Check that `innerWidth` and `documentElement.clientWidth` are right, that the size survives a reload, that two pages size independently, and that a second, focused page keeps `hasFocus()`.
3. On 153, the chosen route and Puppeteer's `setViewport` give the same per-testid boxes on `type-roles`' 240 px pages, and both report a planted overflowing element.

**Validation gate:** one route passes all of it on both revisions, or arc 2 stops and #1111 stays open with the measurements.

## Phase 5: the seam, its callers and the ban

1. Arc-2 items 1 to 3, on 153. Commit per item.

**Validation gate:** lint, typecheck, `test:all`; `browser-seam.test.ts` green, and red on a planted direct call; the full smoke suite once per browser at retry 0; the Chrome network suite once with `NULO_E2E_RETRY=0`; all green.

## Phase 6: the pin on Firefox 158

1. Arc-2 item 4, with the arming probe repeated on 158 when the capability replaces the pref. Commit.

**Validation gate:** the full smoke suite three times per browser at retry 0 (Firefox on 158); the Firefox network suite once with `NULO_E2E_RETRY=0`; `page-error-capture.test.ts` green, or the bump holds; `test:ci-gating` and `firefox-driver.test.ts` green on the new pin.

## Delivery

One `gh stack` against `dev`; no labels at creation.
- **Arc 1** `worktree-e2e-infra-3`, Phases 1-3: `test(e2e): wait for the terms verdict, the fee read and the session's picker cancel` (83), with `Closes #1123` and `Closes #1210`, plus `Closes #1222` only if item 6 shipped (else the title drops its last clause).
- **Arc 2** `e2e-infra-3-seam`, Phases 4-6: `test(e2e): bringToFront and setViewport go through the driver; firefox 158` (74), with `Closes #1111`.
- **Close-out** `e2e-infra-3-close-out`, docs only.

Each body gives the path, what held, the gates with their counts, each browser's suite wall-clock before and after (the e2e-testing skill, § Runtime budget) and `UI impact: none`. No parallel lanes: arc 2 edits arc 1's files.

## Post-implementation

The plan plus `implementations-plan/README.md` § Post-implementation standard at `78f5f9171`. Plan-specific values:
- **Step 1:** absent (`code_review: off`).
- **Step 2:** per arc, at its boundary, over `git diff <arc base>...HEAD`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`. One Opus `general-purpose` review runs beside round 1. Hard stop at three rounds. Then one fresh Codex pass over `origin/dev...` the top arc, for cross-arc issues.
- **Step 3:** `gh stack submit --auto`, `gh pr edit` each body, `gh pr checks <n> --watch`. Never merge.
- **Step 4:** the close-out layer. Merge `origin/dev` and read `index.md` and `lessons.md`. Write the Outcome. Promote lessons after a dedupe (the file is near its budget). Delete `STATUS.md`. `git mv` the plan into `archive/` in its own commit.
- **Step 5:** once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/e2e-infra-3/plan.md` succeeds, run `agent-worktree done e2e-infra-3 --merged`.

## Audit verdicts

| Round | Verdict | Taken | Rejected or kept |
|---|---|---|---|
| Codex r1 (`gpt-6.1-sol`, high) | `conditional approve`: fee readiness, viewport reset, the reproduction's stop rule, retry-zero gates, testid selectors | the read-pending attribute (D3); `Viewport \| null` with a reset and per-page tracking; Phase 3's paired runs and "inconclusive"; `NULO_E2E_RETRY=0`, Chrome network coverage, a full smoke run per arc; the shell testid (D1); dApp pages on the same Firefox path | #1222 wholly in arc 2: kept in arc 1 under D4's condition (D5) |
| Opus (Plan) | `conditional approve`: a settled route before the verdict, Phase 3's stop rule and arming, a Phase 4 comparison that can fail, the null reset and "no such window", fuller gates | the settled-route contract and S7's Home waits (D1, F3); the arming probe (I2); per-testid boxes and a planted overflow (Phase 4); the null reset and `targetGone`; the full smoke and network runs; the fact fixes (F1, F2, the #1210 text, the counts) | none |
| Codex final (fresh, `gpt-6.1-sol`, high) | `conditional approve`: keep an explicit `null` viewport; keep the DOM absence check | `viewportOf` reads a recorded `null` (`has()`), Phase 4 asserts it; the `current` branch keeps `isSheetPresent()` after the verdict; F3 qualified (status starts `loading`; vue-router 5.2.0) | none |
| Codex final r2 (resumed) | `approve`: the three fixes verified, no new material finding, no regression | — | — |
| Arc 1 Codex r1 (`gpt-6.1-sol`, high) | `approve`: no material finding | — | — |
| Arc 1 Opus (general-purpose) | `conditional approve`, six low: the verdict read after its wait; the fee bound under the store's 20 s; `hidden` on routes the sheet never covers; `popup-shell` as every element's nearest testid; two caller-naming comments; an unverified residual | the first five (`5c7aef1d7`) | the residual: a same-identity `recommit` and app-window cards set no mark; unverified, and #1210 is the Send path |
| Arc 1 Codex r2 (resumed; ran on `gpt-6-astra` by a resume mistake) | `conditional approve`, low: Send's forced read can take 20 s + 20 s | the 50 s bound (`e8a22a626`) | a controlled-delay e2e: the sequential path is pinned by `balances.store.test.ts` |
| Arc 1 Codex r3 (resumed, `gpt-6.1-sol`, high) | `approve`: both rounds' fixes re-verified, no regression | — | — |

Light tier with both legs: the resumed final pass is the approval gate's verdict.

## Seeds (not run; the orchestrator drives this lane)

`/goal Phases 1-6 of implementations-plan/e2e-infra-3/plan.md are ✓, each gate reported in the transcript; each arc's Codex loop converged (a resumed pass with no new material finding, quoted), then the cross-arc pass; the stack's PRs exist with their Closes lines, and the close-out archived the plan.`

`/loop 15m Drive implementations-plan/e2e-infra-3 forward per its plan.md; never merge; stop after the PRs' checks report.`
