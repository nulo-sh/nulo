---
plan: icons-2
tier: light
status: panel approve 2026-10-18 (Codex round 2); arc 1 in progress under auto-continue
issues: "#787 (arc 1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex audit (gpt-6.1-sol, high) with its resume; one Opus Plan leg
base: origin/dev at 767789b7
trunk: dev
post_implementation_hardening: not scheduled
---

# icons-2: the private and public marks become Tabler's shield and globe

One arc, one PR against `dev`, closing #787. The owner picked on decision page 52 (signed 2026-10-18), **P52-02, option J**: *"Filled shield and world: Shield beside a globe, the strongest meaning; at 10 px on 1x the globe is a grey ball, and the network glyph is a globe too."* Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Issue claims that did not hold

- **#787** holds as filed (the dashed square at 10 px on 1x), and its Decision section supersedes its four options. Its "Pickup: no arc" line predates this lane.
- **The lane brief's "a picture of Settings where both draw"**: no screen draws both. `network-edit` draws only in Settings → Networks → Edit network, at 18 px, and no Settings screen draws a balance mark ([recon.md § The network glyph](recon.md#the-network-glyph)). Phase 2 shows the two side by side from their real screens instead (D4).

## Outcome & Quality Bar

For a person reading their balances on Home, a token page and Send. Excellent: (1) every private mark is the solid shield and every public mark the globe, at the sizes they draw today (12 px on Home and the token page, 10 px on Send), with no layout shift; (2) the glossary says what the screen shows, so "Marked with a shield." and "Marked with a globe." are true on every surface, and no comment or test title in the tree still names a square. Good enough: the 10 px globe on a 1x screen is a grey ball, as the owner accepted.

## Assumptions

- **F1** The two rows are `glyph-sources.ts:29,31`; `gen:glyphs` writes `glyphs.ts` from them and `glyphs.drift.test.ts` fails on any hand edit.
- **F2** Both icons exist in the installed `@tabler/icons@3.49.0` and pass the parser: `filled/shield` is one filled path, `world` five stroked paths (recon run). So the marks keep their paint classes and `Icon.test.ts:35-41` still holds.
- **F3** The glossary sentences live at `utils/glossary.ts:15,20` and are pinned word for word at `utils/glossary.test.ts:6,11` and `popup/pages/settings/glossary.test.ts:40,44`. The new ones are 42 and 67 characters (cap 100).
- **F4** The marks draw at seven sites, sizes unchanged ([recon.md § Where the marks draw](recon.md#where-the-marks-draw)); `Icon.vue` sets the box from `size`, so a new path changes no layout.
- **F5** The Tabler notices record is whole-package at 3.49.0 (`third-party-notices/src/policy.ts:331-338`) and is appended unconditionally; a new icon name at that release changes no notice. The drift test and the reviewed rows establish the paths' provenance.
- **F6** No e2e reads a mark's shape; the type-roles sweeps measure typography and overflow, not glyphs (recon search trail).
- **F7** The glossary's balance entries render only in Settings → Glossary: no `DottedTerm` takes `private-balance` or `public-balance`. The token page's tooltips use their own labels (`BalanceView.vue:53-54`, "Private balance: only you can see it"), which name no shape and stay as they are.
- **I1** The 12 px shield and globe read apart on a 1x screen as they did on the shots-787 mockups (`p52-787-rows-j-1x`); phase 2's pictures confirm it on the real build.
- **Asks**: none. The pick and both sentences are the owner's (P52-02 J and the lane brief's record).

## Architecture & Implementation

- **The drawing (D1).** Two rows in `glyph-sources.ts`, then `bun run --cwd packages/design gen:glyphs`. Only the `private` and `public` entries of `glyphs.ts` change. Their row comments state the metaphor only.
- **The words (D2).** The two glossary sentences, and every test title or comment that names a square for these marks, move to role words ("the private mark", "the public mark") so the next redraw cannot stale them: `publish-facts.ts:116`, `publish-facts.test.ts:92`, `TokenCard.test.ts:344`, `BalanceView.vue:321`.
- **The neighbour pin (D3).** `Icon.test.ts:35-41` already refuses a mark equal to the padlock; it also refuses one equal to `network-edit`, the glyph the owner named.
- **Pictures (D4).** The shots-787 capture path, without its `Icon.vue` switch. A scratch spec (`zz-icons-2-shots.test.ts`, kept in `~/.cache/nulo-backlog/icons-2/`, copied into `apps/extension/tests/e2e/network/` only for a capture run and removed right after, so lint and typecheck never see it) captures five bands (Home token rows, the token page breakdown, the fee row, the publish strip, the review rows) at 1x and 2x in both themes, in the private-to-private Send state shots-787 used. Bands are picked by CSS selectors, with no `eval`.
  - **The mark check, per band, before any shot:** it finds the `svg`s inside the band's own containers and requires exact counts by role (Home rows and the token page: one private and one public per row; the fee row: one public; the strip and the review rows: as `publishGlyph` gives for that state). Each `svg`'s full `path[d]` list, `width`/`height` (12 or 10) and paint attributes must equal the expected table: `glyphs.ts` of the checked-out tree, read by the spec from source, never from the page. The "after" run also requires that no mark equals the base table (saved as JSON by the "before" run), so a stale build fails.
  - **Settled before each shot:** the spec drops shots-787's swallowed waits (`.catch(() => undefined)`) and fails unless `document.getAnimations()` holds no running animation after the theme switch; no timeout is raised.
  - **Raw captures** go to `~/.cache/nulo-backlog/icons-2/raw/<sha>/`, one directory per build, each with an exact 28-file inventory: the five bands, Settings → Networks → Edit network (the 18 px `network-edit`) and Settings → Glossary (the two sentences); two scales; two themes. "Before" runs on the arc base before any code change, "after" on the arc head. Composed pictures say BEFORE or AFTER, never MOCKUP.
- **Alternative not taken.** Hand-editing `glyphs.ts` (the drift test refuses it; the lane brief forbids it). Keeping the old test titles (false text in the tree).

### Decision ledger

- **D1** Generator row (chosen) vs a hand-written path. Settled by the drift test and the brief.
- **D2** Role words in four test titles and comments (chosen) vs leaving them (false) vs naming the new shapes (stale at the next redraw). `publish-facts.ts` is also consent-display-1 arc 3's and send-fees-ux arc 2's file; the change is one comment line at `:116`, away from both lanes' additions ([recon.md § Collisions](recon.md#collisions)), so a merge resolves without judgement.
- **D3** Extend the existing "neither is the padlock" check (chosen) vs a new test vs a row comment. One assertion, same test; the fact has one home, the test, not also the row comment (Opus). It catches only a reuse of `world-pin`, not a visual likeness; the pictures carry that.
- **D4** Real base and head builds (chosen) vs reusing the shots-787 mockups (a switch build, not the shipping one) vs a picture of Settings with both glyphs (no such screen). How they read apart: the public mark draws at 10 to 12 px on balance rows, in the balance's colour, beside an amount; `network-edit` draws at 18 px, once, in the Edit network popup's header row, and its pin and cut circle mark it as a place, not a balance.

## Security & Adversarial Considerations

- **Threat model:** no trust boundary moves. The glyph table is static data from an exact-pinned devDependency, drawn by Vue attribute binding; the parser refuses any element or attribute beyond bare paths, so a new icon cannot carry script or a foreign reference.
- **The privacy promise:** a mark must never claim more privacy than a send has. `publishGlyph` decides which mark shows and is unchanged; its test keeps the hidden → private, public/exposed → public, unknown → none pins.
- **Supply chain, least privilege, crypto:** no new dependency, lockfile change, permission, workflow or secret. A compromised Tabler release remains a build-time trust (the parser constrains drawings, not package code); the exact pin, the frozen lockfile and the 7-day gate are unchanged.
- **What a person could misread:** the shield is a common "verified" sign and sits beside every token's private amount, a scam token's too. The owner picked it for its meaning; no lane action.

## Phases

Fast gate `F`: `bun run lint && bun run typecheck:all && bun run test`. Pass: each exits 0. A phase is ✓ only when its gate passes; each logs to `lessons/phase-N.md`. Host rule: run a build or e2e only while `cut -d' ' -f1 /proc/loadavg` is below 150, read in the launching command.

1. **Before pictures**, on the arc base before any code change. Write the D4 spec from the shots-787 one, copy it in, run `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_RETRY=0 SHOTS_DIR=~/.cache/nulo-backlog/icons-2/raw/$(git rev-parse --short HEAD) bun run e2e:agent tests/e2e/network/zz-icons-2-shots.test.ts`, then remove it. Gate: the run exits 0; every band's mark check passes against the base table; the directory holds exactly the 28 files; `git status` shows no spec.
2. **The marks and the words.** Change: `packages/design/src/core/glyph-sources.ts`, `glyphs.ts` (generated), `Icon.test.ts`; `apps/extension/src/utils/glossary.ts`, `utils/glossary.test.ts`, `popup/pages/settings/glossary.test.ts`; the four titles and comments of D2. Tests: the four glossary pins read the new sentences; `Icon.test.ts` refuses a mark equal to the padlock or to `network-edit` (control, once and logged: set the `public` row to `world-pin`, run `gen:glyphs`, see the test fail, revert the row and regenerate). UI impact: the private mark on Home's token row, the token page, the publish strip and the review rows, filled square → filled shield; the public mark on those and on the fee row's "NAMES YOUR ADDRESS" tag, dashed square → globe. Sign-off, P52-02 J: *"Filled shield and world: Shield beside a globe, the strongest meaning; at 10 px on 1x the globe is a grey ball, and the network glyph is a globe too."* UI impact: the glossary page (Settings → Glossary, its only surface for these two entries, F7), "Only you can see it. Marked with a solid square." → "Only you can see it. Marked with a shield."; "Anyone can see it, like a balance on Ethereum. Marked with a dotted square." → "Anyone can see it, like a balance on Ethereum. Marked with a globe." Sign-off: the same pick, recorded in the lane brief as the owner's sentences. Gate: `bun run --cwd packages/design gen:glyphs` leaves `git diff -- packages/design/src/core/glyphs.ts` touching only the two entries; `bun run --cwd packages/design test`; `F`; `bun run test:all`. Pass: all exit 0; `git grep -n -i -E "solid square|dotted square|two squares|square, dashed|fence you can see" -- apps packages` prints nothing.
3. **After pictures and the full gates**, in this order, each after the last (they share `dist/chrome`). (a) Phase 1's command on the head, into its own `raw/<sha>/`; the check also refuses the base table. (b) Compose with `compose.ts`'s nearest-neighbour method, from the two named directories, into `implementations-plan/icons-2/screenshots/` (PNG): per theme, the five bands before and after at 1x (enlarged 2×) and 2x, and Settings (Edit network and Glossary) before and after. (c) `bun run audit:vue` (its build runs the notices policy). (d) `bun run --cwd apps/extension build-storybook`. (e) The armed smoke build, `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`, then `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/type-roles.test.ts tests/e2e/tooltips-glossary.test.ts --retry=0`. (f) `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_RETRY=0 NULO_E2E_PROVERLESS=1 bun run e2e:agent tests/e2e/network/type-roles-windows.test.ts` (proverless, as CI's shards run it). (g) `bun run check:plans` after staging. Pass: all exit 0 at retry 0; `git status` shows no scratch spec; `git diff origin/dev -- packages/third-party-notices` is empty. Firefox twins are not run locally: nothing touches fixtures, focus, windows, activation or WebAuthn, and CI's required Firefox smoke lane runs on the PR.

No e2e scenario is added or changed; the PR states that, with the smoke and network suite wall-clock unchanged by construction.

## Delivery

- **Arc 1**, branch `icons-2-a1` off `origin/dev` carrying the plan commit, phases 1-3: `feat(design): the private and public marks become a shield and a globe` (70 chars). Body: what changed and why, the pick quoted by id and text (never the page's name), the pictures (committed PNGs, linked by commit permalink), the validation runs, "no e2e scenario added", `Closes #787`. Opened without labels; add `e2e:extension-smoke` only if the path filter skips smoke.
- **Files held:** `packages/design/src/core/{glyph-sources.ts,glyphs.ts,Icon.test.ts}`, `utils/glossary.ts` and its two tests, one comment line each in `publish-facts.ts` and `BalanceView.vue`, one title each in `publish-facts.test.ts` and `TokenCard.test.ts`. Nothing of `FeeSettingsCard.vue`, `FeeMethodSelector.vue` (send-fees-ux), Holdings or the fee window (p42-followups-1), the execute window or the strip's text (consent-display-1), or onboarding (onboarding-3).
- `code_review: off`. Merge `origin/dev` before the PR opens and run `bun run check:plans` after every dev merge.
- **Close-out** as the PR's final commits: Outcome, lessons (none expected), `git mv` into `archive/` in its own commit. Open items to file: none expected. Outside this lane: landing-explainer-1's clip 01 picture column still names the squares (recon); the report names it for the orchestrator.

## Post-implementation

Steps 2-5 of [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `767789b7`, with these values: reviewer `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; one loop over the arc's diff from `dev`, after phase 3 is green and before the PR opens; one Opus diff review (`general-purpose`) beside the first round; hard stop at three rounds, then report. The orchestrator approves design growth except persistence, permissions, public contracts, background work and scope, which go to the owner. The orchestrator merges. Slug `icons-2`, trunk `dev`; teardown `agent-worktree done icons-2 --merged` once `implementations-plan/archive/icons-2/plan.md` is on `dev`.

## Audit verdicts

**Round 1 (2026-10-18).** Codex (gpt-6.1-sol, high, session `01a1506a-…`): `conditional approve` (glossary surface claims; independent, nonempty D4 checks; separate base and head captures; no swallowed readiness wait). Opus Plan leg: `conditional approve` (scratch spec out of the tree during the fast gate; armed smoke build; nonzero per-band counts; the tooltip claim; `type-roles-windows` proverless). Both verified F1-F6 against the tree. Dispositions (C = Codex, O = Opus):

- **Adopted.** The "two dotted-term tooltips" do not exist: the glossary page is the only surface, and the token page's own tooltip labels stay (C1, O-D; F7). D4's check reads the expected table from source, requires exact counts by role per band, compares full path lists, sizes and paint, and the "after" run refuses the base table (C2, O-C). Raw captures go to one directory per build SHA with an exact 28-file inventory (C3). The shots-787 spec's swallowed waits are dropped and each shot needs no running animation (C4). The spec stays outside the tree except during a capture run, and picks bands by selector with no `eval` (O-A: the repo's Biome reports `noGlobalEval` on the copied spec). The smoke gate gets the armed build and its run flags (O-B: `global-setup-smoke.ts` refuses an unarmed `dist/chrome`, and `audit:vue` writes a plain one). `type-roles-windows` runs proverless, as CI's shards do (O-E). D3's fact lives in the test only; its control goes through a row and `gen:glyphs` (O). F5 and F6 reworded (C). AFTER labels, not MOCKUP; `square, dashed` in the phase 2 grep (O).
**Round 2 (resume, 2026-10-18).** Codex: `approve`. It verified each condition at the plan level and found no regression: the armed smoke flags match `global-setup-smoke.ts`, `type-roles-windows` belongs to CI's proverless pool, and the ordered phase 3 keeps the runs off one another's `dist/chrome`.

- **Not this lane's.** #627 (the store captures predate Home's fixed hero): the regenerated captures will show the new marks; nothing to add here (O). landing-explainer-1's clip 01 picture column names the squares (recon); the report names it for the orchestrator.

## Seeds

Recommended: `/goal`. Use exactly one per session.

```
/goal implementations-plan/icons-2/plan.md phases 1-3 are ✓, each backed by its validation gate's output in the transcript; LESSONS_FILE=implementations-plan/icons-2/lessons/phase-N.md printed per phase; code_review is off and /code-review was not run; the Codex loop converged (a resumed pass with no new material finding, quoted); the arc's PR exists against dev, opened after that loop (gh pr view output); bun run test and bun run lint exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/icons-2 forward per its plan.md: reality check (plan, lessons, git status, the PR's checks), then the next pending phase with its gate, Codex for decisions (gpt-6.1-sol, high), the loop before any PR, stop at 5 failures on one step, never merge.
```
