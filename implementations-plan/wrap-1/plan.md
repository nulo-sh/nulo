---
plan: wrap-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex audit (gpt-6.1-sol, high) and its resume; one Opus Plan leg
base: origin/dev at a4da1f36f
trunk: dev
issues: "#1276 (arc 1 closes)"
post_implementation_hardening: not scheduled
status: approved (final Codex pass)
---

# wrap-1: a long name stays inside the restore texts

One arc, one PR against `dev` (§ Delivery). Recon and measurements: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## The issue, checked (#1276)

**Demonstrated** (recon § Measured).

- **Initial conditions:** a person gives a network a one-word name the field accepts, up to 25 characters (`AztecSequencerTestnetEU01`, or 25 `W`s). A restore then leaves that network unrestored.
- **Events:** Home shows the reminder. Restore again shows its intro. Restoring the same backup fails again and shows the warning, and Retry fails again and shows its line. Each text interpolates the name through `joinNames` (`restore-warning.ts:102-105`) into a box with no wrapping rule.
- **Invariant broken:** a text stays inside its box.
- **Consequence:** the window clips the name. At 240 px (Firefox's sidebar) the realistic name runs 26 px past the banner and 66 px past the warning. 25 `W`s run 85 px past the warning and 45 px past the banner even at 360 px, and the rest of each line of the warning is lost too ("didn't answer in time, s").

Claims that did not hold:
1. **"A full backup holds a network whose name…":** a backup carries no network rows. The restore reseeds the built-in networks (`full-backup-restore.ts:231-264`). A backup does put another name in the warning: a held imported account's, cleaned to 32 letters, digits, spaces and `-._` (`:355-357,644`; `utils/string.ts:49-51`). D1 contains it.
2. **"Roughly 50 or more characters":** 25 is enough.
3. **The onboarding failed-Retry line** (`onboarding/pages/import.vue:224-232`) and the popup import's (`popup/pages/import.vue:314`) name only seeds, 13 characters at most. Measured, they fit, so both stay as they are. Restore again's own failed-Retry line, which the issue does not name, carries typed names and overflows (D4).

## Outcome & Quality Bar

- **Excellent**: every character of a long name is inside its box and readable: Home's reminder; Restore again's intro, warning and failed-Retry line; the import warning's held-account names. This holds at 360 and 240 px, in Chrome (capture) and in Firefox (SE1 checks the banner and the intro). Text with ordinary names renders as today (same lines, same heights).
- **Good enough**: a name breaks at the box's edge, not at a pretty place. No wording changes.

## Assumptions

**Facts** (verified at `a4da1f36f`; citations in recon)
1. A network name in these texts is a seed or a name the person typed (fields capped at 25, `sanitize`). The services accept any length, but only same-extension contexts reach them (`isTrustedInternalSender`, `packages/extension-messaging/src/background/service.ts:46`). A backup reaches the warning only through a held account's name, capped at 32 by `sentenceName`.
2. The boxes:
   - `ImportFullBackupForm.vue:103-117` (`.warning_block`: the "WARNING" tag with `flex-shrink: 0`, then a `Text`, in a row `Flex`). It shows `restoreWarningText`, `restoreAgainFailedText` and the held-account sentence.
   - `RestoreOutcomeBanner.vue:94`: a `Text` inside the description of `@nulo/design`'s `Banner`, in nested flex items.
   - `restore-again.vue:132-136` (intro) and `:174-182` (failed-Retry line).
3. Measured with the trial (D1-D3, built and reverted): `overflow-wrap: anywhere` in those boxes contains every name at both widths, and the seed controls keep their lines and heights to the pixel.
4. `anywhere`, unlike `break-word`, lowers a flex item's min-content width (CSS Text 3 § overflow-wrap). With it, `min-width: 0` is redundant (measured).
5. jsdom applies no module CSS. `source-scan.ts` reads an SFC's rules; `TokenCard.test.ts:414-433` ties a rule to the element under a testid. SE1 (`restore-outcome.test.ts:154-219`) runs `expectFitsNarrow` at 240 px on the banner and on Restore again; it fails on text more than 1 px past its box (`fixtures/type-roles.ts:519-533`).
6. The owner's pick on #1232 (decision page 89, P89-01 = A, signed 2026-10-28) is to wrap inside the box. It was chosen over (b), shortening names, which the ask said "would cover these places too".

**Inferences**: I1. In these four layouts, `anywhere` changes only lines that overflow today; the seed controls confirm it. The rule stays off the banner's buttons and column: a button label could otherwise break mid-word at 240 px. I2. The sanitizer admits letters wider than `W` (U+FDF2, U+FDFA). `anywhere` breaks between any two glyphs, so they also stay inside, on more lines. `w25` is a wide Latin fixture, not a bound.

**Asks**: none for the owner. The lane brief applies P89-01 = A to these texts, and the measured wrapped forms read cleanly (recon), so shortening is not the honest fix. The panel's dissent on sign-off is in § UI impact.

## Decisions

- **D1. `.warning_block` gains `overflow-wrap: anywhere`.** The block is the box, and it holds only the tag and the sentence. One rule covers the warning on all three pages that render the form, for network and held-account names. The tag keeps its width (`flex-shrink: 0`; measured).
- **D2. The banner's reminder `Text` gains `.reminder` (the rule) and `data-testid="restore-outcome-reminder"`.** The rule stays off the column and out of `@nulo/design`'s `Banner` (I1).
- **D3. Restore again: one `.names` class (the rule) on the intro `Text` and on the failed-Retry `Text`.** It is one rule for the page's two name texts. Rejected: the page root, since the layout and the form's controls would inherit it.
- **D4. Restore again's failed-Retry line is in scope.** It is the issue's "failed-Retry line" text, `retryResultText`, and the one instance a typed name reaches.
- **D5. Out of scope:**
  - a global or design-package rule, which would let unrelated flex rows break mid-word;
  - a name cap, since the field caps names at 25 and a backup carries no network names;
  - other places a typed name shows: Settings → full backup's added-networks banner and the capabilities window's chain banner. They are plausible but unmeasured; one `ux` issue is filed at close-out after deduping.
- **D6. Tests:**
  - One scan case per changed place (four), red on the base copy: the element under its testid binds the class, and the class declares `overflow-wrap: anywhere`.
  - Where the mount runs the real text builder, a control feeds a long name and reads it whole under that testid. In the form, that is a 25-`W` network and a 32-`W` held account (extending the case at `:183-196`); in the banner, a 25-`W` network. `restore-again.test.ts` stays scan-only: its `Text` stub renders no slot, and its texts are mocked refs.
  - **SE1 renames Testnet to `"W".repeat(25)`** through the real field, replacing "Old Testnet" in its reads. Its existing 240 px checks then guard the banner and the intro in a real layout on both browsers: red on the base build, green after. No scenario is added; the file's wall-clock is reported before and after.

## Architecture & Implementation

| File | Change |
|---|---|
| `apps/extension/src/components/composite/import/ImportFullBackupForm.vue` | `.warning_block`: `overflow-wrap: anywhere;` and a one-line why (Fact 4) |
| `apps/extension/src/popup/components/modules/general/RestoreOutcomeBanner.vue` | reminder `Text`: `:class="$style.reminder"`, `data-testid="restore-outcome-reminder"`; `.reminder` rule with its why |
| `apps/extension/src/popup/pages/restore-again.vue` | intro and failed-Retry `Text`: `:class="$style.names"`; `.names` rule |
| the three colocated `*.test.ts` | D6's cases |
| `apps/extension/tests/e2e/restore-outcome.test.ts` | SE1's rename target and its reads (D6) |
| `implementations-plan/wrap-1/screenshots/` | before/after of the four places, `w25` at 240 px, light (8 PNG) |

The flow and the copy are unchanged; only line breaking inside four boxes changes. Simpler alternative: no change. Rejected because the warning is clipped at the popup's own width.

## Security & Adversarial Considerations

- **Trust boundary:** a backup file is hostile input. Its held-account name (≤ 32 cleaned characters) reaches the warning through Vue interpolation (no `v-html`). Today a crafted name can push the warning's guidance ("Add the network with chain ID …") out of view. With D1 every character stays inside the box. Network names cannot come from a backup, and no dApp or content script reaches the network service (Fact 1).
- Nothing changes a permission, a log line, storage, a message or a dependency. Known limits: none.

## Phase 1: the rules and their tests ✓

Assumptions: Facts 1-6. Take each red from the base copy (`git show a4da1f36f:<path>`), never `HEAD`.
1. Add D6's cases and SE1's change, then commit (the extension build is still base). Run the cases against the base copies: red. Build Chrome armed (gate 2's command) and run SE1: red at its 240 px checks. Record SE1's wall-clock before on both browsers with the base copy of the file, on base builds.
2. Make the D1-D3 changes: the cases go green. Commit.
3. Run the gate. Then run the scratch capture (`~/.cache/nulo-backlog/wrap-1/capture/`, copied into `apps/extension/tests/e2e/` for the run only and removed after) on the armed Chrome build with `WRAP_NAMES=seed,w25,real25`. Add a `held32` row: the held sentence, written into the real warning's text node. Building the real held-account path needs an imported key on an unserved chain, and no smoke helper builds one. Copy the eight pictures into `screenshots/` (befores from recon's base run).

**Gate**, from the repository root, each command in its own subshell, in this order (`audit:vue` leaves an unarmed `dist/chrome`):
1. `(cd apps/extension && bun --bun vitest run src/components/composite/import/ImportFullBackupForm src/popup/components/modules/general/RestoreOutcomeBanner src/popup/pages/restore-again)`; `bun run audit:vue`; `bun run test:all`.
2. `(cd apps/extension && VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:chrome)`, then `(cd apps/extension && env -u EXTENSION_PATH NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/restore-outcome.test.ts tests/e2e/import-errors-scroll.test.ts --retry=0)`.
3. The same with `build:firefox` and `NULO_E2E_BROWSER=firefox`.
4. The capture.

Pass criteria:
- Every command exits 0.
- D6's cases and SE1 are red at step 1 and green after.
- In the capture, every place is `≤0` at 360 and 240 px for `w25` and `real25`, the warning is `≤0` for `held32` (a synthetic sentence in the real box, labelled so in the PR), and the `seed` rows match recon's lines and heights.

## UI impact

- **Home's reminder; Restore again's intro, warning and failed-Retry line; the popup and onboarding import warning when it names a long held account:** a name wider than its box breaks at the box's edge and stays readable (pictures `1276-before-*` → `1276-after-*`). Ordinary text renders as today.
- **Sign-off basis:** P89-01 = A (decision page 89, "wrap", signed 2026-10-28), chosen over shortening, which its ask said would cover these texts. The lane brief rules that this pick covers these texts and that no further sign-off is needed. The Opus leg dissents: P89-01 named the notice card, and CLAUDE.md asks for an owner message naming each surface. Resolution: the PR body quotes P89-01 and the ask's (a)/(b) text and carries the pictures, and nothing merges without the orchestrator's word. A veto there means changing nothing, since no copy changes.

## Delivery

- Single arc. Branch `wrap-1-a1` off this plan's commit on `worktree-wrap-1`. The close-out commits come after the Codex loop, then one ready PR, base `dev`, so CI runs once: `gh pr create --base dev --title "fix(restore): a long name wraps inside the restore texts"` (56 characters). No label at creation; the path filter trips both e2e lanes.
- Body:
  - what changed and why, and the claims that did not hold;
  - the sign-off basis;
  - the pictures as `?raw=true` links to `implementations-plan/archive/wrap-1/screenshots/` at the head SHA;
  - the measured widths;
  - the runs with their outcomes, and SE1's wall-clock per browser before and after;
  - `Closes #1276`;
  - ending `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Commits: conventional, lower case, signed, ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `a4da1f36f`. Specific here:
- Step 1 is absent (`code_review: off`).
- Step 2 runs once over `git diff origin/dev...HEAD` after Phase 1: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`. One Opus 5.5 diff review (`general-purpose`) runs beside round 1. Prompts under `~/.cache/nulo-backlog/wrap-1/`. Hard stop at three rounds; each round goes in `lessons/phase-1.md` and the table below.
- Approval boundary (a plan change; stop): any copy change, a shortened name, a rule in `@nulo/design` or on a page root, a new e2e scenario.
- Close-out, before the PR opens:
  - the Outcome (Status: "delivered in the PR that carries this close-out");
  - D5's issue, filed after deduping;
  - lessons promoted within the 8 KiB budget;
  - `STATUS.md` deleted;
  - `git mv` into `archive/`, with the index line moved.

  Teardown after the merge: `agent-worktree done wrap-1 --merged`, trunk `dev`; the archived plan is `implementations-plan/archive/wrap-1/plan.md`.

## Audit verdicts

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| plan 1 | Codex, gpt-6.1-sol (session 01a18d49) | conditional approve | held-account names from a backup reach the warning (Claim 1, Fact 1, Security, UI impact; D6's held control; `held32` capture row); "widest" and "three lines" scoped (I2); I1 scoped to these layouts; SE1 as the real-layout guard (D6) | none |
| plan 1 | Opus 5.5 (Plan) | conditional approve | the held-account path (as Codex); the caller guard cited (`isTrustedInternalSender`); `restoreAgainFailedText` named in Fact 2; recon's file count corrected (18 extension files); SE1 as the guard; restore-again cases scan-only; Firefox in the bar only through SE1; pictures linked at their archive path; the Outcome without a PR number | a new owner ask for these surfaces: the lane brief rules P89-01 covers them, so the dissent is recorded under § UI impact and the PR body carries the basis; dropping the mount controls in the form and the banner: they run the real text builder and tie the scanned element to the name |
| plan 2 | Codex, resumed | conditional approve | recon's leftover "widest" removed; `held32` checked in the warning only, labelled synthetic; both Opus rejections endorsed (the lane brief supplies the sign-off scope; the mount controls cover wiring) | none |
| plan 3 | Codex, resumed | **approve** | both corrections verified; no remaining finding | none |

Plan status: **approved** by the final Codex pass. Over the 150-line target by about ten lines because of the held-account path the audit added and the three-round audit table.

## Seeds

```
/goal Phase 1 of implementations-plan/wrap-1/plan.md marked ✓ with its gate passing in the transcript; the Codex loop (gpt-6.1-sol, high) converged; one ready PR against dev closing #1276 with its before/after pictures; bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/wrap-1 per its plan.md and the README § Post-implementation standard at a4da1f36f: run the gate, decide open questions with Codex (gpt-6.1-sol, high), open the PR, never merge, never change copy; stop once its checks are green and report.
```
