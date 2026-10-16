---
plan: ui-followups-p18
tier: light (the orchestrator's call; the panel of two still argues each decision)
status: arc 1 done (phases 1-2 green, Codex loop converged, PR open against dev); arc 2 waits on SA-1; SA-2 open
issues: "#363 (arc 1), #451 (arc 1, no code change), #364 (arc 2, after SA-1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); Codex gpt-6.1-sol high + one Opus Plan lens; Codex resumes to verify
base: origin/dev at d59459ab
trunk: dev
post_implementation_hardening: not scheduled
---

# ui-followups-p18: the rest of the outline-grey text, and fresh store art

Two arcs, one PR each against `dev`, no stack. Arc 1 moves every remaining text rule off `--nulo-outline` (#363, page 18 P18-06 = C) and closes #451, whose wording page 17 already signed. Arc 2 regenerates the store captures and art (#364); it commits no image until the owner signs the new set (SA-1). Recon: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Scope

**In:** 28 of the 30 text rules at HEAD (recon.md table); a source sweep that keeps text off the outline tone; one contrast pin; the #451 close; the regenerated store set, committed on SA-1 A; `apps/extension/README.md:62`.
**Out:** DetailsTable's copy glyph and row chevron (icons; P18-06 keeps them); any new tone; #132, #503-#505, #508.

## Outcome & Quality Bar

- **For whom:** anyone reading meta text on a dim screen or with low vision, in either theme; a person deciding to install from a store listing.
- **Excellent:** after arc 1 no rule colours text with `--nulo-outline`, every moved pair is pinned at 4.5:1 or better in both themes, and a new outline text rule fails a test. The listing shows the wallet as it ships, and the committed images are byte-identical to the set the owner signed.
- **Good enough:** colour is proven by source and contrast tests plus screenshots; no e2e reads computed colour.

## Assumptions

**Facts** (recon.md has the citations):
1. HEAD has 30 `color: var(--nulo-outline)` rules in 21 files: the option-C shot build (`2d929086`, 38 rules) minus #495's eight.
2. P18-06's signed text: option B is "20 text rules; the build in the shots also moved two icons (the connect window's copy glyph and row chevron, 22 rules), which keep --nulo-outline unless your note says otherwise", and C is "B plus every other outline text rule (16 more ...); after it no text uses --nulo-outline". The decision on #363 carries no owner note. So 28 move and the two icons stay.
3. Every moved rule paints on `--app-bg`, `--nulo-surface`, `--nulo-surface-low` or `--nulo-surface-high`, where `--nulo-secondary` is pinned in both themes (lowest 4.58:1, light pressed row). One exception: the log viewer's filter `Input` sits in a `Popover` on `--dropdown-bg` (5.77 light, 5.52 dark), which no pair pins. A template walk of every `Input` and `SearchField` call site found no other fill, and none on `--nulo-surface-highest`, where secondary reads under 4.5:1.
4. `source-scan.ts` walks `apps/extension/src` and `packages/design/src` for `type-role-ban.test.ts` and parses `.vue` style blocks and CSS with postcss; `sourceFiles()` leaves out `base.css` and `utilities.css` (`EXEMPT`); `resolveSelector()` flattens nested rules.
5. Page 17 P17-01 = A signs the shipped #451 wording; `useLockWallet.test.ts:408-430` pins all three cases.
6. `store-captures.test.ts` and `store-art.ts` overwrite the tracked images in place, and a rerun changes addresses and hashes. The promo tile takes no capture (`store-art.ts:70-75`).

**Inferences:**
- I1. The capture tool runs green at arc 2's base. #351 repaired it on 2026-10-13; about 20 commits have touched its fixtures since, and nothing has run it. Phase 3 proves or refutes it.

**Asks:** SA-1 (OWNER-ASKS.md). No other open owner question: arc 1's whole visible change is P18-06's signed text.

## Architecture & Implementation

- **#363.** Change `color: var(--nulo-outline)` to `color: var(--nulo-secondary)` in the 28 rules recon.md lists. No token, selector or markup changes.
- **Guard.** One test in `src/utils/a11y-css.test.ts`'s existing describe. It parses the `.vue`, `.css` and `.scss` files of `sourceFiles()`, plus `base.css` and `utilities.css`, and collects every `color` declaration matching `/var\(\s*--nulo-outline\s*[,)]/` as a `file resolveSelector(rule)` key. It expects exactly the two DetailsTable icon keys; the equality is its own success control (a parser that read nothing fails). One comment line names what it cannot see: template `style`/`:style` bindings and script strings (none today). The `source-scan.ts` header lists the new reader. The seven-row table and `SectionLabel.test.ts:34` stay.
- **Pin.** `theme-contrast.test.ts` gains `--nulo-secondary` on `--dropdown-bg` in its both-themes table.
- **#451.** No change. Arc 1's PR says `Closes #451` with the decision and the test lines.
- **#364.** Capture, keep the new set in scratch in the store's layout, restore the tree, compose old | new in scratch, ask (SA-1) with the 11 hashes. On A, copy back and check the hashes recorded in SA-1.
- **Not taken:** 28 more table rows (it mirrors the edit and misses the next rule); a ban with no icon allowance (moves two icons P18-06 keeps); re-running the capture after the signature (other bytes than signed); a committed composite tool (one use).

## Security & Adversarial Considerations

No trust boundary, input, storage or permission moves; arc 1 is CSS and tests. The store images enter the `git archive` source zip AMO reviewers receive: the frames show only a sandbox wallet (throwaway keys, pinned balances); phase 3 looks for a recovery phrase or a home path in all 11, and the commit gate refuses a stray file. The hashes live in SA-1, not beside the files, so a later write to the shared scratch directory fails the check. The composite script runs with `bun --no-install` and resolves the repo's locked Puppeteer, so it never fetches past the lockfile and the age gate. No dependency changes.

## Arc 1 (#363, #451)

Fast gate `F`: `bun run lint && bun run typecheck:all && bun run test && bun run --cwd packages/design test`. Pass: each exits 0.

### Phase 1: the 28 rules, the guard and the pin (done)
- Change: the 21 files in recon.md; `src/utils/a11y-css.test.ts`; `apps/extension/scripts/type-roles/source-scan.ts` (header only); `packages/design/src/theme-contrast.test.ts`.
- Add the sweep first. Run it: it fails and lists 30 keys. Edit the 28 rules. Run it again: it passes.
- UI impact: P18-06 C, "B plus every other outline text rule (16 more: placeholders, the Presto step numbers, the incoming card's hash, the loading line, the glossary, connected apps, the notes viewer); after it no text uses --nulo-outline." Surfaces: the tx and received detail pages; every dApp window's identity strip (connect, discover, network-unavailable, execute, verify) and Settings → Networks; the connect window's Details; empty states; search and input placeholders; Proving in Settings and onboarding; Glossary; Connected apps; Developer → Notes and authwits; register's terms line; Home's stalled line.
- Gate: `F`. `git grep -n -E "^\s*color:\s*var\(--nulo-outline\)" -- apps packages` prints only the two DetailsTable icon lines.

### Phase 2: arc gate (done)
- Run `bun run test:all`, `bun run test:ci-gating` and `bun run check:plans`.
- Wait for `load1 < 60` or 23:00Z. Then, per browser `B` (`chrome`, then `firefox`), build the armed bundle: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:B`.
- Run the full smoke suite: `cd apps/extension && NULO_E2E_BROWSER=B NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- --retry=0`.
- A red test: rerun it once on this branch. If it is red again and looks environmental, run it on the base SHA. Otherwise fix the cause.
- Pass: all green at retry 0, or a red the base SHA also shows, recorded in `lessons/phase-2.md` and filed as an issue. No e2e scenario is added.
- Screenshots come after this gate and the arc's Codex loop, before `gh pr create`. Take them in both themes on Chrome, from throwaway untracked specs that you delete before commit. Smoke specs go in `tests/e2e/_shot-*.test.ts`: the tx detail page with the fee breakdown open, Contacts empty, Glossary, Connected apps empty, Proving, Send's empty recipient field. The connect window's spec goes in `tests/e2e/network/_shot-*.test.ts` and runs through `e2e:agent`.
- Commit the PNGs under `apps/extension/pr-screens/`. Link them by commit SHA in the PR body. Delete them in the next commit.

## Arc 2 (#364), after arc 1 merges

Scratch `S` = `~/.cache/nulo-backlog/ui-followups-p18/store-art`.

### Phase 3: the regenerated set and SA-1
1. Run `git fetch origin dev`. Then run `git switch -c ui-followups-p18-store-art origin/dev`.
2. Prove arc 1 is in the base: the phase 1 grep prints only the two icon lines. Record the SHA.
3. Copy `apps/extension/store/` (`captures/*.png` and `*.png`) to `S/old/`, keeping its layout.
4. Wait for `load1 < 60` or 23:00Z. Run `STORE_CAPTURES=1 NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/store-captures.test.ts`.
5. Run `cd apps/extension && bun scripts/store-art.ts`.
6. Copy the 11 PNGs to `S/new/`, keeping the layout. In `apps/extension/store`, run `sha256sum captures/*.png *.png > S/SHA256SUMS`.
7. Run `git restore apps/extension/store`.
8. Look at all 11 new PNGs for a recovery phrase or a home path.
9. Compose one old | new PNG per listing image (six) into `S/compare/`. Use a script in `~/.cache/nulo-backlog/ui-followups-p18/scr/`, run as `bun --no-install <script> <worktree>`, that resolves Puppeteer from `apps/extension`.
10. In SA-1, fill the side-by-side line with the paths and paste the 11 hashes. Report `LEAD_BLOCKED: SA-1`.
- Gate: steps 4 and 5 exit 0 at retry 0; 11 files at 720×1200, 1280×800 or 440×280; `git status --short apps/extension/store` prints nothing.
- A red capture run: find the cause and fix it, never with a raised timeout or a retry. A fix in `tests/e2e/fixtures/**` runs every network spec that imports the changed export, at retry 0, on both browsers. Three failures on one step end the arc with `ARC_FAILED`.

### Phase 4: on SA-1
- On A: copy `S/new/` into `apps/extension/store/`. In `apps/extension/store`, run `sha256sum -c` against the hashes SA-1 records.
- On either answer: fix `apps/extension/README.md:62` to `screenshot-{1..5}`. Keep any phase-3 spec fix.
- Gate on A: `sha256sum -c` prints 11 OKs; `git status --short apps/extension/store` lists only paths among those 11 (the promo tile may be unchanged) and no `??`.
- Gate on B: `git status --short apps/extension/store` prints nothing.
- Gate on both: `bun run lint` and `bun run check:plans` exit 0.
- On B: comment on #364 with the answer and close it as not planned; the Outcome carries the disposition.
- Either way the close-out commits follow (Post-implementation).

## Delivery

Arc 1: branch `worktree-ui-followups-p18`, `gh pr create` against `dev` after phase 2, its Codex loop and the screenshots. Title (67): `fix(ui): move the remaining outline-grey text to the secondary tone`. Body: the change and why, the UI impact line with the screenshots, the validation runs, `Closes #363`, `Closes #451` (P17-01 A, the shipped wording, pinned by `useLockWallet.test.ts:408-430`, no code change), and `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
Arc 2: branch `ui-followups-p18-store-art`, after SA-1. Title (59) on A: `chore(store): regenerate the store captures and listing art`; on B: `docs(store): close ui-followups-p18 and fix the store-art readme`. Body: SA-1's answer, the composites, the `sha256sum -c` output, `Closes #364` on A.
Both open without labels.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at revision d59459ab, per arc (each arc is its own PR):
- Step 1 is absent (`code_review: off`).
- Step 2: one loop per arc over that arc's diff from its base, after its last gate. `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh`; log rounds in `lessons/phase-2.md` and `lessons/phase-4.md`. Hard stop at three rounds. No cross-arc pass: the arcs are separate PRs, and arc 2 changes only images, one README line, any capture-spec fix and plan files.
- Step 3: the Delivery above, then `gh pr checks <n> --watch`.
- Step 4: the close-out is arc 2's final commits.
- Step 5: after arc 2 merges, `agent-worktree done ui-followups-p18 --merged`.

## Decision ledger

| # | Question | Chosen | Rejected, and why |
|---|---|---|---|
| D1 | Which rules move | the 28 text rules; the two icons stay | all 30, as the shot build and the orchestrator's "38 rules" count: P18-06's text keeps icons without an owner note |
| D2 | Guard | one sweep, exact two-key allowance, `base.css` and `utilities.css` included | 28 more table rows; a ban without the allowance |
| D3 | Where #451 closes | arc 1's PR, no code | arc 2 (the lane brief's default): it would wait on SA-1 for no reason |
| D4 | What arc 2 commits | the signed bytes, checked against hashes recorded in SA-1 | a fresh run after the signature; hashes kept beside the files |
| D5 | The composite | a scratch script, `--no-install`, the repo's Puppeteer | a committed tool; a scratch import that lets Bun fetch Puppeteer |
| D6 | SA-1 B | close #364 as not planned; the README fix ships anyway | leave #364 open (an open item with no plan) |
| D7 | Local Firefox smoke | run it, as the lane brief requires | CI only (Opus #10): the brief names both browsers |
| D8 | The sweep's rule lookup (implementation deviation) | `enclosingRule` in `source-scan.ts` takes any postcss child, so the sweep keys a declaration by it | a copy of its ancestor loop in the test; the plan's "header only" edit |
| D9 | When arc 1's Codex loop runs (deviation) | round 1 alongside the smoke e2e, in the host's load window | strictly after the e2e gate: the diff is CSS and a test, and a red e2e that needs a fix resumes the loop with it |

## Audit verdicts

**Round 1, Codex** (gpt-6.1-sol, high, session 01a1418d): conditional approve. Accepted: #2 fetch before branching (phase 3 steps 1-2); #3 the connect shot spec under `network/`; #4 the `Input` caller trace, which found `--dropdown-bg` (Fact 3, the pin); #5 the sweep covers `base.css` and `utilities.css` and uses `resolveSelector`; #6 SA-1 states the B path. Rejected: #1, "`-- --retry=0` keeps two retries": Bun 1.4.2 consumes the `--` (reproduced, lessons/phase-0.md).
**Round 1, Opus Plan:** conditional approve. Accepted: #1 the store layout and an exact `git status` gate; #2 hashes recorded in SA-1; #3 `--no-install` and the repo's Puppeteer (D5); #4 as Codex #2, plus the grep proof; #5 a spec fix ships on either answer, with its network runs; #6 B closes #364, the README fix on either answer (D6); #7 the UI impact surfaces; #8 the cross-arc line; #9 the exact regex, the blind-spot comment, the scanner header; #10 the flake rule and screenshots after the loop; #11 the title length, SA-1's 11 files and the promo tile; #12 split steps. Rejected: #10's skip of local Firefox (D7).
**Round 2, Codex** (resume): conditional approve; withdrew round 1's #1. Accepted: #1 phase 4's gate split by answer (the promo tile may not change); #2 SA-1 states B's consequences; #3 screenshots after the gate and the loop, before the PR.
**Round 3, Codex** (resume): approve; no new material finding.

**Arc 1, Codex** (gpt-6.1-sol, high, session 01a141b2; [lessons/phase-2.md](lessons/phase-2.md)): r1 conditional: case-insensitive `color` and a one-sentence `source-scan.ts` header accepted; the fee row's hover fade (3.51:1 light while hovered) verified but pre-existing and visible, so OWNER-ASKS SA-2. r2 conditional: one low over-match rejected (fails closed on a token nobody defines). r3 approve.
**Arc 1, Opus diff review:** no bugs; three low points accepted (the token regex in any case, the alias blind spot named, a coverage check on both roots).

## Seeds

- `/goal`: Implement implementations-plan/ui-followups-p18/plan.md arc 1 (phases 1-2), its Codex loop and its PR; then arc 2 phase 3, stopping at SA-1.
- `/loop`: Read STATUS.md and the open PR's checks; advance the next unmet gate of plan.md; never commit a store image before SA-1 is answered.
