---
plan: harden-security-fixes-3
tier: mid
status: planned, final Codex pass approved; awaiting the orchestrator
issues: "#661 (closed known limit; its SECURITY.md caveat lands in arc 1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 explorers (sonnet); dual review (Codex gpt-6.1-sol high + Opus Plan); one fresh final Codex pass
base: origin/dev at 2a5960da
trunk: dev
post_implementation_hardening: not scheduled
---

# harden-security-fixes-3: a bound on dApp-added tagging sources, six owner picks, a SECURITY.md caveat

This plan carries the lane's code and document changes. Other items are settled outside it. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

Three arcs, one PR each against `dev`, no stack (the orchestrator's D-orch-1). Arcs 2 and 3 are independent; the later one carries the close-out.

| Arc | Ships | Waits for |
|---|---|---|
| 1 | Phase 1: the token-list signer-code caveat in `SECURITY.md` | nothing |
| 2 | Phase 3: a bound on the tagging sources a dApp adds to a chain's PXE. Phase 2 (OA-6) when picked by then | nothing for Phase 3 (#860 merged at 2a5960da); Phase 2 test-infra-1 arc 4 |
| 3 | Phases 4-8: OA-1 to OA-5, and Phase 2 if picked after arc 2; a pick of "keep" drops its phase | the picks; Phase 6 after #854, Phase 8 after test-infra-1 arc 4 |

## Outcome & Quality Bar

**For whom.** A person on v1 who connects dApps they did not write and later reads the Authorizations page, Activity and Home; and the maintainer who inherits the boundary code.

**What excellent looks like.**
- With OA-6 picked: every public authorization of a transaction the wallet saw the node accept is on the Authorizations page; an authorization of a send that never reached the node, or that the node refused, is removed. A test fails if the record moves back behind `addTransaction`.
- A dApp cannot grow a chain's distinct tagging-source addresses (registered senders plus registered accounts, as the PXE's registration reads list them) past a fixed bound, enforced under the PXE's own write guard; the person's own registrations are never refused by it. One test per refused class, each beside its success control.
- Each fix sits in the layer that already owns the concern: no new store, no new lifecycle, no new subscription.
- `SECURITY.md` says what the token-list approval summary is and is not, in #661's words.

**Good enough.** No change to a screen without the owner's pick. No e2e scenario is added; each phase says why a cheaper layer proves it.

## Assumptions

**Facts** (verified at f214e5cb; F2 and F6 re-read at 2a5960da, after #860):
- F1. `ExecutionCoordinator.proveAndSend` runs `commitSubmitting` after prove, then `sendTxTask` (the legal check, then `assertLive` and `node.sendTx` with nothing awaited between), then `onSent` after `sendTx` returns, then `recordTransaction` (`execution/execution-coordinator.ts:277-358`).
- F2. `DappSendExecutor` supplies `commitSubmitting` (`dapp-send-executor.ts:377`) and the two `recordTransaction` closures (`:881`, `:1090`; the estimate-reuse path feeds `:1086`). `sentTxRecorder` (`:760-786`) calls `addTransaction`, then `recordPendingAuthwits`. The no-sender site (`:1265`) carries no public authorization.
- F3. `recordPendingAuthwits` is idempotent per scope and hash; `reconcileAuthwits(scope, txHash, "dropped")` removes a tx's pending rows; a revoke of a pending row waits for its grant's block by tx hash (`auth-registry/service.ts:233-300`, `:557-600`).
- F4. `submitting → cancelled` is not a journal transition (`packages/wallet-core/src/jobs/fsm.ts:34,52`); a cancel cannot land between the submitting commit and the send.
- F5. Upstream PXE 6.0.0-rc.3 derives one tagging secret per registered sender and per keystore account, for every scoped recipient and contract, on each tagged-log sync (`@aztec-labs/pxe dest/logs/log_service.js:185-215`). The PXE runtime has no account removal (`pxe/service.ts:89-115`).
- F6. The dApp paths are `executeAztecRegisterSender` (`execution/service.ts:1190`) and `executeAztecRegisterContract` (`:1199-1245`: derivation check, then `registerContract` at `:1242`, then `registerAccount` at `:1245`). The person's paths (Settings, contacts import, own accounts) call the same PXE methods without a bound.
- F7. A typed error crosses the offscreen hop only when its class is in `@nulo/extension-messaging`'s errors table, as `PxeScopeUnregisteredError` is (serialized by `packages/extension-messaging/src/core/error-response.ts:29`).
- F8. Two callers give `getMethodLabel` no contract: `RecentActivityView.vue:191`, `journal-state.ts:467` (`utils/tx-enrichment.ts:47-53`).
- F9. Journal GC groups by profile and account (`operation-journal/gc.ts:118-120`) and evicts only `succeeded` rows past 50.
- F10. `SECURITY.md:584` says `prepare` "shows ... every signing-relevant change"; #661 gives the caveat.

**Inferences** (challenge these):
- I1. Recording before the broadcast leaks no grant on an estimate or a rejection: neither reaches `proveAndSend`.
- I2. No dApp the wallet is tested against adds more than a handful of senders or keyed contracts per chain (playground; e2e `data-registerSender`, `senders-advanced`, `contracts-register`).

**Asks** (working assumption in brackets; the orchestrator may overrule):
- A1. The bound's figure [128 distinct tagging sources per profile and chain, a provisional policy figure: twice the 64 senders a backup carries, `ACCOUNT_STATE_CAPS.maxSendersPerNetwork`, not a measured threshold]. It is a lifetime limit for keyed contracts (the PXE removes no account) and the person's own senders and accounts use part of it.
- A2. Every change to a screen ships only on the owner's pick (OWNER-ASKS.md), Phase 2's included (OA-6).

## Architecture & Implementation

**Phase 2 (on OA-6).** At the two executor sites, `commitSubmitting` writes the journal's `submitting` stage, then `recordPendingAuthwits(scope, built.pendingPublicAuthwits, txHash)`. A throw from either fails the commit, so nothing is broadcast. The site wraps `onSent` to set a local `sent` flag before it calls the original; its catch around `proveAndSend` removes the tx's pending rows (`reconcileAuthwits(..., "dropped")`) unless `sent` is set, then rethrows the original error. A send the wallet saw the node accept keeps its row whatever fails after it. `sentTxRecorder` drops its own authorization record (one write site).

**Phase 3.** The bound lives with the store and its write guard. `PxeService.registerSender` and `registerAccount` take an optional `maxTaggingSources`. When given, inside the same `withPxeWrite` they read the set of distinct addresses in the address-derived tagging sources and `getRegisteredAccounts()`, and refuse with a new typed `PxeTaggingSourcesFullError` when the set is at the bound and the new address is not in it; an address already in the set (as a sender or an account) is accepted. The class is registered for reconstruction in `@nulo/extension-messaging`'s error table, so it survives the offscreen hop by type. Only the two dApp handlers pass the figure; they map the error to `ScopeViolationError` (the frozen dApp envelope; one new message literal). `executeAztecRegisterContract` registers the account before the contract, so a refusal writes nothing; the derivation check still runs first. The count is over the addresses the PXE's public registration reads list.

**Phases 4-8.** One local change each, described in OWNER-ASKS.md; none adds state.

**Alternatives not taken.**
- Phase 2, reconcile pending rows from the journal's send check (Opus R1): adds a cross-service subscription and a recovery policy; not without approval.
- Phase 2, keep rows pending on a refused send (draft).
- Phase 3, count keystore entries through an upstream private field or a wider upstream patch (Codex final): more upstream surface the Aztec bump runbook must carry; Codex accepted the public-read count on proportion.
- Phase 3, counts read in the service worker before a separate write (draft): concurrent registrations overshoot (Codex R1).
- Phase 3, a per-session counter: new state a restart resets.
- Phase 3, separate figures for senders and keyed contracts (draft): both feed one tagging-secret set (F5), so one figure bounds the cost.

**File-level change map.**

| Phase | Files |
|---|---|
| 1 | `SECURITY.md` |
| 2 | `execution/dapp-send-executor.ts`, `dapp-send-executor.test.ts` (its post-send record test moves); composition tests with the real coordinator in a new `execution/dapp-send-authwit-record.composition.test.ts` |
| 3 | `packages/extension-messaging/src/errors.ts` (one class and its table entry), `packages/aztec-runtime/src/pxe/{service,client,spec}.ts`, `execution/service.ts`, `packages/wallet-bridge/src/scope-violation.ts` (literal); tests `packages/aztec-runtime/src/pxe/tagging-source-bound.test.ts`, `execution/register-bounds.test.ts` |
| 4-8 | per OWNER-ASKS.md |

## Security & Adversarial Considerations

- **Threat model.** A connected dApp with grants the person approved (transactions; address book; any contract with registration), sending well-formed or malformed requests, concurrently from several sessions; a worker killed at any await.
- **Trust boundary.** Only the dApp handlers pass the bound; Settings, contacts import, own accounts and restore never do. The refusal's dApp text is the constant scope envelope.
- **Fail closed.** Phase 2: a failed authorization record stops the broadcast. Phase 3: a failed count refuses.
- **Logging.** Refusals log a fixed category at `debug`; no address, hash or argument (CLAUDE.md § Logging policy).
- **Supply chain, crypto, least privilege.** No dependency, key or permission change.

## Phases

### Phase 1 — the token-list signer-code caveat (arc 1)

- In `SECURITY.md` § Token list signing, "Signer code": say the `prepare` summary is produced by the candidate revision and is informational only, and GitHub's compare view of the range is the authoritative review; drop "every" from "shows ... every signing-relevant change".
- **Validation gate.** `bun run check:plans`, `bun run test:ci-gating`, `bun run lint` exit 0. No test reads that bullet (searched `scripts`, `infra`, `packages`, `apps`).

### Phase 2 — authorizations recorded before the broadcast (arc 2 or 3, on OA-6)

- Change both sites as in Architecture.
- **Tests** (composition, real coordinator, fake node and journal; the ordering lives in the coordinator, which unit tests mock):
  - `addTransaction` rejects after an accepted send: the row exists with the tx hash;
  - the authorization record throws: `node.sendTx` is never called and no row remains;
  - `assertLive` refuses (session ended): no row;
  - `node.sendTx` rejects: no row;
  - controls: a successful send has exactly one row; a cancel during prove writes none.
- **Validation gate.** `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all` exit 0; the first test is red with the record back in `sentTxRecorder`. Network e2e `authwit-lifecycle.test.ts` on Chrome, retry 0, through `e2e:agent`: passes.

### Phase 3 — a bound on dApp-added tagging sources (arc 2)

- Build Architecture's Phase 3.
- **Tests** (unit; a count under a write guard needs no browser):
  - PXE level: at the bound, a new sender and a new account are refused and not written; an address already in the set is accepted, as a sender over an account and as an account over a sender (controls); without `maxTaggingSources` nothing is refused (control); two concurrent bounded registrations at bound − 1 admit exactly one; the refusal arrives in the worker as `PxeTaggingSourcesFullError`.
  - Handler level: the refusal reaches the dApp as `ScopeViolationError`; a keyed registration refused at the bound registers no contract; a keyless registration is never bounded (control).
- **Validation gate.** Phase 2's fast layers; network e2e `data-registerSender.test.ts` and `contracts-register.test.ts` on Chrome, retry 0: pass.

### Phases 4-8 — owner picks (arc 3)

Each phase builds its ask's option A only on that pick, with the tests and pictures OWNER-ASKS.md names. **Validation gate** for each: the fast layers exit 0, the named tests are red without the change, `bun run test:e2e` smoke passes, and the PR attaches before/after pictures.

## UI impact

- Arc 1: none (a document).
- Phase 2: OA-6 (when a transaction's authorizations appear on the Authorizations page). Ships only on the owner's pick.
- Phase 3: none in the wallet; a dApp past the bound reads the existing refusal.
- Phases 4-8: OA-1 to OA-5, each only on the owner's pick.

## Decision ledger

| Id | Decision | Why | Rejected |
|---|---|---|---|
| HS3-D1 | Three PRs, no stack; arcs 2 and 3 independent | D-orch-1; arc 2 waits on other leads, arc 3 on the owner | one PR |
| HS3-D2 | Record at `commitSubmitting`; remove unless the wrapped `onSent` set `sent`; ships on OA-6 | one write before the send; refused sends leave nothing; the order change is visible (Codex final) | send-check reconciliation (subscription + recovery policy); keep pending on refusal |
| HS3-D3 | One bound on distinct tagging sources, under the PXE write guard, dApp path only, counted from the PXE's public reads | the cost driver is one set (F5); atomic per chain (Codex R1 blocking, final: confirmed) | worker-side read-then-write; per-session counter; two figures; a private-field keystore count |
| HS3-D4 | Six owner asks; each phase builds only on its pick | CLAUDE.md § UI changes; the legs split on three of them | deciding them in the panel |
| HS3-D5 | Arc 1 aligns the approver's runbook and `CI.md` with the caveat; the comments in `publish-token-list.yml` and `summary.ts` stay | both files are on the summary's own path list, so a comment-only edit reads as a signer change at the next approval; the docs are what the approver reads | editing the signer's comments (both legs: optional) |

## Review verdicts

| Round | Verdict | Taken | Rejected or deferred |
|---|---|---|---|
| Codex R1 | reject | Phase 2 predicate restated (onSent, not "never broadcast"); Phase 3 bound moved under the PXE write guard; composition tests; OA-2 scope is profile and account, refused rows on their own cap; three items moved to owner asks | "keep pending on an ambiguous send" withdrawn (Opus R1) |
| Opus R1 | conditional approve | unreachable cancel test replaced; one write site; estimate-reuse covered by the `:1087` site; account registered before the contract; the keyed figure's basis restated as one tagging-source figure; committed wording | send-check reconciliation (D2) |
| Codex final | conditional approve; approve on the second resume | `sent` flag set before the original `onSent`; Phase 2 moved behind OA-6 (its order change is visible); distinct-address count and both duplicate directions tested; the error registered in the reconstruction table; A1 stated as provisional; OA-3, OA-4, OA-5 wording; committed text states behaviour only | counting keystore entries through an upstream private field (ledger D3) |
| Arc 1 Codex R1, Opus | conditional approve (both) | the runbook and `CI.md` stop saying the summary shows every signing-relevant change; #860 recorded as merged; F2 and F6 re-read at 2a5960da | the signer's comments (HS3-D5) |

## Delivery

- Arc 1: `harden-security-fixes-3-a1` off `origin/dev`, carrying this plan and Phase 1. Title: `docs(security): the token-list summary is informational; the compare view is the review`.
- Arc 2: `harden-security-fixes-3-a2` off `origin/dev` after its waits. Title: `fix(pxe): bound the tagging sources a dapp adds to a chain` (plus the Phase 2 words if OA-6 is picked by then).
- Arc 3: `harden-security-fixes-3-a3` off `origin/dev` after the picks; title per the picks, at most 93 characters.
- Each PR: no label at creation; body with what changed and why, the gates with outcomes, e2e wall-clock unchanged (no scenario added). No `Closes` line: the lane closes no open issue. Commits signed, `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Post-implementation

Cite `implementations-plan/README.md` § Post-implementation standard at f214e5cb; plan-specific parts:

- Step 1 is absent (`code_review: off`).
- Step 2 per arc at its boundary: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed per round until no new material point, hard stop at three rounds. Each prompt carries the arc table above, the adversarial ask and the two verbatim rules. One Opus review (`Agent`, `model: "opus"`, `general-purpose`) runs beside round 1. Record rounds under Review verdicts and in `lessons/phase-N.md`.
- Step 3: `gh pr create` per arc; `gh pr checks <n> --watch`; one rerun for a known flake.
- Step 4, in the later of arcs 2 and 3: merge `origin/dev` and read `index.md` and `lessons.md`; Outcome block; lessons promotion; `STATUS.md` deleted; `git mv` into `archive/` in its own commit; index line moved.
- Step 5: after the close-out merges, `agent-worktree done harden-security-fixes-3 --merged`. The orchestrator notices the merge.
- Three failures on one step end the arc as `ARC_FAILED`.

## Seeds

- `/goal`: "Implement arc N of implementations-plan/harden-security-fixes-3/plan.md in its worktree: phases in order, each gate green before the next, then the Post-implementation loop and the arc's PR. Stop at a red gate three times."
- `/loop`: "Check the arc's PR checks and its waits (#860, test-infra-1 arc 4, #854, the owner's picks on OA-1 to OA-6); start the next arc when its waits clear; stop when the close-out merges."
