---
plan: fee-method-emoji-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev at 4fd3d8fcc
status: completed
---

## Outcome

- **Date:** 2026-11-13.
- **Status:** completed. Ships in the PR titled `fix(execute): the fee sentence prints the app's name as its chip does, pictographs stripped`, which carries this close-out; it lands on the owner's decision page with its captures.
- **Shipped:** `appLabelOf` (the chip's label rule, one source); the approval window's three "set by" lines read it, and an emptied name reads "the app" (P146-04 b). The chip and its press are unchanged.
- **Gates (retry 0):** static at `dbba75096` and final at `1e43957d6`, green; smoke `execute-steps.test.ts` on Chrome (`1e43957d6`) and Firefox (`029f7f11d`), green; `e2e:agent fee-sponsor-funding.test.ts` on Chrome (147 s) and Firefox (181 s) at `029f7f11d`, green. No e2e scenario was added.
- **Deviations:** the brief's claim that the failed row shows the legend did not hold, so the failed method line is stripped and its payer label stays (D2, A2). Chrome smoke ran at `dbba75096` and again at the final code; only a doc comment changed between them.
- **Owner decisions, named and not filed:** A1 (History's "Fee method", (b) recommended) and A2 (the failed row's "<name> pays", (b) recommended), both shipping as today, for the captures page.
- **Lessons:** none promoted. `lessons.md` is at its 8 KiB budget, and the one candidate is the capture-only reload workaround in `lessons/phase-1.md`, which applies to no other task.
- **Known limits:** none.
- **Open items:** none.
- **Seeds retired:** the `/goal` and `/loop` seeds under Seeds.

# fee-method-emoji-1: the fee row names the app as its chip does, pictographs stripped

Page 146's P146-04 = b: the approval window's fee row prints the app's name through the chip's filter, and only the chip's press quotes the declared name whole. One arc, one PR against `dev`, built on #1808. The PR changes what users see, so it does not land on its own: the orchestrator lands it on the owner's approve of its captures. No open issue matches (`recon.md` § Open work), so the PR carries no `Closes` and no `Part of`. Recon: [`recon.md`](recon.md). Owner asks: [`OWNER-ASKS.md`](OWNER-ASKS.md); A1 and A2 ship as today and block nothing.

## Outcome & Quality Bar

**For whom.** A person approving a transaction whose fee an app sets, when the app's declared name carries emoji or check marks, in the approval window at 400 px or a 240 px side panel.

**What excellent looks like.**
1. In the approval window, every "set by" line of the fee row names the app as the chip does: "Playground ✅🚀" reads "Playground" in "…method set by Playground", in "Fee payment method set by Playground" and in the failed row's "Set by Playground". No check mark sits beside Nulo's seal. The chip's press still reads "The name Playground ✅🚀 comes from the site."
2. A name the filter empties reads "the app" on those lines, as a nameless app does today. No line ends in "set by" and nothing.

**Good enough.** The failed row's "\<name\> pays" (A2), the History page (A1) and every other surface keep today's words. No new words, testid, tooltip, glossary term or stored key.

## Decision ledger

| ID | Decision | Why, and the alternatives |
|---|---|---|
| D1 | One helper, `appLabelOf(name: unknown): string` in `components/composite/contract-chip.ts`: the chip's label expression `sanitizeWireString(stripPictographs(name), 64)` returned untrimmed, or `""` when the name is not a string or the label is blank once trimmed. `appChipOf` reads its label and its null case from it and keeps its own `typeof` guard for the press line; `OperationCard`'s method name becomes `appLabelOf(props.dapp?.name) \|\| "the app"`. | The chip and the row then cannot drift: one function names the app for both (Codex agrees, high confidence; the window already imports `contract-chip.ts`). Rejected: (a) the chip's expression copied into `OperationCard` (two copies of one rule); (b) `stripPictographs(safeWire(…))`, which caps before it strips and diverges from the chip: 64 rockets then "Playground" reads "Playground" stripped first and "…" capped first. No test pins that order today (`ContractChip.test.ts:224` passes either way), so T4 adds the assertion. `stripPictographs` stays the one filter; no new regex. |
| D2 | Three prints read the stripped name: the AppFeeLine slot, the legend and the failed row's method line ("Set by \<name\>", "Private Fee Juice · set by \<name\>"). The failed row's readout label "\<name\> pays" keeps today's `safeWire` name: `OperationCard` holds two names, `appName` (stripped) for the method lines and `payerName` (today's expression) for the label. A2 asks the owner about the label. | The pick names the "method set by" sentence; the failed method line is that sentence in another state. "\<name\> pays" is a payer claim, not the method sentence. The draft stripped it too, reading "the press alone" as covering the whole row. Codex (moderate confidence) argued the narrow reading is safer under the rule that nothing visible changes beyond the pick, and that the two names are two copy roles, not a patch. The narrow reading wins: the wider one is an owner call (A2). |
| D3 | A whitespace-only name now reads "the app", as the chip shows none for it. | Today `safeWire("  ")` prints the spaces ("set by   ."). This follows from D1 and the pick ("stripped like the chip"). |
| D4 | Tests in the component layer only (`OperationCard.fee.test.ts`); no new e2e scenario. | The change maps a string inside one component; each state (the estimate, the legend, the failed row) mounts in a component test with the wire-shaped app-paid operation. The network spec that reads the sentence and the History row (`fee-sponsor-funding.test.ts`) runs unchanged on both browsers as the regression check; its app, `nulo-playground`, has no emoji. |
| D5 | Captures from the armed smoke build's execute fixture with a capture-only patch (an emoji-named app; a failing estimate; no estimate), as #1808 made its `press-app-emoji` frame. History's A1 frames from a capture-only network spec over the local sandbox. Neither patch is committed. | The fixture draws the real window. It has no emoji-named, failing or unestimated shape (`recon.md` § Reuse map, capture fixtures), and adding one for pictures alone would grow the e2e surface. |
| D6 | No accessibility call: the change edits text only. | No focus, Tab stop or ARIA wiring moves. |

## UI impact

- **Approval window, app-paid fee row** (`OperationCard.vue`): the app's name in the three "set by" lines of D2. Before: "Playground ✅🚀". After: "Playground"; a name the filter empties reads "the app". The chip, its press and the failed row's "\<name\> pays" (A2): unchanged. Sign-off, P146-04 = b (2026-11-13 15:35 UTC): "The fee row's "method set by" sentence stripped like the chip; the press alone quotes the declared name whole." The page's reason: "a check-mark emoji beside Nulo's seal reads as a second seal. The press keeps the whole name for anyone who wants it."
- **History detail, "Fee method"**: unchanged (A1).

## Security & Adversarial Considerations

- **Threat model.** A dApp controls its declared name. It can pick emoji or check marks that read as a mark of trust next to Nulo's seal. After the change the "set by" lines cannot show them. The press quotes the name as `sanitizeWireString` leaves it, capped at 64 code points, and a name the filter empties has no chip and so no press: both are the chip's behaviour today, unchanged here.
- **Joined names.** Removal inserts no separator, so `Nu🚀lo` reads "Nulo" (demonstrated, as the chip already does with `Swap🇦🇷Pro`). It gives the dApp no new power: it could declare "Nulo" outright, and the row prints any free-text name today (#792 records the sentence-shaped case). Any mitigation (separators, reserved names) would change what people see, so it is not in this arc.
- **Input.** The name passes `stripPictographs`, then `sanitizeWireString` (control and format characters, 64-code-point cap), in the chip's order. Vue escapes the text.
- **No secrets, storage, permissions or dependencies change.** Crypto, supply chain, least privilege: N/A.

## Assumptions

**Facts** (checked at `4fd3d8fcc`):
- F1. `OperationCard.vue:186`: `appName = safeWire(props.dapp?.name, 64) || "the app"`. It feeds lines 415 (failed method line, `execute-op-app-fee-method`), 418 (the readout's "\<name\> pays"), 426 (AppFeeLine slot) and 430 (legend), the last two under `execute-op-app-name`.
- F2. `contract-chip.ts:130-142`: the chip label is `sanitizeWireString(stripPictographs(name), 64)`, no chip when it trims to nothing; the press line quotes `sanitizeWireString(name, 64)`.
- F3. The brief's "the legend … otherwise (the failed or unestimated row)" does not hold. The failed row draws "Fee", the method line and the readout (`OperationCard.fee.test.ts:441-447`); the legend shows only with no estimate, none running and no failure (`:425-428`).
- F4. Only `tests/e2e/network/fee-sponsor-funding.test.ts` reads the sentence (by regex, capturing the name) and the History row `Sponsored, set by ${app}`; the playground declares `nulo-playground` (`apps/playground/src/lib/wallet.ts:23`). No smoke spec reads the row's words.
- F5. `tx-detail-helpers.ts:67,75` print `origin.name` as stored, which is the declared name (`dapp-interaction/service.ts:376`).

**Inferences.**
- I1. The pick covers the approval window's "set by" lines, not History (A1) and not the payer label (A2): the owner saw the window's sentence only.
- I2. "Declared name" means the session's stored name, which discovery already sanitizes and caps (Codex).

**Asks.** None blocks the arc. A1 (History) and A2 (the payer label) are in `OWNER-ASKS.md`.

## Phase 1: the filter and its tests ✓

Assumptions used: F1, F2, F3, D1-D4.

1. Add `appLabelOf` to `apps/extension/src/components/composite/contract-chip.ts`. Make `appChipOf` read its label and its null case from it.
2. In `OperationCard.vue`, set `appName` from `appLabelOf(props.dapp?.name) || "the app"`. Add `payerName` with today's expression and use it for the failed row's "\<name\> pays" label only. Keep every testid.
3. Add the tests below, then run the gate.

**Tests** (`OperationCard.fee.test.ts`, the app-paid describe; the operation stays wire-shaped and the name arrives as declared, `"Playground \u2705\u{1F680}"`):
- T1. One `test.each` over the estimate, the legend and the failed row: the sentence, the legend and `execute-op-app-fee-method` read "Playground" with no U+2705 and no U+1F680. The failed block reads `FeeSet by PlaygroundPlayground ✅🚀 paysCouldn't estimate fee.Try again` under the file's `.text()` convention (A2 keeps the label). The "Swap" tests stay as the success control.
- T2. A name the filter empties (`"\u2705\u{1F680}"`, and `"  "`): the sentence ends "set by the app." and the legend reads "Fee payment method set by the app".
- T3. The model contract for one fixture: the card's sentence is stripped, while `appChipOf(name, host)` has the label "Playground" and its press line quotes "Playground ✅🚀" whole. Existing mounted tests prove the press renders its lines; the capture shows it in the real window.
- T4 (`ContractChip.test.ts`, one assertion in the emoji test): `"\u{1F680}".repeat(64) + "Playground"` labels "Playground", pinning strip before cap.

**Validation gate** (in order, at retry 0; run one command at a time; `audit:vue` runs its own checks side by side, as designed):
- Commands, from the worktree root: `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run --cwd apps/extension test:components`; `bun run audit:vue`; `bun run test:all`.
- Smoke, Chrome then Firefox: build armed as `tests/e2e/global-setup-smoke.ts:20` names (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_EXECUTE_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<browser>`), then `cd apps/extension && NULO_E2E_BROWSER=<browser> NULO_E2E_RETRY=0 NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_EXECUTE_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/execute-steps.test.ts`. It opens the window on the app-paid fixtures; no smoke spec reads the row's words (F4).
- Network, Chrome then Firefox, from the worktree root: `NULO_E2E_BROWSER=<browser> NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/fee-sponsor-funding.test.ts` (`agent.sh` claims ports from `~/.agents/ports.md`; the 10-minute stall watchdog stays).
- Pass criteria: require every command to exit 0. Require T1-T4 to pass. Require every existing assertion in `OperationCard.fee.test.ts` and `ContractChip.test.ts` to pass unedited.
- Layers: lint, typecheck, unit and component, smoke e2e, network e2e.

## Phase 2: captures and the PR ✓

Assumptions used: D5, F4, F5.

1. Write the capture-only patch and spec under `~/.cache/nulo-backlog/fee-method-emoji-1/`. Copy them into the tree only to capture, and restore the tree after.
2. Capture each frame at 400 px, light and dark, into `~/.cache/nulo-backlog/fee-method-emoji-1/shots/`. Write `captions.json` beside them.
   - `fee-row-stripped-400`: the app-paid sentence beside the chip.
   - `fee-press-whole-400`: the same window with the press open.
   - `fee-legend-stripped-400`: the legend, with no estimate.
   - `fee-failed-stripped-400`: the failed row (A2's label shows as today).
3. For A1, open the History detail of an app-sponsored send by "Playground ✅🚀" over the local sandbox. Capture `history-set-by-a` from it. Capture `history-set-by-b` with a capture-only flag that runs the label through `appLabelOf`.
4. Commit the PNGs under `pr-captures/fee-method-emoji-1/` in one commit; delete them in the next.
5. Run the Post-implementation loop, then open the PR.

**Validation gate.** `git status` clean after the restore; `git grep -n 'capture-' apps/extension/src` shows no capture patch; `bun run check:plans` exits 0 after staging; every capture named above exists in both themes.

## Delivery

One PR from branch `fee-method-emoji-1-a1` (off `origin/dev`, carrying the plan commit) to `dev`, opened ready, no label. Title (91 characters): `fix(execute): the fee sentence prints the app's name as its chip does, pictographs stripped`. The body quotes the UI impact sign-off verbatim, embeds the captures from `pr-captures/fee-method-emoji-1/` at the commit that adds them, lists the gates with outcomes, says no e2e scenario was added, and names A1 and A2. Merging is the orchestrator's, on the owner's approve.

## Post-implementation

Execution contract: this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `4fd3d8fcc`. Plan-specific values:
- Step 1: `code_review: off`, so absent.
- Step 2: single arc. After Phase 1 is green, write the review prompt to a file under `~/.cache/nulo-backlog/fee-method-emoji-1/` and run `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol` over `origin/dev...HEAD`. Keep the `SESSION_ID` and `CODEX_DIR` it prints. Resume each round with `~/.claude/skills/codex/scripts/resume-codex.sh <SESSION_ID> <followup-file> <CODEX_DIR> high`. Stop hard at three rounds. Run one Opus review (`Agent`, `general-purpose`) beside round 1. Then run the gates once more on the final head, then a fresh `run-codex.sh` session over the plan and the net diff.
- Step 3: `gh pr create` as Delivery says; `gh pr checks <n> --watch` once.
- Step 4, close-out, in the same PR's final commits: Outcome, lessons promotion, `STATUS.md` deleted, `git mv` into `archive/` in its own commit, the index line to `archive/index.md`, after merging `origin/dev` in.
- Step 5: teardown is the orchestrator's.

### Where open work lives

| Situation | Home |
|---|---|
| Work inside this arc | this plan and the PR |
| Actionable work that outlives the plan | a GitHub issue with a `Record` link to the archived plan |
| A product call | an issue labelled `owner-decision`, or `OWNER-ASKS.md` while the plan is open |
| A suspected exploitable weakness | a private draft security advisory |
| A finding needing unsupported conditions | a closed `known-limit` issue |

## Seeds (not run; the orchestrator owns the ELI5)

- `/goal`: Build fee-method-emoji-1 per `implementations-plan/fee-method-emoji-1/plan.md`: Phase 1 green, captures, Codex loop converged, PR open with captures; stop before merge.
- `/loop`: Each firing, read `STATUS.md`, run the next unfinished step of `plan.md`, record its gate, stop at the open PR.

## Audit verdicts

**Codex plan audit** (gpt-6.1-sol, high, read-only), 2026-11-13: approve with changes. Accepted:
- D2 narrowed: the payer label stays whole, A2 filed (the draft stripped it; see D2).
- The strip-before-cap claim was wrong: no test pins it; T4 adds the distinguishing assertion (D1).
- The press does not always recover the whole name (capped at 64; no chip for an emptied name); the joined-name case (`Nu🚀lo`) is stated in Security, with why it adds no new power.
- T1 and T3 aligned with the scope and with what each proves; a whitespace name joins T2.
- Recon's issue summary corrected (#605 is open, unrelated; #792 is about sentence-shaped names); the missing `F8` reference replaced.
- Gate wording: one command at a time, explicit working directories, executable pass criteria.

Rejected: none. Kept against the critique: the gate list keeps `audit:vue` and `test:all` beside the single commands, because the lane brief names that sequence.

**Final fresh Codex pass** (new session, gpt-6.1-sol, high, read-only), 2026-11-13: approve with changes. It confirmed F1-F5, D1 and D2 (two copy roles, not a patch), and verified I2 (`discovery-flow.ts:479` sanitizes and caps the stored name, so T4 pins the helper's order, not a recovery of what discovery cut). Accepted: the review wrapper's path and resume contract written into Post-implementation; the title is 91 characters; T1's exact failed text. Verify round (resumed): approve, no regressions.

**Arc review, round 1** (Codex, gpt-6.1-sol, high, read-only, over `origin/dev...HEAD` at `dbba75096`): approve, no findings. It compared `appChipOf` before and after over 10,031 inputs (byte-identical) and confirmed that only the three set-by prints change.

**Opus diff review** (beside round 1): approve. Accepted: the `appChipOf` doc wording (`029f7f11d`). Rejected: deleting T3 (the lane brief asks for the same-fixture pin of sentence and press) and trimming T2 to one print (the pick names both sentences; the four mounts cost milliseconds). Noted, no action: `stripPictographs` collapses spaces before `sanitizeWireString` removes control characters, so `" A \u0000 B "` keeps two spaces; it predates this arc and is the chip's own output.

**Fresh final Codex pass** (new session, gpt-6.1-sol, high, read-only, over the plan and `origin/dev...HEAD` at `1e43957d6`): approve, no findings. The chip's output was byte-identical over 10,016 inputs; no committed capture patch, local path or account name.
