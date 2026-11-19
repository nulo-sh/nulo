---
plan: authwit-copy-1
tier: light
status: completed
issues: "#1656, #1657"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high audit + Opus Plan leg; final fresh Codex pass
base: origin/dev at 4291a8c98
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-11-06. **Status:** completed, one arc, PR #1696.
- **Shipped:** an app-paid window names the sending account's own attached authorization ("Already authorized by <the account>.", its own details group); an app-paid confirm never uses an authorization the window did not list; the unattached refusal gets its own History text (`unattached_refused`) and app error (code 4100, `SCOPE_VIOLATION`, its own constant text). Every surface on the owner's picks, decision page 115 (all A).
- **Known limits:** none. I2 (a carried hash is not a checked signature) over-states only toward rejecting and adds no capability, as #1649's I2; OA-1 states it and P115-01 accepted it.
- **Open items:** none. #1655 stays the owner's own plan.
- **Lessons:** History reads only the selected account's records, now in the `e2e-testing` skill.
- **Seeds retired:** the `/goal` and `/loop` below.

## Scope

- **#1656.** On a send whose app pays its own fee, the execute window names an authorization the sending account gave earlier when the app attached its witness, with #1649's line "Already authorized by <this account>.".
- **#1657.** A send refused because the app left out another account's authorization gets its own History text and its own app error, in place of the generic scope refusal's.
- Out: #1655 (a record of every private authorization the wallet signs; persistent state, the owner's own plan). Recon: [recon.md](recon.md). Both issues carry the owner's request (decision page 108, P108-04, 2026-11-04).

## Outcome & Quality Bar

- **For whom**: a person approving an app-paid send, and an app developer whose send the wallet refused.
- **Excellent**: (1) an app-paid window lists every authorization the transaction uses that an account of the person already gave, the sending account included, and lists nothing the transaction does not carry; (2) History and the app's error say that an authorization from another account was missing, and the app's error names no address and no note.
- **Good enough**: no change on any other route; no record of when the authorization was signed (#1655).

## Assumptions

Facts (verified at 4291a8c98):
1. The app-paid route lists `consumedOf(probe)`, the records with `onBehalfOf` set, at estimate and at confirm (`dapp-send-executor.ts:569-571`, `:1194-1204`, `:1398-1401`).
2. The decoder files every request for the signer under `signable`, carried or not (`decode-authwit-effects.ts:86`).
3. The card shows any `onBehalfOf` record on an app-paid send and renders #1649's line for it (`OperationCard.vue:241-243`, `SendTxSummary.vue:130-132`); its details put every `onBehalfOf` record under "Authorizations your other accounts already gave" (`OperationCard.vue:265-279`).
4. After Reject the worker hands the same `UnattachedAuthorizationRefusalError` instance to `toWalletResponseError` and to `failQueuedForError` (`wallet-message.ts:383-396`); today it maps to `SCOPE_VIOLATION_ENVELOPE` and `scope_refused`.
5. Two sibling refusals already keep code 4100 and `SCOPE_VIOLATION` with their own frozen text (`error-envelope.ts:236-261`); `registry_refused` is the precedent for its own History kind.
6. A journal row's `error.kind` is any non-empty string (`operation-journal/spec.ts:342`); the stored-shape snapshot names no kind.
7. `tx-sendTx-fields.test.ts:47-53` (network) asserts the unattached refusal's app answer as `SCOPE_VIOLATION_ENVELOPE`; no smoke e2e names these texts.

Inferences:
- I1. A request for the sender that its contract checks reaches the app-paid probe only with a witness the sender's account accepted: the validated run does not stub the account (`fee/fee-strategy.ts:224-226`), so a missing or bad witness fails the run before any effect is read (as #1648 traces for another account). The listing still requires the hash in `carried`.
- I2. "Carried" is a hash match, not a signature check. A contract that emits a request naming the sender and never checks it, with any witness of that hash attached, makes the line say the sender authorized what it never did (Codex round 1). Plausible but unverified; the same limit #1649 records for another account. The hostile contract already names its own calls, so the line adds no capability; OA-1 says what the line can vouch for. On other routes the wallet would sign such a request; here it is only named.

Asks (OWNER-ASKS.md), all answered A (the owner's picks under Decisions): OA-1 the line and the details group for the sender's own; OA-2 the History text; OA-3 the app error text; OA-4 whether a confirm is held to the sender's own listed authorization.

## Decisions

**The owner's picks**, the sign-offs: decision page 115, signed 2026-11-06 14:31 UTC; OA-4 settled in chat on 2026-11-06 at about 17:45 UTC.
- P115-01 (OA-1, the sender's own attached authorization on an app-paid send): A, as built: `"AUTHORIZATIONS 1 · Lets <caller> move 1 USDC from <Main> to <recipient> · Already authorized by <Main>. The name, as #1649's line for another account."`
- P115-02 (OA-1b, its details): A, as built: "A group of its own, "Authorizations this account already gave", with the rows Consumer, Authorizes, Function and Authorized by."
- P115-03 (OA-2, History): A, as built: ""Not allowed" / "The app did not include an authorization from another of your accounts. Nothing was sent." Repeats the window's own words."
- P115-04 (OA-3, the app's error): A, as built: "Message: This transaction uses another account's authorization, and the request carries no witness for it. Attach the witness."
- P115-05 (OA-4, Confirm held to the sender's own listed authorizations): the owner asked "wouldn't "A" be blocking our self-discovery of the needed authwits which I consider a feature?", was answered that the window's estimate is the discovery and A only moves it before the signature, and wrote: "1696 => A". A: "One rule with another account's authorization: a send never uses an authorization the window did not list. On both paths Confirm stops before anything is signed or sent; History reads "Stopped before broadcast" / "Your wallet caught this before reaching the network. Often balance, fees, or invalid call." Retrying the estimate is the way on. One line in the confirm path and its test; lands in the same PR before merge if picked."

- **D1 (where the sender's own is found).** The app-paid listing function in the executor (`consumedOf`, renamed `attachedOf(probe, built)`) maps each probe record with no `onBehalfOf` whose message hash the built request carries (`carriedHashes(built.txRequest)`, the set the probe was handed) to `{ ...record, onBehalfOf: built.account.address.toString() }` (the decoder's `signer`, so `listedKey` and the name lookup match), keeps each `onBehalfOf` record, and drops the rest; order stays the probe's (the sender's, then other accounts'). This is where the route's rule "it signs nothing" already lives. Both legs agreed. Rejected: a decoder bucket computed on every route and read on one; a decoder `signs: false` mode, which moves a route policy into the decoder and the strategy; not re-signing a carried sender request on every route (a behaviour change outside both issues).
- **D2 (confirm, OA-4: A, P115-05).** The confirm branch lists through `attachedOf` too, so its keys hold the sender's own carried records to the preview as they hold another account's, and `consumedOf` is gone. After a failed estimate an app-paid Confirm is live (`index.vue:236-238`, `fee-figure.ts:41-45`) and has no snapshot, so a carried sender request stops it with `ESTIMATE_INCOMPLETE_MESSAGE` (`preview-snapshots.ts:105-107`); after a landed estimate, a rebuild asking for a sender authorization the window did not list stops it with `AUTHWITS_CHANGED_MESSAGE`. Both before `proveAndSend`; History reads "Stopped before broadcast". Planned as B (today's confirm) while the ask was open: the failed-estimate path is Opus round 1's trace, the drift path the final Codex pass's.
- **D3 (card).** The summary needs no change. The details split the `onBehalfOf` records: the sending account's (`sameFieldAddress(a.onBehalfOf, op.accountAddress)`, the helper `call-surface.ts:211` already uses; `accountAddress` is set on every account-scoped op, `operation-display.ts:85`) go to a new group "Authorizations this account already gave" (testid `execute-op-sender-authwits`), the rest keep their group and label (OA-1). The wire doc of `DiscoveredAuthwit.onBehalfOf` (`packages/wallet-bridge/src/fee.ts`) says it may name the sending account on an app-paid send.
- **D4 (app error).** Code 4100 and `walletErrorCode: SCOPE_VIOLATION` stay; a frozen `UNATTACHED_AUTHORIZATION_REFUSAL_ENVELOPE` carries its own constant text (OA-3), chosen in `scopeViolationEnvelope` before the fall-through. A distinct code or `walletErrorCode` would stop an app that matches `SCOPE_VIOLATION` from recognising the refusal; the two sibling refusals set the precedent. Documented in `packages/wallet-bridge/README.md` beside them.
- **D5 (History).** A new kind `unattached_refused` (label "Not allowed", its own detail, OA-2), listed wherever `registry_refused` is: `KnownJobErrorKind` and its table, `QueuedFailureKind`, `REFUSED_BEFORE_SENDING`, `kindLabel`, `failedSubtitleFor`. One classifier: `scopeRefusalKind` in `mark-failed-unless-cancelled.ts` gains the arm, returns the three literal kinds (not `JobErrorKind`, which `QueuedFailureKind` cannot take; both legs) and is exported; `queuedFailureKind` calls it for every `ScopeViolationError` and keeps `CapabilityNotGrantedError` (not a `ScopeViolationError`) as its own `scope_refused` arm. `queued-journal.ts` already imports from `execution/`, and nothing there imports `wallet-sdk/`. No stored-shape stamp (Fact 6); the snapshot test proves it.
- **D6 (e2e).** No new scenario. `tx-sendTx-fields.test.ts` expects the new envelope, then reads the refused send's History detail as `scope-refusal.test.ts:64-81` does (`waitForSendRecord`, `readJournalDetail` with a shot name; Opus round 1): the one check that the real worker path journals the new kind, at a few seconds. #1656 stays at unit and component level, as #1649 kept the app-paid route: the change is a pure mapping over a run the probe already reads, and a scenario would need a new playground send and one more estimate and proof per browser.
- **D7 (captures).** #1657: the committed shot hooks in `tx-sendTx-fields` (a `shotSend` at the refusal block, `readJournalDetail`'s `shot`), no-ops unless `NULO_E2E_SHOT_DIR` is set. #1656: a temporary, uncommitted playground send (Crowdfunding's `donate`, which pulls the sender's tokens, with the sender's own witness from `createAuthWit` and the app's sponsor payload) driven by a temporary step in `tx-sendTx-delegated-authwit.test.ts` on `deployDelegatedPullRig` (the authwit-window-1 precedent). Before: one run on base sources with temporary steps for both; after: one run with the change. Every temporary edit is restored before a commit; nothing untracked stays under `apps/`.

## Architecture & Implementation

- **Reuse**: `carriedHashes`, `listedKey`, `assertWithinPreview`, #1649's line and details rows, the sibling envelopes, the `registry_refused` wiring, `shotSend`. Nothing new is stored; no new module.
- **Flow (#1656)**: validated run → observer probe → `attachedOf(probe, built)` → estimate `discoveredAuthwits` and preview keys → card (summary line; details group by account); confirm → `attachedOf` → `assertWithinPreview`, held to the listed keys (D2).
- **Flow (#1657)**: decoder throws → worker records the refusal → window's refusal block (unchanged) → Reject → `toWalletResponseError` → the new envelope; `failQueuedForError` → `scopeRefusalKind` → `unattached_refused` → History text.
- **Alternative not taken**: one details group relabelled "Authorizations your accounts already gave" (no address comparison, but it changes the label on every route); offered as OA-1 B.

## UI impact

The lane brief's no-ask budget is: "The execute window's Authorizations list on the app-paid route (#1656), the History row text of the `unattached` refusal (#1657), and the app error text, which apps read (#1657). Nothing else changes on screen." Every surface below needs the owner's sign-off before merge.
- **Execute window, app-paid send carrying the sender's own witness.** Before: no Authorizations section. After: the row "Lets <caller> … from <sender> …" with "Already authorized by <sender's name>."; in "Show all details", the group "Authorizations this account already gave" (OA-1). Other routes: unchanged. Signed: P115-01 and P115-02, A, as built.
- **History, the refused request.** Before: "Not allowed" / "The app asked for more than you allowed. Nothing was sent.". After: "Not allowed" / "The app did not include an authorization from another of your accounts. Nothing was sent." Signed: P115-03, A, as built.
- **Confirm on an app-paid send using a sender authorization the window did not list (OA-4).** Before: the send goes out. After: Confirm stops before anything is signed or sent; History "Stopped before broadcast". Signed: P115-05, "1696 => A".
- **App error.** Before: `{"code":4100,"message":"This request is outside the permissions you gave this app.","data":{"walletErrorCode":"SCOPE_VIOLATION"}}`. After: the message "This transaction uses another account's authorization, and the request carries no witness for it. Attach the witness.", same code and `walletErrorCode`. Signed: P115-04, A, as built.

## Security & Adversarial Considerations

- **Threat model**: a hostile app controls the calls, the attached witnesses and the scopes within its approved accounts; a hostile contract controls every emitted request. The wallet signs exactly what it signed before: D1 changes a listing on a route that signs nothing, and D2 narrows what an app-paid confirm accepts to what the window listed.
- **Over-statement** (I2) errs toward the person rejecting. **Under-statement**: none added; the inner-hash helper stays #1647.
- **Attribution** (I2): "Already authorized" rests on a carried hash and a validated run, not on a signature check of its own; OA-1 states it. No fix: checking signatures or consumption is new mechanism for no new capability.
- **Privacy**: the new app text is a constant (no address, no note, no account count); the app learns only that a witness it could have attached was missing, for an account it named itself. No new log line; the refusal keeps its `debug` level (`isExpectedRefusal`).
- **Crypto, supply chain, privileges**: N/A (no new dependency, hash or credential).

## Phase 1: the sender's own attached authorization (#1656) ✓

Change map: `dapp-send-executor.ts` (`attachedOf` in `buildForEstimate`; the confirm branch unchanged; the comments at `:553-555` and `:1398`); `OperationCard.vue` (`authwitGroups`; the comment at `:222-226`); `discovery-probe.ts:21-22` (comment); `packages/wallet-bridge/src/fee.ts` (doc).
Tests: `dapp-send-executor.test.ts:2004` keeps its uncarried `record("own")` (not listed, the never-happens case) and gains its control: with `carry(base.built, "own")` the estimate lists `{ ...record("own"), onBehalfOf: <the built account> }` before `consumed("b")`, the confirm sends, and `createAuthWit` is never called; under A (Phase 4) a confirm with no `previewId` and one whose rebuild lists a different carried sender record than the estimate both stop before `proveAndSend`, while the listed record still sends (the control above). `OperationCard.summary.test.ts`: an app-paid send listing `{ ...OWN, onBehalfOf: MAIN }` (wire-shaped `0x` + 64 hex) shows "Already authorized by Main." and, in details, the new group holding it while `CONSUMED` stays in "your other accounts"; `[OWN]` without `onBehalfOf` still lists nothing.
Gate: `bun run lint`, `bun run typecheck:all`, `bun run test` exit 0; the two files above red on base sources for the new cases, green after.

## Phase 2: the unattached refusal's History text and app error (#1657) ✓

Change map: `error-envelope.ts`; `packages/wallet-core/src/jobs/types.ts` (with its producers comment); `mark-failed-unless-cancelled.ts`; `queued-journal.ts`; `operation-journal/gc.ts`; `utils/journal-state.ts`; `packages/wallet-bridge/README.md` (a paragraph beside the registry's: the refusal comes after the window opens, Reject or closing the window answers it, its envelope); `tests/e2e/network/tx-sendTx-fields.test.ts` (D6, D7).
Tests: `error-envelope.test.ts`: the refusal gets the frozen new envelope, whose JSON holds no `0x` address and not the refusal's own message; `journal-state.test.ts` row; `types.test.ts` produced list (and its comment); `gc.test.ts` `REFUSAL_KINDS`; `mark-failed-unless-cancelled.test.ts` and `queued-journal.test.ts` rows mapping the class to `unattached_refused`, the plain scope refusal still `scope_refused` (control).
Gate: `bun run lint`, `bun run typecheck:all`, `bun run test:all` exit 0 (the snapshot test green with no new stamp); then `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/tx-sendTx-fields.test.ts --retry=0` green on Chrome, its time recorded against base.

## Phase 3: captures and the smoke suite

Steps: take the captures (D7) into `~/.cache/nulo-backlog/authwit-copy-1/shots/`, named in OWNER-ASKS (the before run comes first, on base sources); restore every temporary edit. Then build the armed smoke bundle, `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome` (an `e2e:agent` run leaves its own build in `dist/chrome`), and run `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- --retry=0`. Never beside an `e2e:agent` run in this worktree.
Gate: smoke green at retry 0 on Chrome; `git status --porcelain` lists no file under `apps/` beyond the change map; `bun run check:plans` green after staging.

## Phase 4: OA-4 A, the owner's pick ✓

Change map: `dapp-send-executor.ts` (the confirm branch lists through `attachedOf`; `consumedOf` removed). Tests: `dapp-send-executor.test.ts`, the app-paid confirm case flipped from B's pin to A: both paths reject (`ESTIMATE_INCOMPLETE_MESSAGE`, `AUTHWITS_CHANGED_MESSAGE`) and `proveAndSend` is never called; red on the B source, green after.
Gate, once, in order, at retry 0: `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:components`, the execute-window component tests (`src/popup/windows/execute/`), `tx-sendTx-fields` through `agent.sh` on Chrome and Firefox, `bun run check:plans`.

## Delivery

One arc, one PR against `dev`: branch `authwit-copy-1-a1` off `origin/dev` carrying the plan commit, rebased onto `origin/dev` before Phase 4. Title: `fix(execute): name the sender's attached authorization; own text for an unattached refusal` (90 characters). Body: what changed and why, the validation runs and outcomes, `tx-sendTx-fields` time before and after, the owner's picks quoted, light and dark captures, `Closes #1656`, `Closes #1657`. Opened as a draft without labels, readied after the picks were built; the close-out lands as its final commits.

## Post-implementation

Per [`implementations-plan/README.md` § Post-implementation standard](../../README.md#post-implementation-standard) at 4291a8c98, with:
- **Review loop:** `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, over the arc's diff after Phase 3; one Opus `general-purpose` review beside round 1; hard stop at three rounds, then report.
- **Delivery:** `gh pr create --draft --base dev`; `gh pr checks <n> --watch` once.
- **Close-out:** the PR's final commits, after Phase 4 and its review round: bring in `origin/dev` and read `index.md` and `lessons.md`; Outcome block; `git mv` into `archive/`.
- **Teardown:** after the merge, `agent-worktree done authwit-copy-1 --merged`.
- **Approval boundaries:** a finding that adds stored state, a lifecycle, a protocol, a recovery policy or a public contract beyond D4 stops for approval; any copy or behaviour beyond OA-1 to OA-4 is a new owner ask.

## Audit verdicts

**Round 1** (2026-11-05; both legs read the plan, recon and asks with the four asks; log in [lessons/phase-0.md](lessons/phase-0.md)).
- **Codex (gpt-6.1-sol, high): conditional approve.** Q1 keep 4100 and `SCOPE_VIOLATION` (D4); Q2 the executor's listing (D1); Q3 the comparison sound. Material: (1) "carried" is a hash match, so I1 overstated and OA-1 / OA-3 must say what the wallet saw (folded: I1, I2, Security, OA-1, OA-3); (2) the smoke command lacked the armed build and its flags (folded: Phase 3). Nits: `scopeRefusalKind`'s return type (D5); assert no signing on the app-paid control (Phase 1).
- **Opus 5.5 (Plan): conditional approve.** Material: D2 changed a confirm path a person notices (folded as OA-4; B ships). Nits, all folded: the sender's address source (D1); `sameFieldAddress` (D3); the return type (D5); five stale comments and the README paragraph (change maps); fee-payment witnesses get a row too (OA-1); read the History row in the existing e2e (D6). Its recon correction holds: `dapp-send-executor.test.ts:2004`'s `record("own")` is uncarried, so that test stays green.
- Rejected: none.

**Final fresh Codex pass** (new session): conditional approve. Material: OA-4 covered only the failed-estimate path; B also leaves sender drift after a landed estimate unchecked (folded: D2, OA-4, a pinning test). Nit: three sentences still overstated I1 or D2 (folded: recon, Security, OA-4). Resumed: approve, no regressions.

**Implementation review** (arc 1, diff `4c633b4a7..HEAD`; log in [lessons/phase-1.md](lessons/phase-1.md)).
- Codex round 1 (new session, gpt-6.1-sol high, the README's two rules verbatim): clean.
- Opus 5.5 (general-purpose) beside it: no material finding; nits: an app-paid `createAuthWit` assertion no change could fail (dropped, with the title's claim), a comment line over 100 characters (rewrapped). Rejected: reading the stored error kind in the e2e beside the asserted History text (redundant).
- Codex round 2 (resumed, the fix commit): clean.
- Codex round 3 (new session, gpt-6.1-sol high, the README's two rules verbatim; diff since the reviewed head, OA-4 A): clean. It checked the reuse path (embedded estimates are not reused), the identical keys at estimate and confirm, and that a send carrying no witness of the sender's keeps today's keys.

**Deviations.** D6's History read runs at the end of `tx-sendTx-fields`, after switching the wallet to the sender: the journal detail shows only the selected account's records (`popup/pages/journal/journal-detail-scope.ts`), and the refused send is the second account's.

## Seeds (not run; orchestrator-owned)

```
/goal Phases 1-3 of implementations-plan/authwit-copy-1/plan.md marked ✓ with their gates passing; the Codex loop (gpt-6.1-sol, high) converged; one draft PR against dev closing #1656 and #1657, waiting for the owner's OA-1 to OA-4; bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/authwit-copy-1 per its plan.md and the README § Post-implementation standard at 4291a8c98: run the gate, decide open questions with Codex (gpt-6.1-sol, high), open the draft PR, never merge, never change a surface beyond § UI impact; stop once checks are green and report.
```
