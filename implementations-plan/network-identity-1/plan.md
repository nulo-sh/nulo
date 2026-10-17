---
plan: network-identity-1
tier: mid
status: planned, approved by the final Codex pass; awaiting the orchestrator
issues: "#659 (closed by arc 1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); dual review (Codex gpt-6.1-sol high, one resume + Opus Plan); one fresh Codex pass
base: origin/dev at 13d5f8d0
trunk: dev
post_implementation_hardening: not scheduled
---

# network-identity-1: chain 0 is the local development chain; the endpoint docs say what the code checks

One arc, one PR against `dev`. The wallet holds the composite chain id 0 to one identity: the local development chain, anvil's L1 (31337) on a loopback node. It is enforced where a node's chain id is decided, in the row constructor, in every source of a new account's L1 (the stored-L1 getters and the reset journal), at promotion, and in the identity check at every use. `chain-identity.ts` and `SECURITY.md` then state the checks the code runs, including that promotion does not probe (#659). Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Issue claims that did not hold

- **#659** holds. Line drift only: `setPrimaryEndpoint` is `service.ts:760-775`, `handleSetPrimary` `[id].vue:83-93`, `getNode` `service.ts:812-827`. The section it names has three more statements the code does not match, and phase 3 corrects them too:
  - `SECURITY.md:279-284` says the probe compares `l1ChainId` with `Network.chainId` and raises `EndpointChainMismatchError`. The code compares the composite and the exact L1 and throws the `ENDPOINT_CHAIN_MISMATCH` prefix (`service.ts:95-106`).
  - `:285-286` names `DuplicateEndpointError`; the code throws the `DUPLICATE_ENDPOINT` prefix.
  - `:302` says the receipt poll fails over after three strikes. Eviction rebuilds the same URL (`service.ts:856-887`, `transaction/service.ts:485-487`).
- **Lane brief**: its sketch also persists the probed rollup version on every row, with an owner-confirmed reset when a local row's version changes. The panel settled on binding chain 0 to the local L1 instead, with no stored field (D1). OA-2 records it.

## Outcome & Quality Bar

**For whom**: a person who adds or edits RPC endpoints in Settings → Networks (Developer Mode), and the maintainer who reads `chain-identity.ts` or `SECURITY.md` to learn what ties an account to a chain.

**Excellent**:
1. Every chain the wallet builds metadata for is the stored one. On a non-zero chain that means the exact L1 and the composite, so the rollup version too. On chain 0 it means L1 31337, for every stored row. Every new account on chain 0 derives on L1 31337. Proven by the sink and service tests in phases 1 and 2, one per refused class, each with a success control.
2. The Local Network and every existing e2e flow behave as today on `localhost` / `127.0.0.1`. Every refusal reuses a line the popup already shows.
3. `SECURITY.md` and the helper's comment describe the checks the code runs, scoped to what they cover.

**Good enough**: refusals reuse "Wrong chain. This network is chain N.", "Something went wrong" and "Failed to update primary endpoint". A line naming the reason is OA-1.

## Architecture & Implementation

**Rule.** Chain 0 is the local development chain: L1 `LOCAL_L1_CHAIN_ID` (31337, anvil's default, already the seeded Local Network's constant) on a loopback node (`URL.hostname` `localhost` or `127.0.0.1`, the two hosts the transport rule admits for plain HTTP). A non-zero chain is pinned by its exact L1 and its composite. Within u32 that pair fixes the rollup version (`chain-identity.ts:38-42`). Chain 0's rollup version is not pinned, so a redeployed sandbox stays the same network, as the stale-network design already intends (#471). It is confined to L1 31337.

**Changes** (`S/` = `apps/extension/src/wallet/services`):
- `packages/wallet-core/src/utils/chain-id.ts`: `LOCAL_L1_CHAIN_ID` moves here beside `walletChainId`. `apps/extension/src/utils/chain-ids.ts` re-exports it with its doc, as it re-exports `walletChainId`. Seeds and the auto-import keep working through that re-export.
- `packages/wallet-core/src/utils/rpc-url.ts`: export `isLoopbackHost(hostname)` over the one host list. `rpcTransportVerdict`'s `http:` clause calls it on its lowercased host. `utils/index.ts` already re-exports the module.
- `packages/aztec-runtime/src/utils/chain-identity.ts`: on `network.chainId === 0`, `assertLiveChainIdentity` also requires `network.l1ChainId === LOCAL_L1_CHAIN_ID`. The live L1 already has to equal the stored one. A refusal throws its usual `Chain identity mismatch: …` message. The doc comment at `:44-46` states the rule.
- `S/network/service.ts`:
  - `isLoopbackRpcUrl(rpcUrl)` (module-local): parse, then `isLoopbackHost(url.hostname)`. A parse failure is not loopback.
  - `isLocalNetworkTarget(rpcUrl, kindHint)` also requires `isLoopbackRpcUrl`.
  - `nodeChainId(rpcUrl, kindHint, composite)` (module-local) is the one place a node's wallet chain id is decided. It returns 0 for a local target. It throws `${ERR_ENDPOINT_CHAIN_MISMATCH}: …` when `composite === 0`. Otherwise it returns the composite. `_probeChainIdentity` calls it after its `try`, so the prefix is not rewrapped as "Failed to fetch node info". `probeIdentityOnce` and `probeNodeStatus` (inside its `try`) call it too. `getNodeStatus` reads it through `_getChainId`.
  - `_buildNetwork`, the one row constructor (seeding and `addNetwork`), refuses `chainId === 0` unless the L1 is `LOCAL_L1_CHAIN_ID` and the URL is loopback. It throws `${ERR_ENDPOINT_CHAIN_MISMATCH}: …`.
  - `assertCanonicalStoredL1`, behind `getL1ChainIdStored` and `resolveVerifiedL1ChainId`, refuses a `chainId === 0` row on any other L1. Account creation, account import and a newly captured reset read the L1 through it.
  - `setPrimaryEndpoint`, before the already-primary return: on a chain-0 row, it refuses an endpoint that `isLocalNetworkTarget(endpoint.rpcUrl, network.kind)` rejects, the current primary included. The check reads the stored URL; promotion still probes nothing (#659).
- `S/network-reset/service.ts` `validateJournal`, which runs before anything on a first run and on a resume: it refuses `toChainId === 0` with `l1ChainId !== LOCAL_L1_CHAIN_ID`. That journal L1 is the third source of a new account's L1 (`recreateForReset` passes it as the override, `account/service.ts:341,397`). A refused journal is kept and nothing is purged; how it is handled afterwards is the reset's existing refusal path.
- `S/network/seeds.ts`: the `LOCAL_NETWORK_RPC_URL` comment says the override must be loopback. With any other value, the constructor refuses the Local seed, and seeding skips it with its existing log line.
- `SECURITY.md` § RPC endpoint as user input: phase 3.

**Result per path** (traced at `13d5f8d0`):

| Path | After the change | Popup line (existing) |
|---|---|---|
| `addNetwork`, node's composite computes to 0 | refused | toast "Something went wrong" |
| `addNetwork` at the Local seed URL, node on L1 31337 | `custom` row on chain 0 (as today) | none |
| `addNetwork` at the Local seed URL, node on another L1 | refused by the constructor | toast "Something went wrong" |
| `addEndpoint` / `updateEndpoint`, `local` row, remote URL | its composite is computed and refused | "Wrong chain. This network is chain 0." |
| same, `http(s)://localhost:*` or `127.0.0.1:*` | admitted (as today) | none |
| `addEndpoint` / `updateEndpoint`, non-zero row, node computes 0 | refused, same prefix as today | "Wrong chain. This network is chain N." |
| `setPrimaryEndpoint`, chain-0 row, stored remote endpoint | refused | toast "Failed to update primary endpoint" |
| any use (signing, proving, simulation metadata), chain-0 row not on L1 31337 | refused at the sink | the operation's existing failure |
| account creation or import, chain-0 row not on L1 31337 | refused by the L1 getters | the existing creation and import failures |
| a reset journal targeting chain 0 on another L1 (first run or resume) | refused before any purge; the journal is kept | the reset screen's existing refusal |
| re-derivation of an existing account (integrity check, export, account load) | unchanged: from the account's own stored L1 | none |
| `getNodeStatus` / `probeNodeStatus`, chain-0 row with a remote primary | `InvalidChain`, or `Inactive` when the node computes 0 | header's red dot (both states) |
| reset's `decideEndpoint` | a node computing 0 throws, which it maps to the seed's node (`network-reset/service.ts:394-397`) | none |

**Fixtures.** Each moves to a row the rule permits, and no assertion is loosened:
- Execution tests that hold a chain-0 row on L1 11155111 get the consistent composite (`fast-path.test.ts:281`, `batched-view-simulation.test.ts:246`). Any other fixture `test:all` reds for this reason is handled the same way.
- `service.test.ts:344-355` (`{1,1}`, `{2,2}`, composite 0) get non-zero pairs.
- `service.test.ts:1743-1747`'s `{3,3}` becomes `{3,4}`, and its `BOTH` message changes to composite 7. The row keeps its "composite checked first" intent.
- The Local success controls (`:937-963`, the status rows on `storeRow`'s L1 0) use L1 31337, with their node answers to match.

**Alternatives not taken**
- **B, persist the probed rollup version on every row** (the brief's sketch). For non-zero rows the field duplicates what `(chainId, l1ChainId)` already pins exactly. On chain 0, the offline-seeded Local row would bind its version at first contact, so B pins whatever answers first, a wrong first answer included. It needs a stored field, a binding step, a policy for rows with no version, and a reset flow a person sees. The L1 rule binds chain-0 metadata and new account allocation to 31337 with none of that. Both reviewers withdrew B once the L1 rule was in (D1).
- **A URL check at the sink.** Nodes are built in several places (`getNode`, `getSingleAttemptNodeForUrl`, `chain-runtime.ts:180`); the L1 rule needs no URL.
- **A refinement in `NetworkRowSchema`.** A violating row would vanish from `getAll`, and the active one would stop popup start (#498's shape).
- **A new `RESERVED_CHAIN` prefix.** No popup reads it, and on non-zero rows it would replace "Wrong chain…" with "Something went wrong." (Opus).

## Phases

### Phase 1: the shared constant, the loopback predicate and the use-time rule ✓

- [x] Change map: `packages/wallet-core/src/utils/{chain-id,rpc-url}.ts` and `rpc-url.test.ts`; `apps/extension/src/utils/chain-ids.ts`; `packages/aztec-runtime/src/utils/chain-identity.ts` and `.test.ts`; the execution fixtures above.
- Tests:
  - `rpc-url.test.ts`, `isLoopbackHost`: `localhost` and `127.0.0.1` are true. `localhost.`, `127.0.0.2`, `[::1]`, `a.localhost` and `rpc.example.com` are false. `rpcTransportVerdict`'s table stays unchanged and green.
  - `chain-identity.test.ts`, the local test becomes a pair:
    - Refused: chain 0 with a stored L1 of 11155111, live `{11155111, 1}` and `{11155111, 11155111}`.
    - Accepted: chain 0 on L1 31337 with two different live rollup versions (0 and 42), the drift the rule allows.
    - The old `{0, 1337}` pass case is removed.
- **Validation gate**
  - Commands: `bun run lint`; `bun run typecheck:all`; `bun run --cwd packages/wallet-core test`; `bun run --cwd packages/aztec-runtime test`; `bun run test`.
  - Pass: exit 0. The refused sink case fails against the base `chain-identity.ts` (copy taken from `13d5f8d0`).
  - Layers: lint, typecheck, unit.

### Phase 2: the network service holds every chain-0 row to the rule ✓

- [x] Change map: `S/network/service.ts`, `seeds.ts` (comment), `service.test.ts`; `S/network-reset/service.ts` (`validateJournal`), `service.test.ts`.
- Tests, in the existing describe blocks (`setupServiceWithStorage`, `storeRow`, `bothStatuses`, `FakeNodeFactory.setOverrides`):
  1. **A remote node on a `local` row** (`addEndpoint` and `updateEndpoint`, one `test.each`). A stored `local` row is on chain 0, L1 31337. `https://node.remote.example/` answers `{31337, 42}` or `{31337, 31337}`. Each answer rejects `ENDPOINT_CHAIN_MISMATCH` and leaves the row unchanged. Control: `https://localhost:8443/` with the same answers is admitted. The existing "Local Network accepts a non-seed endpoint URL" stays as the plain-HTTP control.
  2. **A composite that computes to 0** (`addNetwork`). `https://rpc.example.com/` answers `{11155111, 11155111}`. It rejects `ENDPOINT_CHAIN_MISMATCH`, stores no row and fires no `onNetworkAdded`. Control: `https://rpc2.example.com/` answering `{11155111, 7}` is stored as `custom` on `11155111 ^ 7`.
  3. **The constructor**. `addNetwork` at `LOCAL_NETWORK_RPC_URL` with a node on L1 11155111 is refused. `_buildNetwork` reached directly (the file's existing `as any` seam) with chain 0, L1 31337 and `https://node.remote.example/` is refused; this is the path of a remote seed override. Controls: a node on L1 31337 at the seed URL gives a `custom` chain-0 row, and `_buildNetwork` with a loopback URL builds the row.
  4. **The stored-L1 getters**. A stored `custom` chain-0 row on L1 11155111 makes `getL1ChainIdStored` and `resolveVerifiedL1ChainId` both reject. Control: the same row on 31337 resolves to 31337 on both, its node answering 31337.
  5. **Promotion**. A stored chain-0 `local` row has endpoints `localhost` (primary), `https://node.remote.example/` and `http://127.0.0.1:18081`. Promoting the remote one rejects `ENDPOINT_CHAIN_MISMATCH` and leaves the primary unchanged. With the remote endpoint already primary, the same call is refused too, so the guard runs before the early return. Promoting `127.0.0.1` succeeds.
  6. **`probeIdentityOnce`**. A remote node computing 0 rejects with the prefix. Control: a remote node on `{11155111, 7}` returns its composite.
  7. **The reset journal** (`S/network-reset/service.test.ts`, its `putNetwork` harness). An unfinished journal for a `custom` chain-0 row on L1 11155111, with `purged` false and then true, is refused. No purge or account recreation runs, and the journal is kept. Control: the same journal on L1 31337 resumes.
  8. **Status**. A stored `local` row whose primary is `https://node.remote.example/` answers a non-zero composite: `InvalidChain` on both methods. The existing loopback case is the `Active` control.
- **Validation gate**
  - Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/wallet/services/network src/wallet/services/account src/wallet/services/network-reset`; `bun run test`; `bun run test:all`.
  - Pass: exit 0. Tests 1 to 5 and 7 fail against the base files.
  - Layers: lint, typecheck, unit.

### Phase 3: the docs, then the arc gate ✓

- [x] Change map: `SECURITY.md` § RPC endpoint as user input (`:279-289`, `:302`, `:321-322`).
- Rewrite these statements to the checks the code runs; state rules, not history:
  - **Adoption.** `addNetwork` probes `getNodeInfo()` and records the exact L1 and the composite. `addEndpoint` and `updateEndpoint` refuse a node unless both equal the row's (`ENDPOINT_CHAIN_MISMATCH`). Chain 0 is the Local Network, L1 31337 on `localhost` / `127.0.0.1`. A composite that computes to 0 is refused.
  - **Use.** Every step that builds the chain metadata a signature, proof or simulation commits to compares the live node with the stored row (`assertLiveChainIdentity`). That is the L1 and the composite on a non-zero chain, and L1 31337 on chain 0, whose rollup version is not pinned. Promotion does not probe. Loopback is checked when an endpoint is adopted, built into a row or promoted, not at use. The guarantee covers the metadata the wallet builds and the accounts it allocates. Existing accounts are re-derived from their own stored L1 for verification and export. An imported key and an opaque message hash carry no chain (§ Authorization, `:255-261`).
  - **Duplicates** name `DUPLICATE_ENDPOINT`.
  - **Receipt poll**: three consecutive failures rebuild that URL's client; the poll never moves to another endpoint.
  - **What endpoints cannot do**: the PXE line becomes "make the wallet build signing or proving metadata for a chain other than the stored one".
- Then the arc gate, on Chrome, while load1 < 150, at retry 0:
  - `cd apps/extension && bun run test:e2e -- tests/e2e/endpoints.test.ts --retry=0`
  - `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/endpoint-refused-recovery.test.ts tests/e2e/network/backup-edited-local-network.test.ts`
  - No Firefox twin: no fixture, focus, window, activation or WebAuthn change. No scenario is added. Every refused class is decided in `NetworkService` or the sink, with no browser behaviour, so the unit layer proves it.
- **Validation gate**
  - Commands: the two e2e runs; then, on the final head, `bun run lint`, `bun run typecheck:all`, `bun run test:all` and `bun run test:ci-gating`; `bun run check:plans` after staging.
  - Pass: all green at retry 0. `STATUS.md` records each e2e file's wall-clock. Each rewritten sentence maps to a line of `service.ts`, `chain-identity.ts` or `transaction/service.ts`.
  - Layers: e2e (smoke and network), docs.

## Security & Adversarial Considerations

- **Threat model** (SECURITY.md § RPC endpoint): an endpoint is untrusted. It can answer anything to `getNodeInfo()`, at adoption and later. The wallet's defence is the stored identity. Adoption admits a node only for the row's identity. Every step that builds chain metadata compares the live answer with the row first. That holds on every chain; on chain 0 the bound is L1 31337.
- **Trust boundary inputs**: the RPC URL passes `RpcUrlSchema` (trimmed, no hidden characters, the transport rule) and the node's answer. The host test reads `URL.hostname` after the same parse the transport rule uses. `127.1` and `0x7f000001` normalise to `127.0.0.1`. A trailing dot, a `*.localhost` name, another `127.x` address and `[::1]` read as not loopback (fail closed). The L1 rule, not the host, binds chain 0's metadata.
- **Stored rows**: no backup writes network rows (recon). The rule is checked at use and in the L1 getters as well as at adoption, so it holds for every stored row. A storage writer is out of scope: it can already delete everything local.
- **Scope of the guarantee**: the metadata the wallet builds and the accounts it allocates. Re-derivation of an existing account reads that account's own L1. An imported key and a raw message hash are outside, as § Authorization says today.
- **Least privilege, crypto, supply chain**: no new permission, dependency, key or derivation. `derive-account-seed.ts` is unchanged.
- **Logging**: the new throws carry no URL, only the prefix and a fixed sentence (logging-policy skill).

## Assumptions

**Facts** (verified at `13d5f8d0`):
- F1. Chain 0 is assigned in `isLocalNetworkTarget` (`service.ts:86-90`); `addNetwork` probes with no kind hint (`:490`).
- F2. The sink handles `chainId === 0` separately (`chain-identity.ts:60`). It has 11 production call sites, each given the stored `Network` row (recon; both reviewers).
- F3. Backups carry no network rows (`full-backup-restore.ts:293-326`, `backup/README.md:20`).
- F4. The runner provisions the sandbox URL as `http://localhost:<port>` (`resolve-ports.ts:270`, `agent.sh:108,122`). The e2e anvil runs on 31337 (`tests/e2e/anvil-probe.ts:4`). `endpoint-refused-recovery` stores `http://[::1]` on purpose. `backup-edited-local-network` moves the Local endpoint to `127.0.0.1`.
- F5. The popup maps `ENDPOINT_CHAIN_MISMATCH` to "Wrong chain. This network is chain N." and other errors to "Something went wrong" (`endpoint-error-text.ts:15-24`, `NewNetworkPopup.vue:126-141`). A promotion failure reads "Failed to update primary endpoint" (`[id].vue:90-92`).
- F6. `probeIdentityOnce` has one caller, the reset's `decideEndpoint`, which maps a throw to the seed's node (`network-reset/service.ts:385-400`).
- F7. A new account's L1 comes from `getL1ChainIdStored` / `resolveVerifiedL1ChainId` (`account/service.ts:341,711,976`, `network-reset/service.ts:471`) or from a reset journal's override (`network-reset/service.ts:536`, `account/service.ts:397`). The getter tests use chain 123, which the rule does not touch.

**Inferences**:
- I1. No supported network reports a composite of 0. The rule makes this a product restriction: 0 is reserved, not merely unlikely (Codex).
- I2. "L1 31337 is development-only" is a support rule, not a fact about every chain that could pick that id. OA-2 records it.
- I3. The host load allows the e2e runs at implementation time (load1 141 at planning).

**Asks** (unattended: the working assumption applies):
- A1. The brief's persisted rollup version. Working assumption: not built (D1). OA-2 states what ships and its two consequences.
- A2. A refusal line that names the reason. Working assumption: the existing lines ship, per the lane brief's no-ask record. See OA-1.

## UI impact

- **Settings → Networks** (Add network, Add/Edit endpoint, Make primary) and any operation on a chain-0 row on another L1: no copy, layout or row changes. The lane brief's record says: "UI impact: none; a reason line for a refused endpoint, if one is needed, is an `OWNER-ASKS.md` entry." Some inputs that were admitted are now refused, and each refusal shows a line the popup already shows (table above). The reason line is OA-1; neither ask blocks the arc.

## Decision ledger

| # | Decision | Chosen | Rejected and why |
|---|---|---|---|
| D1 | How chain 0 is bound | A′: L1 31337 on a loopback node, enforced where the id is decided, in the constructor, in every new account's L1 source, at promotion and at the sink | A (loopback at adoption only): the reviewers asked for the rule at use and in every L1 source too (Codex r1). B (stored rollup version) duplicates the composite elsewhere, pins the first answer on chain 0, and adds state and a visible reset. Codex r2, the final pass and Opus all chose A′ without B |
| D2 | #659: probe on promotion, or docs | docs, scoped to the metadata the checks cover | a promotion probe is a point-in-time check the use-time check repeats on every use, and it would make an unreachable endpoint unpromotable |
| D3 | Refusal code | the existing `ENDPOINT_CHAIN_MISMATCH` everywhere | a new `RESERVED_CHAIN`: no popup reads it, and it would downgrade non-zero rows' copy (Opus) |
| D4 | Where the id is decided | one module helper `nodeChainId` for all four readers | per-site checks (the three copies of `isLocalNetworkTarget(…) ? 0 : composite` that exist today) |
| D5 | Rollup drift on chain 0 | stays unpinned: a known limit, filed closed at close-out | detection needs B's state and a reset flow for a context that redeploys by design (Codex r2) |

## Review verdicts

- **Codex r1** (gpt-6.1-sol, high, session `01a14a84`): **reject**. Adopted: the rule at use and in every L1 source, not only at adoption (the sink L1 rule); "every view boundary" narrowed (`view-executor.ts:344-378` runs utilities without the check); the PXE-injection line dropped; `{3,3}` fixture; `NULO_E2E_RETRY=0`; the `probeIdentityOnce` pair; the promotion check before the early return. Rejected: B, on Codex's own r2 reasoning.
- **Opus Plan leg**: **conditional approve**, agreeing with D1 (no B) and D2. Adopted: reuse `ENDPOINT_CHAIN_MISMATCH`; the `{31337, 31337}` case; `backup-edited-local-network`; fact fixes (11 sites, no `index.ts` edit, account creation and status effects); the receipt-poll line. Its condition that committed files state only the rule and the change is applied throughout.
- **Codex r2** (resume): **conditional approve** of A′. Adopted: the chain-0 L1 rule in `assertCanonicalStoredL1` with getter tests; the guarantee scoped to built metadata and derived keys, imported keys and raw hashes outside; loopback in the constructor; an explicit sink success case for two rollup versions on 31337; OA-2 records both consequences; drift as a known limit (D5).
- **Final fresh Codex pass** (session `01a14a98`): **reject**, two blockers, both adopted. The reset journal is the third source of a new account's L1, so `validateJournal` takes the rule (phase 2, test 7). Committed wording was reduced to the rule and the change. Also adopted: the guarantee is scoped to new allocation, since historical re-derivation reads the account's L1; the fixture list; the remote-seed constructor test; the already-primary promotion test; OA-1's wording. Resumed to verify: **conditional approve** (two wording fixes: OA-2's scope sentence and a misplaced change-map bullet), both applied; resumed again: **approve**.

- **Implementation review r1** (Codex, session `01a14abd`): **reject**, three items. Adopted: the adoption sentence names the Local target's 0; the cache counts three reported failures, which a success does not reset. Argued: a chain-0 row on L1 31337 with a non-loopback primary, which only an install from before this change can hold, is a known limit with D5. **Opus**, beside it: **conditional approve**; the stale `local`-kind comments and the same adoption wording, adopted.
- **Implementation review r2** (resume): **approve**; the known-limit disposition accepted.

## Delivery

- One arc, one PR, branch `worktree-network-identity-1` against `dev` (no stack: the orchestrator's D-orch-1). Phases 1 to 3, then the close-out as the PR's final commits. `code_review: off`.
- Title (≤ 93 characters): `fix(network): chain 0 is the local L1 on a loopback node; endpoint docs match the code`.
- Body: the rule and what changed; the gates with outcomes; each e2e file's wall-clock (no scenario added); `Closes #659`. No label at creation. Add `e2e:extension-network` afterwards only if the path filter skips the network lane.
- Parallelism: none. Three short phases share the network service.

## Post-implementation

The execution contract is this section plus `implementations-plan/README.md` § Post-implementation standard at `13d5f8d0`. Plan-specific values:
- Step 1 (diff review): absent (`code_review: off`).
- Step 2 (review loop): single-arc placement, after phase 3 is green, over `git diff 13d5f8d0...HEAD`.
  - Run `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then resume with `resume-codex.sh` on the same dir.
  - Run one Opus review of the same diff (`Agent`, `model: "opus"`, `general-purpose`) beside the first round.
  - Hard stop at three rounds. Log each round in `lessons/phase-3.md` and under Review verdicts.
- Step 3 (delivery): as above. Run `gh pr checks <n> --watch` once; a known flake gets one rerun.
- Step 4 (close-out):
  - Merge `origin/dev` first and read `index.md` / `lessons.md`.
  - Write the Outcome. Its `Known limits:` line names the closed `known-limit` issue for D5. That issue's body describes the Local Network's development behaviour only: a second sandbox on L1 31337 reads as the same network, and a Local Network row from an install made before this change keeps a primary that is not on this machine until it is edited. Reopen if chain 0 serves anything but development, or the product promises isolation between sandbox deployments.
  - Promote lessons, delete `STATUS.md`, `git mv` into `archive/` in its own commit, and move the index line to `archive/index.md`.
- Step 5 (teardown after the merge): once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/network-identity-1/plan.md` succeeds, run `agent-worktree done network-identity-1 --merged`. The orchestrator merges; the session that sees the merge runs it.

## Seeds

Recorded only. The orchestrator spawns the arc, and this session's planner does not run them.

```
/goal Phases 1-3 of implementations-plan/network-identity-1/plan.md marked ✓, each gate reported passing in the transcript; LESSONS_FILE=implementations-plan/network-identity-1/lessons/phase-N.md printed per phase; the Codex fix loop on gpt-6.1-sol converged over git diff 13d5f8d0...HEAD (a resumed pass with no new material issue quoted); PR against dev open with Closes #659, opened only after the loop; close-out committed (git show --stat of the archive move); bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/network-identity-1 forward per its plan.md: reality check (plan.md, lessons/, git status, PR checks), next pending step, fast gates after each edit, Codex (gpt-6.1-sol, high) for any decision, never merge, never change UI copy; after the PR merges run the teardown in Post-implementation step 5 and stop.
```
