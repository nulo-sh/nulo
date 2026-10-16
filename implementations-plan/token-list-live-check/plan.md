---
plan: token-list-live-check
tier: light (the lane brief's call; one Codex round-trip plus one Opus Plan lens)
status: panel-approved (Codex approve, round 2); awaiting the orchestrator
issues: "#382 (closed by the one arc)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 8459699c
trunk: dev
post_implementation_hardening: not scheduled
---

# token-list-live-check: confirm each list entry on its chain before the owner approves a signature

The owner chose option A on decision page 19 (2026-10-15, the `## Decision` block on #382). `publish-token-list.yml`'s `prepare` job gains one advisory step. The step reads each entry of `infra/token-list/list.source.json` from a public node for its chain. It checks that the contract exists, runs the entry's class, and holds the entry's symbol and decimals. It writes the result into the run's step summary, which the owner reads before approving `sign`. It holds no secret, and `sign` never waits on it. Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Outcome & Quality Bar

- **For whom:** the owner, reading the `prepare` summary before approving `sign`; later, a maintainer after a Testnet reset.
- **Excellent:** (1) every source entry gets one row: `matches`, the exact difference (the chain's value beside the list's), or `not checked` with a fixed reason, so a typo or a stale entry shows before the signature; (2) no failure of the step blocks a publish (the job's existing 10 min timeout still bounds `prepare`); it finishes inside its budget and exits 0 only when every row reads `matches`.
- **Good enough:** `matches` means "this node agrees with the entry", not proof of who deployed the token (the token diff above it shows a changed address). No nightly run, no check of `flagged` pairs or of the chain's `name`.

## Assumptions

**Facts**
1. Everything the workflow runs from `infra/` or `packages/`, and its imports, must sit under `SIGNING_PATHS` and import only `node:` and `@nulo/token-list` (`infra/token-list/test/publish.test.ts:222-257`). The SDK node client (`apps/extension/scripts/seed-preflight-node.ts`) fails that rule.
2. The workflow pins allow a new `prepare` step: exactly three jobs, no `secrets.` in `prepare`, its output from step id `summary` (`scripts/ci-cd/behavior-gating.test.ts:1077-1118`).
3. Before seeding, the wallet requires the instance its PXE returns to have the entry's address and exactly its `currentContractClassId` (`apps/extension/src/wallet/services/token/service.ts:706-717`). The seeder then requires symbol and decimals equal to the entry's and a chain name of 1 to 80 characters (`seeder.ts:651-658`). The list stores both hex fields as lowercase `0x` + 64 digits (`packages/token-list/src/parse.ts:23,105,112`).
4. `https://aztec-testnet.drpc.org` answers without a key on chain 3415328944 (6.0.0-rc.3). The SDK client calls `aztec_*` methods (`@aztec-labs/stdlib` `dest/interfaces/aztec-node.js:399`): `aztec_getNodeInfo`, `aztec_getBlockNumber`, `aztec_getContract(address, block?)` and `aztec_getPublicStorageAt(block, address, slot)` (`:132,305,357`). Their wire shapes are in `recon.md`. Both preflights pass against this node for USDC and GBPC.
5. The aztec-standards Token class `0x163b2b24…1d8a` keeps `symbol` at slot 3 and `decimals` at slot 5. Its getters return those fields verbatim (`fn symbol() -> FieldCompressedString { self.storage.symbol.read() }`, `fn decimals() -> u8 { self.storage.decimals.read() }`, the artifact's embedded `token_contract/src/main.nr`). The wallet decodes the symbol as UTF-8 with every NUL removed (`apps/extension/src/wallet/services/token/functions/descriptors.ts:50`), so a storage read decoded the same way is what the seeder sees.
6. `@nulo/token-list` stays free of Aztec packages; `token-list-pins.test.ts` in the extension pins its copies of Aztec values to the packages the wallet runs. The signer's closure is exactly seven files, `class-ids.ts` among them (`packages/token-list/src/import-closure.test.ts`).
7. `prepare` runs only on `dev` (`publish-token-list.yml:36`), so no dispatch on the feature branch can run it.
8. The wallet's `TESTNET_RPC_URL` carries a provider key in its path (`apps/extension/src/wallet/constants/network-endpoints.ts:1-2`).

**Inferences**
- I1. A class id fixes its storage layout: the slots are compiled into the bytecode the id hashes. Slots keyed by class id therefore cannot go stale silently; a newly bundled class has no slots, and the package test fails until it does.
- I2. The public dRPC endpoint may lag a Testnet reset, or keep answering for the old chain. Either way it fails visibly or reads as the old chain (Known limit K1).
- I3. GitHub marks a step that fails under `continue-on-error` with a failed icon and an annotation while the job succeeds. The summary carries the result either way.

**Asks** (working assumption in brackets; none blocks)
- A1. A nightly run against the served list would catch a reset that stales the list without a publish [out of scope: option A names the `prepare` step only].
- A2. dRPC, already the wallet's Testnet provider, also serves CI's check [accepted: no key; it learns the runner's address and public contract addresses].
- A3. The decision says "calls symbol and decimals"; the check reads the storage those getters return verbatim (Fact 5) [equivalent for the bundled class; the PR says so].
- A4. The step first runs on GitHub at the next publish on `dev` [the owner may dispatch sooner: [OWNER-ASKS.md](OWNER-ASKS.md) O1].

## Architecture & Implementation

**Shape.** A dependency-free script, `infra/token-list/scripts/live-check.ts`, inside the existing publish closure. It sends plain JSON-RPC over `fetch` (`redirect: "error"`) to the `aztec_*` methods. It reads `symbol` and `decimals` from public storage, at slots keyed by class id, so no PXE, prover or SDK is involved. The workflow passes one literal node URL. The script learns each node's chain from `aztec_getNodeInfo` (`(l1ChainId ^ rollupVersion) >>> 0`) and checks the entries of that chain.

**Rows first.** Build one row per source entry, each starting as `not checked: no node given serves chain <n>`. Only a node whose node info names that chain changes a row. So an empty table cannot pass, and an entry on an unserved chain stays visible.

**Per node.** Read node info and one block number. A failed read, or a value outside its shape, leaves the node's rows `not checked`. The first transport failure (no answer, timeout) ends that node's reads, and its remaining rows read `not checked: no answer`.

**Per entry, as the wallet checks it.** Call `aztec_getContract(address, block)`. `null` means not deployed. A different `address` means the node answered another contract. A `currentContractClassId` other than the entry's is a class difference, and the storage read is then skipped, since the layout is unknown. Otherwise read the two slots at the same block, decode the symbol as the wallet does (UTF-8 with `ignoreBOM`, NULs removed), and compare both values with the entry's.

**Shapes and output.** Every node value is checked before use. Hex fields must pass `isFieldHex`. `l1ChainId`, `rollupVersion` and the block must be integers in u32 range. `nodeVersion` must match `^[0-9A-Za-z.+-]{1,32}$`. Anything else is `unexpected reply`. The section `## Token list: live check (advisory)` goes to stdout, appended to the step summary. It opens with one line saying `matches` means "this node agrees", then one line per node (origin, `l1ChainId`, `rollupVersion`, version, block), then the table. A chain symbol prints through `cell` when it is printable ASCII, and as its field hex otherwise. Node error text is never printed, only fixed categories: `no answer`, `HTTP <status>`, `error reply`, `unexpected reply`, `time budget spent`. A top-level catch prints a fixed line, so stderr never carries node text. Exit 0 only when every row matches.

**Budget.** Each request gets 10 s, combined (`AbortSignal.any`) with a 4 min deadline for the whole run, which the test injects. Rows not reached read `not checked: time budget spent`. The step has `continue-on-error: true` and `timeout-minutes: 5`.

**Shared value.** `TOKEN_METADATA_SLOTS` (bundled class id → `{ symbol, decimals }`) goes in `packages/token-list/src/class-ids.ts`, beside the class it describes. A package test holds its keys to `BUNDLED_TOKEN_CLASS_IDS`; the extension's pin test holds its numbers to the artifact's `storageLayout`.

**File-level change map**

| File | Change |
|---|---|
| `packages/token-list/src/class-ids.ts`, `index.ts`, `parse.test.ts`, `README.md` | the slots, exported; keys test |
| `apps/extension/src/wallet/services/token-list/token-list-pins.test.ts` | slot numbers equal the bundled artifact's `storageLayout` |
| `infra/token-list/scripts/live-check.ts` (new), `summary.ts` (`export` on `cell`) | the check |
| `infra/token-list/test/live-check.test.ts` (new), `publish.test.ts` | check cases; the closure scan must name `live-check.ts` |
| `.github/workflows/publish-token-list.yml` | the step after `summary`; one header line |
| `scripts/ci-cd/behavior-gating.test.ts` | the step's exact `run:` line, `continue-on-error`, timeout, place after `summary` |
| `infra/token-list/README.md`, `CI.md`, `.github/WORKFLOWS.md`, `.claude/skills/aztec-update/SKILL.md` | the step, and a local run in the reset runbook |

**Alternatives not taken.** (a) An `apps/extension/scripts` CLI on the SDK client: it reuses more code, but it runs hundreds of npm modules outside `SIGNING_PATHS` in the run the owner approves, and the closure test stays green only because its regex skips `apps/`. (b) A separate job: it breaks the three-job pin, and `sign` could be approved before it ends. (c) Exit 0 with warnings and no `continue-on-error`: a crash or a timeout would fail `prepare` and block the publish. (d) Reuse the preflight's decoder: it refuses non-ASCII and interior NULs that the wallet accepts, so it would report false differences. (e) A URL policy inside the script: the exact pinned `run:` line already fixes the CI node, and a keyed URL would leak at commit, before any run.

## Security & Adversarial Considerations

- **Threat model.** The node is a third party. It can lie, stall, or send hostile text. A lie can produce a false `matches`; that is no worse than today, because the wallet re-checks every entry on its own node before it seeds (Fact 3). A stall is bounded by the budget. Hostile text cannot reach the summary (shape checks, `cell`, hex fallback, fixed categories). It cannot reach stderr either, where the runner would read a workflow command.
- **Least privilege.** The step reads no secret (pinned) and needs no token. It writes only its own step summary. It cannot change `steps.summary.outputs.tokens_sha256`, the digest `sign` enforces (`publish-token-list.yml:40`).
- **No keyed endpoint.** The `run:` line, with its keyless origin, is pinned verbatim in `behavior-gating.test.ts`, so a changed node URL is a reviewed edit of a pinned line.
- **Supply chain.** No new dependency. The publish closure stays `node:` plus `@nulo/token-list`. `live-check.ts` lands under an existing signing path, so later edits show in the summary's signing-relevant changes.
- **Privacy.** The node learns the runner's address and the listed contract addresses, which are public.
- **Known limits, filed at close-out as closed `known-limit` issues.** K1: a dishonest or stale node, or a node of another chain that shares the composite chain id, can report `matches`; reopen if a wrong entry ever passes the check and is then refused by the seeder. K2: the check does not read the chain's `name`, so a token with an empty name reads `matches` and is never seeded; reopen if a listed token is ever refused for its name.

## Phase 1: the live check (arc 1)

1. Add `TOKEN_METADATA_SLOTS` with its keys test, and extend `token-list-pins.test.ts`.
2. Write `live-check.ts` and `live-check.test.ts`. Inject `fetch` and the deadline signal, and build the replies from the wire shapes in `recon.md`. Tests, table-driven where the shape repeats:
   - success control: the Testnet node-info pair, two entries, every row `matches`, exit 0;
   - one row per difference: not deployed, another address, class differs (and no storage read), symbol differs, decimals differs;
   - `not checked`: node info fails (every row, exit 1); one entry on a chain no node serves beside one that matches; a transport failure ends the node's later reads; an error reply; a reply outside its shape, including a `nodeVersion` with a newline and a bidi mark, whose text appears in neither stdout nor stderr; an aborted deadline;
   - decoding as the wallet does: a chain symbol in UTF-8 (`€URC`) or with an interior NUL matches the entry the wallet would accept;
   - display: a printable chain symbol with punctuation renders escaped; a non-printable one renders as hex.
3. Export `cell`, add the step and its pin, make the closure test assert it scans `live-check.ts`, and update the docs.

**Validation gate.** Commands: `bun run lint`; `bun run typecheck:all`; `bun run --cwd packages/token-list test`; `bun run --cwd infra/token-list test`; `bun run test`; `bun run test:all`; `bun run test:ci-gating`; `bun run test:release`; `bun run lint:actions`; from the repo root, `bun infra/token-list/scripts/live-check.ts https://aztec-testnet.drpc.org > ~/.cache/nulo-backlog/token-list-live-check/live.md` and then `echo $?`. Pass: every command exits 0; `live.md` names chain 3415328944 and holds four rows that read `matches`. Layers: lint, typecheck, unit, live network (the public node). No e2e: no wallet code changes.

## Delivery

One arc, one PR against `dev`, no stack (the orchestrator's D-orch-1): `feat(token-list): check each list entry against a public node before signing` (76 characters). The body gives what and why, the gate's outcomes and the live run's table. It also states "storage read, equivalent to the getters" (A3) and "no dispatch dry run: `prepare` runs on `dev` only", and ends with `Closes #382`. Open it with no labels, only after the gate passes and the Codex loop converges. The close-out lands as its final commits and files K1 and K2.

## Post-implementation

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at `8459699c`. Specific to this plan:

- Step 1 is absent (`code_review: off`).
- Step 2 runs once over `git diff 8459699c...HEAD`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`. It stops at three rounds and reports.
- Steps 3 to 5 as written, with slug `token-list-live-check`, trunk `dev`, `Closes #382`, and K1 and K2 on the Outcome's `Known limits:` line.
- Log every round in `lessons/phase-1.md`; refresh `agent-worktree status token-list-live-check "<line>"` at each gate.

## Audit verdicts

**Codex** (gpt-6.1-sol, high), round 1: **conditional approve**. Six findings:

- C1 Medium: a lying node is not "not checked". Accepted: Outcome reworded, K1.
- C2 Medium: `cell` keeps newlines and bidi marks. Accepted: every node value is shape-checked.
- C3 Medium: a layout pin proves locations, not getter results. Accepted with evidence: Fact 5, A3.
- C4 Low: a XOR collision, and a stale endpoint. Accepted: both identity parts are printed and range-checked; K1.
- C5 Medium: rows from the entries, and a deadline. Accepted: rows first, plus the 4 min budget.
- C6 Low: a URL rule is not a credential detector. Accepted as `redirect: "error"` plus the pinned literal; the script rule is dropped (alternative (e)).

**Opus** (Plan lens): **conditional approve**. Eight findings:

- O1 (= C5), O2 (= C2) and O4 (= C1): accepted as above.
- O3 Low: the client uses `aztec_*`, not `node_*`. Verified (Fact 4) and accepted.
- O5 Low: the check skips the seeder's name bound. Accepted as known limit K2: it needs a token deployed with an empty name, and reading slot 1 grows the owner's scope.
- O6 Low: pin the exact `run:` line. Accepted.
- O7 Low: node text on stderr could carry a workflow command. Accepted: the top-level catch.
- O8 nits:
  - Read the instance at the slots' block: accepted.
  - End a node's reads at its first transport failure: accepted, beside C5's deadline.
  - Decode without `Buffer`: moot, because the decoder is not shared.

**Codex**, round 2 (resumed): **approve**. Both Lows accepted: the symbol tests cover the wallet's decoding (Phase 1), and Outcome (2) is qualified by the job's 10 min timeout.

**Decisions taken against a reviewer view.**

- Both reviewers approved moving the preflight's decoder into `@nulo/token-list`. Fact 5 then showed the wallet decodes more loosely, so the check uses the wallet's decoding, and the move lost its second caller (alternative (d)).
- The slots go in `class-ids.ts`, not a new module, so one file holds each bundled class's facts. The signer's closure stays seven files.

## Seeds

- `/goal` Phase 1 marked ✓ in implementations-plan/token-list-live-check/plan.md with its validation gate passing in the transcript; LESSONS_FILE=implementations-plan/token-list-live-check/lessons/phase-1.md printed; the Codex loop converged (a resumed pass quoting no new material finding); one PR into dev closing #382, opened after the loop, its last commits the close-out that files K1 and K2 and archives the plan; `bun run test:all` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/token-list-live-check per its plan.md and the README § Post-implementation standard at 8459699c; never idle; decide with Codex (gpt-6.1-sol, high); stop at the PR for the owner's merge, then tear down with `agent-worktree done token-list-live-check --merged`.
