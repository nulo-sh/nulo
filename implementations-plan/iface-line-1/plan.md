---
plan: iface-line-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: 9470d4e9
status: completed (arc 1 carries this close-out)
---

## Outcome

- **Date:** 2026-10-18.
- **Status:** closed. Arc 1 carries this close-out; the merge that lands it closes the plan and #516.
- **Shipped:** each call Nulo cannot read keeps its orange warning and gets one short line naming the reason, `interface` a dotted glossary term; the closing advice reads once per window (under the last unreadable call at rest, else under the last open unreadable discovered authorization); the footer's refusal tooltip keeps its whole sentence without the advice; Settings → Glossary gains `Interface`, last under Apps. The execute and fee-raised windows both show it.
- **Known limits:** none.
- **Open items:** #776 (OA-1, `owner-decision`: the undrawn lines' ship-now forms, options B to E); #777 (`owner-decision`: an unreadable discovered authorization is not flagged at rest, pre-existing).
- **Dropped:** rewording CLAUDE.md's dotted-term rule to "distinct" terms (Opus, arc review): a ruleset change beyond the lane; D1 records the reading. **Lessons:** none promoted; the two gotchas (a dotted term's hidden definition in `.text()`, and the screenshot recipe) are in `lessons/phase-1.md`, and `lessons.md` is at its budget.
- **Seeds retired:** the `/goal` and `/loop` seeds below.

# iface-line-1: one short reason per unreadable call, `interface` dotted, the advice once

One arc, one PR against `dev`, `Closes #516`. Recon: [`recon.md`](recon.md); planning log: [`lessons/phase-0.md`](lessons/phase-0.md); owner asks: [`OWNER-ASKS.md`](OWNER-ASKS.md).

## Outcome & Quality Bar

- **For whom**: a person approving a dApp request in the execute window when Nulo cannot read some calls' arguments.
- **Excellent**: every such call keeps its orange warning and says why in one short line, with `interface` defined on hover, focus or touch by the same sentence Settings → Glossary shows; the advice `Check what the app says this does before approving.` appears exactly once per window, under the last such call; the footer's refusal tooltip keeps its reason and drops the advice.
- **Good enough**: each dotted instance is its own Tab stop (D2); the advice stays at rest when Show all details opens (D4).

## Issue

| Issue | Arc | Disposition |
|---|---|---|
| #516 | arc 1 | The owner's P44-01 = A, below. The issue's first findings already shipped: one `DetailsToggle` for both execute toggles (#594), its `aria-controls` and reduced-motion rule (#721, `a11y-css.test.ts:69`); the owner's page-40 B ("keep today's look … fix its two accessibility gaps") is therefore met at the base. |

## Assumptions

**Facts** (verified at `9470d4e9`; detail in `recon.md`)
1. One component, `UnreadableArgsNotice.vue`, renders the warning and `rawNotice(reason)` at five sites: the summary row, the grant rows, the Payload rows and the discovered authorizations under Show all details, the `aztec_createAuthWit` card.
2. Every interaction the bridge builds holds one operation (`dispatcher.ts:516, 584, 629, 676`), so a window renders one `OperationCard`, and each operation kind has one at-rest host of unreadable calls: `aztec_sendTx` the summary rows, `send_transaction` the grant rows, `aztec_createAuthWit` its one call. An `aztec_sendTx`'s discovered authorizations show their notice only under Show all details.
3. A surface is `raw` exactly when its decode is `undecoded` (`call-surface.ts:126-131`).
4. The footer tooltip is `rawNotice(reason)` (`call-surface.ts:247-252`) and is a tooltip itself, so it cannot hold a dotted term.
5. `DottedTerm` is a `tabindex="0"` span with its definition on `aria-describedby` (`DottedTerm.vue:44-45`). No screen repeats a dotted term today: only the connect window's authorizations row carries `authorization` (`permission-rows.ts:154-165`). The only other dotted term the execute window can show is `priority fee` (`AppFeeLine.vue:41`).
6. `DottedTerm.scan.test.ts` refuses a bound or unknown key and a definition over one sentence or 100 characters; the new one is 86.
7. The fee-raised window (`windows/fee/index.vue:110, 261`) mounts the same `OperationCard` and the same refusal row, so it shows every change here.

**Inferences**: I1. `.text()` on a row now includes the term's hidden definition; tests read with `shownText` (`OperationCard.fee.test.ts:145`). I2. The three-call window still fits 400 x 800 with the advice line (the mockup measured 30 px spare without it; one body line is about 20 px); the after shot measures it.

**Asks**: OA-1 (the lines the mockups did not draw, and the footer tooltip). It ships in its ship-now form.

## Decisions (the six the lane brief names, and the shape)

- **D1. Dotted-term count: distinct terms.** "At most two dotted terms per screen" counts glossary terms, not instances: the rule caps what a screen asks a person to learn, and the owner picked "as drawn", which repeats `interface` three times. This is the first screen to repeat a term (Fact 5). The execute window shows at most `interface` and `priority fee`: two.
- **D2. Tab stops: every instance is one.** `DottedTerm`'s default; the stops follow the reading order (CLAUDE.md § Keyboard & focus order) and each reaches its definition, as the pick says ("the Tab stops as the rule reads"). Rejected: a non-focusable variant for repeats (a new prop for one caller, and those instances would answer a mouse only). Cost: one stop per unreadable call with a dotted reason; one more per unreadable row while Show all details is open.
- **D3. Footer tooltip: split, and it drops the advice.** It keeps today's self-contained sentence (`RAW_NOTICE[reason]`): a tooltip cannot hold the dotted term the short line leans on. It loses `Check what the app says this does before approving.`: the advice is once per window, and a window with an unreadable grant cannot be approved. The body keeps the advice under its last unreadable grant, as the budget places it. OA-1 quotes the tooltip.
- **D4. Payload rows: the same short line, no advice.** The component is shared, and the budget gives every unreadable call the short line. The advice is anchored at rest and does not move when Show all details opens. One fallback: an `aztec_sendTx` whose calls all read but whose discovered authorization does not gets the advice under the last such authorization whose details are open (`isAuthwitOpen`), where today's notice already carries it (Codex r1, r2). Out of scope, as today: the summary does not flag an unreadable discovered authorization at rest.
- **D5. The two undrawn reasons**: P41-03 A's own words, `The arguments don't fit the interface.` (dotted) and `Nulo couldn't read the arguments right now.` (today's sentence, no term). `arguments` also covers a value the window cannot print whole and a function over the decoder's field budget (`readableGrants`, `call-decoder.ts:76`), as today's sentence does; OA-1 offers broader words. The `UndecodedReason` union stays: splitting it changes a cross-package contract for a copy question.
- **D6. The definition stays verbatim.** It is true: Nulo shows the raw values behind the raw toggle (one press on a grant or `createAuthWit` card, two on a summary row). The owner signed it in the glossary picture.
- **D7. "Once per window" is "once per card".** Fact 2 makes them equal; a window-level coordinator (a registry, an emit, a window-computed index) buys nothing on the single-operation windows the bridge builds. The card computes the one site in one place.
- **D-arc1-1 (deviation, screenshots).** `deployExtraTokensForAccount`'s Token decoded: the wallet already holds its class (the fixture token's). The capture sends the playground's multicall to a random address with no contract, so all three calls read `unknown-contract`; the fee estimate fails there, identically before and after, and the fee card is not under review.

## Architecture & Implementation

- **Strings, `call-surface.ts`**: add `RAW_LINE: Readonly<Record<UndecodedReason, readonly NoticeSegment[]>>` with `NoticeSegment = { text: string } | { term: string }` (the `permission-rows.ts` shape, kept local: one type line, two windows) and `RAW_ADVICE`. `RAW_NOTICE` stays for the footer alone, which reads `RAW_NOTICE[reason]` with no advice; `rawNotice` goes (D3).
- **`UnreadableArgsNotice.vue`**: renders `RAW_LINE[reason]`, each `term` segment as `<DottedTerm term="interface" :testid="`${prefix}-interface-term`">`, in one `Text` (`${prefix}-unverified-reason`); a new `advice?: boolean` prop adds `RAW_ADVICE` as the next line (`${prefix}-unverified-advice`).
- **Placement**: `OperationCard.vue` computes the card's one advice site from the surfaces it already holds: the last raw summary call (`sendTxRows`), else the last raw discovered authorization whose details are open (D4); the last raw grant row; the `aztec_createAuthWit` call. `SendTxSummary.vue` takes `adviceAt?: number` (a call index); `CallArguments.vue` takes `advice?: boolean` and passes it through. A Payload row never carries it.
- **`glossary.ts`**: `interface` = `{ term: "Interface", definition: "A contract's interface names a call's arguments; without it Nulo shows the raw values.", where: "Approval window" }`, appended last to Apps.
- Every `data-testid` stays; no new `.vue` file (a new one under `popup/windows/execute/` needs a `surfaces.expected.json` row).

| File | Change |
|---|---|
| `apps/extension/src/popup/windows/execute/call-surface.ts` | `RAW_LINE`, `RAW_ADVICE`; `rawNotice` doc |
| `…/execute/UnreadableArgsNotice.vue`, `CallArguments.vue`, `SendTxSummary.vue`, `OperationCard.vue` | the line, the term, `advice` |
| `apps/extension/src/utils/glossary.ts` (+ `glossary.test.ts`), `src/popup/pages/settings/glossary.test.ts` | the entry |
| `…/execute/OperationCard.{summary,authwit,fallback,fee}.test.ts`, `execute.fixture.ts`, `index.test.ts` | T1 to T4 |
| `apps/extension/tests/helpers/shown-text.ts` (new) | `shownText`, moved from the fee test, now used by three files |

Files only this lane edits: none of them is in another running lane's list (#714 `tx-enrichment.ts`, #760/#761 `TxFeeRow.vue`, the token add window).

## Security & Adversarial Considerations

- Display copy only; no data, trust boundary, permission or dependency moves. Every string is a constant; no dApp text reaches the new line or the tooltip.
- The approval surface keeps its warning per call; the advice is not removed but de-duplicated, and the footer refusal is unchanged (Confirm stays disabled on an unreadable grant). A hostile dApp gains nothing: the reason comes from the wallet's own decode.

## Phase 1: the lines, the term, the advice, the entry (arc 1) ✓

Warning: run at most one `e2e:agent` in this worktree at a time, at retry 0, with load1 under 150.

Steps:
1. Take the before shots (Screenshots below) on the unchanged head.
2. Add the strings, the notice's segments and `advice`, the placement, the glossary entry.
3. Move `shownText` to `tests/helpers/shown-text.ts`. Write T1 to T4; update the tests `recon.md` lists. Rewrite the comment at `OperationCard.fee.test.ts:363-364` to D1's reading.
4. Take the after shots.

Tests (each red on the base's copy of its source):
- **T1** (`OperationCard.summary.test.ts`) an `aztec_sendTx` with three unreadable calls (two `unknown-contract`, one `unknown-function`) then one readable: each unreadable row reads warning + its short line exactly (`shownText`), its `interface` a `DottedTerm` with key `interface`, `tabindex="0"` and the glossary definition as its description; the advice appears once, inside call 2's row; with Show all details open, still once, and the three Payload rows read their short lines. Readable calls with two unreadable discovered authorizations: the advice is once, in the second's details; close the second and it moves to the first; reopen it and it returns, still once. The existing fixture (call 2 and the Vault authorization raw, `VAULT_RAW_FACTS`), details open: the advice is once, under call 2. Control: nothing unreadable shows no advice and no `interface` term.
- **T2** (`OperationCard.authwit.test.ts:99`, per reason) the grant block reads warning + `RAW_LINE` + advice; `unavailable` has no term, the other three one. The existing multi-grant test gains two unreadable grants then a readable one: one advice, under the second. One `aztec_createAuthWit` case carries the advice.
- **T3** (`index.test.ts:1072, 1082`) the footer tooltip equals `RAW_NOTICE[reason]` exactly, with no advice.
- **T4** (`glossary.test.ts`, `settings/glossary.test.ts`) the signed entry, last under Apps.
- No browser Tab walk: `tooltips-glossary.test.ts:134-160` already proves, in both browsers, that a `DottedTerm` takes Tab, opens on focus and carries its description; this plan adds instances, not a keyboard path.

**Validation gate**: root `bun run audit:vue` (typecheck, test and lint, then build), `bun run test:all`; smoke `cd apps/extension && bun run test:e2e -- tests/e2e/tooltips-glossary.test.ts --retry=0`, then `NULO_E2E_BROWSER=firefox`; network `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/type-roles-windows.test.ts`, Chrome then `NULO_E2E_BROWSER=firefox`. Pass: exit 0 everywhere; T1 to T3 red on the base copies. Layers: lint, typecheck, unit, component, smoke, network.

## Screenshots (PR body)

- Surfaces, light and dark: the execute window at rest with three unreadable calls (400 x 800, before and after); the same with the first `interface` tooltip open (after); Settings → Glossary at the end of Apps (360 x 600, before and after).
- Method: a scratch network spec, never committed, run through `agent.sh` with `NULO_E2E_SHOT_DIR` under `~/.cache/nulo-backlog/iface-line-1/`, calling `shotSend(win, <name>, "execute-op-summary")`. It deploys an aztec-standards Token with a public balance that the wallet never registers (`deployExtraTokensForAccount`, `tests/e2e/fixtures/aztec.ts:741`), sets its address as the playground's `tokenAddress`, presses `pg-btn-sendTx-multicall`, waits for three `execute-op-summary-unverified-args`, shoots, focuses the first term, shoots, and rejects. All three read the unknown-contract line; the PR body quotes the other three lines.
- The PNGs go under `apps/extension/pr-screens/` in one commit, linked by its SHA, and are deleted in the next (as #721).

## UI impact

- **Execute window and the fee-raised window (Fact 7), every unreadable call** (summary, grant, Payload, discovered-authorization and `createAuthWit` rows): the orange `Can't read the arguments` stays; the grey sentence becomes one short line with `interface` dotted. **The closing advice**: once, under the last unreadable call at rest. **The tooltip**: the `interface` definition. **Settings → Glossary**: `Interface`, last under Apps, `Approval window`. Sign-off, P44-01 = A: "Short lines with interface dotted (as drawn), the closing advice once per window, the glossary entry last under Apps." Undrawn lines: OA-1.
- **The footer's refusal tooltip** (an unreadable grant): the reason sentence stays, the advice goes (D3), quoted in OA-1.

## Delivery

- Branch `worktree-iface-line-1`; one PR, `gh pr create --base dev`, title `feat(execute): one short reason per unreadable call, interface dotted, the advice once` (86).
- Open it after the gate and the Codex loop, without labels. If `pr-quick.yml`'s path filter skips the smoke or network lane, add `e2e:extension-smoke` or `e2e:extension-network` afterwards.
- Body: what and why; P44-01 quoted by id and text; OA-1's ship-now lines quoted; D1 to D3; that the fee-raised window shows the same rows; the screenshots; the validation runs; no e2e scenario added, so the wall-clock is unchanged; `Closes #516`; ending `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Commits: conventional, lower case, signed, `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `9470d4e9`. Specific to this plan:
- Step 1 is absent (`code_review: off`). Step 2 runs once over the diff from `origin/dev` after Phase 1's gate: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; prompts under `~/.cache/nulo-backlog/iface-line-1/`; hard stop at three rounds; rounds logged in `lessons/phase-1.md`.
- Approval boundary: a non-focusable term variant, a window-level coordinator for the advice, a split `UndecodedReason`, an at-rest flag for an unreadable discovered authorization, any copy beyond P44-01 and OA-1's ship-now lines, or a change to another dotted term is a plan change and stops for the orchestrator.
- Close-out in this PR's final commits: Outcome block, lessons promotion (dedupe first; `lessons.md` is near its 8 KiB budget), OA-1 filed as an `owner-decision` issue if the owner has not answered it, `STATUS.md` deleted, the `git mv` into `archive/`. Teardown after the merge: `agent-worktree done iface-line-1 --merged`; trunk `dev`; `implementations-plan/archive/iface-line-1/plan.md`.

## Audit verdicts

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| 1 | Codex, gpt-6.1-sol (session 01a14f02) | conditional approve | the advice vanished when only a discovered authorization is unreadable: D4's fallback, T1 case; the footer repeated the advice: D3 drops it there, quoted in OA-1; `arguments` covers more than a mismatch: D5, OA-1 option B; a multi-grant T2 case; T3 now red on the base; `audit:vue` replaces the separate lint, typecheck and test | a browser Tab walk in the execute window: `tooltips-glossary.test.ts:134-160` proves the same component in both browsers |
| 1 | Opus 5.5 (Plan) | conditional approve | the same vanishing advice and missing last-raw tests (adds the `VAULT_RAW_FACTS` case); the screenshot recipe: `deployExtraTokensForAccount`, focus `execute-op-summary`; the fee-raised window shows the change (Fact 7, UI impact); Fact 5 claimed a repeated-term precedent that does not exist (D1 now rests on the pick) | none |
| 2 | Codex, resumed | conditional approve | closing the authorization that carries the fallback advice left none on screen: the fallback takes the last open one (existing `isAuthwitOpen` state), T1 closes and reopens it | none |
| 3 | Codex, resumed | **approve** | none new: the open-authorization fallback verified, no regression | none |
| arc 1, r1 | Codex, gpt-6.1-sol (session 01a14f44) | approve | a test loop over the term testids could run zero times: it asserts three first; a test comment named owner-pick ids, and `RAW_LINE`'s comment restated the map | none |
| arc 1, r1 | Opus 5.5 (diff) | conditional approve | the same loop and comment; three comments claimed "under the last unreadable call" where the fallback differs; `adviceSite` reads `summaryAuthwits` instead of decoding again; `RAW_NOTICE` and `NoticeSegment` lose `export`; the grant-window advice on a refused request goes to OA-1 (option E) | rewording CLAUDE.md's rule to "distinct" terms: a ruleset change beyond the lane, D1 records the reading; an at-rest flag for an unreadable discovered authorization: pre-existing, D4, filed at close-out |

## Seeds

```
/goal Phase 1 of implementations-plan/iface-line-1/plan.md marked ✓, backed by its validation gate passing in the transcript; LESSONS_FILE=implementations-plan/iface-line-1/lessons/phase-1.md printed; the Codex loop (gpt-6.1-sol, high) converged with a resumed pass quoting no new material finding; one PR against dev closing #516, with before and after screenshots, its close-out archiving the plan; bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/iface-line-1 forward per its plan.md and the README § Post-implementation standard at 9470d4e9: run the next gate, one e2e:agent at a time at retry 0, decide open questions with Codex (gpt-6.1-sol, high), never merge, never widen scope; stop after the PR's checks are green and report.
```
