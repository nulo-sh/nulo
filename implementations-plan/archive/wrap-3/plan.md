---
plan: wrap-3
tier: light
status: delivered (arc 1 merged as #1498; arc 2 and this close-out in one PR, merge pending)
issues: "#1397 (arc 1 part of it, arc 2 closes it)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high audit round trip + Opus Plan leg; final fresh Codex pass
base: origin/dev at f738cba62
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-11-02.
- **Status:** delivered. Arc 1 merged as #1498; arc 2 and this close-out are the final commits of one PR against `dev`, which merges on the orchestrator's word.
- **Owner sign-off:** P94-14 = A (2026-11-01) for the wrapping rule (Fact 1); P95-04, P95-05 and P95-06 = A (2026-11-02) for the buttons, the chip and the reset confirm (Fact 7).
- **Shipped:** `overflow-wrap: anywhere` on the dApp windows' identity line, the execute scope banner and Full Backup's reset notice (arc 1), and on the takeover's content column, its loading and progress screens and the reset confirm's name and sentence (arc 2); the takeover's and the arrival's full-width buttons grow to a wrapped name (`min-height: 48px`, `padding-block: 5px`); their chip ends a long name in an ellipsis; six source-scan cases; 240 px guards in `cap-chain-mismatch.test.ts` and `stale-network.test.ts` S1d; one shared `LONG_NETWORK_NAME`. Closes #1397.
- **Dispositions:** the button padding follows the signed sentence over the decision frame (D7). `NARROW_ACCEPTED` takes no chip entry, since it would exempt the chip from S1d's check. The chain banner (#1365) and the name field's cap stay out of scope.
- **Known limits:** none.
- **Open items:** none.
- **Lessons:** none promoted. `lessons.md` is at its 8 KiB budget; the decision frame's padding finding is in [lessons/phase-3.md](lessons/phase-3.md).
- **Seeds retired:** the `/goal` and `/loop` seeds below; never run them.

# wrap-3: a long network name wraps in the five places it can overflow

Two arcs. Arc 1 (#1498) wraps the dApp windows' identity line, the execute window's scope banner and Full Backup's reset notice, and guards the capabilities window in a real layout. Arc 2 wraps the takeover's and the arrival's text, grows their full-width buttons, ends their chip in an ellipsis and wraps the reset confirm's two texts, on the owner's answers to OA-1 to OA-3, and guards the takeover in a real layout. Recon and measurements: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are under `apps/extension/` unless they name a package. At 170 lines this plan runs over the light target: the Outcome and arc 2's answered asks were added to a plan written at it.

## The issue, checked (#1397)

**Demonstrated for all five places** (recon § Measured, Chrome and Firefox).
- **Initial conditions:** a person names a network with one word the field accepts, up to 25 characters (`EditNetworkPopup.vue:116-123`).
- **Events:** a window or screen interpolates the row's name into a box with no wrapping rule. The longest word sets the box's minimum width, so the word runs past the box.
- **Invariant broken:** a text stays inside its box. **Consequence:** the window's edge or the scroll area cuts the name and the words after it.

Claims checked:
1. **The identity line** holds exactly as measured in the issue (26.6 px at 360, 146.6 at 240 with 25 `W`s; 8.2 at 240 with `AztecSequencerTestnetEU01`). Of the six windows that render `DappIdentityBlock`, two put a name on the line: capabilities and discover.
2. **The scope banner, the reset notice, the takeover's body and notice, and the arrival** overflow too (were unmeasured). The issue named the takeover's body and notice; its box label, box lines, progress pre-title and reset confirm overflow as well, and so do the chip and the full-width buttons of the takeover and the arrival (OA-1, OA-2).

## Outcome & Quality Bar

- **For whom:** a person who named a network with one long word, in a dApp window or the popup, at 360 px or in Firefox's 240 px sidebar.
- **Excellent:** every character of the name is inside its box at 360 and 240 px in Chrome and Firefox, and the words around it stay whole. Seed names render as today, with the same lines and heights.
- **Good enough:** the name breaks at the box's edge, not at a pretty place. No word, order or layout changes.

## Assumptions

**Facts** (verified at `f738cba62`; citations in recon)
1. P94-14 = A (decision page 94, signed 2026-11-01): "Measure each place with a 25-character one-word name at 360 and 240 px in Chrome and Firefox, and wrap where it overflows, as #1232 decided; the cap-chain-mismatch e2e then guards the window." #1232's pick is wrap, never shorten; #1276 and #1365 applied it.
2. Measured: `overflow-wrap: anywhere` on each box below contains every name at both widths in both browsers, and changes no seed layout (recon § Measured).
3. `.dapp_action`, `.reset_notice`, `TakeoverLayout`'s `.content` and `StaleNetworkTakeover`'s `.progress` hold no button. The scope banner's one action sits on its own line (vertical `Banner`), as the chain banner's does (#1365).
4. A name in these places is a person's row name or a built-in label (at most 16 characters); a dApp picks only a chain id (wrap-2 Fact 4, unchanged at the base).
5. jsdom applies no module CSS; `source-scan.ts` reads an SFC's bindings and rules (`chain-switch.test.ts:181-186`). `expectFitsNarrow` fails on text more than 1 px past its box (`fixtures/type-roles.ts:520-533`).
6. The fields cap a name at 25; `renameNetwork` takes any non-empty string (`wallet/services/network/spec.ts:216-219`).
7. Decision page 95, signed 2026-11-02 at 17:02 UTC, option A on all three asks, no notes. P95-04 (OA-1) = A: "The name wraps and the button grows to fit it. Every button with a seed name stays 48 px; with a 25-character name at 240 px a button is three or four lines tall." P95-05 (OA-2) = A: "The chip's text ends in an ellipsis inside the chip, as Home's network chip does; the title below names the network in full and the bar stays one line. This shortens the name in the chip only." P95-06 (OA-3) = A: "The two texts wrap at their box's edge, as P94-14 does for the five places. The Cancel and Reset row stays as it is."
8. The house reset gives these buttons no padding. A two-line seed label already exists at 240 px (`STAY ON LOCAL NETWORK`, `GO TO LOCAL NETWORK`, `EXPORT A FULL BACKUP`): 36 px of text in the 48 px button (scratch probe, Chrome and Firefox alike).

**Inferences:** I1. `anywhere` changes only lines that overflow today; the seed rows of every trial are the evidence. I2. The full-width buttons need a height change to hold a wrapped name (measured spill 6-25 px), so they are an owner ask, not a wrapping rule.

**Asks:** OA-1 (buttons), OA-2 (chip) and OA-3 (the reset confirm), on arc 2's surfaces only: answered A (Fact 7).

## Decisions

- **D1.** `.dapp_action` gains `overflow-wrap: anywhere`. One rule covers capabilities and discover.
- **D2.** The execute scope banner gets `:class="$style.scope_banner"` and a `.scope_banner` rule, as #1365's `.chain_banner`: the action repeats a name, so a rule on the texts alone would leave it out. The rule also wraps account names in the account states.
- **D3.** `.reset_notice` gains the rule: it holds the label and the text, nothing else.
- **D4 (arc 2).** `TakeoverLayout`'s `.content` gains the rule, with a comment that the column holds no button (a button added there would inherit mid-word breaks); `.title`'s own copy goes, since it inherits. One rule covers every takeover screen and the arrival.
- **D5 (arc 2).** `StaleNetworkTakeover`'s `.progress` gains the rule, with the same comment; `.title_progress`'s own copy goes.
- **D6 (arc 2, OA-3 = A).** The confirm's `.pre_title` and `.body` gain the rule; its card holds the Cancel and Reset row, so the rule stays off the card and the row.
- **D7 (arc 2, OA-1 = A).** `.primary, .secondary`: `min-height: 48px`, `padding-block: 5px`, `overflow-wrap: anywhere`, in place of `height: 48px`. **Deviation from the decision frame**, which used `padding: 12px 16px`: measured, that grows every two-line seed label at 240 px from 48 to 62 px and wraps `SWITCH TO MAINNET` onto two lines, against the signed "Every button with a seed name stays 48 px". With 5 px and no inline padding, every probed seed label keeps its height and lines at 360 and 240 px in both browsers (Fact 8), and a 25-character name takes three lines at 360 px and three or four at 240 px, 6 px from the button's edges, as a two-line label sits today.
- **D7b (arc 2, OA-2 = A).** The chip's text moves into a `.chip_label` span with Home's `.network_label` rule (`overflow: hidden`, `text-overflow: ellipsis`, `white-space: nowrap`), and the chip takes `min-width: 0`, as the decision frame did.
- **D8.** No rule in `@nulo/design`'s `Banner` (it would change every banner) and no global rule (wrap-1 D5).
- **D9. Tests.** Arc 1: one scan case per rule, each red on the base copy. T1 in `DappIdentityBlock.test.ts` finds the span by its bound `actionTestId` (`walkElements`, `boundAttr`; it imports only `parseSource`, `walkElements` and `boundAttr`, beside its own `declarationsOf`). T2 (`execute/scope-follow.test.ts`) and T3 (`export/full.test.ts`) use `elementByTestid`. E2E: `cap-chain-mismatch.test.ts`'s first test finds Local Network by chain id with `readNetworkRows`, renames it to `"W".repeat(25)` through the network service from an extension page it then closes, connects, reads the banner with that name, and runs `expectFitsNarrow` in the mismatch state. The second test stays the seed-name control. If the check fails on anything but the identity line, stop: no `NARROW_ACCEPTED` entry. Arc 2: scan cases T4 (`TakeoverLayout.test.ts`: the content rule and no button inside the column, the buttons' rule and no `height`, the chip's label and its ellipsis), T5 (`StaleNetworkTakeover.test.ts`: the loading and progress screens' rule, no button inside) and T6 (`StaleNetworkConfirm.test.ts`: the two texts' rule, none on the card or the button row), each red on the base copy. OA-1 and OA-2 let the whole takeover fit, so `stale-network.test.ts` S1d, which already ends on A1, renames Testnet to 25 `W`s first and runs `expectFitsNarrow` there: red on the base CSS (chip 161.5 px, body 105, box 159, RESET 184.3 past their boxes). The arrival renders the same layout, so one guard covers both.

## Architecture & Implementation

| Arc | File | Change |
|---|---|---|
| 1 | `src/components/composite/DappIdentityBlock.vue` (+ test) | D1, T1 |
| 1 | `src/popup/windows/execute/index.vue`, `scope-follow.test.ts` | D2 (class and rule, a one-line why), T2 |
| 1 | `src/popup/pages/settings/security/export/full.vue`, `full.test.ts` | D3, T3 |
| 1 | `tests/e2e/network/cap-chain-mismatch.test.ts` | D9's rename and `expectFitsNarrow`; `requestAccountsCapability` takes the dApp chain's name |
| 2 | `src/components/composite/TakeoverLayout.vue`, `src/components/stale-network/{StaleNetworkTakeover,StaleNetworkConfirm}.vue` (+ tests) | D4-D7b, T4-T6 |
| 2 | `tests/e2e/stale-network.test.ts` | S1d's rename and `expectFitsNarrow` (D9) |

Simpler alternative: rules on each text instead of a box (rejected: the scope banner's action and the takeover's lines would need one rule each).

## UI impact

- **Arc 1:** the capabilities and discover windows' identity line, the execute window's scope banner (every state; account names wrap too) and Full Backup's reset notice. A name wider than its box breaks at the box's edge; seed names render as today.
- **Arc 2:** the takeover (every screen, its loading and progress screens) and the arrival, same change; their full-width buttons wrap a long name and grow (P95-04 A), their chip ends it in an ellipsis (P95-05 A), and the reset confirm's name and sentence wrap (P95-06 A), each quoted in Fact 7. Seed names render as today, with the same lines and heights.
- **Sign-off:** P94-14 = A, quoted in Fact 1, under #1232's pick (wrap, never shorten), the precedent of #1276 and #1365: a wrapping rule only. P95-04, P95-05 and P95-06 = A (Fact 7) sign the buttons' growth, the chip's ellipsis (which overrides "never shorten" for that chip only) and the confirm's wrap.

## Security & Adversarial Considerations

- **Trust boundary:** a dApp chooses which chain and request reach an approval window, not the name shown (Fact 4); Vue interpolates names as text. A long name today hides the end of `Stay on <name>`, so a person can act on a label they cannot read in full; after D2 they read all of it. In arc 2 a person reads the whole name on the button that resets or switches; only the chip, which opens Networks and decides nothing, shortens it. The declarations add no injection or authorization path.
- What we trust: the before numbers come from scratch specs outside the repository, so the PR carries the table and the pictures. T2 cannot see a later `Banner` change that stops passing the class to its root, and no e2e opens the scope banner with a long name; the captures are its layout evidence (wrap-2 D4 named the same blind spot).
- Nothing changes a permission, a log line, storage, a message, a dependency or the CSP. Known limits: none.

## Phase 1 (arc 1): the rules and their scan cases ✓

1. Run `git status` and require no untracked file under `apps/extension/tests/`.
2. Add T1-T3 and run them while the `.vue` files are still the base's; require each red. Commit.
3. Make D1-D3. Require T1-T3 green. Commit.

**Gate**, from the root: `bun run lint`; `bun run typecheck:all`; `(cd apps/extension && bun --bun vitest run src/components/composite/DappIdentityBlock.test.ts src/popup/windows/execute src/popup/windows/capabilities src/popup/windows/discover src/popup/pages/settings/security/export src/utils/type-role-ban.test.ts scripts/type-roles --retry=0)`; `bun run test:all`. Pass: every command exits 0; T1-T3 red before, green after.

## Phase 2 (arc 1): the window guard and the evidence ✓

1. Time the unchanged `cap-chain-mismatch.test.ts` once per browser: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/cap-chain-mismatch.test.ts --retry=0`, then with `NULO_E2E_BROWSER=firefox`. Record each file's wall-clock.
2. Make D9's e2e change. Revert D1 in the tree only, run the file on Chrome, and require `expectFitsNarrow` red on the identity line. Restore D1 with `git checkout`.
3. Run gate 1. Estimated cost: about 4 s per browser (one rename, one 240 px check).
4. Copy the two capture specs from `~/.cache/nulo-backlog/wrap-3/capture/` into `tests/e2e/network/` and `tests/e2e/`. Run the network one beside gate step 1: `SHOTS_OUT=~/.cache/nulo-backlog/wrap-3/shots-a1 SHOTS_TAG=after-chrome NULO_E2E_PROVERLESS=1 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/zz-wrap3-net.test.ts`, then `NULO_E2E_BROWSER=firefox` with `SHOTS_TAG=after-firefox`. Run the smoke one after gate step 2's armed build, the same way through `bun run test:e2e -- tests/e2e/zz-wrap3-smoke.test.ts --retry=0` with gate step 3's variables. Delete both and require `git status` to list nothing untracked under `apps/extension/tests/`.
5. Take the after evidence only from the records the capture did not alter: the network keys without `-fix`, the smoke keys marked `base`. The trial records set the rule themselves and prove nothing about the shipped CSS. Copy the 240 px light Chrome pictures of the three places to `implementations-plan/wrap-3/screenshots/` as `<place>-before-w25.png` (recon's base run, `~/.cache/nulo-backlog/wrap-3/shots/`) and `<place>-after-w25.png`.

**Gate** (warning: `e2e:agent` writes its network build into `dist/<browser>`, so run every network step before the armed smoke build):
1. `bun run lint`; `bun run typecheck:all` (both read `tests/e2e`). The edited file with the step 1 command on both browsers.
2. Build armed: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`, then `build:firefox` the same way.
3. `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/security-backup.test.ts tests/e2e/stale-network.test.ts --retry=0`, then with `NULO_E2E_BROWSER=firefox`.
4. `bun run check:plans` after staging.

Pass: every run green at retry 0; step 2's run with D1 reverted red; the captures show each arc 1 place at `≤ 0` px for both names at 360 and 240 px in both browsers, and seed rows unchanged.

## Phase 3 (arc 2) ✓

Make D4-D7b with T4-T6 (red on the base copies) and D9's guard (red on the base CSS). Done: every gate green at retry 0 (lessons/phase-3.md). **Gate:** Phase 1's commands with `src/components/composite/TakeoverLayout.test.ts src/components/stale-network src/components/network-arrival` in the vitest list; Phase 2's gate steps 2-3 with `tests/e2e/stale-network.test.ts tests/e2e/network-arrival.test.ts tests/e2e/type-roles.test.ts`; the smoke capture after; `bun run check:plans`. Pass as Phase 2, for arc 2's places.

## Delivery

- Arc 1: branch `wrap-3-a1` off this plan's commit; PR `fix(ui): a long network name wraps in the dapp windows and the backup reset notice` (82 characters), body "Part of #1397"; squash-merged as #1498. Arc 2: `wrap-3-a2` off `dev`, `fix(ui): a long network name wraps inside the takeover and the network arrival` (78), `Closes #1397`. **Deviation:** the close-out goes as arc 2's final commits, not a top layer, so one PR lands (the orchestrator's brief). PR ready, no label at creation, base `dev`.
- Body: what changed and why; the claims that did not hold; the measurement table (place, width, browser, px before, after); the e2e failure mode (the identity line and the banner in real CSS, which jsdom cannot lay out), its estimate and each browser's file wall-clock before and after; the sign-off quote; the pictures (`?raw=true` at the head SHA); runs and outcomes; ending `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Commits: conventional, lower case, signed, ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Parallelism: the arcs touch disjoint files, but arc 2 waits on the asks, so no lanes.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../../README.md#post-implementation-standard) at `f738cba62`. Specific here:
- Step 1 is absent (`code_review: off`). Step 2 runs per arc at its boundary over `git diff <arc base>...HEAD`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; one Opus 5.5 diff review (`general-purpose`) beside round 1. After arc 2, one fresh Codex session over the net diff for cross-arc issues. Prompts go under `~/.cache/nulo-backlog/wrap-3/`. Hard stop at three rounds; each round goes in `lessons/phase-N.md` and the table below.
- Approval boundary (a plan change; stop): a copy change, a shortened name, a height or layout change outside OA-1's answer, a rule on a row whose buttons share a line, a rule in `@nulo/design`, a new e2e scenario beyond D9.
- Close-out: the Outcome; OA-1 to OA-3, if still open, filed as one `owner-decision` issue; lessons promoted within the 8 KiB budget; `STATUS.md` deleted; `git mv` into `archive/`, index line moved. Teardown after the merge: `agent-worktree done wrap-3 --merged`, trunk `dev`; the archived plan is `implementations-plan/archive/wrap-3/plan.md`.

## Audit verdicts

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| plan 1 | Codex, gpt-6.1-sol (session 01a19905) | conditional approve | arc 1's smoke gate runs the takeover file too, with the armed build commands; D6 becomes OA-3; arc 2's boundary: an unanswered ask stays pending, and OA-2 A overrides #1232 | none |
| plan 1 | Opus 5.5 (Plan) | conditional approve | D6 and OA-2 as Codex; lint and typecheck after the e2e edit; the armed rebuild after `e2e:agent`; `readNetworkRows`; stop on any other 240 px failure; arc 2 off `dev` if arc 1 merged; the untracked-spec check; T1's imports; the no-button comments; the two trust points and the banner's five states; recon's line cite | `NULO_E2E_PROVERLESS=1` on the gate: the gate and the wall-clock use the default prover-on build, as CI does; only the scratch captures ran proverless |
| final 1 | Codex, gpt-6.1-sol, fresh (session 01a19911) | conditional approve | the capture commands named, and the after evidence taken only from the uninjected records; the trust-boundary sentence narrowed | none |
| final 2 | Codex, resumed | **approve** | the condition verified; no regression, no new owner ask | none |
| arc 1 r1 | Codex, gpt-6.1-sol (session 01a19930) | findings: 1 | the scope banner's comment trimmed to its constraint; the e2e's paragraph cut | none |
| arc 1 r1 | Opus 5.5 (general-purpose) | findings: 3 | the e2e comment's switched-state reason was false (the strip's name is already ellipsized at the window's width, so the check would not flag it): sentence and D9 clause removed, `LONG_NAME` keeps the why of 25; T1 refuses an ellipsis (`text-overflow`, `white-space`), since a shortened line passes both the scan and the e2e; `.reset_notice` states it holds text only | none |
| arc 1 r2 | Codex, resumed | **clean** | the fixes verified; no regression | none |
| arc 2 r1 | Codex, gpt-6.1-sol (session 01a19db1) | findings: 1 | the chip comment claimed the title names the network in full, false on the new-addresses and one-at-a-time screens and the arrival: cut to its constraint | none |
| arc 2 r1 | Opus 5.5 (general-purpose) | findings: 4 | the chip comment, as Codex; T4's and T5's no-button checks also match `Button`, `RowAction` and `RowTarget`, T4 with a success control; the no-`height` check covers the grouped rule; one `LONG_NETWORK_NAME` for the three e2e files | a `NARROW_ACCEPTED` entry for the chips: it would exempt the chip from every check, dropping S1d's guard; no e2e meets the case it covers |
| arc 2 r2 | Codex, resumed | **clean** | the four fixes verified; no regression | none |
| net | Codex, gpt-6.1-sol, fresh (session 01a19db8) | **clean** | no cross-arc seam, duplication, drift or comment issue | none |

## Seeds (not run; orchestrator-owned)

```
/goal Phases 1 and 2 of implementations-plan/wrap-3/plan.md marked ✓ with their gates passing in the transcript; the arc 1 Codex loop (gpt-6.1-sol, high) converged; one ready PR against dev, part of #1397, with its measurement table and pictures; bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/wrap-3 per its plan.md and the README § Post-implementation standard at f738cba62: run the gates, decide open questions with Codex (gpt-6.1-sol, high), open the arc's PR, never merge, never change copy or layout; stop once its checks are green and report.
```
