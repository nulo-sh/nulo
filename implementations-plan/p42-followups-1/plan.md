---
plan: p42-followups-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at c8a423f2
trunk: dev
issues: "#734 (A1 Closes), #719 (A2 Closes); #746 #663 #676 #514 (Refs)"
post_implementation_hardening: not scheduled
---

# p42-followups-1: six page-42 picks

Two unstacked arcs, each one PR against `dev` (D-orch-1). **A1** builds P42-07, P42-12, P42-16, P42-17 and P42-19, all settled by the picks. **A2** builds P42-21 after the owner answers OA-1, the one detail its pick leaves open (D8). Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are relative to `apps/extension/src` unless they start with `apps/`, `packages/` or `implementations-plan/`.

## The picks (the owner's sign-off, quoted by id)

- **P42-07 B**: "The dollars too, on a two-line label in the shared footer." Owner's note (binding): "two lines, but remove the (dot) between the two lnes (at the right of "was") + it seems that it has a weird padding between the roles (not the standard one). Like they are closer than they should".
- **P42-12 B**: "One View Errors row for each case, with the two sentences above": (a) "Not restored: its key is not in this backup", (b) "Skipped: no account in this backup uses this key".
- **P42-16 B**: "The skeleton from the start, no count until the list answers."
- **P42-17 B**: "The approval window's label: Transfer (private) and the others."
- **P42-19 B**: "The grant card's rule: a movement label only for a call the wallet read; the authorization card first, since it signs."
- **P42-21 B**: "Record the call's contract, class and argument count on the journal entry so the words never change."
- As shipped, nothing to build: P42-06 A, P42-18 A, P42-20 A.

## Issues and claims that did not hold

- **#734** (fees-display-1 OA-2, OA-3) already tracks P42-07; the brief's "no issue; file one" would open a twin. P42-06 A and P42-07 B answer both asks: **A1 Closes #734**. Its OA-1 note (the Send review's re-ask submit clips at 10 FJ or $10) becomes a closed `known-limit` issue at close-out.
- **#719** (call-vocabulary OA-1 to OA-4): P42-17 B, P42-18 A, P42-19 B, P42-20 A, P42-21 B answer all five: A1 Refs, **A2 Closes #719**; Refs #514 (closed).
- **#746** OA-5 is P42-12; #746 stays open for its other five asks: **Refs #746, #663** (closed by #739). **#676** (closed) is P42-16's record: Refs. #675 is not touched.
- **P42-12 (a)'s example is not silent today.** A backup made after the imported-keys key was replaced carries its key rows sealed under the lost key (`account/service.ts:1048-1050`); each fails to rewrap with its own View Errors row (`:1150-1165`, recorded at `composables/full-backup-restore.ts:603`). Only the account drop says nothing. A wholly silent (a) needs an imported account with no key row: a keyless imported row in the source profile (#461, #475) or a doctored file.
- **P42-21**: the class a call runs is first known at a build (`tx-request-builder.ts:576-584`): the approval window's fee estimate (`dapp-send-executor.ts:486-736`), which no journal record is linked to, or the send's own build after approval. The queued record is written at message arrival (`wallet/services/wallet-sdk/queued-journal.ts:189-198`). Hence OA-1.

## Outcome & Quality Bar

- **For whom:** a person approving a raised fee in the dApp fee window; restoring a backup; opening Holdings; reading a dApp call in Activity, on its page, in the approval window, in flight or after it failed.
- **Excellent:** each surface reads exactly as its pick says, in both themes and both browsers, at 360 px (the fee window at 400 px), with before and after pictures in the PR. One rule per question: the Confirm's dollars are the card's; one function titles a settled call (its row, its header, its Calls box); every window card titles by `callTitle` with the window's own reading.
- **Good enough:** in-flight glyphs stay (P42-21 names the words); Holdings' error state keeps its summary (an `owner-decision` issue at close-out).

## UI impact (the visible budget: the picks above, nothing else)

- **Fee window (P42-07)**, 400 px: Confirm reads `SEND FOR ~0.00451 FJ` over `($0.032)` once the card's quote lands; one line before it or without a quote. The button keeps 40 px (two 13 px lines and a 4 px gap fit), so no window moves; the other three windows pass no second line. The card's "Fee went up" block becomes three rows at its 4 px gap: the title, `Was ~X FJ ($Y)`, `Now ~X FJ ($Y)`; no "·".
- **Restore (P42-12)**: in case (a) or (b) the import stops at today's warning ("Profile import completed with some errors. You can review the details or continue.") and View Errors lists one row per account or key with the pick's sentence.
- **Holdings (P42-16)**: from open until the list answers, the total is the skeleton (`aria-busy`) and the meta line shows no count while holding its height (with fiat off too, D5); then the count joins and page 39's price wait follows. An account change repeats it.
- **Activity row and transaction page (P42-17)**: a transfer the wallet read is titled with the window's label ("Transfer (private)", "Transfer (public)", "Transfer to public", "Transfer to private"), in the header upper case; the Calls box agrees; the own send's row still shows its symbol.
- **Execute window (P42-19)**, 400 px: createAuthWit's Function line labels a movement only on a call the window read; simulateTx, profileTx, executeUtility and simulate_utility name a call by its own name ("Transfer In Public"), the non-movement labels kept on their contract ("Claim Fee Juice" only on Fee Juice).
- **A2, in-flight row, terminal row, journal page (P42-21)**: a dApp call reads as its settled row will, from the moment OA-1's answer fixes.

## Architecture & Implementation

**P42-07.** `components/composite/DappApprovalFooter.vue` gains `confirmDetail?: string`, rendered after a space as a centred block line 4 px below the label inside the same `Text`, so the button's text and accessible name read `Send for ~X FJ ($Y)`. `FeeRaisedCard.vue` renders Was and Now as two `meta` rows in its column `Flex` (gap 4) and hands its `now` display up through a one-way `defineModel("now")`, as `FeeSettingsCard` hands `feeDisplay` (`FeeSettingsCard.vue:92,255-275`). `popup/windows/fee/index.vue` keeps line 1 from the question (it names the fee before the card mounts) and passes `confirmDetail` = `(${now.usd})` when the card's quote has one; the window gains no price client.

**P42-12.** In `composables/full-backup-restore.ts`: `restoreAccountsAndFilterOwnedSlices` also returns each restored account's slice position by scope, which `restoreAccountsStage` returns beside `held` and `useFullBackupImport.ts:465` passes to `settleHeldAccounts`. (b): `restoreAccountsStage` collects the scopes of every well-formed row of the backup's account slice (presence-guarded); a well-formed key row whose scope is in none gets `{ profileId, chainId, restoreError: "Skipped: no account in this backup uses this key" }` at its source position, merged with the key restore's placed results into one record call. A key whose account row is in the file stays as today: written, or silent when that account was refused (its own row explains). (a): `settleHeldAccounts` records each scope `reconcileImportedAccounts` dropped as `{ profileId, chainId, restoreError: "Not restored: its key is not in this backup" }` at that account's position (D3); a dropped held account gets this row and no "Waiting…" row. The console line stays count-only.

**P42-16.** `popup/pages/holdings.vue`: `awaitingPrices` becomes `showFiatValues && (isLoading || awaitingFirstPriceAnswer(rows, prices))`; `summaryMeta` is empty while `isLoading`, and the meta line keeps its height (D5).

**P42-17.** `utils/tx-enrichment.ts` gains `settledCallTitle(call, tokens)`: a call carrying the wallet's own `transfers` takes the label of `transfers[0].type` (the four `TRANSFER_LABELS` of `utils/token-transfer-vocabulary.ts`, number or enum name; an unknown type falls through), any other call `callTitle(method, contract, settledReading(call, tokens) !== null)`. `getTxTitle` returns it for the primary call (the `"Transfer"` branch goes); `popup/pages/tx/[id].vue:148` titles each Calls row with it (D6).

**P42-19.** `popup/windows/execute/OperationCard.vue`: `:628` prints `rowTitle(s.call, s.args)`; `:540`, `:580`, `:595` print `callTitle(name, contract, false)` with the call's contract, since the window reads none of these calls (D7). `callName` (`call-surface.ts:140`) loses its only caller and goes; its sanitising tests move to `rowTitle`.

**P42-21 (A2, designed on OA-1's ships-now form).** One exported `JournalCallSchema` = `{ contract, argCount, classId? }` (bounded strings, a small non-negative integer), used by `journalMetadataShape` (`wallet/services/operation-journal/spec.ts:270-280`), `setOperationMeta`'s params and both creators, so the writer and the reader accept the same values (a stored value the reader refuses would hide the row). Writes: both creators record `{ contract, argCount }` and the title from one selected primary call (`queued-journal.ts` from the wire calls; `beginJournal`'s callers from `op`), dropping `call` when it does not parse, so creation never fails on it; after a build, one slot-context method beside `markJournal` writes `title` and `call` together from `getPrimaryCall(txCalls)` in one `setOperationMeta`, on every path that yields `txCalls` (a fresh build, an estimate reuse at `dapp-send-executor.ts:1133`, `send_transaction`, no-`from`, which records no class). Every write is best-effort: a refused one leaves the record as it was, logs a fixed category at `debug`, and never fails the send. Reads: `utils/tx-amount.ts` `SettledCall.args` widens to `{ readonly length: number }`; `utils/journal-state.ts` gains `journalCallReading(op, tokens)`; `dappTitle`, `journalCardTitle` and `buildJournalTerminalCardProps` take the listed tokens; `journal/[id].vue`'s title and Method row use it; Home's executing-task fallback (`RecentActivityView.vue:180-191`) takes `callTitle(method, undefined, false)`.

**Not taken:** a window price client (it would read before the session gate); a footer slot (markup in every caller); decoding simulate and utility calls (wider than the pick); gating (b) on account type (it changes which keys are written, outside the pick: D4); a provisional journal label before the class (it would label a call the build refuses, as `scope-refusal` does); linking the window's estimate to the queued record (a new coordination path for a title).

## Security & Adversarial Considerations

- **Threat model:** a hostile dApp controls a call's name, `to` and argument count; a hostile backup controls every slice. No change grants, signs or executes anything: all six are display or log rows.
- **Journal fields (A2):** dApp-chosen values pass one schema at every writer and are dropped when they fail, so they can neither block a record nor hide one. A movement label still needs a token the person listed and the class the wallet's own build recorded; no authorization reads the fields. They join `nulo:journal` (`chrome.storage.local`, in no backup) holding the contract and class the settled history already holds in plain (#522). Never logged.
- **Restore rows (P42-12):** rows carry `profileId` and `chainId` only (the allowlist at `utils/full-backup-helpers.ts:287-298`); the per-call cap holds. Raw slice rows are presence-guarded.
- **Labels (P42-17, P42-19):** fewer movement labels on unread calls than today; the own send's label comes from the record's transfer type, which a hostile backup could already set to retitle a row. Strings stay `safeWire`-bounded text. No crypto, permission, dependency or workflow change.

## Assumptions

**Facts** (verified at `c8a423f2`; detail in recon.md): F1 the fee window has no price client and labels Confirm from the question (`fee/index.vue:113`); F2 a key row failing to rewrap has its own log row (`account/service.ts:1150-1165`, recorded at `full-backup-restore.ts:603`), its account's drop has none (`:650`); F3 Holdings' summary reads `$0.00`/`0 tokens` while its list loads (`holdings.vue:101-117`); F4 the detail page's Calls row titles by `callTitle` with the reading (`tx/[id].vue:148`); F5 the window's argument reading covers sendTx and createAuthWit calls (`display-calls.ts:33-40`) and public grants (`execute/index.vue:340-351`), none of the simulate and utility calls; F6 journal records parse through `journalMetadataShape`, which strips an unlisted key, and `setOperationMeta` writes without re-parsing (`spec.ts:270-295`, `service.ts:447-452`); F7 a person can pick a custom-named transfer function, so an own send's method may have no vocabulary label (`token/functions/runtime.ts:57-75`).

**Inferences:** I1 two 13 px lines and a 4 px gap fit the 40 px button in both browsers (the shots prove it); I2 at the build the title and `call` come from one `getPrimaryCall(txCalls)`, so they cannot describe two calls (A2 tests pin an unnamed call and a fee call beside the primary).

**Asks:** OA-1 (D8) for A2; A1 depends on none.

## Phases

Each gate also runs `bun run lint && bun run typecheck:all` from the repository root; every `bun --bun vitest run` filter runs from `apps/extension`; smoke runs use the armed build (`.claude/skills/e2e-testing/SKILL.md` § Build-armed tests), `--retry=0`; network runs `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent <file>`.

**A1 · Phase 0 — base and before shots.** Merge `origin/dev`; shoot every A1 surface on a `c8a423f2` build, light and dark (scratch specs under `~/.cache/nulo-backlog/p42-followups-1/`, adapted from the earlier lanes' capture specs there). Gate: `bun install --frozen-lockfile` and the fast layers exit 0.

**A1 · Phase 1 — P42-07.** Files: `DappApprovalFooter.vue`, `FeeRaisedCard.vue`, `popup/windows/fee/index.vue`, their tests, `tests/e2e/network/tx-sendTx-default.test.ts:200`. Tests: the footer with a detail (two lines, text with one space) and without (one line, no detail element); the card's Was and Now rows apart and its text never holding "·", beside the quoted case; `now` emitted once the quote lands; the window's Confirm one line before the card and without a quote, two with one, `refreshes()` still 0 then 1. Gate: `bun --bun vitest run src/components/composite/DappApprovalFooter src/popup/components/modules/send/FeeRaisedCard src/popup/windows/fee` exit 0; `tx-sendTx-default` on Chrome and Firefox green.

**A1 · Phase 2 — P42-12.** Files: `full-backup-restore.ts`, `useFullBackupImport.ts` (the caller), `useFullBackupImport.test.ts`. Tests: `:459` the orphan key gets (b) at index 4, the refused account's key none; `:497-499` the keyless held account gets (a) at its position, the keyed one keeps "Waiting…"; a dropped imported account on a seeded network gets (a); a key row that failed to rewrap keeps its own row beside its account's (a); no drop adds no row; no row holds a name or an address. Gate: `bun --bun vitest run src/composables/useFullBackupImport` exit 0; smoke `backup-imported-account`, `restore-outcome`; network `account-balance-orphans` green.

**A1 · Phase 3 — P42-16.** Files: `holdings.vue`, `holdings.test.ts`. Tests: a held first read shows the skeleton, `aria-busy`, no count, never `$0.00`; its answer brings the count with the skeleton kept while prices wait, then the figure (success control); fiat off with the read held shows no count and the line keeps its height; an empty answered list reads `$0.00`, `0 tokens`. Gate: `bun --bun vitest run src/popup/pages/holdings` exit 0; smoke `holdings-add-token`, `token-list`, `fiat-display` green.

**A1 · Phase 4 — P42-17, P42-19.** Files: `tx-enrichment.ts`, `call-surface.ts`, `OperationCard.vue`, `tx/[id].vue`, their tests. Tests: an own send takes its type's label with a custom-named method, canonical names as controls; a read dApp transfer takes its label, an unread `transfer` stays "Transfer"; the header equals the Calls row; createAuthWit unregistered "Transfer In Public", registered "Transfer (public)" (control); a simulateTx and a profileTx row "Transfer In Public"; executeUtility and simulate_utility `claim` off Fee Juice "Claim", on it "Claim Fee Juice". Gate: `bun --bun vitest run src/utils src/popup/windows/execute src/popup/pages/tx` exit 0; smoke `rows`; network `tx-transfer-row`, `type-roles-windows` green.

**A1 · Phase 5 — arc gate and after shots.** `bun run audit:vue`, `bun run test:all`, `bun run check:plans` exit 0; a fresh armed build and the whole smoke suite on Chrome; a network file again only when its code changed after its phase's run; after shots, light and dark.

**A2 · Phase 6 — P42-21** (after OA-1; a B answer is a plan change). Files: `operation-journal/{spec,service}.ts`, `wallet-sdk/queued-journal.ts`, `execution/{execution-lane,dapp-send-executor}.ts`, `tx-amount.ts`, `journal-state.ts`, `journal/[id].vue`, `RecentActivityView.vue`, `activity/TransactionsList.vue`, their tests, `tests/e2e/network/scope-refusal.test.ts:131-139`. Tests: hostile `to` (an object, 1,000 characters) and `args` (not an array, huge) still create a readable record with no `call`, well-formed values recorded (control); a refused `setOperationMeta` leaves the record readable and the send committing, a valid one survives a reread; the build writes title and `call` from the built primary on the fresh, reuse and no-`from` paths, an unnamed call and a fee call beside the primary included; a record with no `call`, a missing or another class, or a wrong count reads "Transfer In Public", one on a listed token with its class "Transfer (public)" (control); a `claim` off Fee Juice "Claim"; the journal page title equals its Method row. Gate: `bun --bun vitest run src/wallet/services/operation-journal src/wallet/services/wallet-sdk src/wallet/services/execution src/utils src/popup/pages/journal src/popup/components/modules/general` exit 0; network `scope-refusal` green; then Phase 5's gate for A2.

## Decision ledger

| # | Question | Decision | Codex r1 | Opus |
|---|---|---|---|---|
| D1 | Two-line Confirm | `confirmDetail` prop, a block line in the label's `Text` | sound | sound |
| D2 | The Confirm's dollars | the card's quote, emitted (`v-model:now`) | sound | sound |
| D3 | Which drops get (a) | every account the reconcile dropped | only when no key row | sound |
| D4 | Which keys get (b) | a well-formed key whose scope is no account row of the file | gate on imported accounts | sound |
| D5 | Fiat off while the list loads | no count, the line's height held | no ask | ask, or hold the height |
| D6 | Own send's title | its stored transfer type's label | type label | type label (optional) |
| D7 | Simulate and utility cards | `read` false | sound | sound |
| D8 | When the class is recorded | owner ask OA-1; ships at the send's build | owner ask | owner ask |
| D9 | Journal field shape | nested `call`, one schema at every writer, `args` as a length | prove hostile values | one schema |
| D10 | In-flight glyph | unchanged | sound | sound |

D3: the pick's own example of (a) is a backup whose key rows are present but sealed under a lost key, so the pick's (a) is "no usable key", which every reconcile drop is; the export page calls that state "Imported keys are not in this backup" (`popup/pages/settings/security/export/full.vue:238`), and a present key keeps its own row saying why. Codex's narrower rule would leave the pick's example without its row. D4: scope membership decides which keys the restore writes today; gating (b) on account type would stop writing a key at a derived account's scope, a behaviour change outside the pick for a doctored file whose key signs nothing (a closed `known-limit` issue at close-out). D5: Codex reads the pick's clause as settling fiat off; Opus's collapse is real, so the line holds its height, as the skeleton holds it with fiat on (page 42's OA-2 A). D8: both legs; the split lets A1 ship without it.

## Audit verdicts

- **Codex round 1** (gpt-6.1-sol, high, session `01a15020`): reject (D3 misreports key failures; D6 misses custom-function own sends; D8 can combine two calls' metadata). Accepted: D6 type label for the own send, shared by the Calls row; title and `call` written together from the built primary, the creators from one selected wire call; D8 to the owner; hostile-value tests that prove a readable record, refused updates that keep it, class and count mismatches beside a matching control; "no drop adds no row" reworded; profileTx and both utility cards tested; network reruns only after a change. Argued: D3, D4 (above).
- **Opus 5.5 (Plan)**: conditional approve (findings 1-5 before the journal phase; D5 to the owner). Accepted: D8 to the owner, with the window's estimate build named as an earlier point; one `JournalCallSchema` at every writer, since `setOperationMeta` writes unparsed (`service.ts:447-452`); `safeParse` at both creators; one write of title and `call`; the write on every `txCalls` path; F2's citation; I2 restated. D5: the line's height held instead of an ask.
- **Codex final pass** (fresh session `01a15030`): conditional approve (conditions: the restore caller's plumbing in Phase 2; explicit working directories). Applied both; F5 qualified (public grants are decoded too; D7 holds). A1 judged fully specified and independent of OA-1. **Resumed: approve** ("All three corrections are present and consistent with the inspected code. No new bugs or regressions found.").
- **Codex round 1, resumed**: conditional approve (condition: OA-1's wording overpromised). D3 withdrawn on the pick's own example; D4's known limit proportionate (its issue carries a reopening condition); D5 settled; the split right. Applied: OA-1's option A states that a refused call keeps today's retitle, that a no-`from` call or a failed write keeps its own name, and drops "at most once".

## Delivery

- **A1**: one PR from branch `p42-followups-1-a1` (off `origin/dev`, carrying the plan commit), opened after its gates and the Codex loop. Title (73 characters): `feat(ui): fee window dollars, restore rows, holdings skeleton, call words`. Body: each pick quoted by id and text, light and dark before and after shots (PNGs under `apps/extension/pr-screens/` in one commit linked by its SHA, deleted in the next), the validation runs, each touched e2e file's wall-clock before and after per browser, `Closes #734`, `Refs #719 #746 #663 #676 #514`.
- **A2**: after A1 merges and OA-1 is answered, branch `p42-followups-1-a2` off `origin/dev`; title `feat(activity): in-flight dapp calls read as they will settle`; `Closes #719`; carries the close-out.
- Merge `origin/dev` before each PR and retake the shots after any merge touching their files (owner-feedback-1 arc 3 edits `OperationCard.vue`). Open without labels; add `e2e:extension-network` or `e2e:extension-smoke` only if a path filter skips a suite.

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `c8a423f2`; step 1 absent (`code_review: off`). Step 2 once per arc over its diff after its last phase: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, hard stop at three rounds; one Opus review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1; log in `lessons/phase-<N>.md` and Audit verdicts. Close-out as A2's final commits: file the #734 OA-1 note and the derived-scope key (D4) as closed `known-limit` issues and Holdings' error-state summary as an `owner-decision` issue (dedupe first); comment on #746. Teardown once `implementations-plan/archive/p42-followups-1/plan.md` is on `origin/dev`: `agent-worktree done p42-followups-1 --merged`.

## Seeds (orchestrator-owned; not run)

```
/goal implementations-plan/p42-followups-1/plan.md: the arc's phases green in STATUS.md, its Codex loop converged (a resumed pass with no new material finding quoted), its PR open against dev with its Closes line, `bun run test:all` and `bun run lint` exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/p42-followups-1: read plan.md and STATUS.md; run the next unticked phase and its gate; consult Codex on any decision; never change what a person sees beyond the plan's UI impact; never start A2 before OA-1 is answered; stop after the PR's checks report.
```
