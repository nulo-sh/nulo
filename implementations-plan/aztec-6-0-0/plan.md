---
plan: aztec-6-0-0
tier: mid
status: completed (P0 delivered as #1103, arc 1 as #1107)
issues: "Refs #864 (its first agent line); closes no issue"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); dual audit (Codex gpt-6.1-sol high + one Opus Plan agent); final fresh Codex pass
base: origin/dev at 95da7744
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-24. Planned and implemented 2026-10-23.
- **Status:** delivered in two PRs against `dev`: #1103 (P0, the empty Testnet list; published by #1104) and #1107 (arc 1, P1-P4 and this close-out). Merging #1107 closes the plan.
- **Shipped:**
  - Aztec `6.0.0` for `@aztec-labs/*` and the `@aztec-foundation/*` toolchain, with presto, aztec-standards and private-fee-juice at `6.0.0`; one `viem` (2.57.1) for the fork; the pxe patch re-created and proven against the tarball; Foundry 1.8.5 with an exact member set (D12).
  - Regime `nulo-v6.2`, appended and bound in place (P85-01): the 6.0.0 `SchnorrAccount.json`, vectors from `reference/nulo-v6.2`, and the oracle-major detector (D4).
  - The reset Testnet: rollup `679261766`, chainId `685146337`; SponsoredFPC, PrivateFPC, AuthRegistry and the Token class re-pinned from their sources.
  - The in-place update scenarios on the moved-chain and moved-addresses truth, and the in-place swap with its interceptions released (D11); the Chrome interception logs name origins only.
  - The age-gate excludes removed in the same PR (D3); audit acknowledgements re-judged.
  - Docs: the `aztec-update` skill and `UPDATE.md` (D6); the `e2e-testing` skill's in-place swap lesson; `lessons.md`'s rc.3 line replaced by the 6.0.0 oracle and `bun patch` line.
  - Gates at retry 0 on both browsers: smoke, the in-place pair, network proverless, both canaries prover-ON ([lessons/phase-4.md](lessons/phase-4.md)).
- **Owner steps:** dispatch `publish-packages.yml` once #1109 prepares the release; the live Testnet send from the 1.0.0 candidate (#864). `BEFORE-LAUNCH.md`'s rc.3 store item asks for a send on the rc.3 Testnet, which no longer exists: rewording it is the owner's call.
- **Dropped, rejected, superseded:** holding the line and a new extension major (OA-1 (b), (c)); keeping the old list (OA-2 (b)); an excludes follow-up (D3, the lane brief's claim did not hold); waiting out the age gate (D8, Codex's dissent recorded); a recovery policy for a prior build's reset journal (D14).
- **Known limits:** #808 (D14).
- **Open items:** #1108 (Testnet default tokens and the PrivateFPC agreement, `blocked:external` on unleashed's 6.0.0 generation), #1109 (the `@nulo-sh/*` release on the 6.0.0 peers); `quality-status` red on `dev`'s 11 advisories until #980 and #1032 land.
- **Seeds retired:** the `/goal` and `/loop` drafts are removed; this plan is a record, not a task list.

# aztec-6-0-0: Aztec 6.0.0, the reset Testnet, an in-place account rotation

Move the wallet from Aztec `6.0.0-rc.3` (labs) and `6.0.0-rc.6` (foundation toolchain) to `6.0.0` for both, follow the Testnet reset, and rotate the frozen account artifact in place: the 6.0.0 PXE refuses the current one. The procedure is the `aztec-update` skill; this plan holds what is specific to this bump.

Paths: `X/` is `apps/extension/src/`, `S/` is `X/wallet/services/`, `R/` is `packages/aztec-runtime/src/`. Recon: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). `$C` is `~/.cache/nulo-backlog/aztec-6-0-0`; `$AH` is `$C/aztec` (a private `AZTEC_HOME`).

## Phase 0: classification (2026-10-23, trial install at `95da7744`, reverted)

| Question | Probe | Answer |
|---|---|---|
| Did Testnet reset? | `node_getNodeInfo` on the seeded endpoint, read silently | `nodeVersion 6.0.0`, `rollupVersion 679261766` (pin `3409706519`), `l1ChainId 11155111`, block 731. **Network reset: Branch B.** New chainId `685146337` |
| Do derived addresses move? | KAT and freeze tests on the trial install | No: `R/account/` (9 files) and `R/pxe/` (40 files) pass. The derivation inputs did not move |
| Does the vendored account still run? | `pxe/dest/oracle_version.js`, `utility_execution_oracle.js:104-107`; the vendored artifact's `file_map` (`aztec/src/oracle/version.nr`: `ORACLE_VERSION_MAJOR = 32`); an ACVM run of its `entrypoint` (recon finding 1) | **No.** Oracle major 32 → 33; the PXE throws on any other major. The fact-store oracles' `scope` also changed shape (`oracle_registry.js`, `FACT_SCOPE`). **A regime rotation, the owner's decision: OA-1** |
| What moved upstream? | `aztec-node` and `aztec-packages` compares (recon finding 3); `install.aztec-labs.com/6.0.0/versions` | Three `!:`, none on our surface; the `@aztec/viem` fork replaced by `viem` 2.57.1 (M5). Toolchain: noir `1.0.0-rc.3` (unchanged), Foundry 1.4.1 → 1.8.5, Node floor 24.15.0 |
| Drift detectors | trial `test:all`: 15 reds, all listed in recon finding 6 | PrivateFPC, SponsoredFPC, Token class and AuthRegistry move with the line; PXE store schema unchanged |
| Patches | trial install | The pxe patch misapplies (recon finding 2): re-create it. The noir patches apply |
| Externals | npm, the live node, unleashed | presto, standards and fee-juice `6.0.0` are on npm; presto-server 1.1.3 stays; SponsoredFPC is live at its 6.0.0 address; unleashed has no 6.0.0 generation (OA-2) |

#864's line ("If Testnet's rollup version moves, run Branch B") answers the skill's Q1 for the reset. It does not authorize a regime rotation, which CLAUDE.md § Account-address freeze reserves to the owner's recorded decision. The rotation is what the skill calls a surprise that changes the shape of the authorization, so arc 1 waits for OA-1.

## Outcome & Quality Bar

**For whom.** (a) A person who updates Nulo or installs 1.0.0 and uses Testnet. (b) unleashed, which needs the wallet's PrivateFPC and the `@nulo-sh/*` peers on the new line. (c) Whoever runs the next bump.

**Excellent:**
1. A wallet built on 6.0.0 creates, deploys and sends with native proving on both browsers: both canaries prover-ON, local sandbox at 6.0.0. Against the live Testnet the node identity matches the pins and the SponsoredFPC instance exists with the bundled class.
2. Every moved pin carries its evidence: account vectors from the independent generator, the PrivateFPC from the package's canonical JSON, the SponsoredFPC from the live instance, the Token class and AuthRegistry from the installed packages.
3. One Aztec generation in the bundle; one `viem`; every lockfile change dispositioned; source-bound provenance for every package the age gate was bypassed for.
4. The next bump fails fast: a unit test sees an oracle-major move before any e2e (D4), and the skill records this bump's two traps.

**Good enough:** Testnet shows no default tokens until unleashed's 6.0.0 generation exists (OA-2). Store art and listing text do not change.

**UI impact** (the budget is #864's Branch B: "the chain ID cascade, the in-place reset on both browsers, and a token list for the new chain"; the rest is OA-1 and OA-2):
- The existing full-screen takeover offers to reset Testnet on the first unlock after the update (#864): "NETWORK RESET", "Testnet was reset". With OA-1 (a), accounts come back at new addresses, and the closing line reads "Your accounts have new addresses."
- With OA-1 (a), every other non-Mainnet network holding derived accounts (the Local Network, user-added ones) gets the existing "NETWORK UPGRADE" screen: "New account addresses", "Tokens at your old addresses stay there. This version cannot reach them." (`X/components/stale-network/copy.ts:10-13`; `S/stale-network/classify.ts:32-66`).
- Testnet shows no default token rows from the empty publish until the new-chain list (OA-2).
- Data on existing rows, forced by the line: Settings → About reads `Aztec version - 6.0.0`; fee settings' Sponsored and Private rows name the new addresses; the execute window names the new AuthRegistry address "Auth registry"; Presto's version line names `6.0.0`.
- No layout, copy or component changes.

## Assumptions

### Facts (verified at `95da7744`, on npm or the live node, 2026-10-23)

- F1. The probes in Phase 0 and recon findings 1-13.
- F2. `REGIMES` (`R/account/address-freeze.ts:69-126`) is append-only; its rule text already allows an in-place rotation off Mainnet on the owner's recorded decision (`:21-24`). `V6_REGIME = REGIMES["nulo-v6.1"]` (`:131`); `address-freeze.test.ts:54-135` hardcodes every entry and the id list.
- F3. The 6.0.0 `SchnorrAccount.json` has the same functions, parameters, attributes and struct names as the vendored one; `@aztec-labs/noir-contracts.js@6.0.0` ships the same bytes. Both name noir `1.0.0-rc.3+5a7ee9bf…`.
- F4. `regimeId` is `z.string()` in the stored integrity record (`S/account-integrity/types.ts:44`), so a rotation changes no registered stored shape; the `nulo-v6.1` values in `stored-shapes/{snapshot,goldens}.json` are history.
- F5. No Mainnet is seeded (#864 § Mainnet); the first Mainnet build freezes the regime it binds.
- F6. `reference/nulo-v6.1/` has its own seven-day gate (`bunfig.toml`) and lockfile; its `derive-vectors.ts:46` pins the artifact sha256.
- F7. Publish times: `@aztec-foundation/*` 2026-10-22 09:05-09:08Z, `@aztec-labs/*` 10:24-10:30Z, standards 16:11Z, presto 17:05Z, fee-juice 2026-10-23 01:10Z. The last clears the gate 2026-10-30 01:11Z.
- F8. The token list's tree check parses the published envelope strictly (`infra/token-list/scripts/check.ts:79`; `packages/token-list/src/parse.ts:113`).

- F9. The 6.0.0 `versions` manifest: noir `1.0.0-rc.3`, Foundry `1.8.5`, Node ≥ `24.15.0` (`install.sh:64-72` enforces it; CI's setup-node floats on 24, Docker pins 24.16.0).
- F10. `@aztec-labs/*` 6.0.0 publishes no SLSA attestation; `@aztec-foundation/*`, standards, presto and fee-juice do (`npm view <name>@6.0.0 dist.attestations`). At rc.3 the owner's `AGE-GATE: bypass-all` excluded the same unattested scope (`archive/aztec-rc3/lessons/phase-1.md:17`).
- F11. `tests/e2e` is type-checked: the extension's `typecheck` runs `tsc -p tsconfig.e2e.json`. The skill's gotcha that says otherwise is stale.

### Inferences

- I1. No `ensureContractSynced` caller is new: the same caller set in both `dest/` trees. P3 reads each.

### Asks

- A1. OA-1: rotate in place to `nulo-v6.2`, or hold. Blocks P2 and the arc.
- A2. OA-2: an empty Testnet list before the bump; the new-chain list after unleashed's generation. Blocks P0.
- A3. The excludes: the lane brief has them ride this PR and leave in a follow-up; the skill deletes them in the same PR. Settled by the panel (D3). The bypass itself is the lane brief's approval; OWNER-ASKS records its weaker trust basis (F10) and the wait alternative.

## Architecture & Implementation

### Arcs

| Arc | Content | Waits on |
|---|---|---|
| P0 | `list.source.json` to an empty list; the owner publishes it | OA-2 |
| 1 | The line, the rotation, the chain cascade, the drift pins, the gates | OA-1; P0's envelope on `dev` before its final gate |
| follow-up | `@nulo-sh/*` release on the line (aztec-update skill, pin surface); the owner dispatches | arc 1 on `dev` |
| follow-up | the new-chain token list | unleashed's 6.0.0 generation |

### Mechanics

**M1. One line.** Every `@aztec-labs/*` and `@aztec-foundation/*` pin, `@alejoamiras/presto`, `@aztec-foundation/aztec-standards` and `@alejoamiras/private-fee-juice` move to `6.0.0` in the six workspaces. `scripts/aztec-hold-residue-check.ts` keeps its three constants, each set to `6.0.0`: the lines split again at rc.3 and may again. The notices policy moves `AZTEC_NODE_TAG` and `AZTEC_PACKAGES_TAG` to `v6.0.0`; each override's `reviewedVersion` moves only after its source is re-read at the tag (the package's README § When a build is refused). `@alejoamiras/presto-core` 1.2.1 and `presto-banners` 1.2.0 stay: presto 6.0.0 exact-depends on `presto-core` 1.2.1.

**M2. Patches.** Rename both noir patches and their root `patchedDependencies` keys to `@6.0.0`; check each installed `package.json` against its `npm pack` tarball: the `exports` change is the only difference. Delete the pxe patch and its key, install, run `bun patch @aztec-labs/pxe@6.0.0`, replace line 499's `return accountCompleteAddress;` with the existing `// Modified by Nulo:` line, `bun patch --commit`, delete the root `node_modules/@aztec-labs`, and run `bun install --frozen-lockfile --force`. Proof: the installed `dest/pxe.js` differs from the tarball's in line 499 only, and `register-account-heal.test.ts` passes. Never rename a patch whose target file moved.

**M3. Age gate.** Add `minimumReleaseAgeExcludes` with the 42 Aztec-scope names in today's `bun.lock` plus presto and fee-juice (the trial needed no other), then `bun install`. Evidence per excluded package in the PR body: tarball integrity and `npm audit signatures` from a scratch project after `npm install --ignore-scripts`. Where npm holds an SLSA attestation (`@aztec-foundation/*`, standards, presto, fee-juice), its repository, workflow and source commit, checked against the publisher's tag. `@aztec-labs/*` publishes none, at 6.0.0 as at rc.3: those rest on the registry signature and the publisher identity, the basis `PROVENANCE.md` records. This evidence does not replace the seven days of exposure the gate buys; the lane brief approves the bypass for #864's launch date, as the owner's `AGE-GATE: bypass-all` did at rc.3 (F10). Removal (D3): delete every exclude in this PR after P4's last resolve, then `bun install --frozen-lockfile --force` leaves `bun.lock` unchanged. Excludes match by name, not version, so a committed one turns the gate off for every later resolve of those names. A branch that re-resolves a workspace on the line before 2026-10-30 01:11Z adds the excludes locally and never commits them (the skill; deps-audit-1's pending bump is one).

**M4. The rotation** (on OA-1 (a); rc.3's M3 is the worked example):
1. Vendor `artifacts/SchnorrAccount.json` byte-exact from `@aztec-labs/accounts@6.0.0`; record the ABI comparison (F3) in `lessons/phase-2.md`. Rewrite `PROVENANCE.md` (package, lockfile integrity, publisher, sha256, class id; previous entry `nulo-v6.1`, not vendored).
2. Move `FROZEN_ARTIFACT_SHA256` and `FROZEN_ACCOUNT_CLASS_ID` (`frozen-artifact.ts:20,23`). The descriptor stays.
3. Append `REGIMES["nulo-v6.2"]` (literals, same KDF and descriptor, `ack` embedding its digests and the in-place policy). Bind `V6_REGIME` to it; the comment at `:129` names three entries. Earlier entries stay byte-identical.
4. Add `reference/nulo-v6.2/`: a copy of `reference/nulo-v6.1/` with 6.0.0 pins and the new sha256. Resolve it with the Aztec names excluded in its own `bunfig.toml`, then restore that file to the gate alone with a comment saying which names resolved inside the gate and that their evidence is in this PR. `bun install --frozen-lockfile` passes; `bun derive-vectors.ts > vectors.json` twice gives an empty diff. No later re-resolve: the Aztec pins are exact, so it would fetch the same tarballs.
5. Tests to the new truth: `address-freeze.test.ts` (entry, binding, id list), `artifact-freeze.test.ts`, `derivation-vectors.test.ts` and `account-seed-vectors.test.ts` (read `reference/nulo-v6.2/vectors.json`), `account-export.test.ts` (one refused class: a `nulo-v6.1` file), the `regimeId` expectations in `coordinator.test.ts:129` and `runtime-mismatch.test.ts:78`, and the `backup-migration-registry.ts:69` comment.
6. The in-place update replay (`tests/e2e/update-replay.test.ts`) expects a chain-only reset: `throughTheReset` waits for "Your accounts kept their addresses." (`:402`) and compares whole account identities. From the recorded `v0.31.0` (an rc.3 build) the reset now also moves addresses. It shows the existing copy "Your accounts have new addresses." (`X/components/stale-network/copy.ts:160`). Move the replay's expectations to that truth: the moved-addresses line; names, indexes and visibility kept; each derived address equal to the `nulo-v6.2` derivation; each imported key re-sealed at its new address. Unrelated-chain and contact checks stay.
7. `default-network-arrival-update.test.ts` breaks on the chain move alone. Its first case populates the release on the old Testnet chain, then calls `acceptTerms` (`:174`) while the candidate shows the reset takeover; its trace (`:176`) and its network-row comparison (`:184`) assume no reset. When the release's Testnet chain differs from `CHAIN_IDS.TESTNET`, the first case completes the reset first, as the second case does (`:239-246`). Its trace then gains `takeover`, its row comparison names the new chainId, and its accounts follow item 6. Its own claims stay: the deleted default stays deleted, the arrival returns after an unanswered close. The second case's kept-addresses toast and account equality (`:247-254`) follow item 6. No skip.

**M5. One `viem`.** Upstream now depends on `viem` 2.57.1 exact. Replace the extension's devDependency `@aztec/viem` 2.38.3 with `viem` 2.57.1; import from `viem` in `tests/e2e/fixtures/l1-signer.ts:2` and `fixtures/aztec-private-fpc-bridge.ts:25`; `HEAVY_PREFIXES` names `viem` in place of `@aztec/viem` (`scripts/vendor-chunks.ts:9-10`); the residue check's retired-scope pattern and `scripts/lockfile-exception-diff.ts:18-24` drop their `viem` carve-outs; reword `scripts/publish/stage.ts:55` and the skill's line 42. Proof: `grep '"@aztec/viem' bun.lock` is empty and one `viem` version is locked.

**M6. The chain and the drift pins.**
- `TESTNET_ROLLUP_VERSION = 679261766`, the live-verified note (6.0.0) and the id comment `685146337` (`X/utils/chain-ids.ts:23-30`); the formula fixtures in recon finding 10. Every historical hit stays.
- SponsoredFPC: `bun run scripts/seed-preflight.ts 0x2d8fff82a3b0c15d0a89169e7d8d043e079ab94d52031f1de1e4972ebad169d3 0x233391319da4f9877f724afd66d93a2d0dbb4a288f41e99093dbb30f41ee3335` from `apps/extension` must print `OK` on identity and class; then move `CANONICAL_SPONSORED_FPC` and `tests/e2e/helpers/fpc-seeds.ts`.
- PrivateFPC: check the installed `canonical-deployment.json` (`aztecVersion` `6.0.0`, salt `0x…01`, address equal to `derivePrivateFpc()`); review the artifact against rc.3's (function names, flags, no initializer); move `CANONICAL_PRIVATE_FPC`, `REVIEWED_PRIVATE_FPC_ARTIFACT` and `fpc-seeds.ts`. Any difference stops the phase.
- Token class: `packages/token-list/src/class-ids.ts` takes the class and slots `getBundledTokenClassId()` and the artifact's `storageLayout` give (`token-list-pins.test.ts`); `descriptors-real-artifact.test.ts` passes unedited.
- AuthRegistry: `known-contracts.test.ts:14` and `dapp-interaction/service.test.ts:952` take `@aztec-labs/standard-contracts@6.0.0`'s constant.
- Re-read the `ensureContractSynced` callers (I1) and every `UPDATE.md` coupling against the 6.0.0 `.d.ts` and source; add what moved.

**D4's detector.** One case in `R/account/artifact-freeze.test.ts`: read `ORACLE_VERSION_MAJOR` from the vendored artifact's `file_map` entry for `aztec/src/oracle/version.nr`, read the installed PXE's `ORACLE_VERSION_MAJOR` from `dest/oracle_version.js` through `@nulo/resolve-asset` (as `opfs-store.test.ts` reads the schema version), and assert they are equal. A missing entry or constant fails the case. It needs no new dependency. It is a tripwire, not an execution proof: the canaries stay mandatory. It is red on the 6.0.0 line with `nulo-v6.1` and green after M4.

### File-level change map

| Phase | Files |
|---|---|
| P0 | `infra/token-list/list.source.json` |
| P1 | 6 workspace `package.json`, root `package.json` (patch keys), `patches/*` (2 renamed, 1 re-created), `bunfig.toml`, `bun.lock`, `scripts/aztec-hold-residue-check.ts`, `packages/third-party-notices/src/policy.ts` (+ `texts/` only if a tagged source changed), `.github/actions/setup-aztec/{installer-pins.sha256,cli/package.json,cli/package-lock.json}`, M5's sites, `apps/extension/scripts/e2e/docker-ci-like.sh:54` (the Node floor comment), the version literals (recon finding 2: `layout-identity.test.ts`, `resolve-asset/src/index.test.ts` with its regex, `bb-fetch-code-shim.test.ts`, `vendor-chunks.test.ts`, `stage.test.ts`), the docs literals (`UPDATE.md`, package READMEs, `store/SOURCE-BUILD.md`, `store/listing.md`, `legal/README.md`) |
| P2 | `R/account/{artifacts/SchnorrAccount.json,artifacts/PROVENANCE.md,frozen-artifact.ts,address-freeze.ts}`, M4.5's tests, `reference/nulo-v6.2/*` (new), `tests/e2e/update-replay.test.ts`, `tests/e2e/default-network-arrival-update.test.ts` (M4.6-7) |
| P3 | M6's sites, `UPDATE.md`, `infra/token-list/test/live-check.test.ts` |
| P4 | `bunfig.toml` (D3), `scripts/ci-cd/audit-acks.json` (re-judged), `.claude/skills/aztec-update/SKILL.md`, `implementations-plan/lessons.md` at close-out |

### Trade-offs and alternatives

| Alternative | Why not |
|---|---|
| Outline B: wait for the age gate (2026-10-30), no excludes, one PR | Testnet already runs 6.0.0, so every shipped build is unusable there now, and #864 launches 1.0.0 on this line this week. B is the safer supply chain (Codex favours it absent a deadline); the deadline is recorded, and the excludes are the lane brief's approved exception. B still needs P0's ordering |
| Hold the line (OA-1 (b)) | The rc.3 network is gone; nothing ships on Testnet |
| Patch the PXE to accept major 32 | A monkey-patch over a breaking interface change: the fact-store oracles' `scope` wire changed (`oracle_registry.js`, `oracle_type_mappings.js`'s `FACT_SCOPE`), and `legacy_oracle_registry.js` serves nothing for it |
| Keep `@aztec/viem` for the fixtures | Two `viem` copies; a 2.57.1 client handed to the fork's `getContract` works only by duck typing |
| Keep the old Token class beside the new one | The wallet bundles one artifact (`token-list-pins.test.ts`); old-class tokens cannot run on the 6.0.0 PXE |

## Security & Adversarial Considerations

- **Supply chain.** 44 packages bypass the seven-day gate; the excludes leave the tree in this PR (D3), so no later resolve inherits the bypass. Evidence per package is M3's: source-bound where npm holds an attestation, registry signature and publisher identity for `@aztec-labs/*`, which publishes none. A compromised `@aztec-labs` publisher is the residual risk the gate would have narrowed. Third-party versions take no exclude. Every lockfile change is dispositioned (`scripts/lockfile-exception-diff.ts`). The CI toolchain lock comes from `lock.sh 6.0.0` and its diff is reviewed; the installer is read whole before its hash is pinned; a new Foundry repeats the attestation check; noir and Foundry tarball hashes match their release digests.
- **Patch integrity.** Bun applies a hunk by line number alone (recon finding 2), so every patch is proven against the pristine tarball, not by a clean install (M2).
- **Funds to a wrong address.** Fee Juice credited to a PrivateFPC the wallet does not use is unrecoverable. The wallet pins the package's machine-asserted address; unleashed must name the same one before any release (OWNER-ASKS, owner actions). The SponsoredFPC pin needs the live instance with the bundled class.
- **Address regime.** An append-only entry, the binding test, the generator's vectors, the oracle detector. The vectors tie the wallet to upstream's derivation, not to an independent truth: a compromised `@aztec-labs` release would make the reference agree, so the vendored bytes are pinned by sha256 and reviewed against the ABI (F3). A `nulo-v6.1` account file is refused (F2); a stored `nulo-v6.1` account meets the reset, never a silent re-derive.
- **Network identity.** The chainId and the preflight's node identity check bind the Testnet; an address equality says nothing about the rollup.
- **Least privilege and secrets.** No agent dispatches `publish-token-list.yml`, approves `sign` or dispatches `publish-packages.yml`. The Testnet endpoint carries a key: probes read it into a variable and print origins only.

## Phases

**Expected reds.** A gate that allows a red names each failing test, its assertion and its cause in `lessons/phase-N.md`. An allowed cause is a pin P2 or P3 moves (recon finding 6, the regime tests, the oracle detector before P2). Any other red, lint, typecheck or build error fails the gate.

### P0. The empty list (on OA-2 (a))

1. Branch `aztec-6-0-0-empty-list` off `dev`; set `list.source.json` to `{"tokens": []}`; open the PR `chore(token-list): empty the testnet list ahead of the aztec 6.0.0 token class`.
2. Report it; the owner merges, dispatches the publish, approves `sign`, and merges the publish PR.

**Validation gate.** `bun run --cwd infra/token-list check`; `bun run --cwd infra/token-list test`; `bun run lint`. Pass: all exit 0.

### Arc 1

#### P1. The line (M1, M2, M3, M5)

1. Edit the pins, the patch names and keys, and the excludes; run `bun install`; re-create the pxe patch (M2).
2. Update the residue check, the notices, the toolchain pins (`.github/actions/setup-aztec/lock.sh 6.0.0`; the installer and tarball checks of the skill), M5, and every version literal.
3. Clear `apps/*/node_modules/.vite`. Install the toolchain into `$AH` with `CI=1 HOME=$C/home AZTEC_HOME=$AH AZTEC_VERSION=6.0.0 bash .github/actions/setup-aztec/install.sh`.

**Validation gate.** `bun run lint`; `bun run typecheck:all`; `bun run lint:actions`; `bun run test:ci-gating`; `bun scripts/aztec-hold-residue-check.ts` exits 0, then exits 1 in three one-run controls (each constant set to `6.0.0-rc.3` in turn, reverted); `bun scripts/lockfile-exception-diff.ts $C/base-bun.lock bun.lock`, every entry dispositioned in `lessons/phase-1.md`; M2's two proofs and M5's; `bun run build:chrome`, `build:firefox`, `bun run --cwd apps/playground build`, `bun run --cwd apps/landing build`; `bun run test:all` with `rc=$?` and a grep for `Exited with code [1-9]`; `rg -l '6\.0\.0-rc\.[36]' --glob '!bun.lock' --glob '!implementations-plan/archive/**'` with every hit classified (moved, or history) in `lessons/phase-1.md`; Foundry 1.8.5's four binaries pass `gh attestation verify` and the signer is recorded in `installer-pins.sha256`. Pass: all exit 0 except `test:all`, whose reds meet the expected-red rule.

#### P2. The rotation (M4, D4)

1. Add the oracle detector; run it red against `nulo-v6.1`.
2. Vendor and review the artifact, rewrite `PROVENANCE.md`, move the two literals, append and bind `nulo-v6.2`.
3. Build `reference/nulo-v6.2/` and its vectors; move the tests.

**Validation gate.** `bun run --cwd packages/aztec-runtime test src/account src/pxe`; `bun run --cwd apps/extension test src/wallet/services/account-integrity src/wallet/services/account src/components/AccountIntegrityBarrier.test.ts src/wallet/services/profile`; the second vector run's diff is empty; `git diff 95da7744 -- reference/nulo-v6 reference/nulo-v6.1 reference/key-model-v2` is empty; `rg` of the `nulo-v6.1` sha256 and class id leaves only its `REGIMES` entry, its test entry, `PROVENANCE.md`, `reference/nulo-v6.1/` and stored-shape history; lint; typecheck. Pass: all exit 0; the detector red before step 2 and green after.

#### P3. The chain and the drift pins (M6)

**Validation gate.** `bun run test:all` (`rc=$?`, the grep); lint; typecheck; the preflight output in `lessons/phase-3.md`; `rg` of `3409706519`, `3415328944` and every moved address leaves only F4's and recon finding 10's history. Pass: all exit 0, except `infra/token-list`'s tree test until P0's envelope is on `dev`.

#### P4. Final gates

1. `git merge origin/dev` (P0's envelope and any landed lane); read `index.md` and `lessons.md` changes.
2. D3 for the excludes; `bun install --frozen-lockfile --force` leaves `bun.lock` unchanged.
3. `bun audit --audit-level=low --json > $C/audit.json; bun scripts/ci-cd/audit-gate.ts $C/audit.json --exit-code $? --mode enforce`; re-judge each `audit-acks.json` entry whose reason names the rc.3 line, `@aztec/viem` or `undici` 5.
4. Update the skill (D6) and `UPDATE.md`.
5. Run the suites below, one `e2e:agent` at a time in this worktree, retry 0.

**Validation gate.**
- `bun run audit:vue`; `bun run test:all`; `bun run test:ci-gating`; `bun run test:release`; `bun run check:plans`.
- Smoke, per browser: the armed build (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`, or `build:firefox`), then `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- --retry=0`; `NULO_E2E_BROWSER=firefox` for Firefox. It includes `stale-network.test.ts`.
- In-place update, per browser, after the smoke run (opt-in; the release skill's step 1 needs the replay once `dev`'s line differs from the release's). Run `tests/e2e/README.md` § In-place update's two blocks exactly, `NULO_E2E_BROWSER=firefox` and the firefox candidate on Firefox. (1) `build-update-candidate.sh <browser>`, then `NULO_E2E_ARTIFACT_RUN=1 NULO_E2E_UPDATE_FROM=v0.31.0 NULO_E2E_UPDATE_TO=$PWD/.e2e-state/update-candidate/<browser> bun run test:e2e -- tests/e2e/update-replay.test.ts --retry=0` from `apps/extension`. (2) `build-update-candidate.sh <browser> --extra-seed`, then the armed build again (it removed `dist/<browser>`), then `NULO_E2E_UPDATE_FROM=v0.31.0 NULO_E2E_UPDATE_TO=$PWD/.e2e-state/update-candidate/<browser>-extra-seed bun run test:e2e -- tests/e2e/default-network-arrival-update.test.ts --retry=0`. Pass: both files execute (not skipped) and pass, on M4.6-7's expectations. The recording's dApp session expires 2026-10-27T00:52Z and the replay refuses it 10 minutes before; after that, it is recorded again per the release skill, from a checkout on the rc.3 line.
- Network, proverless, per browser: `NODE_OPTIONS=--dns-result-order=ipv4first AZTEC_HOME=$AH NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 bun run e2e:agent`. It includes `stale-network-reset.test.ts`, `fee-methods.test.ts` and `selfpay-phase.test.ts`.
- Canaries, prover-ON, per browser: presto-server 1.1.3 from its release asset, `sha256sum` equal to `_extension-network-e2e.yml`'s pins, started only if `ss -ltn 'sport = :59833'` shows the port free: `env -u BB_BINARY_PATH RUST_LOG=info PRESTO_ALLOW_ALL=1 PRESTO_HOME=$C/presto setsid presto-server > $C/presto.log 2>&1 &`, one warm-up prove once `api.github.com/rate_limit` has room; then `AZTEC_HOME=$AH VITE_NULO_PRESTO_REQUIRED=1 NULO_E2E_RETRY=0 bun run e2e:agent tests/e2e/network/frozen-account-canary.test.ts tests/e2e/network/passkey-execution-canary.test.ts`; at least one `Proving succeeded` in `presto.log` inside the run's window. Tear down its process group afterwards.
- Pass: all green at retry 0; one rerun for a known flake, with its log. A red canary holds the line and is never answered with a pin. No e2e scenario is added; the PR body states each browser's suite wall-clock.

## Owner answers

Decision page 85, signed 2026-10-23 13:40Z (`signoff-P85`, page head `4a357b7`), relayed by the orchestrator; no owner notes on any item. Each answer is also the owner's sign-off on the surfaces its option names, which § UI impact lists.

- **P85-01** (OA-1, the account contract on 6.0.0): **A**, "Rotate in place to regime nulo-v6.2; the first unlock offers the Testnet reset the chain move already forces."
- **P85-02** (OA-2, the Testnet token list across the update): **A**, "Publish an empty Testnet list before the update; the new chain's list once unleashed's 6.0.0 generation exists."
- **P85-03** (the 6.0.0 install past the npm age gate): **A**, "Install now with named excludes, as the skill prescribes."
- **The paused-reset window** (relayed by the orchestrator after the implementation review): owner, 2026-10-23: "A: accept, ship tonight" (known limit, written down with its exact conditions). D14.

## Decision ledger

| # | Decision | Source | Status |
|---|---|---|---|
| D1 | Classify as Branch B plus a forced rotation; stop for OA-1 | Phase 0 | accepted: both reproduced the 32/33 split |
| D2 | Rotate by appending `nulo-v6.2` from `@aztec-labs/accounts@6.0.0`, as rc.3 did | M4, F2-F4 | accepted, on OA-1 (a) (P85-01, § Owner answers) |
| D3 | Excludes: delete them in this PR once `bun.lock` is final (skill), not in a follow-up (lane brief); the reference project the same way, with no later re-resolve | M3, M4.4 | accepted: Codex and Opus (excludes match by name; no later PR of this bump re-resolves the root); the lane brief's "follow-up" claim did not hold |
| D4 | Add the oracle-major detector as a `file_map` read in `artifact-freeze.test.ts` | recon finding 1 | accepted: Codex (ACVM version, proportionate), Opus (JSON read, no new dependency or wasm run); the simpler one wins |
| D5 | One `viem`: swap the fixtures' fork for `viem` 2.57.1 | M5 | accepted |
| D6 | Skill: Phase 0 gains the vendored-artifact oracle check; Gotchas gain "Bun applies a patch by line number"; drop "`@aztec/viem` is versioned independently" and the stale "`tests/e2e` is outside the tsconfig graph" (F11) | recon findings 1, 2, 4 | accepted |
| D7 | presto-server stays 1.1.3; the canaries prove it | recon finding 13 | accepted |
| D8 | Outline A (ship now) over B (wait for the gate) | trade-offs | accepted with a recorded dissent: Codex prefers B absent a deadline; #864 sets one |
| D9 | P0 ships as its own PR before arc 1's final gate; the bump never edits `list.source.json` | F8, OA-2 | accepted: both confirmed the deadlock |
| D10 | Opus's OA-3 (a blocking ask on bypassing the unattested scope): not blocking; recorded in OWNER-ASKS with the wait alternative | F10 | accepted in part: its premise that rc.3 never bypassed the labs scope did not hold (`AGE-GATE: bypass-all`) |
| D11 | M4.6-7: the in-place update scenarios move to the moved-chain and moved-addresses truth and run in P4, one candidate each | Codex 2, Opus 2, final Codex 1-2 | accepted |
| D12 | Foundry 1.8.5's tarball adds `solar`: `install.sh` requires exactly the five attested regular files and still extracts the four tools | P1, `lessons/phase-1.md` | accepted: the installer copies four; an exact member set keeps the refusal |
| D13 | M5 deviation: `lockfile-exception-diff.ts` keeps its `viem` carve-out, which reads a pre-6.x lock (this bump's base holds `@aztec/viem`); the residue check drops its own | P1, the tree | accepted |
| D14 | A reset v0.31.0 paused, met by this rotation (#808's two paths: a Testnet journal on rc.3's chain refused on every resume, its imported keys unexportable; a Local or user-added address-only resume finishing under mixed regimes, or stopping at an imported entry's address check after earlier writes, the profile withheld): a known limit, no runtime change; #808 re-closed with the conditions (a reset paused in v0.31.0 and not resumed before the update lands; pre-1.0.0 testers; Testnet, the Local Network or a user-added non-Mainnet network); reopen on a report from a person, or before the first Mainnet build | Codex implementation review rounds 1-3 | accepted: owner, 2026-10-23: "A: accept, ship tonight" (known limit, written down with its exact conditions) |

## Audit verdicts

### Dual audit, 2026-10-23

- **Codex (gpt-6.1-sol, high), fresh session `01a166da`: conditional approve.** Six findings, each verified against the tree:
  1. M3 promised source-bound provenance npm does not hold for `@aztec-labs/*` (accepted in part: M3 and Security state the real basis; the bypass stays on the lane brief's approval, D8, D10).
  2. The update replay is opt-in and its expectations contradict a rotation (accepted: M4.6, P4, D11; the recording expires 2026-10-27T00:52Z).
  3. OA-1 overstated backup recovery (accepted: rewritten from `full-backup-restore.ts:302-332`).
  4. The Local Network offer needs derived accounts (accepted: OA-1 and UI impact).
  5. The ACVM witness was underspecified (superseded by D4's `file_map` read).
  6. Committed excludes would outlive the review (accepted: D3).
  Q1: it reproduced 32.2 against 33.0. Q4: the deadlock is real.
- **Opus (Plan agent), fresh: conditional approve.** Nine findings, each verified:
  1. Bypassing the unattested scope should be an owner ask (accepted in part: D10, OWNER-ASKS).
  2. The update scenarios (accepted with Codex 2).
  3. D4 as a JSON read (accepted).
  4. UI impact must name the "NETWORK UPGRADE" strings and every network with derived accounts (accepted).
  5. Foundry 1.8.5 and the Node floor (accepted: F9, the P1 gate).
  6. The literal sweep (accepted: the P1 `rg`, `lockfile-exception-diff.ts`).
  7. The wrong oracle-file citation (accepted).
  8. `tests/e2e` is type-checked (accepted: F11, D6).
  9. The nightly live check reds on an empty list (accepted: OA-2).
  Q2: drop the reference re-resolve (accepted: M4.4).

### Final pass, 2026-10-23

- **Codex (gpt-6.1-sol, high), fresh session `01a166f5`: conditional approve.** Two findings, both verified. P4's single replay command could not pass, since the two files need different candidates (`fixtures/update/in-place.ts:34-36`) and the extra-seed build deletes `dist/<browser>` (`build-update-candidate.sh:79-81`) (fixed: the README's two blocks, the artifact-run flag on the replay and the armed rebuild before the arrival run, verified in a resumed round). The arrival suite's first case stalls at `acceptTerms` behind the reset takeover once the chain moves (fixed: M4.7, no skip). No new owner ask. D4's `file_map` read works (it read 32 and 33). D8 and D10 are defensible. The user-visible effects are all in UI impact or OWNER-ASKS.
- **Codex, resumed round 2: conditional approve.** M4.7 confirmed; the replay still lacked `NULO_E2E_ARTIFACT_RUN=1` and the arrival run needed the armed rebuild first (fixed: P4 runs the README's two blocks). **Resumed round 3: approve.**

### Implementation review, 2026-10-23

Over `477b2c31..HEAD`, adversarial, the rotation and the chain cascade first.

- **Codex (gpt-6.1-sol, high), session `01a1696b`, round 1: reject.** One major finding, verified: a Testnet reset that v0.31.0 paused before the update keeps a journal whose target is rc.3's chain, `validateJournal` refuses every resume under this build (`network-reset/service.ts:81-88`, `:525`; `admit` resumes an existing journal without a fresh capture, `:442`), and its imported keys cannot be exported under `nulo-v6.2` (`account/service.ts:708`). The person meets "Testnet reset did not finish" on every unlock; the screen's only other exit, deleting Testnet, deletes the imported accounts. It is closed known limit #808's reopening condition, which this plan missed. A fix re-targets a prior build's journal, a recovery policy: routed to the owner, not fixed here.
- **Opus (general-purpose), round 1: conditional approve.** The rotation, the cascade, the pxe patch, the Foundry member check and the swap's interception release hold. Findings: the owner's answers were not quoted in the plan (fixed: § Owner answers); the P4 e2e gates were not yet on record (running); the replay derived from the reset row's own L1 (fixed: it asserts the row's L1 and derives with `TESTNET_L1_CHAIN_ID`); the README's swap sentence (fixed); the intercept log printed node paths, failures too (fixed: origin only); the oracle tripwire covers the account alone (disposition: the PrivateFPC and Token run on the PXE in the network suite's fee and self-pay files, and both are major 33 today). Known limits it names, unchanged from rc.3: a user-added network on Mainnet's L1 holding `nulo-v6.1` accounts is quarantined with no reset; contacts saved at another person's pre-rotation address point at an address no build derives.
- **Codex, resumed round 2: approve, excluding the routed journal finding.** The round-1 fixes verified; no new material finding in the range. On the routed finding it adds a second path: a Local or user-added network's address-only reset that v0.31.0 paused part-way through its accounts passes `validateJournal` here, skips the indexes it finished under `nulo-v6.1` and re-creates the rest under `nulo-v6.2` (`network-reset/service.ts:561`), so the next integrity check finds mixed regimes and withholds the whole profile; reproduced with the real resume and classifier over in-memory dependencies. No path purges another chain or writes under a wrong L1. Smallest relief: export a held key with the address this build derives, disclosed on screen (password profiles only); the full fix re-targets and re-seals a prior build's journal at admission. A fresh capture whenever `purged` is false is unsafe: the purge can land before that flag (`network-reset/service.test.ts:711`).
- **Codex, resumed round 3, over the owner's disposition (D14): conditional approve, no runtime change asked.** The written conditions named Testnet and the Local Network while path 2 reaches a user-added non-Mainnet network too (fixed: #808 and D14 name it); an unfinished imported entry stops the resume at its address check (`S/account/service.ts:434`) after earlier writes, and every retry fails alike (fixed: recorded in #808). The safety sentence holds for a journal the wallet wrote; a reset paused in this build, a fresh install and Mainnet meet neither path. No new finding in the range. The loop stops here (three rounds).

## Delivery

Trunk `dev`. `code_review` is `off`. No stack: one PR per row, each against `dev` (the orchestrator's D-orch-1).

| PR | Phases | Branch | Title |
|---|---|---|---|
| list | P0 | `aztec-6-0-0-empty-list` | `chore(token-list): empty the testnet list ahead of the aztec 6.0.0 token class` |
| arc 1 | P1-P4, close-out | `worktree-aztec-6-0-0` | `feat(aztec): move to 6.0.0 and the reset testnet, rotate the account artifact` |

- Arc 1 body: `Refs #864`; the provenance per excluded package; the lockfile disposition; `SECURITY.md`'s three items for a regime change (the invariant, the plan for existing users: OA-1 (a)'s reset, the vectors); each browser's e2e wall-clock. Labels after creation: `e2e:extension-network`, `e2e:extension-smoke`.
- Follow-ups, named here and filed at close-out: the `@nulo-sh/*` release; the new-chain token list, `blocked:external` on unleashed. No excludes follow-up (D3).
- Until 2026-10-30 01:11Z another lane that re-resolves a workspace on the line needs local, uncommitted excludes (M3): the orchestrator tells deps-audit-1.
- Parallelism: P0 is independent of P1-P3; nothing else is. No lanes.

## Post-implementation

Follow [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `95da7744`. Plan-specific settings:

- Step 1 is absent (`code_review: off`).
- Step 2, once over arc 1's diff after P4 is green: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; one Opus review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1. Hard stop at three rounds.
- Approval boundaries (stop for the orchestrator): a pin moved without its evidence; a held package; any edit to an earlier `REGIMES` entry; a regime field; a stored-shape change; any change to what a screen shows beyond § UI impact.
- Close-out as arc 1's final commits: merge `origin/dev`, read `index.md` and `lessons.md`, write the Outcome, promote lessons (Bun's line-number patch apply; the oracle detector), file the follow-ups, comment on #864, delete `STATUS.md`, `git mv` into `archive/` in its own commit, `bun run check:plans` green. Then report and wait.
- Teardown after the merge: once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/aztec-6-0-0/plan.md` succeeds, `agent-worktree done aztec-6-0-0 --merged`. A `/loop` session checks on every firing; a `/goal` session arms one background wait after its wrap-up report.
