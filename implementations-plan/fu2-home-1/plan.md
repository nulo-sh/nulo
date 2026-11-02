---
plan: fu2-home-1
tier: light
status: arc 1 converged; PR next
issues: "#1523, #1524, #1527 (arc 1); #1525, #1526 (arc 2)"
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

# fu2-home-1: Home and the header after the first-users lab

Five signed picks from decision page 93 in two arcs. Arc 1 is words and state: the switch toast and Receive name the network an address belongs to, a new account announces itself, and Get started holds its place across a switch. Arc 2 is layout: the network chip's words and its name at narrow widths, Home and onboarding at 240 px. Recon, measurements and the signed pictures: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md), both on arc 2. Paths are under `apps/extension/` unless they name a package.

## The items, checked

Each item is **demonstrated** by the lab's frames and a code trace (recon). No issue existed; this lane filed one per item.
- **#1523 (P93-02 D).** Addresses derive from the network's L1 chain id and accounts are stored per chain, so a switch changes the header's address; the toast says only "Active network updated" and Receive names no network.
- **#1524 (P93-25 B).** `getStartedView` is `null` while the scope's funds are unread. Home remounts on every visit (no `KeepAlive`, `src/popup/app.vue:677`), so after a switch the card is absent until the new scope's reads land, then mounts and moves the rows. Invariant broken: Home shows the profile's progress.
- **#1527 (P93-41 C).** `NewAccountPopup` selects the new account with no success message.
- **#1525 (P93-44 C).** The chip's dot has no words, and at 240 px the chip shows its dot only, setting on or off.
- **#1526 (P93-62 B).** Home's hero takes 241 of 600 px at 240 px; onboarding's body stays 320 px wide.

**Claims that did not hold.** (1) P93-62's "as it does at 360 px": Home's hero is pinned at every width (#633). The signed 240 frame shows it scrolling away with the list; the plan builds that below 359 px and leaves 360 as it is. (2) P93-44 B's "the chip fits the full name at 360 px" is not the chip's cap: with the address whole the 360 row is 11.3 px short for Local Network (Alpha and Testnet already fit). The signed frame overflows the row's right padding to show it, so where the room comes from is OA-2. (3) There is no network menu; the chip opens Manage Networks, where the prototype the owner saw put the word.

## Outcome & Quality Bar

- **For whom:** a first-time user who switches network, opens Receive, adds an account, or keeps Nulo in a narrow side panel.
- **Excellent:** the toast names the account and network the header shows, as the header's address changes, and only when it changed; the Get started card no longer leaves Home while the new network loads; every 240 px screen of the lane reads whole in Chrome and Firefox with no sideways scroll; copy ships exactly as signed.
- **Good enough:** a network's first visit delays the switch toast by the worker's derivation of its first account (and a custom network's by its one bounded identity read), as it delays the header.

## Assumptions

**Facts** (verified at `1e6c5bc1f`)
1. The two switch toasts are `settings/networks/index.vue:61` and `[id].vue:124`. Activation does not await `app.vue`'s switch run, which reloads the accounts, so either may finish first (`src/utils/guarded-network-activation.ts:57-63`); `accountStateOf` is `"shown"` only once the account is the active chain's (`src/components/header-account.ts`). `app.vue` already awaits that run before the reset path announces (`accountLoaded`).
2. A seeded network's first account needs no network call, but the worker derives it (`wallet/services/account/service.ts`, `NuloAccount.new`), which the e2e allows 30 s for (`settings-crud.test.ts:97`, against 10 s for the toast at `:90`). A custom network's first account also waits on one bounded identity read (`wallet/services/network/service.ts`, `resolveVerifiedL1ChainId`).
3. Funds decide only the banner (`hidden && !phraseSaved && funds === "some"`) and the Fee Juice step's tick (`src/utils/get-started.ts:118-150`). `SettingItem`'s `disabled` makes a row inert at 0.5 opacity.
4. `ToastOptions` has `sub`; a success closes after 2 s, held while hovered or focused (`packages/design/src/composables/toast.ts`).
5. Measured (recon): label room at 360 with the address whole 89.6 px; Local Network 100.9; the trimmed address 107.4 (13 `data-lead` characters of 7.8 px plus 6). At 240 with the account column gone and the chip's 3 px sides (#1372), Local Network fits with 4.1 px; with 8 px sides it is 7.9 px short.
6. `onboarding.scss` sets `body { min-width: 320px }`; `type-roles.test.ts:1115` runs onboarding with `narrow: false`.

7. Only `security-backup.test.ts:63` presses a Get started row; it waits for the row's visibility, not `data-reminders-settled` (`tests/e2e/fixtures/tokens.ts:122`).

**Inferences.** I1: a `ch` in a container query resolves against the query container's computed font (CSS Containment 3), in Chrome and Firefox; arc 2's boundary e2e proves it.

**Asks.** OA-1 (the red dot's word) and OA-2 (room at 360 px), both arc 2 only. Arc 1 depends on none.

## Decisions

- **D1 (P93-02 B).** Both Settings pages call a helper `switchAndAnnounce` (`src/popup/pages/settings/networks/switch-toast.ts`) in place of `activate()`. It records the profile, and the header's address when `accountStateOf` is `"shown"`, BEFORE `activate()`: the account can land while the network still persists (`src/utils/guarded-network-activation.ts:57-63`). With no address shown (a quarantined network, an account still loading) there is nothing to compare, so no line. On `"activated"` it awaits what `app.vue` provides under `SWITCH_SETTLED_KEY`: `settleLatestRun(() => switchRun, nextTick)` (`src/popup/network-switch.ts`), which after a tick awaits the run in flight, failed or not, and resolves whether that run is still the latest. Unlock's bootstrap reassigns the network (`useProfileBootstrap.ts:153-168`), so a newer switch, A → B → A, and lock → unlock all replace the run. The reset path's `accountLoaded` keeps its own wait, which still rejects. If the run was replaced, or the login, the profile or the network moved, it opens nothing: the newer action owns the feedback. A failed run still gets the plain toast, since the network did switch. Otherwise one success toast "Active network updated", with the sub `${account.name} has a different address on ${network.name}.` only when `accountStateOf` is `"shown"` on the target and the address differs from the recorded one. The toast opens when the run ends, just after the account lands: the run's last step is the scope's local transaction read (`network-switch.ts:79-84`). Names render raw, as the header renders them. Only the two "Active network updated" toasts take the line: creating a network (`NewNetworkPopup`, "Network is created"), an arrival and the stale-network takeover also switch and keep their feedback, and Receive's line (D2) names the network on every path; carrying the line to them would be copy beyond the pick.
- **D2 (P93-02 C).** Receive adds `<Text variant="caption" color="secondary" data-testid="receive-network">` reading `Your address on ${appStore.network.name}` under the address, with `overflow-wrap: anywhere` (#1232: wrap, never shorten).
- **D3 (P93-41 C).** Once `commitScopeChange` lands, `NewAccountPopup` opens `{ kind: "success", label: `Now using ${appStore.account.name}` }`; the refused path keeps its error toast only.
- **D4 (P93-25 B).** `getStartedView` gains `pending`: while only the funds are unread and the banner cannot be due (`!(hidden && !phraseSaved)`), it returns the card from the profile's flags, Fee Juice ticked by `feeJuiceHeld`, `pending: true`; otherwise `null` as today. `GetStartedCard` takes `pending`: rows `disabled`, the label and count at 0.5 opacity, the list `aria-busy`; Hide stays live (the signed frame). `general.vue` passes it, and `remindersSettled` is false while pending. This is the cause, so it also shows the card greyed for the moment a popup opens, instead of mounting it late. The card still waits for the profile's flags and the Presto setting, local reads at mount; the seconds-long wait on the network's reads is what this removes. `security-backup.test.ts:59-64` presses a row once it is visible; it now calls `waitForHomeReminders` first, since a pending row is inert.
- **D5 (P93-44 B, words).** `networkStatusWord(status)` (`src/utils/network-status.ts`): `"Connected"` for `Active`, `"Waiting for the network"` for every other state until OA-1. The chip's `aria-label` becomes `Manage networks (currently ${name}, ${word})`; Manage Networks' active row shows the word as its description.
- **D6 (P93-44 C, 240 px).** Below 359 px with Show network name on, the header gets `name_first`: the account group is `flex: 1 1 0`, the chip keeps its natural width and shrinks only past the avatar and lock, and the account column, composing `type--data-lead` so its `ch` is the address's character, is a size container whose name and address leave (`display: none`) under `15ch`. That is the address's 13 characters plus the copy icon revealed 6 to 18 px past it, which must clear the chip across the 8 px gap: at least 111.4 px, and `15ch` is 117. With the setting off, nothing changes. `account-selector` and `account-address-text` enter `NARROW_ACCEPTED` with the reason; `network-name` keeps its entry, reworded: a typed name wider than the room left ends in an ellipsis, as today, while the seeded names show whole (pinned by `appearance.test.ts`). The chip keeps #1372's 3 px sides. Receive's address becomes a native button, its testid and look kept, so a keyboard can still copy the address where the header's button leaves (an accessibility call under the 2026-10-19 delegation).
- **D7 (P93-44 B, 360 px).** Only on OA-2's answer: the 120 px cap goes and the row takes the answered spacing.
- **D8 (P93-62, Home).** `general.vue`'s own module, below 359 px: `.wrapper { overflow-y: auto }`, `.scroller { flex: none; overflow: visible }`, and the scroll shadow hidden (it follows only the scroller's scroll, so it would stick after a resize). The wrapper gets `data-testid="home-page"` for the e2e. The token page keeps the shared pinned hero.
- **D9 (P93-62, onboarding).** `body { min-width: 240px }`, the narrowest width the wallet lays out at; `StepIndicator`'s four cells in two rows below 359 px (the signed frame). Then the narrow gate runs on every onboarding page and each failure is fixed by wrapping or reflow only. A fix that hides, reorders or rewords anything stops for an owner ask.
- **D10 (tests).** Arc 1: unit and component tests only, each red at the base first: `switch-toast.test.ts` (the line on a changed address, also when the account lands before `activate()` resolves; none on the same address; none when the header showed no address before; plain toast when the account never shows or the run fails; no toast once the run is replaced or after a lock; pages call it), `network-switch.test.ts` (`settleLatestRun`: true for the same run, failed or not; false once replaced, with deferred runs), `ReceivePopup.test.ts` (new), `NewAccountPopup.test.ts` (toast after selection; none on refusal), `get-started.test.ts`, `GetStartedCard.test.ts`, `general.test.ts` (its case "while the gas read is still out, an empty token list shows nothing yet" pins the defect and changes). Arc 2: `network-status.test.ts`, `Header.test.ts`, `networks/index.test.ts`; e2e only where layout is the witness (jsdom lays nothing out): `appearance.test.ts` (seeded names: at 360 unchanged; a sweep from 240 to 358 px in 4 px steps, Alpha and Local Network, asserting at each width that the address is either absent or whole inside its column with its hovered copy icon clear of the chip, which is what proves I1; Alpha keeps the address at 320, Local Network gives it up; at 240 the name whole; both browsers; est. +8 s), `rows.test.ts` hero at 240 (the hero leaves on scroll, the nav stays; +3 s), one onboarding walk with `expectFitsNarrow` replacing `narrow: false` (+15 s).

## Architecture & Implementation

| Arc | Files | Change |
|---|---|---|
| 1 | `src/popup/network-switch.ts`, `src/popup/app.vue`, `src/popup/pages/settings/networks/{switch-toast.ts,index.vue,[id].vue}` (+ tests) | D1 |
| 1 | `src/popup/components/popups/{ReceivePopup,NewAccountPopup}.vue` (+ tests) | D2, D3 |
| 1 | `src/utils/get-started.ts`, `src/popup/components/modules/general/GetStartedCard.vue`, `src/popup/pages/general.vue` (+ tests), `tests/e2e/security-backup.test.ts` | D4 |
| 2 | `src/utils/network-status.ts`, `src/components/Header.vue`, `src/popup/pages/settings/networks/index.vue`, `src/popup/components/popups/ReceivePopup.vue`, `tests/e2e/fixtures/type-roles.ts`, `tests/e2e/appearance.test.ts` | D5-D7 |
| 2 | `src/popup/pages/general.vue`, `src/onboarding/{onboarding.scss,components/StepIndicator.vue}`, onboarding pages as the gate finds, `tests/e2e/{rows,type-roles}.test.ts` | D8, D9 |

Alternatives not taken: D1 with a page-local `watch` on `accountStateOf` (a second lifecycle beside a wait `app.vue` already owns, for a few milliseconds earlier) or the toast at `activate()` (names the previous chain's account). D4 holding the last view in a store (state across Home's unmount, and still wrong on a popup open). D6 by a fixed breakpoint (hides the address at Chrome's 320 px side panel where Alpha fits beside it) or a `ResizeObserver` (a lifecycle where a declarative query holds).

## UI impact

Sign-off: page 93, signed 2026-11-02. P93-02 D, "Both B and C." (B: "The switch confirmation adds “Account 1 has a different address on Local Network.”"; C: "Receive names the network under the address: “Your address on Local Network”."). P93-41 C, "The switch stays, with a toast “Now using Account 2”.". P93-25 B, "Home keeps the card, its rows greyed, until the new network's state loads.". P93-44 C, "B, and at 240 px the setting shows the name in place of the account address when both do not fit." (B: "The chip fits the full name at 360 px, and the dot gets a word for screen readers and in the network menu (“Connected”, “Waiting for the network”)."). P93-62 B, "Fix the two that block use: Home's top block collapses on scroll as it does at 360 px, and onboarding fits 240 px."
- **Arc 1:** the switch toast gains its line and opens when the header's account lands; Receive gains one grey line; creating an account shows "Now using <name>"; the Get started card stays in place greyed while the scope loads, after a switch and at popup open.
- **Arc 2:** the chip's accessible name and Manage Networks' active row carry the word; below 359 px with the setting on, the chip shows the name and the account name and address leave when both do not fit; at 360 per OA-2; Home below 359 px scrolls as one page; onboarding lays out from 240 px.
- The PR bodies quote these picks and carry before/after captures (light, Chrome) of every surface.

## Security & Adversarial Considerations

- Names are person-typed strings the header already renders; Vue renders them as text. No message, storage, permission, log line, dependency or CSP changes.
- The toast and Receive line reduce a real misuse: handing out an address from another network. The toast reads the store after the run settles, so it never names the outgoing chain's account; a superseded switch, or one a lock ends, shows no toast.
- At narrow widths with the setting on, the header's copy-address button leaves; Receive still shows and copies the address, and the avatar still switches accounts. Known limits: none.

## Phase 1 (arc 1): words and state

1. Time the gate's e2e files once per browser on the base. Add D10's arc 1 tests and run them on the base code; require each red. Commit.
2. Make D1-D4. `settings-crud.test.ts:90` waits for the toast under the account's existing 30 s bound, since the toast now follows the account (a changed meaning, not a race cover). Require the tests green. Commit.
3. Capture before (base build) and after, light, Chrome: the switch toast, Receive, the new-account toast, Home right after a switch. Use a scratch spec under `tests/e2e/`, delete it, and require `git status` clean under `apps/extension/tests/`. Copy the PNGs to `implementations-plan/fu2-home-1/screenshots/`.

**Gate**, from the root: `bun run lint`; `bun run typecheck:all`; `(cd apps/extension && bun --bun vitest run src/popup/pages/settings/networks src/popup/components/popups src/popup/components/modules/general src/popup/pages/general.test.ts src/utils/get-started.test.ts src/popup/network-switch.test.ts src/utils/toast-call-sites.test.ts src/utils/copy-dash-ban.test.ts src/utils/type-role-ban.test.ts --retry=0)`; `bun run test:all`; the armed builds (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`, then `build:firefox`); `(cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/settings-crud.test.ts tests/e2e/accounts.test.ts tests/e2e/snackbar.test.ts tests/e2e/home-links.test.ts tests/e2e/security-backup.test.ts tests/e2e/stale-network.test.ts tests/e2e/type-roles.test.ts --retry=0)`, then with `NULO_E2E_BROWSER=firefox`; `bun run check:plans` after staging. Pass: every command exits 0 at retry 0; each new test red before, green after (a new export's test fails on its assertions, through a stub at the base); the e2e wall-clock before and after per browser recorded.

**Status ✓ (2026-11-02).** Red at the base, green after; the gate passed at retry 0. Smoke e2e wall-clock for the gate's files, base → arc 1's final head: Chrome 286 s → 274 s, Firefox 442 s → 403 s (one earlier Firefox run read 483 s under a load average above 100; no scenario was added). Captures: [screenshots/](screenshots/) (`a1-before-*`, `a1-after-*`).

Deviations, the tree winning:
- `general.test.ts`'s Fee Juice case "after one account held it…" also pinned the card leaving on a reset's new chain; it now reads the card held, greyed, until the read lands.
- `snackbar.test.ts`'s still-pointer case pressed Receive's address where the snack used to open; the new line now sits there, so the pointer rests on it and the copy is pressed by testid. Same invariant: hover from a still pointer does not hold a success.
- The card's label dims by class, with no testid: `[data-testid^="get-started-"]` lists the rows (the e2e `getStartedRows`).
- A revisited network's funds are already read, so nothing holds there; the pending card shows on a first visit, where the captures are taken.

## Phase 2 (arc 2): the chip, Home and onboarding at 240 px

1. Time `appearance`, `rows` and `type-roles` once per browser on the base. Add D10's arc 2 tests; require red on the base.
2. Make D5, D6, D8, D9 (D7 only with OA-2's answer, D5's third word only with OA-1's). Require green.
3. Capture before and after as phase 1 step 3: the header at 360 and 240 (setting on, Local Network), Manage Networks, Home at 240 scrolled, each onboarding page at 240.

**Gate:** phase 1's commands with `src/utils/network-status.test.ts src/components/Header.test.ts` added to the vitest list and `tests/e2e/appearance.test.ts tests/e2e/rows.test.ts tests/e2e/onboarding-tab.test.ts` added to both e2e runs. Pass: as phase 1; the e2e wall-clock before and after per browser recorded.

## Delivery

- Stack with `gh stack`, base `dev`: arc 1 `fu2-home-1-a1` off this plan's commit, `feat(ui): name the network where an address changes, toast a new account, hold get started` (90), `Closes #1523, #1524, #1527`. Arc 2 `fu2-home-1-a2` on it (off `dev` if arc 1 merged), `feat(ui): the network chip says its status and fits 240 px; home and onboarding fit 240 px` (90), `Closes #1525, #1526`. Close-out: docs-only `fu2-home-1-close-out`. PRs ready, no label at creation.
- Body: what and why, the claims that did not hold, the picks quoted, the captures (`?raw=true` at the head SHA), the runs, the e2e wall-clock per browser before and after, accessibility calls made under the owner's 2026-10-19 delegation (D4's inert rows and `aria-busy`, D5's accessible name, D6's tab order), ending `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Commits conventional, lower case, signed, ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Parallelism: the arcs share `general.vue` and `networks/index.vue`; no lanes.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `1e6c5bc1f`. Specific here:
- Step 1 is absent (`code_review: off`). Step 2 runs per arc at its boundary over `git diff <arc base>...HEAD`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; one Opus 5.5 diff review (`general-purpose`) beside round 1; after arc 2, one fresh Codex session over the net diff. Prompts under `~/.cache/nulo-backlog/fu2-home-1/`. Hard stop at three rounds; each round in `lessons/phase-N.md` and the table below.
- Approval boundary (stop): any copy beyond the picks, a spacing change at 360 without OA-2, a third status word without OA-1, an onboarding fix that hides, reorders or rewords, a change to the shared pinned hero.
- Close-out: the Outcome; OA-1 and OA-2, if open, filed as `owner-decision` issues; lessons promoted within budget; `STATUS.md` deleted; `git mv` into `archive/`, index line moved. Teardown after the merge: `agent-worktree done fu2-home-1 --merged`, trunk `dev`; the archived plan is `implementations-plan/archive/fu2-home-1/plan.md`.

## Audit verdicts

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| Plan 1 | Codex `gpt-6.1-sol`, high | reject | Address recorded before `activate()`; no toast once the scope moves or a lock lands; toast timing named as the run's end; D4's residual wait stated and the outcome narrowed; `waitForHomeReminders` before the Get started press, in arc 1; Receive's address a native button; `15ch` and a boundary e2e; typed long names keep their ellipsis; the e2e `cd` in a subshell | none |
| Plan 1 | Opus 5.5, Plan | conditional approve | Before-address only when shown; the toast's derivation delay in the outcome, its e2e wait under the account's bound, arc 1's e2e wall-clock recorded; a 4 px sweep that proves I1; the scroll shadow hidden below 359 px and a wrapper testid; the line kept to the two switch toasts, stated | none (its lock and `15ch` findings were already folded) |
| Plan 2 | Codex `gpt-6.1-sol`, high, fresh | conditional approve | Run identity across A → B → A and lock → unlock (`settleLatestRun`, tested); reset's wait left rejecting, the catch local to the toast; Fact 1 says either may finish first | none |
| Plan 2, resumed | Codex `gpt-6.1-sol`, high | approve | the fold checked against the code | none |
| Arc 1, round 1 | Codex `gpt-6.1-sol`, high | reject | The new-account toast opens only while its profile is unlocked (a lock mid-create showed the name); the wait no longer binds to one run: an unattended reset's reload replaces it, which dropped the toast | none |
| Arc 1, round 1 | Opus 5.5, diff review | no high finding | The same reload case; the e2e waits for the line itself and the pages inject with no silent default; `app.vue`'s comment names both waiters | A pending card that the funds complete draws once, greyed, then leaves: the signed pick holds the card until the state loads, then shows what it says. The copy snack covers Receive's line for 2 s: the snack's existing place. Receive's line without a chain check: entry is gated on the shown account, as its address is. The line naming an account other than the one shown before: it names the header's account, whose address differs by derivation. The network lane: CI runs it; the smoke files that switch passed locally |
| Arc 1, round 2 | Codex, resumed | reject | B → A → B while B's first read is out let the first wait follow back to B: the handler now counts scope changes (`scopeChanges`), and the wait ends once that count moves | none |
| Arc 1, round 3 | Codex, resumed | approve | the counter checked against the handler, watcher and serialized activation | none |

## Seeds (not run; orchestrator-owned)

```
/goal Phase 1 of implementations-plan/fu2-home-1/plan.md marked ✓ with its gate passing in the transcript; the arc 1 Codex loop (gpt-6.1-sol, high) converged; one ready PR against dev closing #1523, #1524 and #1527, with the picks quoted and the captures; bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/fu2-home-1 per its plan.md and the README § Post-implementation standard at 1e6c5bc1f: run the gates, decide open questions with Codex (gpt-6.1-sol, high), open the arc's PR, never merge, never change copy or layout beyond the picks; stop once its checks are green and report.
```
