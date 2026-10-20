---
plan: dapp-boundary-4
tier: mid
status: planned, final Codex pass approve; arc 1 in progress
issues: none open; #966 and #967 are closed known limits the arc 1 PR references
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); dual audit (Codex gpt-6.1-sol high + one Opus Plan leg); one fresh final Codex pass
base: origin/dev at ad4de50d8
trunk: dev
post_implementation_hardening: not scheduled
---

# dapp-boundary-4: dApp reads and registrations answer from the session and the chain

Arc 1 changes four wallet answers to a connected dApp and one paragraph of `SECURITY.md`. No screen changes.

1. `getContractMetadata` answers for a profile account outside the dApp session exactly as for an address the wallet never registered. Its publication and upgrade fields come from the node.
2. `getContractClassMetadata` answers `isContractClassPubliclyRegistered` from the node.
3. The receipt indexer's class gate adds the original-class comparison: the bundled Token class as both original and current, at both anchors.
4. A dApp `registerContract` binds its artifact to the instance's original class and requires the current class to equal it; the PXE seam refuses a current class that differs from the original, for every caller.
5. `SECURITY.md` states what the dApp-session MAC stops and what it does not (#967).

Arc 2 is held for the owner (OA-2). Item 4 is hardening under #966. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md).

**Claims that did not hold** (at `ad4de50d8`):
- The brief asks for `isContractPublished` "from the same node lookup a miss makes". A miss today asks the PXE cascade (PXE, node, compiled-in known bundle; `packages/aztec-runtime/src/pxe/service.ts:294-339`), which cannot give a node-only answer. The plan asks the node directly for every address (D2).
- The brief asks `executeAztecRegisterContract` to run `assertWireArtifactClassId(op.instance, op.artifact)`. That binder parses wire forms only: the schema refuses an artifact that is already parsed (planner probe, `lessons/phase-0.md`), and a dApp may send no artifact, so the wallet's looked-up artifact (parsed by `PxeServiceClient`) would always be refused. The plan shares the binder's parsed-form core instead (D6).
- The metadata op types live in `packages/wallet-bridge/src/operation.ts`, not in the extension's `spec.ts`.

## Outcome & Quality Bar

- **For whom:** a dApp developer using the stock wallet-sdk and aztec.js against Nulo; a person whose wallet holds several accounts and connects apps with a subset.
- **Excellent:**
  1. For an address the session does not hold, every field of the `getContractMetadata` answer is the same whether or not the address is one of the profile's accounts, hidden ones included. Both cases make the same node call and the same reads, apart from inside one PXE read (I2).
  2. `isContractPublished`, `isContractUpdated`, `updatedContractClassId` and `isContractClassPubliclyRegistered` mean what upstream means: chain state per the node. An aztec.js deploy of a class that is already published, but absent from this profile's store, adds no class publication.
  3. Every PXE registration refuses an instance whose current class differs from its original, before any write. The dApp path also binds its artifact to the original class and keeps the existing plain refusal text.
  4. A contract whose original class is not the bundled Token never reaches the public receipt scan, whatever its current class.
- **Good enough:** session accounts and non-account contracts keep their stored-instance answers. A node failure answers "not published" for a contract and fails the class call. No consent row changes in this lane.

## Assumptions

**Facts** (verified at `ad4de50d8`):
- F1 The two metadata executors are `executeAztecGetContractClassMetadata` and `executeAztecGetContractMetadata` (`apps/extension/src/wallet/services/execution/view-executor.ts:149-208`); arc 1 rewrites both as in Architecture. Their results reach the dApp unprojected.
- F2 Upstream sets `isContractPublished`, `isContractUpdated` and `updatedContractClassId` from one `aztecNode.getContract(address)`, and `isContractClassPubliclyRegistered` from `aztecNode.getContractClass(id)` (`@aztec-labs/wallet-sdk` 6.0.0-rc.3 `dest/base-wallet/base_wallet.js:467-502`). aztec.js `DeployMethod` reads only the class flag (`dest/contract/deploy_method.js:180-189`).
- F3 The dispatcher holds the session row at `buildOperation` (`packages/wallet-bridge/src/dispatcher.ts:963-973`); `getSessionAccountAddresses(session, chainId)` gives the session's raw addresses on that chain (`:1085-1091`). Only `buildNetworkOperation` builds the metadata op (`:1006-1007`). A batch leg re-enters `dispatch` with the same context and re-reads the session (`:230`, `:468-473`). The schema parse makes the address canonical before any of this (`wallet-schema-args.ts:66-77`).
- F4 `AccountService.getAccounts(profileId, chainId, true)` lists the profile's rows on the chain, hidden ones included (`apps/extension/src/wallet/services/account/service.ts:241-254`); `ViewExecutorDeps` already holds `accountService`. No user flow deletes an account row (recon.md).
- F5 `networkService.getNodeForUrl(url)` gives the node of one endpoint URL without reading the active profile (`apps/extension/src/wallet/services/network/service.ts:1011-1017`); `getNode(chainId)` reads the active profile's row on a cache miss (`:963-974`). `AuthRegistryService.nodeFor` pins a network row's own endpoint this way (`auth-registry/service.ts:182-189`).
- F6 `assertWireArtifactClassId` parses both inputs, requires current = original, checks the artifact against the original and maps every failure to `Error(CLASS_ID_MISMATCH)`; `assertArtifactClassId` lets a recompute failure propagate (`packages/aztec-runtime/src/pxe/artifact-class-id.ts:70-100`). Both reach the extension through the barrel `packages/aztec-runtime/src/pxe/index.ts:24-31`. Arc 1 changes the class binding of `executeAztecRegisterContract` (`apps/extension/src/wallet/services/execution/service.ts:1222-1277`).
- F7 `PxeService.registerContract` checks the address against the preimage before any write, then writes the wallet's own copy of the class when it has one (`packages/aztec-runtime/src/pxe/service.ts:422-451`). Wire callers bind a supplied artifact before they call it.
- F8 The class gate resolves the instance from the node at `finalized` and at the pinned checkpoint (`packages/aztec-runtime/src/pxe/public-events.ts:440-466`); arc 1 adds the original-class comparison and restates the two docs (`:101-105`, `:421-439`).
- F9 Network e2e that drive these paths: `contracts-getMetadata`, `contracts-getClassMetadata`, `batch-mixed`, `contracts-register`, `public-events-capability` (tolerates `unresolved`), and `incoming-public-transfers`, which is green only when the gate answers `standard`.

**Inferences:**
- I1 A node `getContract` answers `undefined` for a Nulo account, which is never published (`packages/aztec-runtime/src/account/nulo-account.ts:120-132`), so a session account's `isContractPublished` turns from `true` to `false`. No aztec.js code reads it (grep of `dest/`).
- I2 A withheld account and a fresh address then differ only inside one PXE read: a stored hit against a miss, with the hit's serialization and the client's parse. This plan claims no timing equality beyond that; the residual is tracked privately.
- I3 No legitimate caller of `PxeService.registerContract` passes current ≠ original: wire callers are guarded, PXE preimages hydrate current := original, and node instances are refused when upgraded (recon.md).
- I4 A real node returns `originalContractClassId` from `getContract` (`ContractInstanceWithAddress`); `incoming-public-transfers` proves the gate still answers `standard` for the sandbox token.

**Asks** (working assumption in brackets; none blocks arc 1):
- A1 = OA-1: what the class-lookup consent row shows. [Unchanged; arc 1 ships the node's publication answer only.]
- A2 = OA-2: arc 2. [Held.]
- A3 No public issue exists for item 2. [None filed: the PR records it.]

## Architecture & Implementation

**Shape.** No new module, state, option or seam. The bridge adds one field to one op. The view executor gains two private helpers. `artifact-class-id.ts` splits the wire binder's parsed-form core into its own export. Two aztec-runtime functions gain one comparison each.

**Interfaces.** `AztecGetContractMetadataOperation` gains `readonly sessionAccounts: readonly string[]`, the session's raw addresses on the op's chain. The dispatcher is its only builder; no screen renders it (`OperationCard.vue` shows `op.address` only). `artifact-class-id.ts` exports `assertInstanceArtifactClassId(instance: ContractInstanceWithAddress, artifact: ContractArtifact)`: it throws `Error(CLASS_ID_MISMATCH)` when current ≠ original, then runs `assertArtifactClassId(artifact, original)`, so a recompute failure propagates. `assertWireArtifactClassId` becomes: parse both, call it, map every failure to the fixed text, as today.

**Flow, `getContractMetadata`.** The dispatcher runs its checks unchanged. `buildNetworkOperation` then sets `sessionAccounts = [...getSessionAccountAddresses(dappSession, ctx.chainId)]`, or `[]` with no session, so every profile account is withheld. The executor does, for every call, in this order:
1. Read the PXE-local instance (`pxeOnly`) and `accountService.getAccounts(network.profileId, network.chainId, true)` together. The rows come from the profile whose store is read, not the active one.
2. Withhold the instance when the address is an account row and not in `sessionAccounts` (lower-case compare on both sides).
3. Read the artifact `pxeOnly` for a visible hit only, as today.
4. Ask `getNodeForUrl(networkInfoFrom(network).rpcUrl).getContract(address)` once: the node of the network row read in step 1, never the active profile's. `isContractPublished = !!instance`; `isContractUpdated` and `updatedContractClassId` from it, as upstream. A throw answers not published and not updated, logged at debug as a fixed category with no error object.
5. Return the instance and `INITIALIZED` for a visible hit with its artifact, else `undefined` and `UNKNOWN`.

**Flow, `getContractClassMetadata`.** Read the artifact `pxeOnly` and ask the same pinned node `getContractClass(id)`, together. `isArtifactRegistered = !!artifact` (upstream's meaning: the wallet holds it) and `isContractClassPubliclyRegistered = !!publicClass`. A node throw fails the call (D4).

**Registration.** `executeAztecRegisterContract` looks an absent artifact up by `originalContractClassId`, then calls `assertInstanceArtifactClassId(instance, artifact)` in place of `assertArtifactClassId`, before the key binding and any write. `PxeService.registerContract` throws `Error("registerContract class mismatch: …")` when current ≠ original, beside the address check and before any write, and resolves its own artifact by the original id.

**Class gate.** At each anchor, the gate answers `non-standard` unless both class ids equal the bundled Token class. `unresolved` keeps its two causes; the two docs state the rule.

**File-level change map.**

| File | Change |
|---|---|
| `packages/wallet-bridge/src/operation.ts` | `sessionAccounts` on the metadata op, one-line invariant doc |
| `packages/wallet-bridge/src/dispatcher.ts` | `buildOperation` hands the session's chain addresses to `buildNetworkOperation`, which sets them on the metadata op |
| `packages/wallet-bridge/src/dispatcher.test.ts` | the op carries this chain's session accounts, in a batch leg too, and `[]` without them |
| `apps/extension/src/wallet/services/execution/view-executor.ts` (+ test) | the two executors; helpers for the withholding decision and the node read |
| `apps/extension/src/wallet/services/execution/service.ts` | lookup by the original id; `assertInstanceArtifactClassId` |
| `apps/extension/src/wallet/services/execution/service.class-id.test.ts`, `register-contract-void-conformance.test.ts` | fake instances gain an original id, both ids with `equals`; one refusal case |
| `packages/aztec-runtime/src/pxe/artifact-class-id.ts` (+ test), `index.ts` | `assertInstanceArtifactClassId`, re-exported from the barrel; the wire binder calls it |
| `packages/aztec-runtime/src/pxe/service.ts`, `register-contract.test.ts` | the PXE-seam refusal and its test |
| `packages/aztec-runtime/src/pxe/public-events.ts` (+ test) | the gate, its docs, its fake, two cases |
| `SECURITY.md` | the MAC sentence |

**Trade-offs and alternatives not taken.** See the decision ledger (D1-D7, Outline B).

## Security & Adversarial Considerations

- **Threat model.** A connected origin controls every argument of the calls it is granted: addresses, class ids, instance fields and artifacts. It holds read grants (`contracts` with `canGetMetadata`, `contractClasses`) and registration grants, listed or `"*"`. Its calls open no window. The node is chain-id-honest but may observe (`SECURITY.md` § What endpoints can still do).
- **Invariants arc 1 keeps.** (1) For an address outside the session, the metadata answer does not depend on whether the address is a profile account. (2) Publication and upgrade flags come from the node, never from local storage. (3) The PXE seam refuses current ≠ original for every caller; wire callers bind the artifact to the original class. (4) The public receipt scan reads logs only from contracts whose original and current class, at both anchors, is the bundled Token.
- **Accepted.** The node now sees a `getContract` call for every address a dApp asks about, the session's own accounts included, as upstream does; the dApp chose each address. Stored non-account contracts still answer from the store (upstream's meaning). `isArtifactRegistered` stays a local answer (upstream's meaning; OA-1). Simulation reads the same stores (#965).
- **Input validation.** The schema parse makes the address and class id canonical; the executor parses them again before the node call.
- **Logging.** The node-failure lines are fixed categories with no error object, since a node error message can carry the requested address (CLAUDE.md § Logging policy; `lessons.md` § Extension runtime).
- **Supply chain, crypto, privileges.** No dependency, key, hash or permission changes.

## UI impact

None. Arc 1 changes no screen, copy or row. The orchestrator's no-ask record for this lane is "Arc 1 is not a draft: it changes no screen". The consent rows for metadata and class lookups belong to another lane (OA-1).

## Phases (arc 1)

Every gate runs from the worktree root and also runs `bun run lint` and `bun run typecheck:all`.

### Phase 1: the class gate adds the original-class comparison

- Change `resolveTokenClassStatus` and its two docs (`packages/aztec-runtime/src/pxe/public-events.ts`).
- In `public-events.test.ts`, give `makeNode`'s instances an `originalContractClassId`; set it to the bundled class in the existing standard cases.
- Add one `test.each` with two rows, each answering `non-standard`: a random original with the bundled current at both anchors, and the same at the checkpoint only.
- **Gate:** `cd packages/aztec-runtime && bun run test src/pxe/public-events.test.ts`. Pass: exit 0, and both new rows red when run against the base copy of `public-events.ts`.

### Phase 2: registrations bind the current class to the original

- Add `assertInstanceArtifactClassId` to `artifact-class-id.ts`, re-export it from `packages/aztec-runtime/src/pxe/index.ts`, and make `assertWireArtifactClassId` call it.
- In `PxeService.registerContract`, refuse current ≠ original before any write; resolve its own artifact by the original id.
- In `executeAztecRegisterContract`, look an absent artifact up by the original id, and call `assertInstanceArtifactClassId(instance, artifact)`.
- Tests:
  - `artifact-class-id.test.ts`: a genuine instance with its own artifact passes `assertInstanceArtifactClassId`; the same instance with a forged current id is refused with the fixed text. The wire binder's existing table stays green.
  - `register-contract.test.ts`: a genuine instance with a forged current id and an artifact is refused, and `writes` stays `[]`.
  - `service.class-id.test.ts` and `register-contract-void-conformance.test.ts`: fake instances gain `originalContractClassId`, both ids with `equals`. New `aztec_registerContract` case: current ≠ original is refused with the plain `Error` and `MISMATCH`, and `registerContract` and `registerAccount` are not called. The looked-up case asserts the lookup used the original id. The existing cases stay as the controls, the recompute-failure pin included.
- **Gate:** `cd packages/aztec-runtime && bun run test src/pxe/register-contract.test.ts src/pxe/artifact-class-id.test.ts`, then `cd apps/extension && bun run test src/wallet/services/execution/service.class-id.test.ts src/wallet/services/execution/register-contract-void-conformance.test.ts src/wallet/services/execution/register-contract-account.real.test.ts src/wallet/services/execution/register-bounds.test.ts src/wallet/services/account-state`. Pass: exit 0; the new refusal cases red against the base copies of the two changed sources.

### Phase 3: class publication comes from the node

- Change `executeAztecGetContractClassMetadata` as in Architecture.
- Tests in `view-executor.test.ts` (the harness node gains `getContractClass`; the network fake gains `getNodeForUrl`):
  - The node has the class and the store lacks the artifact: `{ true, false }`.
  - The store has the artifact and the node lacks the class: `{ false, true }`. Red on the base.
  - The node throws: the call rejects.
- **Gate:** `cd apps/extension && bun run test src/wallet/services/execution/view-executor.test.ts`. Pass: exit 0.

### Phase 4: a metadata read is bound to the session

- Add the op field and the dispatcher change; change `executeAztecGetContractMetadata` as in Architecture.
- Bridge tests (`dispatcher.test.ts`): a session holding A on this chain and C on another; the recorded op carries `sessionAccounts` equal to `[A]`, as a top-level call and as a `batch` leg.
- Executor tests (`view-executor.test.ts`). The harness node gains `getContract`. The account fake `getAccounts` returns the hidden row B only when `all` is true, and records its arguments.
  - **Withheld.** Session {A}; the store holds A, B and a contract K. The answer for B deep-equals the answer for a fresh address F. `node.getContract` is called once for each. `getContractArtifact` is not called for either. `getAccounts` received the network row's profile id, and `getNodeForUrl` its primary URL, with `getNode` never called. Red on the base.
  - **Empty session.** With `sessionAccounts: []`, A answers as F does.
  - **Session account.** A returns its instance and `INITIALIZED`, with `isContractPublished: false` when the node has no A. Red on the base.
  - **Control.** K returns its instance and `INITIALIZED`. With the node holding K upgraded, it returns `isContractPublished: true`, `isContractUpdated: true` and K's current class.
  - **Node failure.** The node throws an error whose message holds the address: F and B both answer not published. No logged argument holds the address.
- **Gate:** `cd packages/wallet-bridge && bun run test src/dispatcher.test.ts`, then `cd apps/extension && bun run test src/wallet/services/execution/view-executor.test.ts`. Pass: exit 0; the reachability pins in `dispatcher.test.ts` unchanged and green.

### Phase 5: the dApp-session MAC sentence

- In `SECURITY.md` § Storage privacy, add one sentence. It says each dApp-session row carries a MAC keyed from the profile's keys, which stops a forged row and a row replayed under another id or profile. It does not stop a writer with storage access from putting back an earlier authentic row of the same key (#967). In the content-script note, name a Firefox content script as such a writer, pointing at that sentence.
- **Gate:** `git diff --stat` shows only `SECURITY.md` for this phase; `bun run test:ci-gating` exits 0.

### Phase 6: arc gate

- **Commands:** `bun run lint`, `bun run typecheck:all`, `bun run test:all`, `bun run test:ci-gating`. Then two network runs through `agent.sh`, one at a time in this worktree:
  - Chrome: `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/contracts-getMetadata.test.ts tests/e2e/network/contracts-getClassMetadata.test.ts tests/e2e/network/batch-mixed.test.ts tests/e2e/network/contracts-register.test.ts tests/e2e/network/public-events-capability.test.ts tests/e2e/network/incoming-public-transfers.test.ts`
  - Firefox: `NULO_E2E_BROWSER=firefox NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/contracts-getMetadata.test.ts tests/e2e/network/contracts-getClassMetadata.test.ts tests/e2e/network/batch-mixed.test.ts tests/e2e/network/contracts-register.test.ts`
- **Pass:** every command exits 0, and every listed file is green. No e2e scenario is added, so the runtime budget is unchanged.

## Arc 2 (held for OA-2)

How a dApp's registrations are admitted. The design and its options are tracked privately; nothing in arc 1 depends on them. Arc 2 is planned here only after the owner picks.

## Decision ledger

- **Outline chosen:** A, by both audit legs. Outline B withheld by account class and moved both node reads behind new `PxeService` methods; rejected per D3 and D2.
- **D1 Who decides.** The dispatcher passes the session; the executor decides with the account rows of the profile whose store it reads. Rejected: the bridge decides alone, because its `IAccountReader.getAccounts` lists visible rows only.
- **D2 One node-only lookup.** `getNodeForUrl` on the captured network row's primary endpoint, `getContract(address)`, for every address; the class call uses the same node. Both calls use the captured network row's primary endpoint, independent of the active profile (final pass). Rejected: reusing the cascade (no node-only answer for a stored address); a new node-only `PxeService` method (a new cross-process surface for one caller). With it, the upgrade fields come from the same answer, as upstream (r1: both legs).
- **D3 Rows, not classes.** Withhold by the profile's account rows on the chain, hidden included. Rejected: withholding every stored instance of a wallet account class, which ties the executor to account classes and withholds account-class contracts a dApp registered. The residual is tracked privately.
- **D4 Class call fails on a node error.** A false "not published" makes aztec.js add a class publication that fails on chain after the person approves; an error fails before any window. The contract call keeps its best-effort answer.
- **D5 PXE-seam error.** A plain `Error` beside the address check, not `assertNotUpgraded`, whose `ContractUpgradedError` is defined as a node answer.
- **D6 Parsed-form binder.** `assertInstanceArtifactClassId` holds the rule once; the wire binder parses and delegates. Rejected: the wire binder on the dApp path (refuses parsed and absent artifacts); an inline check with an exported text constant in the executor (Opus r1; a second copy of the rule).
- **D7 Logging.** A fixed category with no error object on a node failure (Codex r1).

## Review verdicts

- **Round 1, Codex (gpt-6.1-sol high): `conditional approve`.** Accepted: (1) `isArtifactRegistered` stays local, so OA-1 stays open (Asks, OA-1); (2) Phase 2 test changes understated (D6, Phase 2); (3) the gate lacked `NULO_E2E_RETRY=0`; (4) I2 claimed timing equality: narrowed, residual tracked privately; (5) red-on-base for the withheld case, a batch leg and an empty session (Phase 4); (6) the D3 residual: tracked privately, not a public issue; (7) upgrade fields from the node answer (D2); (8) a node error message can carry the address (D7); (9) committed text named private items and overclaimed the PXE seam: rewritten. Fine per Codex: Outline A, D1, D4, D5, I3, the dual-anchor gate.
- **Round 1, Opus Plan leg: `conditional approve`.** Accepted: (1) arc 2's mechanism and OA-2's options out of committed text, and no public OA-2 issue at close-out; (2) the wire binder breaks parsed and absent artifacts (D6; the planner's probe agrees); (3) rows from `network.profileId`; (4) upgrade fields (as Codex 7); (5) `incoming-public-transfers` added to Phase 6; (6) retry 0; (7) the PXE-seam overclaim; (8) two line numbers. Its trace found no other field, error or side effect that tells a withheld account from a fresh address.

- **Final fresh Codex pass (gpt-6.1-sol high, new session): `conditional approve`.** Accepted: (1) endpoint pinning: both metadata calls use the captured row's endpoint (D2, F5, Phase 3-4 tests); (2) Facts and recon still described baseline behaviour: rewritten as locations and intended contracts; (3) the barrel re-export (Phase 2). Also: I2's wording widened to the hit's serialization and parse; F3 says batch legs re-read the session. Fine per Codex: D3, D6, the class gate, the gate commands and e2e selection.
- **Final pass, resumed round 2: `conditional approve`.** One condition: the D2 rewrite still narrated a failure path in committed text; reworded to the invariant. **Round 3: `approve`.** "All previously accepted conditions are satisfied. Confidence: high."

## Delivery

- **Arc 1** = Phases 1-6, branch `dapp-boundary-4-a1` off `origin/dev` with this plan's commit cherry-picked first, one PR against `dev` (the orchestrator's D-orch-1: no stack), ready, not a draft. Title: `fix(dapp): answer metadata from the session and the node; bind registered classes` (81 characters). Body: what changed and the invariant each change keeps, the validation runs, "Refs #966, #967", and no `Closes` line (no open issue). Open it without labels; add `e2e:extension-network` only if the path filter skips the network lane.
- **Arc 2** = OA-2's pick, a later PR against `dev`, carrying the close-out. If the pick needs no code here, arc 1's PR gets the close-out commits before it merges.
- **Parallelism:** none; six short phases on one path.

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at `ad4de50d8`. Plan-specific values:
- **Diff review:** `code_review: off`; the step is absent.
- **Review loop, per arc, before that arc's PR:** `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`. The prompt carries the arc diff from `origin/dev`, this plan and its ledger, the arc map ("arc 1 of 2; arc 2 is held"), the adversarial ask, and the README's two rules verbatim. One Opus review (`general-purpose`) of the same diff runs beside round 1. Hard stop at three rounds. Log each round in `lessons/phase-6.md` and under Review verdicts. A fix that adds state, a lifecycle, a protocol, a recovery policy or a public contract stops for approval.
- **Delivery:** `gh pr create --base dev`, then `gh pr checks <n> --watch`; one rerun for a known flake. Never merge.
- **Close-out** (with the last arc): merge `origin/dev` and read `index.md` and `lessons.md`; write the `## Outcome` block; promote lessons only within the 8 KiB budget; file OA-1 as an `owner-decision` issue if still open; OA-2 stays with the private tracking, never a public issue; delete `STATUS.md`; `git mv implementations-plan/dapp-boundary-4 implementations-plan/archive/dapp-boundary-4` in its own commit, with the index line moved to `archive/index.md`; `bun run check:plans` green after staging.
- **Teardown after the merge** (standing authorization): once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/dapp-boundary-4/plan.md` succeeds, leave the worktree if this session entered it, then run `agent-worktree done dapp-boundary-4 --merged`; relay a refusal, never force. A `/loop` session checks on every firing; a `/goal` session arms one background wait after its wrap-up report.

## Seeds (draft until approval)

Recommended: `/goal`.

```
/goal Arc 1 of implementations-plan/dapp-boundary-4/plan.md done: Phases 1-6 marked ✓ in plan.md, each backed by its validation gate reported passing in the transcript, LESSONS_FILE=implementations-plan/dapp-boundary-4/lessons/phase-N.md printed per phase; the Codex loop (gpt-6.1-sol high) converged on the arc diff, quoted; the arc PR open against dev after the loop (gh pr view output); bun run test:all and bun run lint exit 0 in the transcript.
```

```
/loop 15m Drive arc 1 of implementations-plan/dapp-boundary-4 forward per its plan.md (read it and lessons/ first; plan.md is the state). Pick the next unchecked step, run the fast gates after each edit, commit signed. Decide open questions with Codex (gpt-6.1-sol high) and log each consult. A phase is green only when its gate passes as written. After Phase 6, run the Post-implementation loop, open the PR against dev, watch checks, report and stop. Never merge; never start arc 2.
```
