---
plan: followups-p15
tier: light
status: draft, awaiting the orchestrator's approval
issues: "#294 #316 #321 #339 #340 #290 (arc 1, closes); #108 #103 #250 (arc 1, refs); #341 #112 (no arc)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet) and one probe; one Codex audit (gpt-6.1-sol, high) with a resume round; one Opus Plan critique
base: origin/dev at 479ba56d
trunk: dev
post_implementation_hardening: not scheduled
---

# followups-p15: the twelve calls of decision page 15

One arc, one PR against `dev`. The logs filter loses its dead rows (#294). The add-sponsor form refuses a stored address (#316) and account import a taken name (#290). The PXE store refusal stops quoting the stored stamp (#321). The wallet tells a pasted non-token apart (#339) and files a cap refusal as its own refused row (#340). An Unconfirmed send found on chain reads "Sent" (#108). A token of unknown decimals shows no figure on the settled card and sorts with the unknown rows (#103). The skill states how the move label is revoked (#250). #341 and #112 need no code. Recon: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Scope

**In:** each issue's signed option, as the lane brief quotes it. **No arc:** #341 closes as not planned with its decision text. #112 gets the decision as a comment (A1). **Out:** #156, #116, #132 (page 18), #383, #251 (other lanes). Words the page did not give (OWNER-ASKS).
**One arc, not two:** every code item but #250 changes a popup surface, and #250 is one sentence. A second PR would run a full CI pipeline for that sentence.

## Outcome & Quality Bar

- **For whom:** a person who adds a sponsor, imports an account, pastes an address to add a token, or reads History after a send. Also a developer who filters the logs window.
- **Excellent:** each changed screen matches its signed sentence, and nothing else moves. No row claims what the wallet cannot prove: no "before anything was signed" on a cap row, no "Unconfirmed" on a send the chain holds, no figure in guessed decimals.
- **Good enough:** words the page did not give ship as the existing wording, or wait. No new component, token, option or glossary term.

## Claims that did not hold

- #294: six rows are dead, not five. `token-list-client` is dead too, because the token-list service (#389, after the issue) has no popup client. The probe is in recon. The signed converse check refuses it, so it goes with the five (I-1).
- #340: the cap row's detail reads "Stopped before broadcast", not "Reported by app". `refuseSlot` fails the row before `submitting`: `pending` on the silent path, `queued` on the popup-approved one (`dapp-interaction/service.ts:350`). Either way `wasNeverSent` holds (recon). `refuseSlot` has already failed the row when `queuedFailureKind` could see it, so the issue's queued-journal test has no path.
- #250: the live read shipped already. Only the skill's sentence lacks the revoke half.
- #112: the signed option text says #112 "stays open"; the lane brief says close it (A1).
- #103 OA-8: the settled send's detail page shows the same figure; the signed option names only the card (OA-4).
- #340's "filed under the shared refused kind": the issue's fix names `wallet_refused`, but that kind cannot get its own line without a stored discriminator; the plan files a new kind with the shared label (D6, A3, I-2).
- Found beside #294: `deleteProfileClient()` logs under `profile-delete-client`, which has no row, so the filter drops its lines (`profile/client.ts:131`). Adding a row is the owner's (OA-6).

## Assumptions

**Facts** (citations in recon.md):
1. `LOG_SOURCES` order is the filter's row order.
2. `getFpcs(chainId)` serves the active profile's sponsor rows on that chain, the discovered protocol rows included. If discovery fails, the protocol rows are missing and the check cannot see them (`fpc/service.ts:172`); acceptable.
3. `appStore.accounts` is the active profile's accounts on the active chain, hidden ones included: the list New account checks. So "in the profile" means on the active chain, as for New account.
4. `trim()` logs an `Error` as `{ name, message }`, and the offscreen hop carries the message only: a `cause` is neither shown nor logged.
5. A `WalletError` subclass absent from `error-envelope.ts` reaches a dApp as `UNCLASSIFIED_ERROR_MESSAGE`, as today's plain `Error` does.
6. Journal copy is keyed by `error.kind`, the stage a row failed from, and its check (`journal-state.ts:79-84`, `:233-236`), never by message text. `JobErrorKind` is an open union with a drift-guarded table.
7. "present" from `proveExpired` proves only that the expiry nullifier is spent; the row's own receipt is `minedVerdict`.
8. Home's placeholder rows hold a zero balance and no `hasDecimals`.

**Inferences:** I1, no popup client for `token-list` is planned. I2, "present" and a missing contract are the configured endpoint's answers, as every check here already trusts; a lying endpoint misleads these rows today, and this lane adds no cross-node check.

**Asks** (orchestrator; the arc proceeds on the working assumption):
- **A1 (#112).** Close it, as the lane brief says, or leave it open, as the signed text says? Working assumption: comment the decision and leave it open.
- **A2 (#340).** The decision record quotes "Too many sends were already waiting. Nothing was sent." with no owner note; the lane brief sends it for approval. Working assumption: until OA-3 is answered, the cap row reads exactly as today; the new kind sits beside `dapp_execute` in the copy switches, and one edit moves it to the shared label and the answered line.
- **A3 (#340).** The plan reads "filed under the shared refused kind" as the shared refused row (its label "Refused before sending"), stored as a new `error.kind` literal (D6). The literal form, `wallet_refused` plus a typed reason, adds a field to the persisted `JobError` (an owner call). Working assumption: D6.
- Owner asks OA-1 to OA-6, and the information items I-1 and I-2 (OWNER-ASKS.md).

## Architecture & Implementation

- **#294.** In `useLogFilters.ts`, the `flatMap` skips the `-client` twin for names in a `NO_CLIENT` set (`wallet-sdk`, `token-list`), and `faucet` and `rpc` leave the list. Row order is kept. `useLogFilters.scan.test.ts` computes the registration and logger-call results once, lazily inside the tests, so a resolver error still fails a named test. A new test asserts that every row is in their union. `logs-format.ts`'s acronym rule is a display rule per name segment and stays.
- **#316.** The address rule in `NewFpcPopup.vue` returns "Already exist" when `fpcs` holds a row with the same address (`sameFieldAddress`). The address field's `#right` slot shows it after the hex check, and `isAvailableToAddFpc` refuses on the address error. A form rule mirrors the name rule; no service check (D3).
- **#290.** `import.vue` gains `nameTaken` (`sameStoredName` over `appStore.accounts`), a `FieldWarning` "Already exist" in the name input's `#right` slot, and `|| nameTaken` in the CTA's `:disabled` and in `handleConfirmImport`'s guard (the Enter path).
- **#321.** The parse branch of `initStoreVersionStamp` sets `mismatch = UNPARSEABLE_STAMP`. It keeps the parser's error, and the throw passes `{ cause }`. The warn line is unchanged; the comment at `:223` and the now-unused `errorMessageFromUnknown` import follow.
- **#339.** `packages/extension-messaging/src/errors.ts` gains `ContractNotFoundError` (code `CONTRACT_NOT_FOUND`, a constant message, no address), listed in `REBUILT_AS`. `parseTokenInterface` throws it where it threw `Error("contract instance not found")`. The dApp envelope does not change (Fact 5). The seeder's log allowlist (`seeder.ts:797`) gains the name, so a seed refusal still logs a named category. The class has no popup consumer until OA-2 is answered, on purpose. `NewTokenPopup.vue`'s catch gains an `instanceof` branch only with OA-2's words; until then the popup reads the generic line.
- **#340.** A kind `too_many_pending` joins `KnownJobErrorKind` and its table, and `refuseSlot` files it. `error.kind` is `z.string().min(1)` in the stored schema, so the literal needs no schema change. Until OA-3 is answered, its arms sit beside `dapp_execute`'s in `nothingSentLabel` and `kindLabel`, and `failedSubtitleFor` keeps its default: the row reads exactly as today (A2). With the answer, `kindLabel` returns `{ label: "Refused before sending", context: <the answered line> }`, `failedSubtitleFor` returns "Refused before sending", and `nothingSentLabel` falls through to `kindLabel`.
- **#108.** On "present", `expiryAnswer` reads the row's receipt. A mined success returns `{ next: verdict, refresh: true }`. A receipt read that throws keeps the slow watch already set, as a failed `proveExpired` read does; `minedVerdict` swallows a throw, so this read goes through the node already held and reuses `verdictOf`. Any other receipt (not mined, or reverted) unwatches, as "present" does today. `isSendCheckMove` admits `unconfirmed → sent` on a row with a recorded expiry, with or without `inclusion` (a non-final block goes on to `finalityAnswer`). Its doc comment gains the edge, and `expiryAnswer`'s doc comment says what "present" now does.
- **#103 (OA-8).** `TransactionCard.vue` finds the listed token for `call.contract`, as `txAmount`'s mint branch does. For a transfer whose listed token has `knownDecimals(...) === null`, `amountStr` and `amountFiat` are null. The title keeps the symbol, as the journal card does. An unlisted token keeps the record's figure (`tx-amount.test.ts:80`). The `tokens` prop comment (`:34`) now names transfers too.
- **#103 (OA-9).** `classifyRow`'s held branch returns `"unknown"` when `knownDecimals(tb.token) === null`. Zero balances (placeholders) and pins do not change: pin membership is decided first, by design. The file header and `RowClass` doc say what "unknown" now holds.
- **#250.** `SKILL.md:13`'s parenthesis states the decision: the label takes effect when the unit-tests job next runs. Re-run the failed job after applying it; re-run the job after removing it to revoke a green result. A run that already passed stays green until then.
- **Not taken:** reusing `ContractNotRegisteredError` (#339): the dApp's `registerToken` refusal would change from unclassified to `-32602` "Register it and retry", a public contract change. Filing the cap under `wallet_refused` and picking its line from `error.message` (#340): copy keyed on text, against the kind-keyed design. A pure helper for the card's figure (#103): three lines in the card read better than a second walk of the calls. Decision ledger below.

## Security & Adversarial Considerations

- **Trust boundaries.** A pasted address (#316, #339) passes the hex or address parse before any compare or lookup. Stored rows (#108, #103): a hostile backup could plant `check` or `hasDecimals`. The move rule still refuses anything but `expired` or `sent` from `unconfirmed`, and `hasDecimals: false` only hides a figure. The PXE stamp (#321): the hostile stored value no longer reaches the message; the cause stays in process (Fact 4).
- **#108 trust.** The post-expiry receipt comes from the endpoint the send used, as the first read's receipt does. This adds no new trust.
- **Information.** The new error carries a constant message; the new kind carries the error's own message, as `dapp_execute` did. No new log line carries a value. The dApp envelope is unchanged.
- **Supply chain.** No dependency change.

## Phases (one arc)

Fast gate `F`: `bun run lint && bun run typecheck:all && bun run test`, plus `bun run --cwd packages/<name> test` for each touched package. Pass: every command exits 0. A phase is ✓ only when its gate passes.
Smoke `S(file)`, per browser `B` (`chrome`, then `firefox`): `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:B`, then `cd apps/extension && NULO_E2E_BROWSER=B NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/<file> --retry=0`. Rebuild after a source change.
Network `N(file)`, Chrome, one at a time: `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/<file>.test.ts`.

1. **#294.** Change: `useLogFilters.ts`, `useLogFilters.scan.test.ts`. Test: the converse test, red on the base list with the six dead rows named, green after. UI impact: P15-01, "Remove the five rows ... so the filter lists only sources that log", and I-1. Gate: `F`.
2. **#316.** Change: `NewFpcPopup.vue`, `NewFpcPopup.test.ts` ("duplicate names" gains two cases). Never: the protocol row's address, pasted in upper case, warns "Already exist", disables Submit, and Enter calls no `addFpc`. Control: the address changed to a new one submits. UI impact: P15-02, "Refuse the address in the add form when it is already stored for this profile and network". Gate: `F`.
3. **#290.** Change: `import.vue`; new `import.test.ts`, mounted in the confirm step. Never: another account's name with outer spaces, or a hidden account's name, warns, disables "Import Account", and Enter imports nothing. Control: a new name imports on Enter. UI impact: P15-07, "'Already exist' warning, 'Import Account' disabled until the name changes". Gate: `F`.
4. **#321.** Change: `opfs-store.ts`, `opfs-store.test.ts:90-103`. Test: the message equals the category sentence exactly, it holds no stored bytes, and `cause` is the parser's error. Gate: `F` with `packages/aztec-runtime`.
5. **#339.** Change: `errors.ts`, `token/service.ts:705`, `seeder.ts:797`, tests (`seeder.status.test.ts:221`'s category pin gains the named case). Tests: the parse rejects with `ContractNotFoundError` on a missing instance; the class rebuilds by code (`errors.test.ts`); `error-envelope.test.ts` maps it to the unclassified message. `token/service.composition.test.ts`: a node exception during the lookup stays a plain error, and the existing successful parse (`:122`) is the control. `NewTokenPopup.test.ts`: the rebuilt error reads the generic line until OA-2 is answered, then the owner's line, with the plain error as the control. Gate: `F` with `packages/extension-messaging`.
6. **#340.** Change: `types.ts` (union, table, producers doc), `types.test.ts`'s `produced` list, `execution-lane.ts:434`, `journal-state.ts`. Tests: `execution-lane.test.ts:140` expects the new kind, from both stages `refuseSlot` meets (`pending`, `queued`). `journal-state.test.ts`: one `test.each` over records shaped as `refuseSlot` writes them (`from: "pending"` and `from: "queued"`); the card and the detail page read today's text until OA-3 is answered, then the shared label and the answered line. The taxonomy coverage test covers the kind. UI impact: P15-05, "The shared label with a line that drops the signing claim", only with OA-3's answer. Gate: `F` with `packages/wallet-core`.
7. **#108.** Change: `send-check.ts`, `operation-journal/spec.ts`. Tests: `send-check.test.ts:533` becomes the never case: a present nullifier with no mined receipt writes nothing and unwatches. New: a present nullifier with a mined success receipt writes `sent` and refreshes balances (control). A receipt read that throws writes nothing and keeps the watch, and a later read that succeeds writes `sent`. A lock during the receipt read writes nothing. A reverted receipt writes nothing (OA-5). `service.test.ts:843-885`: `unconfirmed → sent` is admitted with a recorded expiry and refused without one. UI impact: P15-09, "An 'Unconfirmed' row whose post-expiry check finds the transaction on chain moves to 'Sent'". Gate: `F`.
8. **#103 card.** Change: `TransactionCard.vue`, `TransactionCard.test.ts`. Never: a priced transfer (the fixture at `TransactionCard.test.ts:201`) of a listed token with `hasDecimals: false` shows no figure and no fiat, and its title keeps the symbol. Control: the same transfer with a listed 6-decimal token shows both. The record is wire-shaped (`amount` as a decimal string). UI impact: P15-10, "no figure while the wallet's token for that contract has unknown decimals". Gate: `F`.
9. **#103 order.** Change: `token-order.ts`, `token-order.test.ts` (its `row()` fixture gains `hasDecimals: true`, as every stored token has, or every funded fixture would classify unknown). Never: a held `hasDecimals: false` row ranks with the unknown rows, behind a held unpriced row. Controls: the same row with known decimals stays held-unpriced; with a zero balance it stays empty; pinned, it stays pinned. UI impact: P15-11, "with the rows whose balance is unknown, at the end of the list", on Home, Holdings and the Send picker. Gate: `F`.
10. **#250.** Change: `.claude/skills/complexity-budgets/SKILL.md:13`. Gate: `bun run lint`.
11. **Arc gate.** Commands: `bun run test:all`, `bun run test:ci-gating`, `bun run check:plans`. `S(file)` on both browsers for `settings-crud`, `account-import-export`, `imported-account-lifecycle`, `backup-imported-account`, `holdings-add-token` and `send-outcome-rows`. `N(file)` for `holdings` (its missing-contract case drives #339's refusal over the real hop), `account-balance-orphans` (a re-import under the default name after a delete) and `fee-sponsor-funding`, then `NULO_E2E_PROVERLESS=1` with `N(failed-send-check)`. No e2e scenario is added: each fix is a pure rule or a component state that a unit or component test proves. If OA-2 is answered, `network/holdings.test.ts:135` reads the new line; the PR then states that file's wall-clock before and after. Screenshots in both themes: the logs filter, the sponsor form with a stored address, import with a taken name, a cap row's card and detail (seeded as `send-outcome-rows` seeds), a settled card with no figure, and the Holdings order. Pass: all green, and the screenshots go in the PR.

## Delivery

Single arc: branch `worktree-followups-p15`, one PR against `dev` with `gh pr create`, opened after phase 11 and the Codex loop. Title (83 characters): `fix(wallet): page 15 follow-ups: log rows, sponsor and name checks, refusals, sends`. Body: what changed and why, a UI impact line per surface with its screenshots, the validation runs, "no e2e scenario added" (with `holdings`' wall-clock before and after if OA-2 changed its line), `Closes #294 #321 #290`. Add `Closes #316`, `#339` and `#340` only when OA-1, OA-2 and OA-3 have answers the arc carries; otherwise `Part of`. Then `Refs #108 #103 #250` and the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Open it without labels, then add `e2e:extension-network` if the path filter skips the network lane. No parallel lanes: small phases on one critical path.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at revision 479ba56d. Plan-specific values:
- Step 1 is absent (`code_review: off`).
- Step 2: one loop over the net diff from 479ba56d after phase 11. Run `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh` for each later round. Log each round in `lessons/phase-11.md`. Hard stop at three rounds.
- Step 3: the Delivery above, then `gh pr checks <n> --watch`.
- Step 4: the close-out as the PR's final commits. Close #341 as not planned with its decision text. Comment the decision on #112 and leave it open or close it, per A1. Comment on #108, #103 and #250 with the PR. File each open OWNER-ASKS item (OA-6 included) as an `owner-decision` issue, or extend its issue when the issue stays open. Then archive the plan.
- Step 5: after the merge, `agent-worktree done followups-p15 --merged`.

## Decision ledger

| # | Question | Chosen | Rejected, and why |
|---|---|---|---|
| D1 | #294 pruning | a `NO_CLIENT` set in the `flatMap` | a hand-written list of 54 rows: longer, and it hides which names pair |
| D2 | #294 converse | every row in the union of the two scans | an allowlist of unpaired rows: the scan already finds them |
| D3 | #316 where | the form rule, beside the name rule | a service refusal: the name rule has none, and a stale list is the held-read pin's known case |
| D4 | #316 compare | `sameFieldAddress` | lower-case equality: same result on 64-hex input, but a second rule for one compare |
| D5 | #339 type | `ContractNotFoundError` | `ContractNotRegisteredError` (Not taken); a bare `WalletError` with a new code: it survives the hop, but the popup tells refusals apart by `instanceof` (`transfer-failure-copy.ts:26-33`) |
| D6 | #340 kind | `too_many_pending` with the shared label (A3) | `wallet_refused` plus a text discriminator (Not taken); plus a typed reason field: a persisted `JobError` field, the owner's call (Codex r1 #6 prefers it; Opus r1 #1 and the plan do not) |
| D7 | #108 proof | the receipt after "present"; a read that throws keeps the watch | trust "present": a replacement can spend the nullifier; unwatch on a failed read (Opus r1 #6): the expiry read keeps watching after its own failure, so the receipt read does too (Codex r1 #4) |
| D8 | #103 card | inline in the card | in `txAmount`: it would also change the title and the detail page |

## Audit verdicts

**Round 1, Codex** (gpt-6.1-sol, high, session 01a14027): conditional approve, 7 findings. Accepted: #1 the cap row also fails from `queued`; #2 `N(holdings)` added; #3 stronger controls in phases 2, 5 and 8; #4 a receipt read that throws keeps the watch (D7); #5 the rarity inference dropped; #7 no unapproved line ships for #340 (A2). Kept with dissent recorded: #6, D6 departs from "the shared refused kind" (A3, I-2).
**Round 2, Codex** (resume): **approve**. Verified the interim cap row renders exactly as today (both stages reach `nothing_sent`; no other reader filters on this error kind), D7's throw-versus-receipt split, the seeder allowlist, and that OA-1 to OA-6 cover every visible choice. One low finding, applied: recon's D8 and cap-trace entries now match the plan.
**Round 1, Opus Plan:** conditional approve, 12 findings. Accepted: #1 the departure recorded (I-2); #3 the `token-order.test.ts` fixture; #4 the seeder's log allowlist; #5 I1 and OA-5 rewritten; #7 the stale comments, the unused import and `types.test.ts`; #8 a live source with no row (OA-6); #9 D5's alternative restated; #10 Facts 2, 3 and 6; #11 lazy scan results; #12 OA-2's note. Rejected: #2, an interim cut line ("The wallet refused this request. Nothing was sent."), because a new line needs the owner (Codex r1 #7); it is offered in OA-3. #6, unwatch on a failed receipt read: rejected for Codex r1 #4 (D7).

## Seeds

`/goal Phases 1-11 of implementations-plan/followups-p15/plan.md are ✓, each backed by its gate's output in the transcript; LESSONS_FILE=implementations-plan/followups-p15/lessons/phase-N.md printed per phase; the Codex loop converged (a resumed round with no new material finding, quoted); one PR against dev exists, opened after the loop, with the close-out's archive-move commit shown by git show --stat; bun run test and bun run lint exit 0.`

`/loop 15m Drive implementations-plan/followups-p15 forward per its plan.md: reality-check plan.md and lessons/, take the next phase, run its gate, decide open questions with Codex (gpt-6.1-sol, high), never cross the owner boundary in OWNER-ASKS.md; after phase 11 run the Post-implementation section; once the archived plan is on dev, run agent-worktree done followups-p15 --merged and stop.` Recommended: `/goal` (completion shows in the transcript).
