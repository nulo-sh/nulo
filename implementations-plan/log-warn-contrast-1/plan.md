---
plan: log-warn-contrast-1
tier: light
status: planned, Codex approve
issues: "#887 (arc 1 closes)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev @ 24399338
standard: implementations-plan/README.md § Post-implementation standard, read at 24399338
---

# log-warn-contrast-1: the log viewer's WARN lines in an AA amber

One issue, one arc, one PR against `dev` (D-orch-1, no stack). Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none).

| Arc | Issue | Branch | PR line |
|---|---|---|---|
| 1 | #887 | `log-warn-contrast-1-a1` off `origin/dev`, carrying this plan | `Closes #887` |

**The decision**, the orchestrator's on #887 ([comment](https://github.com/nulo-sh/nulo/issues/887#issuecomment-6278848235)) under the owner's delegation ("for accessibility questions / rings, etc. decide yourself"): "the log viewer's WARN lines take `--txt-warning`, as its ERROR lines took `--txt-danger` in #878. The lane measures the pair on the log viewer's own surface in both themes (at least 4.5:1), pins it in the contrast gate, and attaches before and after pictures, light and dark. Nothing else on the viewer changes."

## Outcome & Quality Bar

- **For whom**: a person on the light theme who reads or copies the logs window's WARN lines into a bug report; the next contributor who changes `--txt-warning` or the line's tint.
- **Excellent**: (1) every WARN line reads at least 4.5:1 on its own tint in both themes, read in Chrome on the rendered text; (2) a later token change that drops either theme's WARN pair under 4.5:1 fails `bun run test:all`, with the theme named.
- **Good enough**: dark keeps its WARN colour (A1); selected text keeps the viewer's selection highlight (K1); the other levels, the layout and the copy stay as they are.

## Assumptions

**Facts** (at `24399338`; detail in [recon.md](recon.md)):
- F1 The issue's numbers hold (`theme-contrast.ts`'s `contrast`): light `--log-warn-color` #c38700 on `--log-warn-background` #fff8e1 is 2.91:1; `--txt-warning` (#7f6200, `base.css:163`) on that tint is 5.42:1; dark #a99d5e on #3a2a0f is 5.05:1. The issue's "#880" and the brief's "#878" agree: #878 shipped the ERROR change and closed #880.
- F2 `.log-line-warn` (`creator.js:283-286`) is the only reader of both WARN tokens. The JSON viewer's theme has no log rule. No literal copy of the WARN values exists outside `base.css`; the dark #a99d5e is also `--json-property-name` (`base.css:197`).
- F3 The log tokens are hand-authored in `base.css`, outside the generated token contract, so no generated file or drift pin moves. `base.css.test.ts:24` pins the file's sha256, and its comment lists the deliberate choices the hash holds, the ERROR line's included.
- F4 `theme-contrast.test.ts` § status text gates the ERROR pair on its tint in both themes (`:239-243`). Nothing gates the WARN pair.
- F5 The level class is a mark span inside `.cm-line` (`logs-decoration.ts:24`), and its background is opaque. So `.cm-activeLine`'s 5% white, set on the line behind the span, does not reach the text's backdrop. Selected text is another case: the viewer's `::selection` (`editor-shadow.css:33`) paints `--nulo-surface-highest`, 4.09:1 under the light shade (K1).
- F6 No open PR touches a file this arc changes (recon § Open work). #849 (lane viewer-flake-1) works on `viewers-csp.test.ts` and `LogsViewer.vue`; no file is shared.

**Inferences**: I1 The light change is the record's whole visible budget (A1). I2 A colour value moves no e2e selector, since every selector is a testid or a `cm-` class.

**Asks**: A1 Does "take `--txt-warning`" cover the dark theme too? Settled: no (D1; the panel split, § Audit verdicts). The call adopts the issue's option A, whose text reads "The light `--log-warn-color` takes `--txt-warning` … Dark stays as it is", and "nothing else on the viewer changes". Dark passes today at 5.05:1. In dark, `--txt-warning` is `--yellow` (#e6c525): a brighter line, 8.15:1, a visible change outside the record. So the arc changes light only, gates both themes, and the PR body states this reading (D1).

## Architecture & Implementation

Values only: one token value, one gate loop, one re-pinned hash. No new token, colour name, component, dependency or e2e scenario. The light block's `--log-warn-color` refers to `--txt-warning`, so the AA warning shade has one source. That is the ERROR line's shape (#878, its D12). The gate lands first, so its red run reads the untouched tree.

### Phase 1: The gate

- `packages/design/src/theme-contrast.test.ts` § status text: the ERROR loop iterates a literal two-row table of `[level, colour token, tint token]`, the ERROR row and the WARN row, so a `grep log-warn` still finds the gate. Each theme gates both pairs. Keep the ERROR test names as they are (`a log viewer's ERROR line on its tint`); the WARN twins read `a log viewer's WARN line on its tint` (D2).
- **Gate**: `bun run --cwd packages/design test -- src/theme-contrast.test.ts`. Pass: exactly one failure, `light: a log viewer's WARN line on its tint >= 4.5:1` (2.91); the dark WARN test and both ERROR tests pass. Record the run in `lessons/phase-1.md`. Layers: unit.

### Phase 2: Pictures and readings before the change

- Write the scratch spec `zz-log-warn-contrast-1.test.ts` under `~/.cache/nulo-backlog/log-warn-contrast-1/`. Copy it into `apps/extension/tests/e2e/` for each run only, and delete it after the run. Adapt the a11y-errors-1 spec (recon § Reuse map):
  - Use the `registeredExtension` fixture and the suite's own timeout, as `viewers-csp.test.ts` does. Open `#/windows/logger` at 900x700.
  - Log, with a nonce, an INFO, a WARN, an ERROR and a second WARN line.
  - Wait for two `.log-line-warn` spans that hold the nonce. Blur the editor. Keep the search panel closed and select nothing: the reading is unselected text on the WARN tint (K1).
  - For each theme: read every text element of those spans. Take its computed `color`, and blend its backdrop from the span's and its ancestors' `background-color`, across the shadow host, until opaque. Check every ancestor up to the root, past the first opaque one: a `background-image` or an `opacity` under 1 marks the reading unmeasured.
  - Take one screenshot per theme.
- **Warning**: check `cat /proc/loadavg` before each build or run. Wait until the 1-minute load is under 150.
- Build the armed Chrome bundle: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`.
- Run the spec with `WARN_PHASE=before`: `cd apps/extension && WARN_PHASE=before NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/zz-log-warn-contrast-1.test.ts --retry=0`.
- **Gate**: exit 0. Pass: light reads 2.91:1 and dark 5.05:1 (± 0.01) on every WARN span, none unmeasured; `git status --porcelain apps/extension/tests/e2e` is empty; two PNGs in `implementations-plan/log-warn-contrast-1/screenshots/` (`logs-warn-lines-before-{light,dark}.png`); the readings in `STATUS.md`. A reading off F1 stops the arc: record it, then re-plan the gate. Layers: e2e (scratch).

### Phase 3: The change

- `packages/design/src/base.css:187`, the `[theme="light"]` block: `--log-warn-color: #c38700;` becomes `--log-warn-color: var(--txt-warning);`. The dark block (`:203`) stays.
- `packages/design/src/base.css.test.ts`: append to the comment's ERROR clause, "and the light `--log-warn-color` is `--txt-warning`, AA on its tint". Then set the new hash from a run of the test.
- **Gate**: `bun run --cwd packages/design test`; `bun run lint`; `bun run typecheck:all`. Pass: exit 0 each; the Phase 1 test is green in both themes. `git diff --stat origin/dev...HEAD` shows code changes only in `base.css`, `base.css.test.ts` and `theme-contrast.test.ts`. Layers: lint, typecheck, unit.

### Phase 4: Pictures after, the touched viewer's smoke, full gate

- Build again (as Phase 2), then run the spec with `WARN_PHASE=after`. Then run `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/viewers-csp.test.ts --retry=0`.
- **Gate** (spec): exit 0. Pass: every WARN span reads 5.42:1 light at `rgb(127, 98, 0)` and 5.05:1 dark at `rgb(169, 157, 94)` (± 0.01), the dark reading the same as Phase 2's; two PNGs `logs-warn-lines-after-{light,dark}.png`; the before and after table in `STATUS.md`; `git status --porcelain apps/extension/tests/e2e` is empty. A head reading under 4.5:1 stops the arc: record it and report.
- **Gate** (smoke): `viewers-csp.test.ts` exits 0 on Chrome. No Firefox twin: the change touches no fixture, focus, window, activation or WebAuthn path.
- **Gate** (full, on the final head): `bun run audit:vue`; `bun run test:all`; `bun run check:plans` after staging. Pass: exit 0 each. Layers: lint, typecheck, unit, component, build, e2e smoke.

## Security & Adversarial Considerations

No trust boundary moves: no dApp input, storage, message, permission, log content, redaction or dependency. Which lines show, their text, order and testids stay. The one risk is a regression in a later edit: a token change that drops a WARN line under AA fails the gate (criterion 2), and an edit to `base.css` fails the hash pin until a person re-pins it.

## UI impact

The lane's whole visible budget, the orchestrator's record on #887 (quoted above): in the logs window on the light theme, each WARN line's text turns from #c38700 to #7f6200 (darker amber) on the same #fff8e1 tint. Dark WARN lines, every other level, the layout and the copy stay as they are (A1). Pictures: Phase 2 and Phase 4.

## Decision ledger

| Id | Decision | Rejected | Why |
|---|---|---|---|
| D1 | Light `--log-warn-color: var(--txt-warning)`; dark keeps #a99d5e; both themes gated; no owner ask | both themes `var(--txt-warning)`, as the ERROR line; the light hex copied; A1 as an owner ask | A1: the issue's option A says dark stays, dark passes, and its change is visible outside the record; light only cannot exceed the call; `var()` keeps one source, as #878's D12 |
| D2 | One loop over a literal two-row table in the existing ERROR block | names built from the level; a separate WARN `describe`; a `--txt-warning` identity pin | literal names keep the gate greppable; one pair per level and theme is the whole contract; ERROR has no identity pin, and the hash pin holds the value |
| D3 | No README change | a WARN clause in `packages/design/README.md` | that paragraph is the error-text rule; `base.css:162` already says the status text shades are AA |
| D4 | No committed e2e scenario; a scratch spec gives the readings and pictures | a committed colour spec | the unit gate proves the token pair; a spec would add runtime to prove a value the gate holds |
| D5 | One arc, one PR, the gate first | the change first | its red run is then the untouched tree (#878's D11) |
| D6 | Selected text stays outside the arc: K1, a closed `known-limit` issue at close-out | recolour `::selection`; assert on selected text | the decision covers the line's colour; a selection is a transient state the person chose, and its highlight is the whole viewer's |

## Audit verdicts

**Round 1.** Codex (gpt-6.1-sol, high, session `01a15654`): `conditional approve (with conditions: scope browser evidence to unselected text and make the scratch reader check ancestor opacity beyond the opaque span)`. Opus 5.5 Plan: `conditional approve (with conditions: list A1 as an open ask and state the reading in the PR body; Phase 4 passes on the exact readings, dark unchanged)`. Both recomputed F1 (2.913, 5.416, 5.054; 8.154 for dark `--txt-warning`) and found F2-F6 hold. C = Codex, O = Opus; all accepted unless marked:
- C1 native selection paints `::selection` (`--nulo-surface-highest`), 4.09:1 under the light shade; plausible but unverified on real pixels → the reading is unselected text, search closed; K1 (D6). The 4.5 bar stays.
- C2 the predecessor's reader stopped at the first opaque background, so ancestor opacity above it went unchecked; demonstrated as a helper limit → the walk checks every ancestor. Its `timeout: 300_000` is not copied.
- O1 A1 as an owner ask, answered before the PR. Rejected in part: C3 reads the call as the issue's option A ("Dark stays as it is"), the analogy fixing the shape, not the scope; light only cannot exceed the call; an ask would hold a change nobody requested. Accepted: the PR body and the report state the reading (D1).
- O2 exact pass readings, dark the same as before; O3 three line references; O4 `origin/dev...HEAD` and a clean `tests/e2e` after Phase 2; O5 literal token names (D2). O6 `filter` and blend modes: none in the path, no change.

**Round 2** (Codex, resumed, verification): `approve`, no remaining finding; O1's partial rejection holds (moderate confidence), the reading disclosed in the PR body and the report.

## Delivery

- PR title: ``fix(ui): the log viewer's warn lines in `--txt-warning`, aa on the light theme`` (≤ 93 characters). Open it ready, with no label: every e2e lane's path filter takes `packages/design/src/**`.
- Body: a Sign-off section that quotes the owner's delegation and links the call; the accessibility call, made under the owner's 2026-10-19 delegation; the contrast table, before and after; the four pictures by blob URL at the commit that adds them; the gates with outcomes; no e2e scenario added, so no suite wall-clock moves; `Closes #887`.

## Post-implementation

The standard is `implementations-plan/README.md` § Post-implementation standard at `24399338`. Plan-specific values:
- Step 1 is absent (`code_review: off`).
- Step 2 once, after Phase 4, over `git diff origin/dev...log-warn-contrast-1-a1`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh` until a round has no material finding; hard stop at three. One Opus 5.5 diff review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1.
- Step 3: one PR against `dev`, then `gh pr checks <n> --watch`.
- Step 4 as this PR's final commits: merge `origin/dev`, read `index.md` and `lessons.md`; the Outcome; K1 filed as a closed `known-limit` issue (dedupe first) and named on `Known limits:`; the lessons pass; `STATUS.md` deleted; `git mv` into `archive/` in its own commit; the index line moved; `bun run check:plans` green.
- Step 5 after the merge: `agent-worktree done log-warn-contrast-1 --merged`, once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/log-warn-contrast-1/plan.md` succeeds.

## Seeds

`/goal` (recommended): `implementations-plan/log-warn-contrast-1/plan.md is done: Phases 1-4 marked ✓, each backed by its gate reported passing in the transcript; LESSONS_FILE=implementations-plan/log-warn-contrast-1/lessons/phase-N.md printed per phase; the Codex loop converged on the arc's diff, quoted; the PR exists against dev, opened after the loop, with the close-out's archive commit on it; bun run test and bun run lint exit 0.`

`/loop 15m Drive implementations-plan/log-warn-contrast-1 per its plan.md (read it and lessons/ first; plan.md is the state). Take the next unchecked step, run the fast gates after each edit, commit signed. Decide open questions with Codex (gpt-6.1-sol high) and log each consult. After Phase 4, run the Post-implementation loop, open the PR against dev, watch checks, report and stop. Never merge.`
