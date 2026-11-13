---
plan: fee-words-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev at 43970003b
status: approved
---

# fee-words-1: two more fee lines name the app as its chip does

Page 147, signed 2026-11-13 19:50 UTC. #1809 (P147-01) made the approval window's three "set by" lines read the app's declared name through the chip's label rule, `appLabelOf` (`apps/extension/src/components/composite/contract-chip.ts`). The page's two questions were the two other fee lines that print that name; the owner picked **b** on both:

- **P147-02 = b**: "Stripped like the approval window's sentence; the App row above it keeps the whole name."
- **P147-03 = b**: "The label stripped like the line above it: "Playground pays"."

One arc, one PR against `dev`. It changes what users see, so it does not land on its own: the orchestrator lands it on the owner's approve of its captures. No issue matches (searched `pictograph`, `emoji`, closed `known-limit` "app name"), so the PR carries no `Closes` and no `Part of`. Recon: [`recon.md`](recon.md). Owner asks: none ([`OWNER-ASKS.md`](OWNER-ASKS.md)).

Proportion (lane brief): two strings through an existing function. No plan audit round; one Codex pass over the plan and the net diff after the build; no Opus review.

## Decision ledger

| ID | Decision | Why, and the alternatives |
|---|---|---|
| D1 | `tx-detail-helpers.ts` names the app once, `appLabelOf(tx.origin?.name) \|\| "the app"`, in a module-local helper read by both branches that print it (`describeExternalFee`'s legacy dApp row, `describeAppFee`'s four forms). | One rule, the chip's, for every fee line; a local helper keeps the two branches from drifting. The L4 module importing the L3 `contract-chip.ts` is allowed by `biome.json`'s layer overrides. Rejected: calling `stripPictographs` directly (a second spelling of the chip's rule, and no 64-code-point cap). |
| D2 | `OperationCard.vue` drops `payerName`; the failed readout's label reads `${appName} pays`, the same name the method line above it prints. | P147-03 names the label "stripped like the line above it", which is `appName`. Two names for one app on one row no longer has a reason. |
| D3 | An emptied or whitespace-only name reads "the app" on both lines. | Follows from `appLabelOf` returning `""` for those. Today History prints `Set by ` plus the spaces (`??` falls back only on a missing name); the window's label already reads "the app" for a name `safeWire` empties. |
| D4 | Tests in the unit and component layers only; no new e2e scenario. | Both changes map a string inside a pure helper or one component. `fee-sponsor-funding.test.ts` reads History's line (`Sponsored, set by ${app}`, where `app` is captured from the window's already-stripped sentence) and runs unchanged as the regression gate; its playground declares `nulo-playground`. No smoke spec reads either line. |
| D5 | Captures reuse #1809's capture-only kit (`recon.md` § Capture kit): the smoke fixture for the failed row, a network capture spec over the local sandbox with the playground renamed "Playground ✅🚀" for History. Neither patch is committed. The network gate runs on the committed tree in its own invocation; the capture run is the second. | The gate of record must run the code that ships; a renamed playground is a capture prop. |
| D6 | No accessibility call. | Text only; no focus, Tab stop or ARIA wiring moves. |

## UI impact

- **History, transaction page, "Fee method"** (`tx-detail-helpers.ts`, read by `popup/pages/tx/[id].vue`): before "Sponsored, set by Playground ✅🚀"; after "Sponsored, set by Playground". Every form that names the app ("Set by …", "\<proven\>, set by …", "Public Fee Juice (with claim), set by …") reads the stripped name; an emptied name reads "the app". The App row above keeps the whole declared name. Sign-off, **P147-02 = b** (2026-11-13 19:50 UTC): "Stripped like the approval window's sentence; the App row above it keeps the whole name."
- **Approval window, failed-estimate row, the readout's label** (`OperationCard.vue`): before "Playground ✅🚀 pays"; after "Playground pays"; an emptied name reads "the app pays", as a nameless app does today. "You pay" is unchanged. Sign-off, **P147-03 = b** (2026-11-13 19:50 UTC): "The label stripped like the line above it: "Playground pays"."
- Nothing else: no testid, tooltip, glossary term, stored key or new word.

## Security & Adversarial Considerations

- **Threat model.** A dApp controls its declared name and can pick emoji or check marks that read as a mark of trust. After the change neither fee line can show them; the App row and the chip's press still quote the declared name, as the owner chose.
- **Input.** The name passes `stripPictographs` then `sanitizeWireString` (control and format characters, 64-code-point cap), the chip's order; Vue escapes the text. History reads the stored session name, which discovery already sanitizes and caps; `appLabelOf` adds the cap there too.
- **Joined names** (`Nu🚀lo` reads "Nulo") give the dApp no new power: it can declare "Nulo" outright today. Recorded with #1809 (`archive/fee-method-emoji-1/plan.md`).
- No storage, permission, secret, dependency or log line changes.

## Assumptions

**Facts** (checked at `43970003b`):
- F1. `tx-detail-helpers.ts:67` prints `tx.origin.name ?? "the app"` for a dApp row with no recorded chooser; `:75` sets `app` the same way for `describeAppFee`'s four forms.
- F2. `OperationCard.vue:188-189`: `appName = appLabelOf(props.dapp?.name) || "the app"`, `payerName = safeWire(props.dapp?.name, 64) || "the app"`; `:421` prints `${payerName} pays`. `safeWire` stays imported for other prints.
- F3. Only `tests/e2e/network/fee-sponsor-funding.test.ts:353` reads History's line; no e2e spec reads the failed label (`git grep` of ` pays` and `set by` under `apps/extension/tests/e2e`).

**Asks.** None.

## Phase 1: the two lines and their tests ✓

1. `apps/extension/src/popup/components/modules/tx/tx-detail-helpers.ts`: import `appLabelOf`; add the local helper (D1); read it at `:67` and `:75`.
2. `apps/extension/src/popup/windows/execute/OperationCard.vue`: delete `payerName`; the label reads `${appName} pays`; the comment above `appName` states one rule for the whole row. Every testid unchanged.
3. Tests, wire-shaped (the name arrives as declared, `"Playground ✅\u{1F680}"`):
   - T1 (`tx-detail-helpers.test.ts`, the "who chose the fee" describe): one `test.each` over both branches: the protocol sponsor reads "Sponsored, set by Playground"; the legacy dApp row (no chooser) reads "Set by Playground"; an emptied name (`"✅\u{1F680}"`) reads "Sponsored, set by the app". The existing "Foo" cases stay as the success control.
   - T2 (`OperationCard.fee.test.ts`, the emoji describe): the failed row's case reads `FeeSet by PlaygroundPlayground paysCouldn't estimate fee.Try again` (the assertion that pinned the whole name is this change); the emptied-name test adds the failed block, `FeeSet by the appthe app paysCouldn't estimate fee.Try again`. The "You pay" row stays the control.

**Validation gate** (retry 0, one command at a time, from the worktree root): `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run --cwd apps/extension test:components`; `bun run check:plans` after staging; then `NULO_E2E_BROWSER=chrome NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/fee-sponsor-funding.test.ts` (`agent.sh` claims ports from `~/.agents/ports.md`; the 10-minute stall watchdog stays). No smoke spec reads either line (F3), so none runs; no Firefox run (no fixture, focus, window or WebAuthn change). Pass: every command exits 0; T1 and T2 pass; every other existing assertion passes unedited.

## Phase 2: captures and the PR ✓

1. Copy the capture kit from scratch into the tree, capture at 400 px in both themes into the lane's scratch `shots/` with `captions.json`, restore the tree:
   - `fee-failed-stripped-400`: the smoke fixture's failed row, "Set by Playground" over "Playground pays".
   - `history-fee-method-stripped-400`: History's transaction page of an app-sponsored send by "Playground ✅🚀" over the local sandbox: "Fee method: Sponsored, set by Playground", the App row "Playground ✅🚀".
2. Commit the PNGs under `pr-captures/fee-words-1/` in one commit; delete them in the next.
3. Post-implementation, then the PR.

**Validation gate.** `git status` clean after the restore; `git grep -n 'capture-emoji' apps/extension/src` and a grep for the renamed app id in `apps/playground/src` show no capture patch (a bare `capture-` hits unrelated test comments); every frame exists in both themes; `bun run check:plans` exits 0 after staging.

## Delivery

One PR from `fee-words-1-a1` (off `origin/dev`, carrying the plan commit) to `dev`, opened ready, no label. Title (87 characters; the brief's suggestion is 93, over the cap): `fix(fee): History's fee method and the failed row's label name the app as its chip does`. The body quotes both sign-offs verbatim, embeds the captures from `pr-captures/fee-words-1/` at the commit that adds them, lists the gates with outcomes and says no e2e scenario was added. Merging is the orchestrator's, on the owner's approve.

## Post-implementation

Execution contract: this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `43970003b`. Plan-specific values:
- Step 1: `code_review: off`, so absent.
- Step 2, thinned by the lane brief: after Phase 1 is green, ONE `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol` over the plan and `origin/dev...HEAD`, the prompt in the lane's scratch dir. Take its findings and rerun only the gates a fix touches. A second round only if the first says anything but approve (resume with `resume-codex.sh`; hard stop at three). No Opus review.
- Step 3: `gh pr create` as Delivery says; `gh pr checks <n> --watch` once.
- Step 4, close-out in the same PR's final commits: Outcome, lessons (none expected), `STATUS.md` deleted, `git mv` into `archive/` in its own commit, the index line to `archive/index.md`, after merging `origin/dev` in.
- Step 5: teardown is the orchestrator's.

## Seeds (not run; the orchestrator owns the ELI5)

- `/goal`: Build fee-words-1 per `implementations-plan/fee-words-1/plan.md`: Phase 1 green, captures, one Codex pass, PR open with captures; stop before merge.
- `/loop`: Each firing, read `STATUS.md`, run the next unfinished step of `plan.md`, record its gate, stop at the open PR.

## Audit verdicts

No plan audit round (lane brief, Proportion).

**Codex pass over the plan and the net diff** (gpt-6.1-sol, high, read-only, `43970003b...51402dab5`), 2026-11-13: approve, no findings, high confidence. It confirmed every History form that names the app reads `appLabelOf`, the legacy no-chooser row included; the missing, emptied and whitespace fallbacks; the App row, chip, press and "You pay" unchanged; no caller or layer rule broken; the six new or edited cases fail on the base and no assertion was loosened. No second round (the lane brief runs one unless the first says anything but approve).
