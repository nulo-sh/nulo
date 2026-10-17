---
plan: authwit-intent-1
tier: light
status: approved 2026-10-17 (orchestrator); arc 1 implemented, in review
issues: none; the PR closes nothing
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); one Codex review (gpt-6.1-sol high) with one resume; one Opus Plan leg
base: origin/dev at 4ad2a80d
trunk: dev
post_implementation_hardening: not scheduled
---

# authwit-intent-1: a dApp's inner-hash intent never names the account that signs it

The dApp `createAuthWit` path refuses an `IntentInnerHash` whose consumer is the signing account, under every grant and consent, before any window. Every other inner-hash intent keeps the existing confirmation: the owner's **P38-11 = A** (opaque intents allowed), narrowed by the orchestrator's lane record to consumers other than the account. The pinned Fee Juice claim selector moves to a node-only pin file, as #716 split the registry selector pins. One arc, one PR against `dev`. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md).

**Claims that did not hold** (at `4ad2a80d`): the lane brief's "a History row" is not reuse. No `createAuthWit` writes one today, so a row is new persisted state for the owner (OA-2); the arc ships without it. "Any consumer that resolves to the account's own entrypoint" reduces to equality with `args[0]` (F3, F5).

## Outcome & Quality Bar

- **For whom:** a person who connects dApps and approves their authorization requests; the developer of a dApp that meets the refusal.
- **Excellent:**
  1. An inner-hash intent naming the signing account is refused before any window, top-level or batched, under the widest grant and any consent. Nothing is signed, and the dApp reads the refusal's own text.
  2. A third-party inner-hash intent keeps its confirmation and the dApp receives its witness (`authwit-variants` e2e green); call intents keep their routing, silent signing under consent included.
  3. The Fee Juice claim selector pin fails loudly on drift, in the runner that can compute it.
- **Good enough:** no History row (OA-2); discovered authorization requests unchanged (F9).

## Assumptions

**Facts**
- F1. `checkCreateAuthWit` runs for every dApp `createAuthWit`: the method needs the `accounts` capability (`method-descriptors.ts:155-162`), so `enforceScopeFor` never returns early (`dispatcher.ts:293-305`); batch legs re-enter `dispatch` (`dispatcher.ts:468-475`).
- F2. The consumer the signer's inner-hash branch reads, and `args[0]`, reach the checker only in their canonical spelling (`assertCanonicalAddresses`, run at `dispatcher.ts:231`). An object carrying `caller` is parsed as a call intent (`parseCallIntentKeys`), and both the checker and the signer read it as one (`service.ts:1256`).
- F3. The signer is exactly `args[0]`: `handleCreateAuthWit` passes it as `requestedFrom`, matched by exact string (`account-resolution.ts:72-74`).
- F4. For an inner-hash intent the wallet signs `computeAuthWitMessageHash({ consumer, innerHash }, liveChainInfo)` (`service.ts:1294-1300`).
- F5. The account's entrypoint checks a witness over `(this_address, chainId, version, app_payload.hash())`; its `verify_private_authwit` uses `msg_sender` as consumer (vendored `SchnorrAccount.json` sources, `authwit/account.nr`). So a witness whose consumer is the account is checked only by the account's own code. The probe found the two hashes equal for one payload (recon).
- F6. No `createAuthWit` writes a History row: the queued journal is `sendTx`-only (`background.ts:659-662`).
- F7. The refusal is thrown in dispatch and mapped by `toWalletResponseError` (`background.ts:1515`). Still, `errors.test.ts:345-371` requires every exported `WalletError` subclass to rebuild as itself from its payload, so the class gets a rebuild branch.
- F8. `fee-payer.test.ts:28-41` turns a WASM failure into `"no-hasher"` and skips the pin; the jsdom runner collects the file (`apps/extension/vitest.config.ts:47`).
- F9. Nothing else signs a dApp-chosen consumer: supplied witnesses are imported, never re-signed (`operation-planner.ts:193-201`); a discovered request's consumer is the emitting contract (`collectOffchainEffects` sets `callContext.contractAddress`); the frozen account's sources emit no authorization request; `simulateTx` results drop `partialWitness` (`app-facing-results.ts:54`); `profileTx` is refused (`view-executor.ts:390`).
- F10. A call intent's inner hash uses separator `AUTHWIT_INNER` (221354163), the app payload hash `SIGNATURE_PAYLOAD` (463525807): no supported construction makes the two witnesses equal, assuming Poseidon2 collision and preimage resistance.

**Inferences**
- I1. No legitimate dApp names the signer as consumer. Repository evidence only (playground and e2e use a contract), backed by F5. A third-party dApp that does loses that request: the intended restriction.
- I2. F9's account premise holds while the account's address runs the frozen class.

**Asks** (working assumption in force; the orchestrator may flip it)
- A1. The brief's "its own code": read as its own class and text. The wire code stays 4100 with `walletErrorCode: SCOPE_VIOLATION`, as #716 kept; a new wire code is a public contract.
- A2. The History row: OA-2. The arc ships without it.

## Architecture & Implementation

- **Refusal:** in `checkCreateAuthWit`, right after `refuseAuthRegistryIntent(args[1])`, throw `OwnAccountIntentRefusalError` when the intent is not a call intent, is an inner hash, and `sameFieldAddress(String(consumer), String(args[0]))`. The precedence matches the signer's (F2), so a mixed object stays a call intent. Placed before the grant checks, so no grant admits it.
- **Comment at the guard**, one sentence: only the wallet's own send authorizes this account's transactions, so an inner hash the signing account would consume is never signed for an app.
- **Type:** `OwnAccountIntentRefusalError extends ScopeViolationError` in `packages/extension-messaging/src/errors.ts`: zero-argument constructor, one constant message (`"Scope violation: createAuthWit inner hash names the signing account as its consumer"`), and one rebuild line in `walletErrorFromPayload` keyed on that message, beside #716's (F7). No new journal kind (F6).
- **Envelope:** `OWN_ACCOUNT_INTENT_REFUSAL_ENVELOPE` (code 4100, OA-1 text, frozen) in `error-envelope.ts`; `scopeViolationEnvelope` checks the new class beside the registry one.
- **Docs:** one sentence each in `SECURITY.md`'s `createAuthWit` paragraph and `packages/wallet-bridge/README.md`'s refusal list, stating the rule.

## Decision ledger

- D1. Refuse in the bridge checker, not at signing in `ExecutionService`: the checker runs before any window (F1); a refusal at signing would follow the person's confirmation. Not both: no dApp route reaches the signer without the checker, so a second check is a copy. Both legs agree.
- D2. Compare with `sameFieldAddress` on the wire values (F2): the bridge's one address comparison.
- D3. Inner-hash intents only. Call intents (F10) and discovered requests (F9) cannot carry the account as consumer of a payload witness; refusing them changes behaviour with no path.
- D4. A sibling subclass with its own text, the shape #716 gave the registry refusals; `AuthRegistryRefusalError` would show the registry's text, a plain scope refusal tells the developer to widen a grant that cannot help. Both legs agree.
- D5. The regression test is a new `describe` in `apps/extension/src/wallet/services/execution/service.authwit-binding.test.ts` (node environment). It compares upstream `DefaultAccountEntrypoint`'s hash with the hash the wallet's own signing arm produces (`makeFacade`), then calls the exported `enforceScope`. Opus argued for it: the wallet's real arm instead of re-deriving F4, no new devDependency, no exclude line, no new `aztec-update` pin site, and it runs in `bun run test`. Codex had judged a bridge-local test proportionate with "no clear advantage" for this one; the concrete savings above decide it.
- D6. The fee-payer pin file is excluded from the jsdom runner, like `auth-registry.pins.test.ts`, so it runs once in wallet-bridge's node runner under `test:all`.

## Adversarial considerations

- **Who reaches the rule:** a connected dApp holding the `accounts` capability with `canCreateAuthWit` and any transaction grant, a wildcard included, choosing every field of the `createAuthWit` arguments, top-level or batched. The invariant: authorizing the account's own transactions stays with the wallet, which shows what it signs.
- **Input validation:** the rule reads only values the schema parse admitted in canonical form (F2), before any grant check, account resolution, window or signature.
- **Leaks:** the message is constant and echoes no argument (tested). The log line stays at debug (`isExpectedRefusal` matches every `ScopeViolationError`).
- **Unchanged by the owner's record:** a third-party inner-hash intent keeps its opaque confirmation (P38-11 = A).
- **Crypto and supply chain:** nothing added; the test calls upstream hash functions the extension already declares.

## UI impact

- **dApp refusal text:** new constant envelope text, inside the orchestrator's no-ask record; ship-now form in OA-1, quoted in the PR body.
- **Execute window:** no screen changes. A self-consumer inner-hash request no longer opens the confirmation, as the lane record narrows P38-11 = A.
- **History:** none (OA-2).

## Phase 1: the refusal ✓

Files: `packages/extension-messaging/src/errors.ts` + `errors.test.ts`; `packages/wallet-bridge/src/method-scope-checkers.ts` + `method-scope-checkers.test.ts`; `dispatcher.test.ts`; `apps/extension/src/wallet/services/execution/service.authwit-binding.test.ts`; `error-envelope.ts` + `error-envelope.test.ts`; `SECURITY.md`; `packages/wallet-bridge/README.md`.

Tests (wire-shaped: addresses and inner hashes are `0x` + 64 hex):
- `service.authwit-binding.test.ts`: the wallet's signing arm and `DefaultAccountEntrypoint` (recording signer, one wire-shaped call) give the same hash for the account as consumer; `enforceScope` refuses that intent with `OwnAccountIntentRefusalError`. Control: a third-party consumer gives a different hash, and `enforceScope` passes.
- `method-scope-checkers.test.ts`: refused under the widest grant, exact message, no argument echoed. Controls: a third-party consumer passes; an object with `caller`, `call` and the signer as `consumer` passes as a call intent.
- `dispatcher.test.ts`: refused top-level and batched, under the widest grant and broad consent; counts stay `{ signed: 0, windows: 0 }`. Control: a third-party inner hash opens one window and resolves `0xconfirmed`.
- `errors.test.ts`: a `by-message` row and the message beside the registry messages. `error-envelope.test.ts`: the new frozen envelope; a plain scope refusal keeps the generic one.

**Validation gate**
- Commands: `bun run lint`; `bun run typecheck:all`; `bun run --cwd packages/wallet-bridge test`; `bun run --cwd packages/extension-messaging test`; `bun run test`.
- Red proof: delete the new refusal line; the checker row, the dispatcher test and the binding test must go red, every control green. Then delete the rebuild line; the `errors.test.ts` row must go red. Restore both.
- Network e2e, host load1 below 150: `cd <worktree> && NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/authwit-variants.test.ts` at retry 0. No scenario is added, so no wall-clock moves.
- Pass: every command exits 0, and each red proof turns red then green again.

## Phase 2: the fee-payer pin split ✓

Files: new `packages/wallet-bridge/src/fee-payer.pins.test.ts` (the computed `claim_and_end_setup` selector equals `CLAIM_AND_END_SETUP_SELECTOR`, no catch); `fee-payer.test.ts` (drop the computed-selector block, its catch and the `FunctionSelector` import; keep the address pin and the claim positive); `apps/extension/vitest.config.ts` (exclude line with the bb.js reason).

**Validation gate**
- Commands: `bun run lint`; `bun run typecheck:all`; `bun run --cwd packages/wallet-bridge test`; `bun run test`; then `bun run test:all`.
- Red proof: change one digit of `CLAIM_AND_END_SETUP_SELECTOR` in a scratch edit; the pin must fail in wallet-bridge's runner. Revert.
- Pass: every command exits 0; `bun run test` no longer collects the pin file.

## Delivery

One arc, one PR against `dev` from `worktree-authwit-intent-1`, no stack (D-orch-1). Merge `origin/dev` first. Title: `fix(dapp): refuse an inner-hash authorization intent naming the signing account` (79 characters). Body: what changed and the invariant, the OA-1 text and OA-2's "no row" as what ships now, the validation runs, no `Closes` line. Open without labels; if the path filter skips the network lane, add `e2e:extension-network` afterwards. Close-out as the PR's final commits.

## Post-implementation

The contract is this plan plus `implementations-plan/README.md` § Post-implementation standard at `4ad2a80d`. Specific to this plan:
- **Review loop:** single arc, once over the net diff from `4ad2a80d` after Phase 2 is green. Codex: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`. Hard stop after three rounds. Commits, the PR, tests and comments describe the change and its invariant only.
- **Close-out:** the Outcome block (`Known limits:` and `Open items:` lines), lessons promotion, `STATUS.md` deleted, `git mv` into `archive/` in its own commit, `bun run check:plans` green after staging.
- **Teardown after the merge:** `agent-worktree done authwit-intent-1 --merged`, once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/authwit-intent-1/plan.md` succeeds.

## Panel verdicts

- **Codex round 1** (`gpt-6.1-sol`, high): conditional approve. Accepted all six: the key-uniqueness overclaim (recon now argues from F3 and F5), F10's qualification, F9's checked boundaries, F2 narrowed to the signer's branch, I1 as repository evidence, the template heading renamed.
- **Codex round 2** (resumed): **approve**, nothing new and material. Two wording fixes applied: recon's reuse rows for the rebuild and the test's dependency, and Outcome 2's call-intent routing.
- **Opus leg:** conditional approve. Accepted: the rebuild line and `errors.test.ts` row (F7), the test moved to the extension (D5), the signer's precedence plus a mixed-intent control, the comment at the guard, the wording pass. Rejected: "`lessons/` is empty" (`lessons/phase-0.md` exists).

## Seeds

```
/goal Phases 1 and 2 marked ✓ in implementations-plan/authwit-intent-1/plan.md, each backed by its validation gate passing in the transcript; the Codex loop converged (a resumed pass reporting nothing new and material, quoted); the PR open against dev with the close-out commits on it; `bun run test:all` and `bun run lint` exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/authwit-intent-1: read plan.md, run the next unchecked phase to its gate, then the Post-implementation section; decide with Codex, never merge.
```
