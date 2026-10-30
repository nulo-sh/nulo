---
plan: chips-1
tier: light
status: approved by the final Codex pass; arc 1 next
issues: "#1363 (arc 1 closes); known limit #1364"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex (gpt-6.1-sol, high, read-only) audit round-trip; one Opus Plan leg
base: origin/dev at a4da1f36f
trunk: dev
standard: implementations-plan/README.md § Post-implementation standard, read at a4da1f36f
post_implementation_hardening: not scheduled
---

# chips-1: the header's chips get room, and the default network reads "Alpha"

One issue, one arc, one PR against `dev`. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md).

## Outcome & Quality Bar

- **For whom**: a person on Home who reads the network chip to know where they are.
- **Excellent**: (1) at the popup's width, ALPHA and TESTNET sit whole in the chip with visible room on both sides; (2) on a new install the default reads "Alpha" wherever it is named; (3) Lock stays a native button named "Lock wallet", at the network chip's height.
- **Good enough**: LOCAL NETWORK may end in an ellipsis at the popup's width; an install seeded before the rename keeps its row's earlier name (#1364); no colour, dot or Manage networks layout change.

## Assumptions

**Facts** (at `a4da1f36f`; detail in [recon.md](recon.md)):
- F1 The seed (`seeds.ts:61`) and `getChainName(CHAIN_IDS.MAINNET)` (`components/ui/utils.ts:35`) answer "Alpha V6"; every other "Alpha V6" in `apps/extension/src` is a test or the `Header.vue:402` comment.
- F2 `v1.1.0` (GitHub Release, 2026-10-27) seeds "Alpha V6"; `v1.0.0` seeded "Mainnet", which #1191 never rewrote.
- F3 A seed's name is read only when its row is first written (`service.ts:388-412`, and a log line at `:326`); rows are matched by kind (`seed-offers.ts`), never by name, so the rename reaches new rows only. Backups carry no network rows; a restore reseeds (`wallet/services/backup/README.md:20`).
- F4 A row records no "renamed by the person" mark (`Network`, `spec.ts:36-55`); `name` is user-set (`renameNetwork`, `service.ts:598-611`).
- F5 Header's avatar button (`account-avatar-btn`, `Header.vue:180`) and the sub-page back button (`SubPageHeaderBase.vue:40-49`), both without text, carry `aria-label` and no Tooltip; row actions carry Tooltips.
- F6 Deleting `.lock_label` changes no type-role baseline; `NARROW_ACCEPTED`'s `header-lock` entry (`tests/e2e/fixtures/type-roles.ts:596`) then exempts nothing.
- F7 `TakeoverLayout.vue:42-43` draws its own Lock chip, "LOCK", on the takeovers; the Header change does not reach it.
- F8 The claims of #1363's "What happens" held. Its stored-row rule is not contained (D1).

**Inferences**:
- I1 The Lock label's width returns to the row (the chip is 69.5 px wide today, measured). The network chip's label box is at most 90 px (120 cap − 16 padding − 2 border − 6 gap − 6 dot). Before, at 360 px (measured): ALPHA V6 58.7 px in a 58.7 px box, TESTNET 53.1 whole, LOCAL NETWORK 100.9 cut to 61.1. After: Phase 3 measures it.

**Asks**: none for this arc. OA-1 (Terms and store note) and OA-2 (the takeovers' Lock chip) concern files and surfaces the arc does not touch.

## Architecture & Implementation

- **Name**: the mainnet seed's `name` becomes "Alpha"; `getChainName(MAINNET)` returns "Alpha". Stored rows are not rewritten (D1, #1364). No service, schema or storage change.
- **Header** (`Header.vue`): drop the `lock_label` span and its rule; `.lock_chip` loses `gap` and takes `padding: 0 6px` (its icon-only form below 359 px today) at every width; the `<359px` rule keeps only the row's tightening, its comment rewritten to match. `.network_chip`: `gap: 6px`, `padding: 6px 8px`; the `:402` comment goes.
- **Not taken**: D1, D2, D4 below.

### Phase 1: The name

- The "before" captures are done (planning, base build): `~/.cache/nulo-backlog/chips-1/captures/before/`.
- Change the seed and `getChainName`. Change to "Alpha" every expectation in recon's list (unit, component, e2e), never loosened: `components/ui/utils.test.ts:8`, `network/service.test.ts:1445,1447`, `popup/pages/settings/networks/index.test.ts` (its `kind: "mainnet"` fixture row), `appearance.test.ts:210`, `contacts-import.test.ts:166`, `settings-crud.test.ts:67,81,96,100`, `network-arrival.test.ts:83,130`, `network/cap-chain-mismatch.test.ts:33,58`.
- Afterwards, `git grep -n "Alpha V6" -- apps packages scripts` lists only `apps/extension/store/listing.md`.
- **Validation gate**:
  - Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/wallet/services/network/ src/components/ui/utils.test.ts src/popup/pages/settings/networks/ --retry=0`; the `git grep` above.
  - Pass: exit 0, and the grep lists only the listing. Layers: lint, typecheck, unit, component.

### Phase 2: The header

- Make the Header change. Change `Header.test.ts:193-200` (text `""`, the title names the padlock alone) and `header-layout.test.ts:34` (`6px 8px`). Remove the `header-lock` entry of `NARROW_ACCEPTED`.
- **Validation gate**:
  - Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/components/Header.test.ts src/components/header-layout.test.ts src/utils/type-role-ban.test.ts --retry=0`; `bun run --cwd apps/extension build-storybook`.
  - Pass: exit 0. Layers: lint, typecheck, unit, component, static scan, Storybook build.

### Phase 3: Full gates and captures

- Run `bun run test:all` and `bun run audit:vue`.
- Build the armed smoke dist for each browser. Run the full smoke suite, Chrome then Firefox (CLAUDE.md: a user-visible change and a `tests/e2e/fixtures/**` edit): `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 [NULO_E2E_BROWSER=firefox] bun run test:e2e -- --retry=0`.
- Network files, both browsers, one `e2e:agent` at a time: `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first [NULO_E2E_BROWSER=firefox] bun run e2e:agent tests/e2e/network/cap-chain-mismatch.test.ts tests/e2e/network/type-roles-windows.test.ts`.
- Captures, Chrome: copy the scratch spec `~/.cache/nulo-backlog/chips-1/zz-chips-captures.test.ts` into `apps/extension/tests/e2e/`, run it once on the armed Chrome dist, then delete it. It activates each seeded network at 360 px, logs the name's text and box widths, and clips the header in light and dark. Commit the 12 PNGs (before and after) to `implementations-plan/chips-1/screenshots/`.
- Warning: a cut ALPHA or TESTNET at 360 px stops the arc for the owner.
- **Validation gate**:
  - Commands: the above; `bun run check:plans` after staging.
  - Pass: every command exits 0 at retry 0; `git status --porcelain apps/extension/tests/e2e` is empty before the commit; `STATUS.md` holds each run's wall-clock. Read a red before any rerun: rerun a known flake once, fix real breakage.
  - Layers: unit, component, Storybook build, e2e smoke and network on both browsers.

## Security & Adversarial Considerations

No trust boundary moves: no dApp input, message, permission, log line or dependency, and no rewrite of an existing stored row or storage shape (a new row stores "Alpha"). The change is a seed's display name, one label function, CSS and one template element. A seed's name is never used to match a row or a chain (F3), so no account derivation, node routing or reset decision reads it. The Lock button keeps its element, handler, `disabled` binding and accessible name. On an install seeded before the rename, the row's name and `getChainName` differ (#1364); both are display data.

## UI impact

- The header network chip: 8 px sides and a 6 px gap (was 3 px and 4 px).
- The Lock chip: the padlock alone at every width (was padlock and LOCK at 359 px and wider), named "Lock wallet". The takeovers' own Lock chip is unchanged (OA-2).
- On a new install the default network reads "Alpha" wherever it is named: the header chip, Manage networks, the arrival title, the contacts import sender line and the chain-mismatch line. On every install, `getChainName` surfaces read "Alpha": the capabilities chain chip and a connected app's shared accounts. An install seeded before the rename keeps its row's name (#1364).
- Sign-off, the owner on #1363 (2026-10-30): "For chips: nevermind about the seed, let's keep it as is, but maybe the user-facing thing is setting it as "ALPHA" wdyt?", then the pick **Seed "Alpha" + room**, whose stored-row clause names the known-limit fallback. The PR body quotes both, with the captures.

## Decision ledger

| Id | Decision | Rejected | Why |
|---|---|---|---|
| D1 | Stored rows keep their name; known limit #1364 (also recorded on #1363) | rename a mainnet row named exactly "Alpha V6" at the seed pass (the round-1 design); a provenance mark on the row | the owner's rule renames only a row "never renamed by the person"; a name match also overwrites a person's deliberate "Alpha V6" at every open (final Codex pass), and a mark is new stored state. The decision names this fallback |
| D2 | Lock: `padding: 0 6px` at every width, no gap, no Tooltip, `aria-label` kept | a Tooltip; a new padding | its icon-only form ships below 359 px; Header's textless buttons carry no Tooltip (F5). Accessibility call under the owner's 2026-10-19 delegation |
| D3 | Remove `header-lock` from `NARROW_ACCEPTED` | keep it | it exempts nothing now, and kept it would hide a label that comes back |
| D4 | No new e2e scenario; captures from a scratch spec | an assertion per seeded name | the 360 px check stays on the default; the unit layout pin holds the padding; the captures measure the rest |
| D5 | Full smoke on both browsers, `audit:vue`, Storybook build, two network files | the six smoke files only; the full network suite locally; the v1.1.0 update replay | CLAUDE.md § Quality gates names the full smoke, `audit:vue` and the Storybook build for this edit; no network or stored behaviour changes, and the two network files read the name or the narrow fixture; with no row rewritten the replay meets nothing new (F3). CI's required lanes run the rest |

## Audit verdicts

**Round 1.** Codex (gpt-6.1-sol, high, session `01a18d47`): `conditional approve`. Opus 5.5 Plan: `conditional approve`. Both reviewed the round-1 design, which renamed a stored row named exactly "Alpha V6" at the seed pass. Taken then and still standing: F5, F6, F7 and OA-2 (Opus); the measured fit and the 90 px arithmetic in I1 (Codex); the full UI gates, D5 (Codex); plain-language fixes (Opus). Folded into D1 by the final pass: both legs' finding that a name match overwrites a deliberate "Alpha V6" at every open, the write's failure policy, the replay change at `update-replay.test.ts:616`, the deletion-fence question (Codex rejected an orphan path itself) and the "Mainnet" rows.

**Final pass.** Codex, fresh (gpt-6.1-sol, high, session `01a18d57`): `conditional approve (with conditions: take the authorized stored-row fallback or obtain explicit owner approval for deliberate-name overwrites; add the required Storybook build gate)`. It found the round-1 claim that D10 was authorized unsafe: the owner's fallback covers leaving rows unchanged, not undoing a deliberate name. Taken: D1 (the fallback, #1364), the Storybook build in Phase 2. It confirmed rejecting the deletion fence (the lock order admits no orphan) and found no new security weakness. Verification (resumed): `approve`; one wording fix in Security, taken.

## Delivery

| Arc | Phases | Branch | Base | PR title | Closes |
|---|---|---|---|---|---|
| 1 | 1-3 | `worktree-chips-1` | `dev` | `fix(ui): name the default network alpha and give the header's chips room` (72) | #1363 |

`code_review: off`. Merge `origin/dev` before the PR; `bun run check:plans` after. Open ready, without labels. Body: what changed and why, the owner's words, the captures (`raw/<sha>` links), each name's measured fit before and after, the known limit #1364, every gate with its outcome, each browser's smoke and network wall-clock (no e2e scenario added), `Closes #1363`. No lanes: the phases share tests.

## Post-implementation

The contract is this plan plus `implementations-plan/README.md` § Post-implementation standard, read at `a4da1f36f`. Plan-specific values:

- **Review loop** (once, after Phase 3): `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` over `git diff a4da1f36f...HEAD` (the merge base if `dev` was merged in), with the plan, the ledger, the adversarial ask and the standard's two rules verbatim; resume with `resume-codex.sh`. Hard stop at three rounds. One Opus review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1. Log rounds in `lessons/phase-3.md` and here.
- **Approval boundary**: a rewrite of stored rows, a new stored field, or any visible change beyond UI impact is a plan change and stops for the orchestrator.
- **Close-out**, the PR's final commits: merge `origin/dev`, read what changed in `index.md` and `lessons.md`; the Outcome block after the front matter (`Known limits: #1364`); `STATUS.md` deleted; `git mv implementations-plan/chips-1 implementations-plan/archive/chips-1` in its own commit, the index line moved to `archive/index.md`; `bun run check:plans` green.
- **Teardown** after the merge: once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/chips-1/plan.md` succeeds, `agent-worktree done chips-1 --merged`. The orchestrator's next session notices the merge.

## Seeds

Not run: the orchestrator drives this plan.

```
/goal Phases 1-3 of implementations-plan/chips-1/plan.md marked ✓, each gate passing in the transcript with LESSONS_FILE=implementations-plan/chips-1/lessons/phase-N.md printed; the Codex loop converged (a resumed pass with no new material finding, quoted); the PR against dev open with Closes #1363 and the close-out's archive move (`git show --stat`); bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/chips-1 forward per its plan.md: reality check (plan, lessons, git status, PR checks); next pending step; fast layers after each edit; the phase gate before ✓; Codex (gpt-6.1-sol, high) for any decision; never merge; once the archive is on dev, run the teardown and stop.
```
