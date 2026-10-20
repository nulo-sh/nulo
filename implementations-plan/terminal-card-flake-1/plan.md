---
plan: terminal-card-flake-1
tier: light
status: planned, Codex approve (round 3)
issues: "#903 (arc 1 closes)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex audit (gpt-6.1-sol, high) and its resume; one Opus Plan leg; a scratch probe; one Opus diff review beside the first fix-loop round (the implementer brief's same-family leg, not /code-review)
base: origin/dev at 44bc391f
trunk: dev
post_implementation_hardening: not scheduled
---

# terminal-card-flake-1: read the terminal card once the page it names has rendered

One arc, one PR against `dev`. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Probe data, its rebuild notes and consults: [lessons/phase-0.md](lessons/phase-0.md).

## Root cause (#903)

**Path (demonstrated).** Initial conditions: a popup on Home that shows a terminal card for the record, as `tx-sendTx-reject.test.ts:98-103` leaves it (a fresh popup, so History's route chunk is cold). Actions, in order: `readTerminalCard(wallet, "#/popup/activity")` sets the hash (`fixtures/navigation.ts:103-116`); the router runs its guard and loads History's chunk while Home stays drawn (W1, 6-33 ms in the probe); the fixture's `waitForSelector` meets **Home's** card; the router swaps the page, and History draws nothing until its journal read returns (W2, 16-30 ms); the separate `$eval` lands in W2 and throws `failed to find element matching selector`. Invariant broken: the fixture assumes the node its wait saw is still there for the read, and on the page the hash names. Consequence: a red required network shard on a correct product. The CI red (#896's run 39340471498, Chrome shard 4/5) is consistent with this race: its log shows only the throw, and the probe reproduced the same message in the same situation.

**Evidence** ([lessons/phase-0.md](lessons/phase-0.md)): a scratch smoke probe on 44bc391f recorded W1 and W2 on three of three swaps; the base fixture threw the CI message on a cold first swap (1 of 20), on a second run under load (1 of 1), and every time a card was parked between its wait and its read.

**Claims of #903 that did not hold.** The card did not leave because History re-rendered its row: History's rows are keyed `journal:<id>` (`src/utils/activity-rows.ts:122`) and its list stays mounted while it has rows. The node the wait saw was Home's. The issue's fix, one atomic read, closes the throw but would return Home's card in W1: a History assertion that passes on Home's rendering.

## Outcome & Quality Bar

For a maintainer reading a red network lane: a red at `readTerminalCard` means the page it names drew a wrong card or none.

- The read happens in the evaluation that finds the card, and only once the page the caller names is the rendered page. No retry, no new wait on time, no longer timeout (15 s stays), and the visibility check stays.
- The specs keep every assertion: the values each caller expects do not change.

## Architecture & Implementation

**Change** (`apps/extension/tests/e2e/fixtures/journal-page.ts`, `readTerminalCard` only). Signature `readTerminalCard(page, tab: "activity" | "general", shot?)`: it navigates to `#/popup/${tab}` as before, then one `page.waitForFunction` (the fixtures' idiom: `waitForNameField`, `editorText`, `shownToast`), `{ timeout: 15_000, polling: 100 }` like those peers, whose predicate returns `null` until both hold, then the card's data:

1. `[data-testid="nav-${tab}"]` carries `aria-current="page"`. `RouterLink` sets it from `isExactActive` (vue-router 5.2.0, `dist/vue-router.js:1003`), which reads the `currentRoute` that `finalizeNavigation` assigns (`:1392`) after the route's chunk has loaded; `RouterView` re-renders from the same assignment in the same Vue flush, and `app.vue:574-576` wraps it in no `Transition`, `KeepAlive` or `Suspense`. A poll is its own task, so it never lands inside that flush. The probe saw the mark appear in the batch that removed Home's card, three of three.
2. The first `tx-terminal-card` holds a `tx-terminal-subtitle` that is shown (the patched `waitForSelector`'s visibility test, `fixtures/dom.ts:57-62`). Stricter than the base, which waited for any card's subtitle, then read the first card.

It returns `{ title, subtitle }` read from that card (`activity-title`, `tx-terminal-subtitle`, trimmed), through `withTimeoutMessage` (`dom.ts:83`) with a message naming the tab, the hash, the current nav tab and the card count. The opt-in `shotSend` moves after the read. The doc comment states the invariant in two sentences: the hash names the new page before the router draws it, so the read waits for the router's own mark and reads in the same evaluation; the mark proves the page only while the page swaps with no transition around `RouterView`.

**Call sites** (the tab, no other edit): `network/tx-sendTx-reject.test.ts:103` and `network/legal-acceptance-wall.test.ts:75` (`"activity"`); `network/scope-refusal.test.ts:35` (`readHistoryCard`, `"activity"`) and `:127` (`"general"`: already on Home, the mark is already set, and the router hears only `popstate`, so the same-hash `hashchange` remounts nothing).

**Skill** (CLAUDE.md routes e2e lessons to `.claude/skills/e2e-testing/SKILL.md`): one bullet in § What to assert, beside "A wait over a page that can navigate", with only the new half: until the router commits, the hash names the new page while the old one is still drawn, so a node both pages draw can be the departing page's; gate on the tab's `nav-<tab>` `aria-current`, or, for a page with no tab, wait for the leaving nodes to disconnect (`openSurface`, `rows.test.ts:756-761`); rows 35 and 37 already say read once and wait for what only the loaded page draws. One flake-ledger row for this fingerprint.

**File map:** `journal-page.ts`, the three specs, the skill. No product file, no new helper, no new test file. `navigation.ts:99-102` says the router listens for `hashchange`; vue-router 5 hears only `popstate`. Out of scope, left alone.

### Trade-offs and alternatives not taken

- **Unscoped atomic read** (#903's suggestion): returns Home's card during W1, so the History assertions in three specs could pass on Home. Rejected.
- **`openSurface`'s idiom** (hold handles to the leaving rows, wait until they disconnect): a call on the page already shown remounts nothing, so `scope-refusal`'s Home read would wait its whole timeout; a same-hash branch plus handles is more mechanism than one attribute. Rejected.
- **A page-root testid on History**: a product change for a test; `activity-feed-root` is already shared by History and Home's widget. Rejected.
- **Keep the hash parameter and derive the tab**: the parameter would accept hashes the gate cannot serve. Chosen: the tab union.

## Phase 1 — one scoped read

1. Rewrite `readTerminalCard` and its comment as above; update the four call sites.
2. Add the skill bullet and the ledger row (the next free number on the branch; the close-out renumbers it after merging `origin/dev`).
3. Proof, scratch, never committed: the probe (rebuild notes in `lessons/phase-0.md`), copied into `apps/extension/tests/e2e/` for each run and removed after. Every case uses a fresh browser.
   - **(a) Held router.** `history.pushState(history.state, "", "#/popup/activity")` puts History's hash on Home with no event, so `navigateByHash` takes its same-hash branch and the router never moves. At each read, assert the held state: History's hash, Home's card present, `nav-general` current. Pass: the base fixture returns the card's values (Home's), the new one throws its message naming `activity` after its 15 s and returns no card.
   - **(b) Card gone during the read.** On History with its card shown, remove the card and count, page-side, every `querySelector` for `tx-terminal-card` while it is out. Start the new fixture (same hash, no remount), wait until that count reaches 2, then put the card back. No timer decides the order. Pass: the fixture returns the record's values after the card is back.
   - **(c) Cold swaps.** Ten rounds per run; each opens a fresh popup on Home, records every mutation batch, and calls the fixture for `activity`. Pass: every round returns the values, and no batch shows `nav-activity` current while Home's card is present.

**Validation gate.** Warning: start a build or e2e run only once `cut -d. -f1 /proc/loadavg` is under 150; never run two `e2e:agent` runs in this worktree at once.

- `bun run lint`, `bun run typecheck:all` (it covers the e2e tree), `bun run test:all`, and `bun run check:plans` after staging. Pass: each exits 0.
- The probe on armed smoke builds of the branch (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:<browser>`), run with `env -u EXTENSION_PATH NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/zz-tcf-probe.test.ts --retry=0`. Chrome: (a) and (b) once; (c) on the base fixture pinned, up to three runs, stopping at the first throw of the CI message (the sensitivity check; with no throw it is recorded as inconclusive, and the timeline and case (a) remain the evidence), then on the new fixture ten runs as is and twenty pinned (`taskset -c <cpu>` around the run, three busy loops on the same CPU), per the skill's § Certifying a deflake. Firefox (`NULO_E2E_BROWSER=firefox`): (a), (b) and (c) once each. Pass: every case as step 3 says; `git status` clean after.
- The three specs at retry 0 in CI's pool shape, Chrome then Firefox: `NULO_E2E_RETRY=0 NULO_E2E_PROVERLESS=1 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/tx-sendTx-reject.test.ts tests/e2e/network/scope-refusal.test.ts tests/e2e/network/legal-acceptance-wall.test.ts`, then with `NULO_E2E_BROWSER=firefox`. Pass: exit 0, every test passed. Exit 86 is a boot failure: rerun once and count it apart.
- Record each file's time per browser for the PR body. No pass bound: the change adds no scenario.
- Layers: lint, typecheck, unit, smoke probe and network e2e on both browsers.

## Security & Adversarial Considerations

Test code only: no product, permission, storage, wire or CI change; no secret handled. The risk is the test's honesty. The scoped read cannot accept the departing page while `RouterView` swaps with no transition (above), no assertion is loosened, and the timeout and visibility check stay. `aria-current` is written by vue-router from its current route.

## Assumptions

- **Facts.** F1 `readTerminalCard` waits, then reads with a separate `$eval` (`journal-page.ts:48-60`). F2 its callers and their prior pages, as `recon.md` lists. F3 the route-commit trace above (`vue-router.js:929,1003,1392`; `app.vue:574-578`), confirmed by both audit legs; vue-router 5's hash history listens for `popstate` only (`vue-router.js:79,210-217`). F4 `activity-feed-root` is on History and Home's widget (`activity.vue:191`, `RecentActivityView.vue:826`). F5 the probe records in `lessons/phase-0.md`. F6 the patched `waitForFunction` keeps a passed `timeout` and `polling` (`dom.ts:22-37`).
- **Inferences.** I1 the CI red is this race (consistent, not proven). I2 Firefox commits the mark and the swap in one render, as F3's code path implies; probe (c) checks it on Firefox. I3 a dApp record's title can change once tokens load (`journalCallTitle`, `src/utils/journal-state.ts:465-470`, through `settledCallTitle`), so the first sighting can be provisional; the base read at the same moment, the specs expect the plain name and have passed on it, so the scoped read adds no risk. No change.
- **Asks.** None.

## Decision ledger

- D1 Fix the fixture, not the product: the swap's order is correct product behaviour.
- D2 One read inside the wait, gated on the router's own mark (above). Alternatives in § Trade-offs.
- D3 `readJournalDetail` and the other same-shape fixtures stay: no written path (`recon.md` § The same shape); both audit legs agree.
- D4 No committed test beyond the three specs: no fake `Page` exists, and the race needs a real router. The probe is the proof, certified as the skill asks.
- D5 The skill gets one bullet (the router-commit half only) and one ledger row; no `README.md` or `FIREFOX.md` edit (neither names this fixture).
- D6 Case (a) holds the router with `pushState`, not by blocking `popstate`: a capture-phase block on the window did not stop the router on Chrome (`lessons/phase-0.md`), and `pushState` fires no event on either browser.

## Delivery

Branch `terminal-card-flake-1-a1` off `origin/dev`, carrying the plan commit. One PR against `dev` with `gh pr create`, after the gate and the Codex loop. Title: `test(e2e): read the terminal card once the page it names has rendered` (70 characters). Body: the path and its evidence, the claims of #903 that did not hold, the probe's outcomes per browser, the gate's runs with file times, `UI impact: none`, `Closes #903`. No label: the network and smoke lanes run on `apps/extension/**`. Overlaps: #743 and #886 edit the same skill (ledger rows 57-59 are claimed); the close-out renumbers this row if needed. No parallel lanes.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at `44bc391f`, once over the arc's diff. `code_review: off`: no `/code-review`. The Codex loop: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; stop at three rounds; log each round in `lessons/phase-1.md` and § Audit verdicts. One Opus diff review beside round 1. A fix that grows the design stops for the orchestrator. Close-out: the PR's final commits (merge `origin/dev` first, renumber the ledger row, the Outcome, the archive move). Teardown after merge: `agent-worktree done terminal-card-flake-1 --merged`.

## Audit verdicts

**Round 1, Codex** (gpt-6.1-sol, high, session 01a156a1): conditional approve, 6 findings. #1 the mark proves the page only with a plain `RouterView`: accepted (stated in the comment and § Security). #2 the Firefox gate must test I2: accepted (case (c) records batches on both browsers). #3 case (a) needs a fresh popup and an asserted held state: accepted. #4 case (b) needs an observable park: accepted (the predicate's own queries are counted while the card is out). #5 the first sighting can carry a provisional title: checked, pre-existing and unchanged (I3). #6 "is" the CI race overclaims: accepted (I1 reworded); D3 agreed.

**Round 1, Opus Plan:** conditional approve, 8 findings. #1 case (a)'s block may not hold; use `pushState`: accepted (D6; the block indeed failed). #2 the probe needs rebuild notes: accepted (`lessons/phase-0.md`). #3 the skill's certification rule: accepted (10 plain, 20 pinned). #4 I2 follows from the code path: accepted (F3). #5 `polling: 100` like the peers: accepted. #6 `readJournalDetail` unchanged: agreed. #7 the bullet repeats rows 35 and 37: accepted (router-commit half only, `openSurface` named). #8 the Opus diff review and `check:plans`: accepted; the `navigation.ts` comment noted, out of scope.

**Round 2, Codex** (resume): conditional approve, 2 findings. #1 case (b)'s 1,400 ms floor was itself a timing assumption: accepted (the card returns only after two counted predicate queries saw it absent). #2 the base sensitivity run needs a criterion: accepted (up to three runs; none failing is recorded as inconclusive). It confirmed the `pushState` hold and the case (c) check.

**Round 3, Codex** (resume): **approve**, high confidence; both round-2 fixes verified, no new finding.

## Seeds

`/goal` (recommended): `/goal Phase 1 of implementations-plan/terminal-card-flake-1/plan.md is ✓, backed by its gate in the transcript (lint, typecheck:all, test:all, check:plans exit 0; probe cases a, b, c on Chrome and Firefox with the base sensitivity run and the 10 + 20 certification runs; the three network specs at retry 0 on both browsers, exit 0), LESSONS_FILE=implementations-plan/terminal-card-flake-1/lessons/phase-1.md printed; /code-review not run; the Codex loop converged (a resumed pass with no new material finding, quoted); the PR exists, opened after the loop.`

`/loop` (fallback): `/loop 15m Drive implementations-plan/terminal-card-flake-1 forward; never idle. Read plan.md and lessons/. If the plan directory is gone, git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/terminal-card-flake-1/plan.md: success means merged, so run agent-worktree done terminal-card-flake-1 --merged and stop; failure means delivered, so watch the PR's checks. Otherwise run phase 1's gate, then the Post-implementation section. Never merge. The same step failing 5 times: reassess with Codex.`
