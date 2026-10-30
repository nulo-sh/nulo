---
plan: wrap-2
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex audit (gpt-6.1-sol, high) and its resumes; one Opus Plan leg
base: origin/dev at 9ce6bb0bd
trunk: dev
issues: "#1365, #1375 (arc 1 closes both)"
post_implementation_hardening: not scheduled
status: approved; arc 1 in progress
---

# wrap-2: a long network name stays inside the capabilities window's chain banner

One arc, one PR against `dev` (§ Delivery). Recon and measurements: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## The issues, checked

**#1365, capabilities window: demonstrated** (recon § Measured, Chrome and Firefox).
- **Initial conditions:** a person names a network with one word the field accepts, up to 25 characters. A dApp then asks for capabilities on another chain than the wallet's, so the chain banner shows.
- **Events:** the title and the action ("Switch wallet to …") name the dApp's chain; the description names the wallet's. After the switch, the title and the description name the dApp's chain. The names sit in `@nulo/design`'s `Banner`. Its column is a flex item, so the longest word sets its minimum width.
- **Invariant broken:** a text stays inside its box.
- **Consequence:** `cap-scroll-area` clips the name's end and the action's. With 25 `W`s the banner runs 39 px past at 360 px and 159 px past at 240 px. A plausible name (`AztecSequencerTestnetEU01`) runs 39 px past at 240 px, the action worst. At the window's opening width (400 px) both fit.

**#1365, full backup's added-networks banner: does not hold.** Its sentence is built from two counts (`full.vue:70-75`; `useFullBackupExport.ts:34`), so no name reaches it. It stays as it is, and the PR body and a comment on #1365 record why.

**#1375: holds** (recon § #1375). The comment above the account-file page's network watcher names a cross-window network switch, which never reaches the page's store (known limit #1374). What fires the watcher is this window's own bootstrap re-resolving the network, after a profile change made in any window or a reopened session.

## Outcome & Quality Bar

- **For whom:** a person who named a network with one long word and approves a dApp's request in a narrow window.
- **Excellent:** every character of the name is inside the banner, in both states, at 400, 360 and 240 px, in Chrome and Firefox. The action's own words ("Switch wallet to") stay whole, and only the name breaks. A banner with seed names renders as today, with the same lines and heights.
- **Good enough:** the name breaks at the box's edge, not at a pretty place. No wording changes.

## Assumptions

**Facts** (verified at `9ce6bb0bd`; citations in recon)
1. The banner is `index.vue:386-405`. It is `direction="vertical"` and `wide`, and its action is a `button` inside the same column as the two texts (`packages/design/src/ui/Banner.vue:41-67`).
2. Measured: a rule on the two texts only (t1) leaves the banner overflowing, because the action repeats the name as one word. The rule on the banner's root (t2) brings every part to `≤0` at all three widths for both long names, and leaves seed layouts unchanged to the pixel.
3. Under t2 the action breaks only inside the name. `anywhere` lowers each item's min-content width, which is why wrap-1 kept it off its banner's buttons (its I1): there two actions share a nested row (`RestoreOutcomeBanner.vue:95-101`), where one can shrink below its words. Here the one action sits alone on its line, in a column whose width comes from above. Its words are shorter than that column, and `anywhere` breaks a word only when it cannot fit on a line (CSS Text 3 § overflow-wrap). The measurements, not the reasoning alone, are the evidence.
4. A name in the banner is a person's (a row name, at most 25 characters through the field) or the built-in label for a chain with no row (`Testnet`, `Alpha`, `Sandbox`, else `Aztec:<u32>`, at most 16). A dApp cannot choose a longer one: it picks only a chain id, and a connection on a chain with no row is refused (`connect-unserved-chain.test.ts`); a session whose row was deleted later uses the same built-in-or-`Aztec:<u32>` fallback (`chain-switch.test.ts:218-223`).
5. `Banner` passes a `class` to its root element, as it does the `data-testid` that `cap-chain-mismatch.test.ts` reads. `source-scan.ts` reads the class an element binds and the declarations of a module rule; jsdom applies no module CSS.
6. P89-01 = A (decision page 89, signed 2026-10-28): a long name wraps inside its box and is not shortened.

**Inferences:** I1. In this banner, `anywhere` changes only lines that overflow today; the seed control is the evidence. I2. Firefox contains the names under t2 as Chrome does. Its base overflows match Chrome's within 0.1 px, but one action breaks differently (recon § Measured), so the after capture checks Firefox on its own.

**Asks:** the owner signs the before/after pairs at merge ([OWNER-ASKS.md](OWNER-ASKS.md)). The ask blocks the merge, not the arc.

## Decisions

- **D1. `overflow-wrap: anywhere` on the whole banner** (`:class="$style.chain_banner"` on the `Banner`), with a one-line why that names the action's own line it relies on. This departs from the lane brief's "on the banner's own text, so the action keeps its words whole": the action carries the name, so a rule on the texts alone fails (Fact 2). The action's own words stay whole (Fact 3). Rejected:
  - spans inside the two slots plus a `button` rule, which reaches into `@nulo/design`'s DOM with two rules for one inherited property;
  - a rule in `@nulo/design`'s `Banner`, which would change every banner (lane brief; wrap-1 D5);
  - a rule on an ancestor such as `.sections`, which reaches past the banner.
- **D2. The added-networks banner stays as it is** (claim did not hold).
- **D3. #1375:** the comment's first sentence states what fires the watcher; "A made file is kept." and the code stay. Target text:
  `// A passkey profile's file not made yet ends when this window's chain id changes or clears (its own`
  `// bootstrap clears it; another window's network switch never reaches it): its approval and any`
  `// pending export belong to the session or network before. A made file is kept.`
  (Revised in the arc 1 review: a reset completed in another window can also write this store, and an in-place reopen keeps the network.)
  A switch in this window cannot fire it: the page hides the header (`account.vue:5`; `Header.vue:172`), and the takeover and the arrival replace the router view (`app.vue:659-680`).
- **D4. Tests:**
  - One scan case in `chain-switch.test.ts`: the element under `cap-chain-banner` binds `$style.chain_banner`, and `.chain_banner` declares `overflow-wrap: anywhere`. It is red on the base copy.
  - No mount control: the existing cases read the name in the title and the action (`chain-switch.test.ts:167-190`, seed names). A long name changes nothing a stubbed `Banner` can show, and no code shortens it.
  - What the scan cannot see: a later `Banner` change that stops the class or the inheritance (`inheritAttrs: false`, an `overflow-wrap` on `.action_btn`, the horizontal direction). That needs a future change; the captures are this PR's layout evidence.
  - No e2e change, a chosen coverage boundary: no existing e2e reaches the window with a long name (recon § Reuse map), and the lane brief asks for a check only where one does. A banner-scoped check is possible (`atWidth`, `readPageTypography`), but a full `expectFitsNarrow` would go red on the identity line (D5). The D5 issue carries the whole-window guard. So no automated check guards the long-name layout; the captures in the PR are its evidence.
- **D5. Out of scope, filed at close-out as one `ux` issue after deduping** (the lane brief says to name them on #1365, but #1365 closes with this PR, so the #1365 comment links the new issue): the identity line "wants to connect on <name>" (measured: 26.6 px past at 360 px with `w25`, 8.2 px past at 240 px with `real25`); the execute window's scope banner; the full backup page's reset notice; the stale-network takeover's body and notice; the network arrival. Lane brief: no name cap, no wording change, no design-package change.

## Architecture & Implementation

| File | Change |
|---|---|
| `apps/extension/src/popup/windows/capabilities/index.vue` | the `Banner` gains `:class="$style.chain_banner"`; a `.chain_banner` rule with the declaration and a one-line why |
| `apps/extension/src/popup/windows/capabilities/chain-switch.test.ts` | D4's scan case |
| `apps/extension/src/popup/pages/settings/security/export/account.vue` | D3's comment, nothing else |
| `apps/extension/tests/e2e/helpers/profile-chaos/model.ts` | four citations of `account.vue` lines shift by one (found by `test:all`; the plan's map had missed them) |
| `implementations-plan/wrap-2/screenshots/` | before/after, Chrome: mismatch `real25` at 240, mismatch `w25` at 360 and 240, switched `w25` at 240 (8 PNG) |

Simpler alternative: no change. Rejected, because the action and the name are clipped at 360 px with a name the field accepts.

## Security & Adversarial Considerations

- **Trust boundary:** a dApp chooses the session's chain, but not the name the banner shows. The name is a row a person named, or `Aztec:<u32>` (Fact 4). Vue interpolates it as text (no `v-html`).
- **What the fix closes:** today a long name pushes the end of "Switch wallet to …" past the window's edge, so a person can act on a label they cannot read in full. After D1 the whole label is visible. Exploitability needs the person's own long name; no attacker capability is involved.
- Nothing changes a permission, a log line, storage, a message, a dependency or the CSP. Known limits: none.

## Phase 1: the rule, its test, the comment ✓

Assumptions: Facts 1-6. Take the red from the base copy (`git show 9ce6bb0bd:<path>`), never `HEAD`.
1. Check that `git status` lists no untracked spec under `apps/extension/tests/`.
2. Add D4's scan case. Run it while `index.vue` is still the base copy, and require red. Commit.
3. Make D1's change. Run the case and require green. Commit.
4. Make D3's change (the target text). Commit.
5. Run gates 1 and 2.
6. Copy `~/.cache/nulo-backlog/wrap-2/capture/zz-wrap2-cap.test.ts` into `apps/extension/tests/e2e/network/`. Run gate 3. Delete the copy.
7. Copy eight pictures into `screenshots/`: `base-chrome-<key>.png` becomes `1365-before-<key>.png`, and `after-chrome-<key>.png` becomes `1365-after-<key>.png`. The keys are `mismatch-real25-240`, `mismatch-w25-360`, `mismatch-w25-240` and `switched-w25-240`.

**Gate**, from the repository root, each command in its own subshell:
1. `(cd apps/extension && bun --bun vitest run src/popup/windows/capabilities)`; `bun run audit:vue`; `bun run test:all`.
2. `NULO_E2E_PROVERLESS=1 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/cap-chain-mismatch.test.ts --retry=0`, then the same with `NULO_E2E_BROWSER=firefox`.
3. `SHOTS_OUT=~/.cache/nulo-backlog/wrap-2/shots SHOTS_TAG=after-chrome NULO_E2E_PROVERLESS=1 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/zz-wrap2-cap.test.ts`, then the same with `NULO_E2E_BROWSER=firefox` and `SHOTS_TAG=after-firefox`.

Pass criteria:
- Every command exits 0.
- D4's case is red on the base copy and green after.
- In the capture, no banner part ends more than 1 px past the banner's content edge (the bound `overflowingText` uses). This holds at 400, 360 and 240 px, for `w25` and `real25`, in both states and both browsers.
- Each browser's `seed` rows keep the heights and line counts of its own base run.

Departures from the lane brief's gate and capture: no smoke file reaches the changed banner, `full.vue` does not change and `account.vue` changes a comment only, so gate 2 replaces the smoke step. The added-networks banner gets a code trace, not a capture pair, since no name reaches it. No e2e scenario is added or changed, so no wall-clock is reported.

## UI impact

- **The capabilities window's chain banner, both states:** a name wider than the box breaks at the box's edge in the title, the description and the action, and stays readable. Seed names render as today. Pictures: `screenshots/1365-before-*` → `1365-after-*`.
- **Sign-off:** P89-01 = A covers how the name reads; the owner signs the pairs at merge (OWNER-ASKS.md). No copy, row or control changes.

## Delivery

- Single arc. Branch `wrap-2-a1` off this plan's commit on `worktree-wrap-2`. The close-out commits come after the Codex loop, then one ready PR, base `dev`: `gh pr create --base dev --title "fix(capabilities): a long network name wraps inside the chain banner"` (68 characters). No label at creation; the path filter trips the network lanes.
- Body: what changed and why; the claims that did not hold; D1's departure from the lane brief and its measurement; the sign-off basis and the pictures (`?raw=true` links to `implementations-plan/archive/wrap-2/screenshots/` at the head SHA); the runs and their outcomes; `Closes #1365`, `Closes #1375`; ending `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Commits: conventional, lower case, signed, ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `9ce6bb0bd`. Specific here:
- Step 1 is absent (`code_review: off`).
- Step 2 runs once over `git diff origin/dev...HEAD` after Phase 1: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`. One Opus 5.5 diff review (`general-purpose`) runs beside round 1. Prompts go under `~/.cache/nulo-backlog/wrap-2/`. Hard stop at three rounds; each round goes in `lessons/phase-1.md` and the table below.
- Approval boundary (a plan change; stop): a copy change, a shortened name, the rule on any element but the chain banner, a rule in `@nulo/design`, any D5 place, a new e2e scenario.
- Close-out, before the PR opens: the Outcome; the D5 issue, filed after deduping; one comment on #1365 that records the added-networks trace and links the D5 issue; a comment on #1375 with the watcher's real triggers; lessons promoted within the 8 KiB budget; `STATUS.md` deleted; `git mv` into `archive/`, with the index line moved. Teardown after the merge: `agent-worktree done wrap-2 --merged`, trunk `dev`; the archived plan is `implementations-plan/archive/wrap-2/plan.md`.

## Audit verdicts

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| plan 1 | Codex, gpt-6.1-sol (session 01a18e50) | conditional approve | Firefox's base differs from Chrome's on one action (recon, I2); Fact 4 names the built-in labels; the coverage boundary is a choice, not an impossibility (D4); plain-language fixes in Phase 1 | none |
| plan 1 | Opus 5.5 (Plan) | conditional approve | D3's target text (a profile change from another window does fire the watcher; a switch in this window cannot); Fact 3 names why wrap-1's I1 does not apply; the scratch spec removed from the worktree and a check for it; the 1 px pass bound; D4's reasons and the scan's blind spots; the departures named (no capture pair for the added-networks banner, D5 as a new issue); the picture mapping, the gate 3 command, the approval boundary and the close-out comments made exact; title length | an optional 25-`W` mount pin: no code shortens the name, and a stub has no layout |
| plan 2 | Codex, resumed | conditional approve | Fact 3 names the nested action row of wrap-1's banner, not a direction; Fact 4's fallback for a deleted row; recon's Firefox direction reversed (its labels end further right) | none |
| plan 3 | Codex, resumed | **approve**: the plan is approved | all corrections verified; no remaining finding | none |
| arc 1 r1 | Codex, gpt-6.1-sol (session 01a18e78) | findings | the account.vue comment names a chain id that changes or clears, with the bootstrap as one writer: a reset completed in another window can reach the mounted page first (reproduced in memory) | none |
| arc 1 r1 | Opus 5.5 (general-purpose) | findings | `.chain_banner`'s comment says "wider than the banner", not the window; the account.vue reason fits an in-place reopen ("the session or network before") | none |

## Seeds

```
/goal Phase 1 of implementations-plan/wrap-2/plan.md marked ✓ with its gate passing in the transcript; the Codex loop (gpt-6.1-sol, high) converged; one ready PR against dev closing #1365 and #1375 with its before/after pictures; bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/wrap-2 per its plan.md and the README § Post-implementation standard at 9ce6bb0bd: run the gate, decide open questions with Codex (gpt-6.1-sol, high), open the PR, never merge, never change copy; stop once its checks are green and report.
```
