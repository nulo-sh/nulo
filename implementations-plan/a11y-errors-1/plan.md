---
plan: a11y-errors-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev @ 2f591ddd
standard: implementations-plan/README.md § Post-implementation standard, read at 2f591ddd
---

# a11y-errors-1: error text in an AA red

One issue, one arc, one PR against `dev` (D-orch-1, no stack). Recon and the inventory: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (two, neither on a surface this arc touches).

| Arc | Issue | Branch | PR line |
|---|---|---|---|
| 1 | #874 | `a11y-errors-1-a1` off `origin/dev`, carrying this plan | `Closes #874` |

**The decision**, the orchestrator's on #874 under the owner's delegation ("for accessibility questions / rings, etc. decide yourself"): "Move every error text from `--red` to `--txt-danger` in one change, so all field errors keep one colour; `--red` stays for icons and fills. A test pins that no `Text` renders an error in `--red`."

## Outcome & Quality Bar

- **For whom**: a person on the light theme who misreads a password or a phrase and must read why; the next contributor who adds a field error.
- **Excellent**: (1) every error and refusal text reads at least 4.5:1 in both themes: read in Chrome on the real text wherever the smoke build shows it, and on every background the sources put it on through the token gate; (2) a new text in `--red`, through a `color` prop, a class, a style or a stylesheet, fails `bun run test` with the file and the text named, and the message says to use `txt-danger`.
- **Good enough**: icons, fills and borders keep `--red`; text outside the decision waits for the owner (OA-1, OA-2).

## Assumptions

**Facts** (at `2f591ddd`; detail in [recon.md](recon.md)):
- F1 `--txt-danger` and the `txt-danger` colour name exist; `<Text color>` renders `color--<name>` (`packages/design/src/core/Text.vue:47`), and `Icon` paints with the same classes (`Icon.vue:37`), so `textColors.red` cannot move without recolouring every red icon (18 static, 2 bound, and the glyphs of `FieldWarning` and `ProcessingErrorNote`).
- F2 Nineteen error and refusal texts in 14 files render in `--red`: 7 by `<Text color="red">`, 12 by a stylesheet (recon rows 1-19). The issue's "23 `color="red"` text sites" does not hold: 25 attributes, 7 on `Text`.
- F3 `--txt-danger` is gated at 4.5:1 on `--app-bg`, `--nulo-surface-low` and `--nulo-surface-high` in both themes (`theme-contrast.test.ts` § status text); dark on `--nulo-surface-high` is exactly 4.50:1. It is 3.89:1 dark on `--nulo-surface-highest`. Row 10 sits in the window footer, `--nulo-surface` (`popup/windows/window-shell.module.css:19-24`): 6.54:1 light, 5.82:1 dark, not yet in the gate.
- F4 `source-scan.ts` gives a guard the files, the template AST, the parsed stylesheets and resolved nested selectors; `copy-dash-ban.test.ts` has the reviewed-list shape (`{ file, text, why }`, exact, stale fails) and an explicit `POLICY`.
- F5 No test asserts red on any moved text (recon § Tests).
- F6 The hero "Delete Profile" is 40 px (`CollapsingHeroLayout.vue:176`): large text, AA 3:1; `--red` is 3.56:1 on the light page.
- F7 The import form's warning chip already pairs a text-token label with a raw-colour border (`ImportFullBackupForm.vue:204-207`: `--txt-warning`, `--yellow`); a `--red` border is 3.56:1 on the light page, above the 3:1 non-text minimum.

**Inferences**: I1 No moved text sits on `--nulo-surface-highest`, a tinted box or a translucent layer (source reading; Phase 4 reads it where smoke reaches). I2 Changing a colour value breaks no e2e selector (they select by testid).

**Asks**: none for this arc. OA-1 and OA-2 are outside the decision and outside this arc's surfaces.

## Architecture & Implementation

Values only: each site's `red` becomes `txt-danger`; a source guard keeps it so. No new token, colour name, component, prop or dependency. The guard lands before the change, so its red run is the untouched tree (D11).

### Phase 1: Inventory ✓ (at plan time)

- Recon rows 1-19 move; the two kept texts and every icon, fill and border stay (recon). At the arc base, re-run `git grep -n 'color="red"' -- 'apps/extension/src/*.vue'` and `git grep -n -- '--red' -- apps/extension/src packages/design/src`. Fold any new text site into Phase 3; if #870's line has merged, it is one (D10).
- **Gate**: the counts equal recon's (25 attributes; the stylesheet list), or the delta is added to recon and Phase 3.

### Phase 2: The guard ✓

- New `apps/extension/src/utils/red-text-ban.test.ts` (D3, D4), with its own `POLICY`: roots `SCAN_ROOTS`, extensions `vue css scss`, skipping `TEST_FILE`, `STORY_FILE`, `DECLARATION` and `EXEMPT` (the generated `utilities.css` holds `.color--red` itself). A finding is `{ file, text }`, whitespace collapsed:
  - Template, on an element whose `componentName(tag)` is not `Icon` or `ProcessingErrorNote` (their `color` paints a glyph only): `color="red"`, or a bound `color` whose expression holds the string literal `red`; a static `class` or a bound `class` expression naming `color--red`; a static `style` or a bound `style` expression with a `color` key (not `-color`, not `…Color`) naming `var(--red`. Text: the attribute as written, prefixed by its tag, e.g. `<Text :color="tone ? 'red' : 'body'">`.
  - Stylesheet: a `color` declaration whose value holds `var(--red`, or a `composes` naming `color--red`. Text: `<resolved selector> { <property>: <value> }`.
  - `REVIEWED: { file, text, why }[]`, matched as a multiset; an unmatched entry fails as stale. An unmatched finding fails with a message that starts "error and refusal text is `txt-danger`" and adds that an entry is only for large text, a glyph or a recorded decision. Five entries: the hero ("large text: AA asks 3:1"), `tokens/[id].vue`'s hover span ("a destructive row's hover label, not an error; its colour awaits an owner decision"), the three `… svg` rules ("a glyph"). No plan id in a `why`.
  - The header states the blind spots: a `v-bind` spread, a colour chosen in script (`:color="tone"`), a custom property aliasing `--red`, a wrapper forwarding `color` under another prop name, a `.ts` render function.
- `ProcessingErrorNote.test.ts`: the exemption rests on its text staying `secondary`, which the test does not pin (its `Text` stub drops `color`). Give the stub a `data-color`; assert that with `color: "red"` the title and the tooltip text stay `secondary`.
- Self-tests on snippets through `parseSource(name, source)`, one finding each: a static `Text` prop; a ternary `:color`; `AddressDisplay color="red"` (a forwarding wrapper); `class="color--red"`; `:style="{ color: 'var(--red)' }"`; a flat rule; a nested `&:hover span` rule. No finding (controls): `Icon color="red"`; `ProcessingErrorNote color="red"`; `Text color="txt-danger"`; `background: var(--red)`; `border-color: var(--red)`; `:style="{ borderColor: 'var(--red)' }"`. A stale entry is reported.
- **Gate**: lint; typecheck; `cd apps/extension && bun run test -- src/utils/red-text-ban.test.ts src/components/composite/ProcessingErrorNote.test.ts`. Pass: the self-tests and the `ProcessingErrorNote` test green; the tree test red with exactly 19 open findings, one per recon row (row 11 once), and none stale. Log the run in `lessons/phase-2.md`.

### Phase 3: The change ✓

- The 7 `T` rows: `color="red"` → `color="txt-danger"`. The 12 `C` rows: `color: var(--red)` → `color: var(--txt-danger)`. Borders, icons and the rest of each rule stay.
- `theme-contrast.test.ts` § status text: add `--nulo-surface` (popup cards, window footers) to the `--txt-danger` pairs, both themes (F3).
- `FormPopup.stories.ts:107`: the sample error's `var(--red)` → `var(--txt-danger)` (D7).
- `packages/design/README.md` § Tokens, one paragraph: error and refusal text is `txt-danger`; `red` paints glyphs, fills and borders; `red-text-ban.test.ts` refuses red text. `CLAUDE.md` § UI changes, one bullet after the em-dash one: the same rule and the test.
- **Gate**: `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run --cwd packages/design test -- src/theme-contrast.test.ts`. Pass: exit 0 each (the guard green); `git diff --stat` against Phase 2's commit touches only the 14 files of recon rows 1-19, the contrast test, the story, the README and `CLAUDE.md`.

### Phase 4: Pictures, contrast in the browser, full gate ✓

- Scratch spec `zz-a11y-errors-1.test.ts`, kept under `~/.cache/nulo-backlog/a11y-errors-1/`, copied into `apps/extension/tests/e2e/` for each run only and deleted before lint and commit. Helpers as `shots-p61`'s (theme flip, settle); flows from the specs recon names.
- Contrast (D5), light and dark, on the head build: for each site the smoke build shows (rows 1-6 and 9, 11's "Wrong password", 12, 13; 7 if its second step is reachable), read the error element's computed `color` and its background: ancestors' `background-color` blended until opaque. If an ancestor on that path has a `background-image` or an `opacity` under 1, mark the site unmeasured. The other rows (8, 10, 11's torn refusal, 14-19) need a failure or a network that smoke lacks: list each with the background token its sources set, and check that `theme-contrast.test.ts` gates `--txt-danger` on it. Read the hero too (≥ 3:1).
- Pictures (Chrome, 360x600, DPR 1, light and dark), on the arc-base build and the head build: the lock screen's "Wrong password", change password's "Wrong current password", the account import's error. Commit the 12 PNGs to `implementations-plan/a11y-errors-1/screenshots/`.
- **Gate**: `cat /proc/loadavg` reads a 1-minute load under 150 before each build or run; build the armed Chrome bundle (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`) at the arc base, run the spec (`cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/zz-a11y-errors-1.test.ts --retry=0`), then the same at the head. Pass: exit 0; every head reading ≥ 4.5:1 (the hero ≥ 3:1); every listed row's background token gated; the table in `STATUS.md`; `git status --porcelain apps/extension/tests/e2e` empty before the commit. A reading under 4.5:1 or an unmeasured site with no gated token stops the arc: record it and ask.
- Full gate on the final head: `bun run audit:vue`; `bun run test:all`; `bun run check:plans` after staging. Pass: exit 0 each.

## Security & Adversarial Considerations

No trust boundary moves: no dApp input, storage, message, permission, log line or dependency. Error copy, which errors show, and each text's role, testid and visibility stay as they are. The guard reads repository sources only. Its one weakness is its reviewed list: a contributor can silence it with an entry, so the failure message says what an entry is for, and review reads each `why`.

## UI impact

The lane's whole visible budget, the orchestrator's record on #874: every error and refusal text changes colour, darker on the light theme (#f03c3c → #b3261e) and slightly lighter on dark (→ #ff534b): recon rows 1-19. Nothing else changes. Disclosed: the import forms' "Error" chip keeps its `--red` border around the darker label, as the warning chip beside it already pairs `--txt-warning` with `--yellow` (F7).

## Decision ledger

| Id | Decision | Rejected | Why |
|---|---|---|---|
| D1 | Sites move to the existing `txt-danger` | retarget `textColors.red`; a new `danger` name | F1: the class also paints every red icon; the name exists |
| D2 | Non-text red stays, the chip borders included | move the borders; ask | the decision keeps `--red` for non-text; F7's precedent and 3:1 non-text contrast; both reviewers agree it is inside the decision |
| D3 | A separate guard on `source-scan.ts`, deny by default, its own `POLICY` | a rule in `type-role-ban.test.ts`; a `Text` prop validator; narrowing `Text`'s `color` type; the typography default policy | that guard is 1044 lines on another concern; a validator only warns and misses stylesheets; `vue-tsc` skips SFCs without `lang="ts"` (lessons.md); typography's skips must not narrow this one |
| D4 | It refuses all text in `--red`, with reviewed entries | refuse only "error" text | a scanner cannot read meaning, and any small text in `--red` fails AA on light |
| D5 | Read in Chrome on the real text where smoke shows it; every other row by its sources' background token, gated | probes at rest; a route root; a network run | a probe proves the token, not the element (Codex); the verify refusal sits in a footer, not on the root (F3); one network run for a colour is out of proportion when each background is a gated token |
| D6 | No shared `ErrorText`, no merge of the four `.error_text` rules | dedupe now | their margins differ; a merge is a layout change outside the budget |
| D7 | The Storybook sample moves too | leave it | it documents the pattern a contributor copies |
| D8 | One arc, one PR | two | one issue, about 60 changed lines |
| D9 | The hero stays `--red` | move it | large text; 3.56:1 ≥ 3:1 (F6) |
| D10 | Red text on open PRs: listed in this PR's body and the report, for the orchestrator's merge order | trusting the guard to fail the other branch | `dev` does not require an up-to-date branch, so an already green PR merged after this one turns `dev` red (Opus) |
| D11 | The guard lands before the change | the brief's order (change, then guard) | its red run is then the untouched tree; restoring base copies over uncommitted edits could lose work (Codex) |

## Audit verdicts

**Round 1.** Codex (gpt-6.1-sol, high, session `01a155b6`): `conditional approve (with conditions: cover ordinary template styling, make contrast evidence match the claimed gate, and correct the red-proof procedure)`. Opus 5.5 Plan: `conditional approve (with conditions: fix D10's merge-order claim; extend the template arm to bound :style)`. C = Codex, O = Opus; all accepted unless marked:
- C1/O2 the guard missed `class="color--red"` and a bound `:style` (precedent: `settings/developer/account-state/senders/index.vue:119`, on an `Icon`) → both arms, plus `composes`, with controls for `border-color` and `borderColor` (O5).
- C2 probes, a route root or tokens do not prove a site "measured in Chrome"; the verify refusal sits on the footer's `--nulo-surface` → D5: real text where smoke shows it, gated tokens otherwise, said so in criterion (1); the footer pair added. O6 an ancestor `background-image` or `opacity` marks a site unmeasured; base-build readings dropped; a clean `tests/e2e` before commit.
- C3/O4 14 files, not 15; restoring base copies could drop uncommitted edits → D11 (guard first). O4 F1's icon count and the Security wording on `role="alert"` (rows 14, 15, 17-19 have none) corrected.
- O1 D10 rewritten. O3 no plan id in a `why`; OA-1 and OA-2 are filed as `owner-decision` issues at close-out if still open. O5 explicit `POLICY`. O7 `lessons/phase-0.md` written; blind spots extended.
- Both: inventory complete and classified right; the chip border inside the decision (D2).

**Round 2** (Codex, resumed, verification): `approve`, no new finding; it recomputed the footer pair (6.54:1, 5.82:1).

**Post-implementation** (diff `origin/dev...a11y-errors-1-a1`). Round 1: Codex (gpt-6.1-sol, high, session `01a155e3`) `findings: 2`; Opus 5.5 diff review beside it `findings: 4`. All taken:
- Codex 1 / Opus 1: a conditional or mixed inline colour (`{ color: bad ? 'var(--red)' : 'inherit' }`, `color-mix(…var(--red)…)`) passed the guard → the style check reads each top-level part's whole `color` value; self-tests for both, and controls for a static `border-color` and a fill beside another colour.
- Opus 2: a bound `color` comparing a tone (`tone === 'red' ? 'txt-danger' : 'body'`) was flagged → a literal beside `===` or `!==` is not a colour; control added.
- Opus 3: the README said `txt-danger` reads 4.5:1 everywhere; it does not on `--nulo-surface-highest` (3.89:1 dark) → it names the gated surfaces and the exception.
- Codex 2 / Opus 4: comments: two helper docs restated their code (deleted); `REVIEWED`'s and the footer pair's comments corrected.

Round 2 (Codex, resumed): `findings: 1`, Medium, demonstrated: the per-part match flagged a fill or border beside a white `color` inside a style array or parentheses → each `color` value is now cut at the first `,`, `;` or closing bracket at its own depth; an array's red colour hits, an array's red fill and a parenthesised red border do not.

## Delivery

- PR title: ``fix(ui): error and refusal text in `--txt-danger`, aa on the light theme`` (73 characters). Opened ready, no label; add `e2e:extension-smoke` only if the path filter skipped smoke.
- Body: a Sign-off section quoting the decision and the owner's delegation; the inventory and the issue claim that did not hold; the contrast table; the 12 pictures by blob URL at the commit that adds them; the gates with outcomes; no e2e scenario added; `Closes #874`.
- Before opening the PR and again before the report: list open PRs whose diff adds red text (`gh pr diff <n>` for each open PR, lines added with `color="red"` on a non-icon or `var(--red)` on a `color`). Name each in the PR body and the report (D10): it needs the one-token change and a `dev` merge before it merges after this one; lane ui-picks-1 (#870) is known.
- Collisions: #743 (onboarding: rows 1-5) and the connect-window lead (row 10) take a one-token change each.

## Post-implementation

The standard is `implementations-plan/README.md` § Post-implementation standard at `2f591ddd`. Plan-specific values:
- Step 1 is absent (`code_review: off`).
- Step 2 once, after Phase 4, over `git diff origin/dev...a11y-errors-1-a1`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh` until a round has no material finding; hard stop at three. One Opus 5.5 diff review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1.
- Step 3: one PR against `dev`, then `gh pr checks <n> --watch`.
- Step 4 as this PR's final commits: merge `origin/dev`, read `index.md` and `lessons.md`; the Outcome; OA-1 and OA-2 filed as `owner-decision` issues if the owner has not answered (dedupe first); the lessons pass; `STATUS.md` deleted; `git mv` into `archive/` in its own commit; the index line moved; `bun run check:plans` green.
- Step 5 after the merge: `agent-worktree done a11y-errors-1 --merged`, once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/a11y-errors-1/plan.md` succeeds.

## Seeds

`/goal` (recommended): `implementations-plan/a11y-errors-1/plan.md is done: Phases 1-4 marked ✓, each backed by its gate reported passing in the transcript; LESSONS_FILE=implementations-plan/a11y-errors-1/lessons/phase-N.md printed per phase; the Codex loop converged on the arc's diff, quoted; the PR exists against dev, opened after the loop, with the close-out's archive commit on it; bun run test and bun run lint exit 0.`

`/loop 15m Drive implementations-plan/a11y-errors-1 per its plan.md (read it and lessons/ first; plan.md is the state). Take the next unchecked step, run the fast gates after each edit, commit signed. Decide open questions with Codex (gpt-6.1-sol high) and log each consult. After Phase 4, run the Post-implementation loop, open the PR against dev, watch checks, report and stop. Never merge.`
