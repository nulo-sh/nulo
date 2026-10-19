---
plan: copy-polish-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: 993b3efc
trunk: dev
post_implementation_hardening: not scheduled
status: completed 2026-10-19; delivered in #853
---

## Outcome

- **Date:** 2026-10-19.
- **Status:** completed. #853 closes #803 and #746; its merge into `dev` closes the plan.
- **Shipped:** the failed token preview reads "Couldn't resolve token metadata" over "Reject this request and ask the app to add the token again." (P54-01 B), left-aligned; it and the opaque authorization warning left the card's label and value row for its full-width block, and the row aligns only its direct last child right (computed `start` on Chrome and Firefox; every other row unchanged). The restore warning offers "…, or import it again from its account file." (P55-05 B), in both numbers. Pictures in `screenshots/`.
- **Owner asks:** none. `Closes #746` follows the lane's instruction, with the conflict flagged in #853 and on #746 (D6).
- **Dropped:** none.
- **Known limits:** none. #744 stays closed; its wording ships (D5).
- **Open items:** #850 (the loading row, D4).
- **Lessons:** none promoted; the host-load timeouts and the held-account picture method are in [lessons/phase-3.md](lessons/phase-3.md).
- **Seeds retired:** the `/goal` and `/loop` seeds below.

# copy-polish-1: the failed token preview's warning, the restore warning's clause

One arc, one PR against `dev`: #803 (P54-01 B, and the left alignment the owner asked for, fixed at its cause) and #746 (P55-05 B, the OA-2 clause). Recon: [`recon.md`](recon.md). Owner asks: [`OWNER-ASKS.md`](OWNER-ASKS.md) (none). Consults: [`lessons/phase-0.md`](lessons/phase-0.md).

## Outcome & Quality Bar

- **For whom**: a person whose dApp asked to add a token the wallet cannot read, and a person who restored a backup whose imported account waits for a network.
- **Excellent**: each warning reads as signed, left-aligned line by line, in both themes and both browsers; the fix is the layout rule, so every warning that shared the cause is fixed with it and the rows beside it do not move; the pictures show it.
- **Good enough**: no other copy, no other row's layout, no new e2e scenario.

## Assumptions

**Facts** (at 993b3efc; `recon.md` has the citations)
1. The failed preview is a `.prop` column (`OperationCard.vue:504-510`); `.prop`'s descendant `:last-child { text-align: right }` (`:744-746`) right-aligns its second line. The archived consent-display-1 picture shows it.
2. The opaque authwit warning (`:637-641`) is the only child of a `.prop` row, so the same rule right-aligns it; at 400 px it wraps. No other warning sits under a `.prop`.
3. `.group` (`:685-688`) is the `.prop` box (full width, 12 px top) without the value column. Under a `.prop`, only the nested `.row > :last-child` (`:703-706`, the resolved token's name) declares `text-align`, and it declares `right`.
4. Confirm stays disabled while the token's details are unread (`index.vue:111,660`): #803's premise holds.
5. The held sentence is built once (`restore-warning.ts:27-36`) and rendered by `ImportFullBackupForm.vue:49` on the onboarding and popup restore pages; restore-again passes no held list.
6. The only page that creates an imported account takes an account file (`settings/accounts/import.vue`); a full backup then carries the account on (`AccountService.restore`), so a person who restores may no longer hold the file. The clause is the owner's copy; this plan does not change it.
7. No e2e renders the failed preview or the held sentence. `authwit-variants` and `type-roles-windows` (`:228-233`, with `expectLaidOut`) open the opaque window; `register-token` and `type-roles-windows` open the resolved card. `openPopup` sets 360×600 (`fixtures/wallet-pages.ts:140`).

**Claims that did not hold**: none in #803 or #746. The draft's "no element under a `.prop` sets `text-align`" and "an imported account enters only from a file" were corrected (Codex round 1).

**Inferences**
- I1. Collapsing `.prop`'s descendant rule into `> :last-child` changes no computed alignment today: every label is text only or a `Spinner`; inside each value column nothing declares `text-align` but the nested `.row`, which declares the inherited `right` (traced by the Opus leg). Phase 3 checks it in the browser.
- I2. The plural clause takes the sentence's number, as "to restore them" already does: "… to restore them, or import them again from their account files." The pick adds a clause to the warning, whose every form agrees in number ("was"/"were", "it"/"them", in the plural forms #739's body showed the owner); leaving the plural without it would ship half the pick. Quoted in the PR body under the pick. Codex withdrew its round-1 ask (D7).

**Asks**: none. The loading row (D4) is left as it is and filed as an issue.

## Architecture & Implementation

**File-level change map** (paths under `apps/extension/src/`)
| File | Change | Issue |
|---|---|---|
| `popup/windows/execute/OperationCard.vue` | second sentence → "Reject this request and ask the app to add the token again."; the failed preview and the opaque warning take `.group`, not `.prop`; `.prop`'s two last-child rules become one `> :last-child` rule; the `.prop` and `.group` comments state which takes a block with no label | #803 |
| `popup/windows/execute/OperationCard.test.ts`, `OperationCard.long-strings.test.ts` | D3's pins | #803 |
| `components/composite/import/restore-warning.ts` | `heldAccountsText` adds ", or import it again from its account file" (plural: "them … their account files") | #746 |
| `components/composite/import/restore-warning.test.ts`, `ImportFullBackupForm.test.ts` | the seven exact strings | #746 |

**Decision ledger**
- D1. One arc, one PR, branch `copy-polish-1-a1` cut from this worktree's branch (the plan commit on `origin/dev`), closing #803 and #746 (D6) and carrying the close-out (orchestrator's D-orch-1).
- D2 (#803, the cause). `.prop` is a label and its value; the value column aligns right. The two warnings carry no label, so they belong in `.group`, the card's full-width block. The descendant `:last-child` rule also reaches any depth at (0,2,0), so a nested `Text align="left"` loses to it; one child-combinator rule keeps the value column and lets nested content align itself. The warnings lose `.prop > :last-child`'s `min-width: 0` and `overflow-wrap: anywhere`; both are fixed copy with spaces, and `type-roles-windows` lays the opaque window out in a browser. Rejected: `text-align: left` on the two lines (a patch on elements, which the brief forbids); `.prop > :last-child:not(:first-child)` (fixes the lone opaque line only; the preview is a two-child column and would still move); a new `.note` class (a copy of `.group`).
- D3 (tests). jsdom applies no stylesheet, so the layout pins live in `OperationCard.long-strings.test.ts` and use its helpers: the class each element carries, and the module's rules read with postcss. (a) The failed preview: neither line has a `.prop` ancestor; their block is a `.group`; success control: the contract address value sits in a `.prop`. (b) The opaque warning: no `.prop` ancestor, in a `.group`. (c) `.prop` declares `text-align` only under `> :last-child`; `.group` declares none. (d) `OperationCard.test.ts`: the failed preview reads both sentences, exact. Fixtures are wire-shaped (`0x` and 64 hex digits). All but the control are red on base. No e2e scenario: none renders the preview, and a network scenario for one static rule spends its runtime on what (a) to (c) already catch; the cascade itself is shown by the pictures and a computed `text-align` read on both browsers (Phase 3).
- D4. The loading row ("Loading token metadata…" pushed right by `.prop`'s `space-between`) shares the misuse but is no warning, so moving it is outside the signed budget. Left as it is; filed as a `ux` issue at close-out after a dedupe.
- D5 (#744). The closed known limit's reopening condition names a wording pick; this PR ships that wording, but the account still stays held. Comment on #744 with the PR at close-out; no reopen.
- D6 (#746's close). The spawn brief says `Closes #746`, and the lane brief records OA-1 and OA-3 to OA-7 as shipped in their default form. Both legs object: #746's last comment keeps it open for OA-1 to OA-4, OA-6 and OA-7, so a close settles them without an owner pick. The orchestrator's explicit instruction stands; the PR adds a comment on #746 naming OA-2 as delivered and the rest as shipped in their default form per the lane brief, and the report flags the conflict so the orchestrator can switch to `Refs #746` before merging.
- D7 (the budget). The opaque warning moves with the cause: the brief asks for the cause fixed and every warning sharing it checked, and checking it while leaving it on the rule would keep the cause. I2's plural is the pick's own form. Codex round 1 asked for an owner ask on both and withdrew both in round 2; the Opus leg read both as inside the brief. The pictures go in the PR for the owner.
- D8 (deviations in arc 1). The review loop ran before Phase 3's e2e gates, while host load (load1 above 150) held the builds; the gates then ran on the reviewed head. After them `origin/dev` gained #848 (no file in common): the merged head reran `audit:vue`, `test:all` and `check:plans`, and its e2e run on the PR's CI. The scratch execute spec sets no viewport on Firefox, where it only records alignment.

## Security & Adversarial Considerations

- The token preview's text is a fixed string; the dApp's address renders through `AddressDisplay` as before; Confirm's disabled state is untouched (Fact 4).
- The held sentence still interpolates only the cleaned, capped names and the numeric chain IDs; the clause is a fixed string. No log line, storage, permission, crypto, dependency or CI change.

## Arc 1

### Phase 1: #746, the restore clause ✓

1. Update the seven exact strings first; run them red on base.
2. Edit `heldAccountsText`: `Add ${network} to restore ${it}, or import ${it} again from ${one ? "its account file" : "their account files"}.`

**Gate**: `cd apps/extension && bun --bun vitest run src/components/composite/import`. Pass: exit 0, step 1 red on base. Layers: unit, component.

### Phase 2: #803, the sentence and the layout rule ✓

1. Write D3's pins; run them red on base (the control green).
2. Apply D2 and the new sentence.

**Gate**: `cd apps/extension && bun --bun vitest run src/popup/windows/execute`; root `bun run lint`, `bun run typecheck:all`. Pass: exit 0. Layers: lint, typecheck, unit, component.

### Phase 3: pictures and the arc gate ✓

Warning: load1 must be under 150 before every build and e2e run (`cut -d' ' -f1 /proc/loadavg`). Never commit a scratch spec, and never run two e2e runs in this worktree at once.

1. Pictures, Chrome, light and dark, `NULO_E2E_SHOT_DIR` set, before (`OperationCard.vue` and `restore-warning.ts` from 993b3efc) and after, on the same fixtures. Each scratch spec sets the page to 400×600 (`page.setViewport`) and asserts `innerWidth` 400 and `innerHeight` 600 before a picture (`openPopup` sets 360×600).
   - Execute window: a scratch spec copied into `tests/e2e/network/` for the run asks `registerToken` for an address no contract holds (`register-token-meta-error`), then `createAuthWit` by inner hash (the opaque warning), then a real token (the resolved card). In each window it records the computed `text-align` of every element under a `.prop` (`[class*="_prop_"] *`) and of each warning line. It runs once more on Firefox for the readings.
   - Restore warning: a scratch smoke spec exports a backup, adds one imported account on chain 1337 whose key it seals again for chain 1337 under the file's key (the seal binds the chain), seals the file (`tests/e2e/helpers/backup-seal.ts` writes only the checksum) and restores it, as backup-restore-1's capture did.
   - Pictures go to `screenshots/`; the readings to `lessons/phase-3.md`.
2. From the root: `bun run audit:vue`, `bun run test:all`, `bun run check:plans`.
3. Smoke, per browser `<b>`, warning first: rebuild after `audit:vue`, whose unarmed build the smoke setup refuses. `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:<b>`, then `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 [NULO_E2E_BROWSER=firefox] bun run test:e2e -- tests/e2e/restore-outcome.test.ts tests/e2e/import-errors-scroll.test.ts tests/e2e/backup-imported-account.test.ts --retry=0`.
4. Network, Chrome then Firefox: `NODE_OPTIONS=--dns-result-order=ipv4first [NULO_E2E_BROWSER=firefox] bun run e2e:agent tests/e2e/network/register-token.test.ts tests/e2e/network/authwit-variants.test.ts tests/e2e/network/type-roles-windows.test.ts --retry=0`.

**Gate**: every command exits 0 (one rerun for a known flake); the after pictures show each warning line left-aligned and the resolved card unchanged; each warning line reads `left` (or `start`) on both browsers; every element still under a `.prop` reads the same `text-align` before and after (I1). Layers: lint, typecheck, unit, component, smoke e2e, network e2e.

## UI impact

- **Execute window, failed token preview** (#803): "P54-01 = B, 'Reject this request and ask the app to add the token again.'", owner's note "but please align it to the left? Why is it right-aligned? yikes." (lane brief). Both lines left-aligned. Pictures before and after.
- **Execute window, opaque authorization** (#803's cause): its wrapped line left-aligned, under the brief's "check every other warning that shares the cause". Pictures before and after.
- **Restore warning** (#746 OA-2): "P55-05 = B, 'Add a clause: '... to restore it, or import it again from its account file.''" (lane brief), plural per I2. Pictures before and after.
- No other row moves (I1); the loading row is unchanged (D4).

## Issues

| Issue | Arc | Phase | Closed by |
|---|---|---|---|
| #746 | 1 | 1 | `Closes #746` per the spawn brief (D6): OA-2 ships; OA-1, OA-3, OA-4, OA-6, OA-7 stay in their shipped default form; OA-5 shipped in #805 |
| #803 | 1 | 2 | `Closes #803` |

## Delivery

`copy-polish-1-a1` → `dev`. Title (83 chars): `fix(execute): left-align the failed token preview; restore clause for held accounts`. Body: each change and why; the two picks quoted by id and text with the owner's note, never by page name; I2's plural; the pictures; D2's cause; the validation runs with outcomes; no e2e scenario added, so no suite wall-clock moves; `Closes #803`, `Closes #746`, one per line, with D6's comment posted on #746; ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Merge `origin/dev` first; open it ready, without labels, after the gate and the Codex loop; add `e2e:extension-network` or `e2e:extension-smoke` afterwards only if the path filter skips a suite.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at 993b3efc. Specific to this plan:
- Step 1 is absent (`code_review: off`). Step 2 runs once over `git diff origin/dev...HEAD` after Phase 3: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; prompts under `~/.cache/nulo-backlog/copy-polish-1/`; one Opus review alongside round 1; hard stop at three rounds; rounds in `lessons/phase-3.md` and the table below.
- Approval boundary: any other copy, any other row's layout, a new class beyond D2, or a committed e2e scenario is a plan change and stops for the orchestrator.
- Close-out (this PR's final commits): file D4 after `gh issue list --state all --search "Loading token metadata"`; comment on #744 (D5); Outcome block; `lessons.md` promotes nothing unless a retirement pays for it; `STATUS.md` deleted; `git mv` to `archive/` in its own commit. Teardown: slug `copy-polish-1`, trunk `dev`.

## Audit verdicts

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| 1 | Codex, gpt-6.1-sol | approve with changes | Fact 3 (the nested `.row` rule), Fact 6 (a backup carries an imported account on), Phase 3's 400×600 viewport set and asserted, I1 checked in the browser, wire-shaped fixtures | owner asks for I2's plural and the opaque warning (D7); `Refs #746` (D6: the spawn brief's instruction stands, conflict flagged) |
| 1 | Opus 5.5 lens | approve with changes | I1's trace; Fact 7 (`type-roles-windows` opens the opaque window); the layout pins in `long-strings` beside its postcss helpers; the restore picture re-seals the key for chain 1337; wire-shaped fixtures | `Refs #746` (D6, as above) |
| 2 | Codex, resumed | approve | D6 followed with the conflict flagged; the opaque warning and I2's plural withdrawn as owner asks (inside the brief); round 1's fixes verified | none |
| impl 1 | Codex, gpt-6.1-sol | approve | no finding | none |
| impl 1 | Opus 5.5 review | approve with changes | the CSS comments made exact; the postcss pin walks every `text-align` under `.prop` and gets a `.group` success control; a dead mock dropped | none |
| impl 2 | Codex, resumed | approve with changes | the `.group` comment no longer claims nothing in it aligns right (its nested `.row`s do); the narrating `.prop` comment removed | none |
| impl 3 | Codex, resumed | approve | no finding | none |

## Seeds

```
/goal Arc 1 of implementations-plan/copy-polish-1/plan.md (Phases 1-3) marked ✓, each backed by its gate passing in the transcript; the Codex loop (gpt-6.1-sol, high) converged with a resumed pass quoting no new material finding; one ready PR from copy-polish-1-a1 to dev closing #803 and #746, with before and after pictures in both themes; bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/copy-polish-1 forward per its plan.md and the README § Post-implementation standard at 993b3efc: reality-check plan.md and lessons/, run the next phase's gate, rebuild before every smoke run, retry 0, decide open questions with Codex (gpt-6.1-sol, high), never merge, never widen scope; stop after the PR's checks are green and report.
```
