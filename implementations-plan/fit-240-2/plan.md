---
plan: fit-240-2
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at b88c20a39 (#986 merged)
trunk: dev
issues: "#1022 (Refs only: it closes when firefox-handoff-1's hand-off half also lands); #1023 the gate's scroller blind spot (open)"
post_implementation_hardening: not scheduled
---

# fit-240-2: the full backup's done state and its working card, proven at 240 px

One arc, one PR against `dev` (the orchestrator's D-orch-1: no stack). The arc adds #986's 240 px check, `expectFitsNarrow`, at six points inside three existing smoke visits: the working card, the done state after a plain file, an encrypted backup, a ready backup, the done state after an encrypted file, and that done state under a warning. A probe on #986's head found the first five already fit on Chrome and Firefox, so the arc changes tests only, no CSS. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## The claims and what did not hold

- **#1022, "the backup done state's `StatusCard`".** The done state renders no `StatusCard`. It is a `Banner variant="done"` above Close (`full.vue:293-310`, `:400`). `StatusCard` is the working card shown while the run creates or encrypts the file (`full.vue:206-220`). The lane brief names both, so the arc proves both.
- **#1022, "neither is proven at 240 px today".** Holds. On `dev` at `b88c20a39`, no `expectFitsNarrow` or `expectLaidOut` reaches Full Backup in any state (recon).
- **The lane brief, "reuse #986's mechanism".** Holds with a caveat. The gate does not see a box pushed past the view inside a page's own scroller (D4). The arc reuses the gate unchanged; the gap has its own issue.

## Outcome & Quality Bar

- **For whom**: a person with Firefox's sidebar open at 240 px who saves a full backup, and a maintainer who changes the done state later.
- **Excellent**: (1) at 240 px, on both browsers, CI fails if the working card, a done state, the encrypted or the ready state hides, cuts or splits text, or puts a box past the view. One exception stays open: a box that a page's own scroller holds (D4, #1023). (2) The suite gains no scenario and only seconds, and the PR states them.
- **Good enough**: the `encrypting` card and the contacts export card share the measured component but are not held on screen (D3). Three warnings no visit reaches, and the agreement, unlock and password-field states, stay unmeasured (D6). The success toast is not checked at 240, as #986 decided for every toast (its D20: a toast is already the view's width less 32 px).

## UI impact

None. The arc changes no file under `apps/extension/src` or `packages/`. The lane brief's no-ask record allows "no layout change beyond fitting the width"; a person-visible fit is an owner ask with pictures, and none is needed. The PR still shows the states at 240 px, light and dark, on both browsers (D5).

## Architecture & Implementation

- **Reuse**: `expectFitsNarrow` (`fixtures/type-roles.ts`) unchanged. `holdNextPasskeyRequest` (`fixtures/passkey.ts:144`) keeps the working card on screen: `runBackup` sets `progress` before `openRun` awaits the passkey ceremony (`useFullBackupExport.ts:335-337`). `type-roles.test.ts:1080-1086` holds the passkey dialog the same way, with release in `finally`.
- **Change map**, tests only, no fixture, no new test:
  - `apps/extension/tests/e2e/passkey-backup.test.ts`, test "passkey full-backup export: modal appears + status card + CTAs become available": hold, check the working card, release; check the plain done state; check the encrypted state.
  - `apps/extension/tests/e2e/security-backup.test.ts`, test "a password profile's full backup downloads only once it is encrypted": check the ready state, then the done state.
  - `apps/extension/tests/e2e/backup-imported-account.test.ts`, stage 6: check the done state under `backup-imported-unopened-banner`. The download keeps that warning (`discardRun` leaves the warning flags; `useFullBackupExport.ts:476-488`).
- **Flow (held card)**: arm the hold, arm the progress observer, press Agree; the card and the passkey dialog show; check at 240; assert both are still mounted; release in `finally`; the run continues as today. `progress` never returns once left, so presence after the check proves the check read the held state.
- **Alternative not taken**: one new spec for the six states. It registers a profile and loads the page again (about 20 s per browser) for no failure mode the existing visits miss.

## Decision ledger

- **D1, tests only.** The four probed states fit at 240 on both engines today (recon § The probe). A CSS change would change layout with nothing to fix.
- **D2, inside existing visits.** Each check runs where the spec already stands in that state, with no page loaded twice.
- **D3, `encrypting` and the contacts card are not held.** The encryption runs in the page, so a new test patch of `crypto.subtle` could hold it (Opus r1). The contacts export awaits the worker, which no fixture holds. Either hold would be a new fixture for one variant of a component already measured. The held `progress` card covers the shared component with its Creating copy, not every variant. The card sets no `white-space`, overflow or fixed width (`StatusCard.vue`), so the other copy is expected to wrap; that is inspection, not measurement. The `encrypting` bottom bar ("Encrypting…" over Download Backup) has the ready state's shape with a shorter first label, so D9's check bounds it.
- **D4, the gate's blind spot is filed, not fixed here.** Path, demonstrated by a control (recon): a page inside `CollapsingHeroLayout` gets a box wider than 240 px. `.wrapper` has `overflow: auto` and lies inside the view, so `expectInsideView` excuses the box. The text-fates check counts text that scroller can reach as painted. A page that scrolls sideways at 240 passes. This holds on any page with a vertical scroller: computed `overflow-x` cannot tell a page scroller from a deliberate sideways one, because `overflow-y: auto` makes `overflow-x` compute to `auto`. The fix needs a list of the scrollers meant to scroll sideways at 240, a gate change for every page #986 measures, and full suites on both browsers. It may also surface layout fixes that need the owner's pictures. **Codex (r1)**: reject as written; repair the gate here or depend on a repair that lands first. **Opus (r1)**: defer is right; a repair must change `expectInsideView` and the text-fates span together, for every caller. **Call**: the owner's rule decides it. A clean fix outside the lane's scope is recorded and left out, not patched over. A backup-only scroll assertion would be a second mechanism, which the lane brief forbids. Gate-wide work goes beyond the lane, and scope expansion is the owner's to approve. The six call sites gain the repaired check with no spec change when #1023 lands. The PR records, at each check on both browsers, the hero `.wrapper`'s `scrollWidth` against its `clientWidth` at 240. The final report raises this to the orchestrator.
- **D5, pictures.** The arc changes no source, so the before and after pictures would be the same. Take one set from the arc's head build: the six states at 240 px, light and dark, Chrome and Firefox. The working card shows dimmed under its dialog, and the caption says so. Commit the set under `implementations-plan/fit-240-2/screenshots/` and link it at its commit, as #986 did. The PR labels it "unchanged by this PR".
- **D6, scope stays at #1022.** Two groups have no 240 check and stay out. First, the page's agreement, unlock and password-field states, which predate #964 and were not probed. Second, the three warnings no visit reaches: keys lost, network to add, chain data omitted. No path is written, so nothing is filed; A3 asks the orchestrator.
- **D7, each check asserts its state first** (Codex r1). The existing asserts read `textContent`, which a hidden banner still has. Each check therefore waits for its banner and its CTA to be visible. A banner hidden at both widths would otherwise pass as "not shown at 360".
- **D8, a red control at every call site** (Codex r1, Opus r1). Each of the six sites gets a scratch control. The control injects `@media (width < 300px) { [data-testid="<target>"] { display: none } }`, which the check must report as fate `gone`. A `nowrap` alone proves nothing on a title that fits on one line (recon).
- **D9, the ready state is checked** (Opus r1). Its bottom bar stacks Protect with Password over Download Backup, the shape the `encrypting` bar has. The spec already stands there, and the probe found it green.

## Security & Adversarial Considerations

- **Threat model**: none new. The arc touches no trust boundary, message, storage or permission. The hold patches `navigator.credentials` in the test page only. Release restores it, and release runs in `finally`.
- **What could go wrong**: a check that never runs, or that runs on a state not shown, and so proves nothing (D7, D8). The pictures show seeded test wallets. The states shown carry no recovery phrase, password or endpoint, and the shots must stay so.
- **Supply chain, crypto, least privilege**: N/A. No dependency, workflow or key changes.

## Assumptions

- **Facts**: F1 #986 merged; `dev` at `b88c20a39` holds the gate. `git diff fc6422d53 b88c20a39` touches no file the probe used: only #1021's network specs and fixtures. F2 done-state markup at `full.vue:293-310` and `:400`; working card at `:206-220`. F3 the recon records four states and the ready state passing on both browsers at #986's head; the planner ran it, and the raw logs stayed local. F4 a cut card title turns the gate red (`cut`). F5 a 300 px done banner past the view passes; `CollapsingHeroLayout.vue:135` is the scroller that excuses it. F6 the three files carry no browser skip.
- **Inferences**: I1 a held and released passkey request leaves the happy path's later steps as they were: the probe's full test passed with it. It says nothing on cancellation or abort timing. I2 the warning visit's done state fits at 240; the probe did not cover it, and Phase 1 measures it. I3 a headless run draws no classic scrollbar; with one, `scrollbar-gutter: stable` takes about 17 px (#1023).
- **Asks**: none for the owner. To the orchestrator: A1, one set of pictures stands for before and after (D5); A2, D4's gate repair (#1023) as its own lane; A3, whether the page's agreement, unlock and password-field states need their own 240 check (D6).

## Phase 1: the six 240 px checks (arc A1, branch `worktree-fit-240-2`)

**Assumptions**: F1 to F6, I1 to I3.

1. Merge `origin/dev` if it moved since this plan's commit. Re-run the F1 diff for any newer commit.
2. In `passkey-backup.test.ts`, test 1, import `expectFitsNarrow` and `holdNextPasskeyRequest`.
3. Before `armProgressObserver(page, CREATING)`, add `const release = await holdNextPasskeyRequest(page)`. Open a `try` right after it.
4. Inside the `try`: arm the observer as today, press Agree, wait for `backup-status-card` and `passkey-ceremony-dialog` to show (5 s each), call `expectFitsNarrow(page, "the working card under the passkey dialog")`. Then assert that both are still mounted.
5. Put `await release()` in the `finally`, as `type-roles.test.ts:1080-1086` does.
6. After the plain done state's asserts, wait for `backup-done-banner` and `backup-close-btn` to show. Call `expectFitsNarrow(page, "the done state after a plain file")`.
7. After the `encrypted` wait and its observer assert, wait for `backup-done-banner` and an enabled `download-backup-btn`. Call `expectFitsNarrow(page, "an encrypted backup")`.
8. In `security-backup.test.ts`, before the ready state's `shotSend`, wait for `backup-ready-banner`, `protect-password-btn` and `download-backup-btn` to show. Call `expectFitsNarrow(page, "a ready backup")`.
9. After the "Saved to your downloads" assert, wait for `backup-done-banner` to show. Call `expectFitsNarrow(page, "the done state")`.
10. In `backup-imported-account.test.ts`, stage 6, after the download, wait for `backup-imported-unopened-banner`, `backup-done-banner` and `backup-close-btn` to show. Call `expectFitsNarrow(page, "the done state under a warning")`.
11. Write at most one comment, at the hold: what keeps the card on screen.
12. Run D8's control at each of the six sites, one at a time, scratch only. Confirm fate `gone` each time. Also plant `nowrap`, `overflow: hidden` and an ellipsis on the card's title, and confirm fate `cut`. Log all seven in `lessons/phase-1.md`.
13. Take D5's pictures with a scratch `atWidth(page, NARROW_WIDTH, () => shotSend(...))` and `NULO_E2E_SHOT_DIR`, on both browsers. At each check, read the hero `.wrapper`'s `scrollWidth` and `clientWidth` at 240 for the PR (D4).

**Validation gate** (retry 0; one rerun for a known flake, a fix for real breakage):

- `bun run lint`, `bun run typecheck:all`, `bun run test`: exit 0.
- Armed build per `tests/e2e/global-setup-smoke.ts:20` for each browser. Then, in `apps/extension`, run `NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/passkey-backup.test.ts tests/e2e/security-backup.test.ts tests/e2e/backup-imported-account.test.ts --retry=0`, and again with `NULO_E2E_BROWSER=firefox`. Pass: every test green on each browser.
- Step 12's seven controls: each red with the named fate, logged.
- Each file's time per browser, at the base (before step 2) and after, from full-file runs: logged for the PR.
- **Layers**: lint, typecheck, unit, smoke e2e on both browsers. No network suite: the page makes no node call the change depends on.

## Post-implementation

[README § Post-implementation standard](../README.md#post-implementation-standard) at `b88c20a39` binds; plan-specific parts: single arc, so the review loop runs once over the diff from `origin/dev` after Phase 1 is green. Consult: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; hard stop at three rounds. Log each round in `lessons/phase-1.md` and under § Audit verdicts. Teardown after the merge: `agent-worktree done fit-240-2 --merged`, trunk `dev`.

## Delivery

- One PR, `worktree-fit-240-2` → `dev`, opened after the loop converges, without labels. Title: `test(e2e): the full backup's done state and working card are checked at 240 px` (78 characters).
- Body: what and why; the six states; `Refs #1022` and that #1022 closes when firefox-handoff-1's hand-off half lands; D4's limit and #1023; the pictures (D5); validation with outcomes; the three files' time per browser before and after; the CI smoke shard times before and after.
- If `extension-smoke-e2e` skips on the path filter, add the label `e2e:extension-smoke` after opening.
- Close-out as the PR's final commits, per the README standard: Outcome, `Known limits:` none, `Open items:` #1023, `STATUS.md` deleted, `git mv` into `archive/` with the index line moved.

## Audit verdicts

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| r1 | Codex, gpt-6.1-sol, high | request changes | F1 stale (#986 merged, base moved); visible-state waits (D7); release in `finally`; a control per call site that must fail (D8); the warning visit; D3, D6 and I1 wording | repairing the shared gate here or waiting on it (D4: out of scope, owner's rule; filed as #1023 and raised to the orchestrator) |
| r1 | Opus 5.5, Plan | conditional approve | presence asserts around the held check and `finally` release; a control for each done-state check (D8); F1 and I1 for #986's merge; D3's reason rewritten; D6 raised as A3; the ready-state check (D9); the dialog named in the held check's label; the scrollbar gutter in #1023 | D4, the toast and the gutter as `known-limit` issues: D4 is an open defect in the gate with a supported path, so it stays open (#1023); the toast is #986's settled D20; the gutter is part of #1023 |

## Seeds

`/goal Phase 1 of implementations-plan/fit-240-2/plan.md green with its gate in the transcript; the Codex loop converged (gpt-6.1-sol, high, at most three rounds); the PR against dev open with Refs #1022, the pictures and the timings; not merged.`

`/loop Continue implementations-plan/fit-240-2/plan.md from STATUS.md: run the next unchecked step, its gate at retry 0, and log it; stop at the PR or a red gate after three tries.`
