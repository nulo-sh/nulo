---
plan: chips-2
tier: light
status: approved (final Codex pass); arc 1 running
issues: "#1370, #1371 (arc 1 closes); #1372 (captures only, stays open)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex (gpt-6.1-sol, high, read-only) audit round-trip; one Opus Plan leg
base: origin/dev at 9ce6bb0bd
trunk: dev
standard: implementations-plan/README.md § Post-implementation standard, read at 9ce6bb0bd
post_implementation_hardening: not scheduled
---

# chips-2: "Alpha" in the Terms box and the reviewer note, the takeovers' padlock-only Lock chip, and the 240 px captures

One arc, one PR against `dev`. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md).

## Outcome & Quality Bar

- **For whom**: a person who meets a takeover (network arrival, stale network) and looks for Lock; a reader of the Terms box or the store reviewer note who compares it with the wallet.
- **Excellent**: (1) the takeovers' Lock chip reads as the header's: the padlock alone at 15 px, named "Lock wallet", at the network chip's height beside it; (2) every text that names the wallet's label for the default network says "Alpha", and the Terms change asks nobody to accept again.
- **Good enough**: the protocol name "Alpha V6" stays in README, release-note and upgrade prose; the reviewer note's L1 date claim is the owner's and stays as written.

## Assumptions

**Facts** (at `9ce6bb0bd`; detail in [recon.md](recon.md)):
- F1 `legal/terms.md:13` says "shown in Nulo as Alpha V6", inside the summary box that says it "is not part of the agreement" (`:19-20`). Terms are at 1.2, material, effective 27 October 2026; `legal/archive/` has no `terms-1.2.md`.
- F2 A patch is not material, so `pendingTermsVersions` never returns it and nobody meets the sheet (`status.ts:137-144`). `manifest.test.ts` fails until the version line, the history table, the manifest and the archived copy agree.
- F3 `origin/main` and `origin/dev` hold the same `legal/` and manifest: Terms 1.2.1 is published by the next promote, and nulo.sh deploys from `main`. A PR into `main` at a stable version runs `launch-legal` (`pr-quick.yml:372-392`), which fails on any `«FILL»` line in `legal/terms.md` or `legal/privacy.md` (`packages/legal/src/launch.ts`). Terms 1.2 and privacy 1.2.2, 1.2.3, 1.2.4 and 1.2.6 landed on `dev` with `«FILL: effective date»` and a § 4 block, and a PR dated them at the promote (#1229); 1.2.5 and 1.2.7 were dated in their own PRs.
- F4 `listing.md:240-242` names the wallet's label twice ("opens on Aztec Alpha V6", "shows Alpha V6 as unavailable") and the protocol upgrade once. `store-listing.test.ts` bounds the notes block at 200-3000 code points only.
- F5 `TakeoverLayout.vue:42-43`: the Lock chip is `Icon name="lock" :size="12" aria-hidden="true"` plus "LOCK", in `.chip` (`padding: 7px 10px`, 1 px border, `type--label-section`). The header's chip (`Header.vue:241-251`) is the padlock at 15 px with `aria-label="Lock wallet"` and no Tooltip; `.lock_chip` takes the network chip's height through `min-height: calc(1lh + 14px)`.
- F6 Six text-dump assertions list "LOCK" (`NetworkArrival.test.ts:71`; `StaleNetworkTakeover.test.ts:98,134,194,320,344`), and five read a text node by position after it (`StaleNetworkTakeover.test.ts:134,135,165,166,339`); every e2e reaches the chip by testid only.
- F8 Two tests expect every Terms entry's `changes`, not only the material ones the sheet shows: `LegalAcceptanceSheet.test.ts:92` and smoke `legal-acceptance.test.ts:265`. A patch with a `changes` line fails both.
- F7 The opt-in capture tests exist for both takeovers (`NETWORK_ARRIVAL_CAPTURES=1`, `STALE_NETWORK_CAPTURES=1`), 360×600 at 2×, dark and light, Chrome only.

**Inferences**:
- I1 (measured in Phase 1, now a fact) Both takeover chips are 30 px tall at the base: one label line is 14 px. The padlock alone in `.chip` would be 15 + 14 + 2 = 31 px, so the chip needs a height rule (D2). Phase 4 measures again.
- I2 The history row is public text on nulo.sh/terms, but the owner's pick of "a patch version" covers it: the procedure (`legal/README.md` § Changing these documents) makes every version add one, and the precedent holds (privacy 1.2.2's row was written by its lane under the owner's pick "a patch bump"). UI impact quotes the row exactly. A patch's `changes` line shows nowhere in the wallet (recon).

**Asks**: none for this arc ([OWNER-ASKS.md](OWNER-ASKS.md)). #1372 is the owner's, decided on the issue.

## Architecture & Implementation

- **Terms 1.2.1** (patch): copy `legal/terms.md` byte for byte to `legal/archive/terms-1.2.md`; in `terms.md`, line 13 "Alpha V6" → "Alpha", a history row `| 1.2.1 | «FILL: effective date» | The summary box names the default network as Nulo shows it, Alpha. |`, the version line `**Version 1.2.1 — effective «FILL: effective date»**`; append `{ version: "1.2.1", effective: null, material: false, changes: ["The summary box names the default network as Nulo shows it, Alpha."] }` to `LEGAL_MANIFEST.terms` (D1).
- **Tests that read every Terms entry** (F8): filter the expected `changes` by `material`, exact equality kept, as `LegalAcceptanceSheet.test.ts:111-114` already does. Production filtering does not change.
- **BEFORE-LAUNCH § 4**: one block, "Due at the release that publishes Terms 1.2.1", in the privacy 1.2.2 block's form: the version is archived and in place, its effective date is the day the promote publishes it, so until then it reads `«FILL: effective date»`; three open items: `legal/terms.md` (the version line and the 1.2.1 history row, dated the day it is published), `packages/legal/src/manifest.ts` (`effective` for `terms` 1.2.1, now `null`, same date), and after the deploy `nulo.sh/terms` and `nulo.sh/terms/v1.2.1/` show no DRAFT banner.
- **Reviewer note**: "opens on Aztec Alpha with a zero balance" and "the wallet shows Alpha as unavailable"; the upgrade sentence unchanged.
- **Lock chip** (`TakeoverLayout.vue`): the button keeps `.chip`, its testid, handler and `aria-label`, and adds `$style.lock`; its content is `<Icon name="lock" :size="15" aria-hidden="true" />`. `.lock { padding-block: 0; align-self: stretch; }`, after `.chip` in the sheet, with one comment: with no text of its own, it takes the height of the network chip beside it (D2).
- **Comments**: `stale-network-captures.test.ts:52` "carries its own LOCK" → "its own Lock chip".
- **Rejected alternatives**: see the ledger.

### Phase 1: Captures at the base ✓

- Build the armed Chrome dist (recon, Armed smoke build). Run `NETWORK_ARRIVAL_CAPTURES=1 … -t "the arrival over Home"` and `STALE_NETWORK_CAPTURES=1 … -t "every takeover state"`. Copy `arrival.{dark,light}.png` and `A1-network-reset.{dark,light}.png` to `screenshots/before-*`.
- Write the scratch spec `~/.cache/nulo-backlog/chips-2/zz-chips2-captures.test.ts`, on the model of chips-1's (`~/.cache/nulo-backlog/chips-1/zz-chips-captures.test.ts`). Keep it there until Phase 4 ends. Copy it into `apps/extension/tests/e2e/` for each run and delete the copy after. It has two tests. One switches to Testnet at 360 px, sets 240×600 at 2×, logs the dot's offsets inside the chip, and clips the header in light (`1372-a-dev.png`). The other seeds the arrival as `network-arrival.test.ts:145-150` does and logs the `network-arrival-chip` and `network-arrival-lock` rects (both takeovers share `TakeoverLayout`).
- Warning: revert the next edit before Phase 2. Edit the `(width < 359px)` `.network_chip` block to `gap: 6px; padding: 6px 8px`. Rebuild the armed Chrome dist, rerun the spec's first test as `1372-b-8px.png`, then `git checkout -- apps/extension/src/components/Header.vue`.
- **Validation gate**: four takeover and two header PNGs exist; the spec logged both chips' heights and both dot offsets; `git status --porcelain apps/extension` is empty. Done at planning time ([lessons/phase-1.md](lessons/phase-1.md)): chips 30 px; A's dot 0.59 px inside the right border, B's 4 px past it.

### Phase 2: Terms 1.2.1, BEFORE-LAUNCH and the reviewer note ✓

- Make the edits above, the two F8 tests included. Then `git grep -n "Alpha V6" -- legal/terms.md apps/extension/store` lists only `listing.md`'s upgrade sentence and its release notes (`:187`, `:189`).
- **Validation gate**: `git show 9ce6bb0bd:legal/terms.md | cmp - legal/archive/terms-1.2.md` (the archive is the text people accepted; `manifest.test.ts` reads its header only); `bun run lint`; `bun run --cwd packages/legal test`; `bun run --cwd apps/landing test`; `bun run --cwd apps/landing build` (then `apps/landing/dist/terms/v1.2/index.html` exists and `dist/terms.html` holds "shown in Nulo as Alpha"); `cd apps/extension && bun --bun vitest run scripts/store-listing.test.ts src/components/LegalAcceptanceSheet.test.ts --retry=0`. Pass: exit 0, and the grep as stated. Layers: lint, unit.

### Phase 3: The Lock chip ✓

- Make the TakeoverLayout change. In `TakeoverLayout.test.ts`, the lock test becomes "the lock chip is the padlock alone, named for what it does, and reports a press": icon `lock` at size 15 (the Icon stub gains `size`), text `""`, `aria-label` "Lock wallet", `type` button, one `lock` emit. Drop "LOCK" from the six dumps and move the five positions after it back by one, strings and order unchanged (F6). Rename the tests at `StaleNetworkTakeover.test.ts:404` and `NetworkArrival.test.ts:116`, "LOCK locks" becoming "the padlock locks". Fix the comment at `stale-network-captures.test.ts:52`.
- **Validation gate**: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/components/composite/TakeoverLayout.test.ts src/components/network-arrival/ src/components/stale-network/ src/utils/type-role-ban.test.ts --retry=0`; `bun run test:all`; `bun run audit:vue`; `bun run --cwd apps/extension build-storybook`. Pass: exit 0. Layers: lint, typecheck, unit, component, static scan, build, Storybook build.

### Phase 4: Smoke on both browsers, captures after ✓

- Build the armed dist for Chrome and Firefox. Run the full smoke suite at retry 0, Chrome then Firefox (CLAUDE.md § Quality gates: a user-visible change): `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 [NULO_E2E_BROWSER=firefox] bun run test:e2e -- --retry=0`. It holds the takeover files, `type-roles.test.ts` and the edited `legal-acceptance.test.ts`. Record each wall-clock in `STATUS.md`.
- Rerun Phase 1's two capture commands and the chip-height log on Chrome; save `screenshots/after-*`.
- **Validation gate**: every run exits 0 at retry 0; the chips' heights are equal at 360 px; `bun run check:plans` after staging. Read a red before any rerun: rerun a known flake once, fix real breakage. Layers: e2e smoke, both browsers.

## Security & Adversarial Considerations

No trust boundary moves: no dApp input, message, permission, stored shape, log line or dependency. The Lock button keeps its element, handler, testid, focus ring and accessible name, and its icon stays `aria-hidden`. The Terms change is a non-material patch of a box that binds nobody, so the acceptance record and its guard are untouched; a wrong version line, history row or archive header fails `manifest.test.ts`, and Phase 2's `cmp` holds the archived body to the published 1.2 that installed wallets link to. The reviewer note is store text; its unchanged upgrade claim is flagged in the report, not edited. Captures hold a fresh profile on a stand-in node: no secret, address of value or local path.

## UI impact

- **Network-arrival and stale-network takeovers**: the top bar's Lock chip is the padlock alone at 15 px (was the 12 px padlock and LOCK), at the network chip's height, named "Lock wallet". Before and after captures, light and dark, go in the PR body.
- **Terms box** (nulo.sh/terms from the next promote, the wallet's Terms links): "shown in Nulo as Alpha" (was "Alpha V6"), version 1.2.1, no re-acceptance. The consent label and Settings → About read "1.2.1" (they print the current version). The new history row reads exactly "The summary box names the default network as Nulo shows it, Alpha." (I2). **Store reviewer note**: "opens on Aztec Alpha", "shows Alpha as unavailable".
- Sign-off, the owner on 2026-10-30: "1370 yes, change to Alpha. 1371 yes, padlock alone." Quoted in the PR body.
- **#1372**: nothing ships. Captures A (`dev`) and B (8 px sides and a 6 px gap below 359 px too) go on the issue in one comment.

## Decision ledger

| Id | Decision | Rejected | Why |
|---|---|---|---|
| D1 | `«FILL: effective date»` and `effective: null` until the promote, with a § 4 block (F3) | date it the day it commits, with a § 4 item to re-date it (the draft's choice) | a patch takes effect on publication (`legal/README.md`), which only the promote fixes; `launch-legal` already refuses an undated version into `main`, so the date cannot go out wrong, where a re-date item can be skipped. It is the form five of the last seven legal versions took (F3). The cost: the next promote needs a dating PR first, as #1229 was. Codex round 1 found the draft's argument (a `«FILL»` reaching `main`) overstated |
| D2 | `.lock`: no block padding, `align-self: stretch`; 10 px sides kept | `.chip` unchanged (31 px against 30, I1); the header's `min-height: calc(1lh + 14px)`, here `+ 16px` (the draft's choice) | the takeover's network chip always carries its label, so the row is its height and the padlock chip takes it with no constant that repeats `.chip`'s padding, and follows a name that wraps; the header needs its constant because both its chips can lose their text. The sides are the takeover chip's own. No Tooltip: the header's chip has none. Accessibility call under the owner's 2026-10-19 delegation |
| D3 | No new e2e scenario; existing opt-in captures plus one scratch spec; no CSS pin test | a source-scan pin like `header-layout.test.ts` | the component test pins the content; with D2's stretch no constant can drift; Phase 4 measures the height |

## Delivery

| Arc | Phases | Branch | Base | PR title | Closes |
|---|---|---|---|---|---|
| 1 | 1-4 | `worktree-chips-2` | `dev` | `fix(ui): the takeovers' lock chip is its padlock, and the terms box says alpha` (78) | #1370, #1371 |

Merge `origin/dev` before the PR; `bun run check:plans` after. Open ready, without labels. Commit the PNGs to `screenshots/`. Body: what changed and why, the owner's words, the captures (`raw/<sha>` links), the measured heights, every gate with its outcome and wall-clock (no e2e scenario added), the "Alpha V6" left in place with why, `Closes #1370`, `Closes #1371`. Then one comment on #1372 with captures A and B, one line each with the dot offsets; #1372 stays open.

## Post-implementation

The contract is this plan plus `implementations-plan/README.md` § Post-implementation standard, read at `9ce6bb0bd`. Plan-specific values:

- **Review loop** (once, after Phase 4): `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` over `git diff 9ce6bb0bd...HEAD` (the merge base if `dev` was merged in), with the plan, the ledger, the adversarial ask and the standard's two rules verbatim; resume with `resume-codex.sh`. Hard stop at three rounds. One Opus review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1. Log rounds in `lessons/phase-4.md` and here.
- **Approval boundary**: any visible change beyond UI impact, or a material Terms version, is a plan change and stops for the orchestrator.
- **Close-out**, the PR's final commits: merge `origin/dev`, read what changed in `index.md` and `lessons.md`; the Outcome block after the front matter (`Open items: #1372`); `STATUS.md` deleted; `git mv implementations-plan/chips-2 implementations-plan/archive/chips-2` in its own commit, the index line moved to `archive/index.md`; `bun run check:plans` green.
- **Teardown** after the merge: once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/chips-2/plan.md` succeeds, `agent-worktree done chips-2 --merged`. The orchestrator's next session notices the merge.

## Seeds

Not run: the orchestrator drives this plan.

```
/goal Phases 1-4 of implementations-plan/chips-2/plan.md marked ✓, each gate passing in the transcript; the Codex loop converged (a resumed pass with no new material finding, quoted); the PR against dev open with Closes #1370 and Closes #1371, and the #1372 comment posted; the close-out's archive move shown by git show --stat; bun run test:all and bun run lint exit 0.
```

```
/loop Read implementations-plan/chips-2/STATUS.md and run the first phase not marked ✓, its gate exactly as written; stop at a red gate after one rerun of a known flake, or after three failures on one step.
```

## Audit verdicts

**Round 1.** Codex (gpt-6.1-sol, high, session `01a18e5c`): `conditional approve (repair the missed test expectations, complete the required gates, and resolve the history-row sign-off assumption)`. Opus 5.5 Plan: `conditional approve (fix findings 1, 2, 4 and 5; reverse D1 as finding 3 says)`. Every finding was verified against the tree; each one's resolution is in [lessons/phase-0.md](lessons/phase-0.md). Taken: F8 and its two tests, the F6 index shifts, the full smoke on both browsers, `audit:vue`, the Storybook and landing builds, the archive `cmp`, the scoped grep, the scratch spec written and run, the history row quoted in UI impact (I2, no ask), D1 flipped to `«FILL»` on the precedent, D2 to `align-self: stretch`.

**Verification** (Codex, resumed): `approve`, no new material finding. It confirmed the stretch (both chips always render together; a wrapped name grows the row and the padlock chip with it), that the `«FILL»` form breaks no `dev` gate, and that I2 needs no separate ask.

**Post-implementation.** Round 1: Codex (gpt-6.1-sol, high, session `01a18e75`) over `9ce6bb0bd...7e9e8cf75`: `clean | findings: 0`; the Opus 5.5 diff review beside it: `clean | findings: 0` (every changed assertion stricter or exactly shifted; a known cost of D1 noted: a prerelease cut from `dev` before the promote links a `/terms/v1.2.1/` that does not exist yet, as Terms 1.2 did). Converged ([lessons/phase-4.md](lessons/phase-4.md)).
