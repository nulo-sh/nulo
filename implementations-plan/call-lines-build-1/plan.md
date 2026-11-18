---
plan: call-lines-build-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev at eb42af540
status: in progress
---

# call-lines-build-1: a contract call reads as one sentence on both screens

One signed pick, one build. One arc, one PR against `dev`; closes no issue. It changes what users see, so it lands only after the orchestrator reads its captures against the frames the owner picked. Recon: [`recon.md`](recon.md). Owner asks: none ([`OWNER-ASKS.md`](OWNER-ASKS.md)).

> **P180-01 = c2** (decision page 180, signed 2026-11-18 14:58 UTC at dev `eb42af540`, no note), "A contract call's line: as built (c1), one sentence with "on" held to the chip on both screens (c2), the contract first, a dot, then the function (c3), the function over a CONTRACT key and the chip (c4), or the function in a code pill with the chip at the line's end (c5)". As the page put it: "A preposition on both screens: in the window "on" moves into the chip's no-wrap box, so a wrap reads "Publish For Public Execution" over "on [Contract Instance Registry]"; without a wrap it is pixel-identical to c1. On the detail each Calls row becomes the same sentence on one line, "Claim Fee Juice on [Fee Juice]", "Transfer In Private on 0x0000..00a1", the long name wrapping with "on 0x2c3d..4e5f" under it. Rows 40.8, 41.8 and 62.6 px (16 px shorter than today on a short row). No new copy, no new role, two templates, and all 686 unit tests of the lane's run pass unchanged."

It answers the owner's page-176 note: "n1 but n1 design looks awful (on the contract calls) like, it just reads {function name} {contract name}. and looks kinda weird."

Proportion (lane brief): two templates and two tests on a signed pick, built from the render lane's prototype commit `3723daa3c`. No plan audit round and no Opus review; one Codex pass over the plan and the net diff after the build.

## Decision ledger

| ID | Decision | Why, and the alternatives |
|---|---|---|
| D1 | c2 as drawn, from `3723daa3c` cherry-picked by hash: it applies clean, both files byte-identical between its parent and `eb42af540`. Window (`SendTxSummary.vue`): a call's " on " leaves the head's text and opens `.chip_tail` as `on&nbsp;`. Detail (`pages/tx/[id].vue`): each Calls row is one `.call_line` span (`type--body`, `line-height: 1.6`): the title (`.call_method`, unchanged), a space, then `.call_tail` (nowrap) holding `on&nbsp;` and the contract, the protocol chip in `.call_chip` (now `inline-flex`, `vertical-align: middle`) or the short address. | The pick. The authorization line already reads "Lets [caller] call {fn} on [chip]" and stays as it is. |
| D2 | The window's "on" and chip sit in one inner `.chip_fit` (`display: inline-flex; align-items: baseline; max-width: 100%`) inside `.chip_tail`; the chevron stays outside it, in `.chip_tail`. A transfer head (no "on") gets the same wrapper around its chip, so one template serves both. | **Demonstrated** (a scratch page with the chip's own rules, Chrome and Firefox; the spec's assertion reads the same boxes). Conditions: a call step whose chip label is wider than the line. `network/type-roles-windows.test.ts` (`expectCallCaptionsWhole`, 360 px, a 48-letter label) pins "a contract wider than the row clips inside its chip, which stays in the row". As drawn, `on&nbsp;` and the chip are one unbreakable run and the chip keeps `max-width: 100%` of the line after "on", so it ends 16.7 px (Chrome), 16.5 px (Firefox) past the row: the spec's `inRow` goes red and the chip crosses the card. In the flex box, Popover's `.inline` span (`min-width: 0; max-width: 100%`, the design's own "lets the trigger shrink and clip its text") clips to what "on" leaves: 0 px past. Measured over 12 heads (widths 312, 272, 212 × four lines, both engines): every other box identical to as drawn, and identical for a transfer head. Rejected: the whole `.chip_tail` as inline-flex (chevron 1 px higher, a wrapped head 1 px taller, the chevron itself shrinks); `align-items: stretch` (chip 0.8 to 1.3 px higher); a `calc()` cap on the chip (a magic width, and `ContractChip.vue` stays untouched); changing the assertion (it is the pinned rule). |
| D3 | `.chip_tail`'s comment names both its callers' whys: a call's "on" never ends a line, a chevron never opens one. | The transfer line's "to" box also uses `.chip_tail` and holds no "on"; the prototype's comment said it always did. |
| D4 | The detail page takes D2's mechanism (Codex R1-1): `.call_tail` is `display: inline-flex; align-items: baseline; max-width: 100%` and `.call_chip` is `min-width: 0` (its `inline-flex` and `vertical-align: middle` dropped), so the chip shrinks in the tail and clips inside its row. | **Demonstrated** (Codex's probe with the repository's CSS and fonts; mine with the chip's rules, both engines). The plan first said the detail needed no D2, measuring only to 300 px; pages are laid out down to 240 px (`NARROW_WIDTH`, Firefox's sidebar, `tests/e2e/fixtures/type-roles.ts`), where "on Contract Instance Registry" needs about 204 px of the 174 a row leaves, and the drawn tail ran the chip 30.3 px past it (8.4 px in my probe); c1 clipped it inside. Measured over 12 rows (widths 318, 258, 198): every glyph identical to as drawn, the widest chip now ending at the content edge; the one difference is an unpainted address box 1 px taller in Chrome. Rejected: a flex tail only when it holds a chip (a conditional class for a 1 px box nothing paints). |
| D5 | Two tests, as the brief names them. Window, beside the chevron test in `OperationCard.summary.test.ts`: every call head's `execute-op-call-to` box opens with `on ` inside `.chip_fit` with the chip, and the text before the box is a plain space; the transfer head's box opens with its chip; `.chip_fit`'s declarations pinned. Detail, in `pages/tx/[id].test.ts`'s contract-for-a-call block, on its wire-shaped claim (32-byte fields, a 32-byte address): each row is one `.call_line` reading exactly "Claim Fee Juice on Fee Juice" and "Checkpoint on 0x0b0b..0b0b", the contract in `.call_tail` after `on `; `.call_tail`'s, `.call_chip`'s and the title's `unicode-bidi` declarations pinned. | Each new assertion fails on the base (no box, " on " outside it; two stacked lines). jsdom has no line breaking or bidi, so the wrap is proved by the declaration pins plus the captures, the window's capped case by `type-roles-windows`, the detail's at 240 px by the capture run's measurement. No e2e scenario added. |
| D6 | `.call_method` takes `unicode-bidi: isolate` (Codex R1-2). | **Demonstrated** in both engines (scratch page). Conditions: a history row whose stored `method` ends in a direction control, which only a hostile restored backup carries (dApp names pass `wireTitle`'s sanitizer; the wallet's own methods are constants). c1 kept the title in its own line box; one sentence lets its override reorder what follows: with D4's flex tail the address text stays whole and the tail moves one space; isolated, the row lays out as with a plain name. Rejected: sanitizing stored rows on read, a reader change for a display containment the old layout gave for free. |
| D7 | The chevron after a chip wider than the line still passes the row by about 15 px (Codex R1-3): known limit [#1850](https://github.com/nulo-sh/nulo/issues/1850), closed. | As before this change (c1 drew the same), on a decorative `aria-hidden` glyph, at labels no list, protocol name or short address produces; the fix would move the chevron into `.chip_fit` and rewrite the chevron box pin, a change beyond the signed words. |

## UI impact

- **Approval window, a call step** (`SendTxSummary.vue`): before, on a wrap "on" ends line 1 and the chip opens line 2; after, "on" goes to line 2 with the chip; without a wrap, pixel-identical. A chip label wider than the line clips inside the row, as today. Sign-off **P180-01 = c2**, quoted above: "in the window "on" moves into the chip's no-wrap box, so a wrap reads "Publish For Public Execution" over "on [Contract Instance Registry]"; without a wrap it is pixel-identical to c1."
- **Transaction detail, Calls rows** (`pages/tx/[id].vue`): before, the title over the contract, two lines, no word between; after, one sentence, "{title} on [chip]" or "{title} on 0x…", "on" and the contract wrapping together. Sign-off **P180-01 = c2**: "On the detail each Calls row becomes the same sentence on one line … Rows 40.8, 41.8 and 62.6 px (16 px shorter than today on a short row)." A chip wider than what the row leaves after "on" clips inside the row, as the stacked row's chip did.
- Nothing else: no copy, role, testid, chip or authorization-line change; the doubled "Fee Juice" on a claim stays (a copy decision the owner has not made).

## Security & Adversarial Considerations

Display only. Every string rendered is what the two templates already render (the wallet's call title, the chip model, `trimAddress` of the stored contract), by interpolation, never HTML. A hostile dApp controls the call's contract address and function name; neither reaches a new sink, and D2 and D4 keep a long chip label inside its row. A hostile restored backup controls a history row's stored method name: D6 keeps its direction controls from reordering the contract after it. No storage, message, permission, secret, dependency or log line changes.

## Phase 1: the build and its tests

1. Cherry-pick `3723daa3c` (D1), committed with this lane's message.
2. `apps/extension/src/popup/windows/execute/SendTxSummary.vue`: `.chip_fit` and its template (D2); `.chip_tail`'s comment (D3). `apps/extension/src/popup/pages/tx/[id].vue`: the flex tail (D4), the isolated title (D6), the template comment dropped (Codex R1-4).
3. `apps/extension/src/popup/windows/execute/OperationCard.summary.test.ts` and `apps/extension/src/popup/pages/tx/[id].test.ts`: the two tests (D5).

**Validation gate** (retry 0, one command at a time, from the worktree root unless named): `bun run lint`; `bun run typecheck:all`; from `apps/extension`, `bun run test -- type-role-ban copy-dash-ban red-text-ban src/popup/windows/execute src/popup/pages/tx src/components/composite/ContractChip`; `bun run check:plans` after staging; from `apps/extension`, the armed smoke build (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_EXECUTE_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:chrome`), then `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_EXECUTE_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/execute-steps.test.ts tests/e2e/type-roles.test.ts --retry=0`, then the same on Firefox (`build:firefox`, `NULO_E2E_BROWSER=firefox`); from the root, `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/type-roles-windows.test.ts tests/e2e/network/tx-sendTx-default.test.ts`, then the same under `NULO_E2E_BROWSER=firefox`. Pass: every command exits 0; the new assertions fail on the base; no existing assertion changed; per-browser counts recorded.

## Phase 2: captures and the PR

1. The prototype's kit copied into the lane's scratch dir (paths and ids changed, never committed): its three window fixtures and its claim carrying three calls, applied around one armed Chrome smoke build at the PR's head and reverted after it. Frames `clb1-window`, `clb1-window-unknown`, `clb1-detail`, light and dark, 400 px, 2x, plus a metrics-only transaction whose call is `publish_for_public_execution` on the Contract Instance Registry, measured at 400, 300 and 240 px (D4), and `captions.json` (`<id>-light`, `<id>-dark`, one sentence each with the measured heights).
2. The PR as Delivery says.

**Validation gate.** `git status` clean after the run; six frames; the detail rows measure 40.8, 41.8 and 62.6 px and the window's wrapped protocol step 31.3 px, as the c2 frames did; the Contract Instance Registry chip ends inside its row at 240 px.

## Delivery

One PR from `call-lines-build-1-a1` (off `origin/dev`, carrying the plan commit) to `dev`, opened ready, no label. Title (87 characters): `fix(execute): call lines read "{function} on {contract}" on a wrap and in the tx detail`. The body quotes the pick under `## Sign-off`, lists the two tests, D2 under `## Deviations` with its measurements, the four e2e runs with counts, the Codex verdict and the captures. No `Closes` line. Merging is the orchestrator's.

## Post-implementation

Execution contract: this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `eb42af540`. Plan-specific values:
- Step 1: `code_review: off`, so absent.
- Step 2, bounded work: after Phase 1 is green, ONE `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol` over this plan and `origin/dev...HEAD`, asking also about D2's mechanism and its measurements, the two tests' strength, and the comments. Rerun only the gates a fix touches. A second round only if the first finds something (`resume-codex.sh`; hard stop at three). No Opus review.
- Step 3: `gh pr create` as Delivery says; `gh pr checks <n> --watch` once.
- Step 4, the close-out in the same PR's final commits, after merging `origin/dev` in: Outcome, lessons, `STATUS.md` deleted, `git mv` into `archive/` in its own commit, the index line to `archive/index.md`.
- Step 5: teardown is the orchestrator's.

## Seeds (not run; the orchestrator owns the ELI5)

- `/goal`: Build call-lines-build-1 per `implementations-plan/call-lines-build-1/plan.md`: Phase 1 green, one Codex pass, captures, PR open; stop before merge.
- `/loop`: Each firing, read `STATUS.md`, run the next unfinished step of `plan.md`, record its gate, stop at the open PR.

## Audit verdicts

No plan audit round (lane brief, Proportion).

**Codex round 1, over the plan and the net diff** (gpt-6.1-sol, high, read-only, `eb42af540...448132c83`), 2026-11-18: **approve with fixes**. It found both tests exact with positive controls, the explicit whitespace, the address's click and selection guard and `line-height: 1.6` sound, and D2 keeping control order, handlers, description ids and Popover's trigger. Findings:
- R1-1, accepted (D4): the detail's chip ran past its row at 240 px.
- R1-2, accepted (D6): one sentence lost the title's bidi containment; Codex said the override reversed the address, which held for the drawn tail and, after D4, shrinks to a one-space move.
- R1-3, rejected as a change, filed as known limit #1850 (D7): the chevron past the row at labels wider than the line, as before.
- R1-4, accepted: the detail's template comment restated the nowrap rule, and the test helper's comment restated the helper; both dropped.
