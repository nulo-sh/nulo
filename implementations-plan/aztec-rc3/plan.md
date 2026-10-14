---
plan: aztec-rc3
tier: mid
status: draft; dual audit and final Codex pass applied (all conditional approve, conditions met); awaiting the orchestrator's approval
issues: "Closes #324 (arc 1); refs #324 in arc 3"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 explorers (sonnet); dual audit (Codex gpt-6.1-sol high + one Opus Plan agent); final fresh Codex pass
base: origin/dev at d3dc4415
trunk: dev
post_implementation_hardening: not scheduled
---

# aztec-rc3: Aztec 6.0.0-rc.3, the reset Testnet, an in-place account re-pin

Move the wallet from Aztec `6.0.0-rc.1` to `6.0.0-rc.3`, follow the Testnet reset, and re-pin the frozen account artifact in place under the freeze policy the owner set on 2026-10-14. Then prepare the `@nulo-sh/*` release that unleashed needs before it can bump.

Paths: `X/` is `apps/extension/src/`, `S/` is `X/wallet/services/`, `R/` is `packages/aztec-runtime/src/`. Recon: [recon.md](recon.md). Owner questions: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). `$AH` below is `~/.cache/nulo-backlog/aztec-rc3/aztec` (a private `AZTEC_HOME`).

## Phase 0: classification

| Question | Probe (2026-10-14) | Answer |
|---|---|---|
| Did Testnet reset? | `node_getNodeInfo` on the seeded endpoint, 16:57Z | `nodeVersion 6.0.0-rc.3`, `rollupVersion 3409706519` (pin `2914217885`), `l1ChainId 11155111`, block 2621. **NETWORK RESET: Branch B.** New chainId `3415328944` |
| Do derived addresses move? | `@aztec-labs/constants@6.0.0-rc.3` `constants.gen.js:546`; `stdlib/dest/keys/derivation.js:62` | The preaddress uses `CONTRACT_ADDRESS_V3 = 993442748`: every account, PrivateFPC and SponsoredFPC address changes against the rc.1 derivation. **The KAT goes red by construction: a regime re-pin** |
| Does the vendored artifact still run? | `pxe/dest/oracle_version.js`; `utility_execution_oracle.js:104` | rc.1 oracle major 31, rc.3 major 32; the PXE refuses a contract of another major. The SchnorrAccount, the PrivateFPC and the Standards Token must all be rc.3 builds |
| What moved in `aztec-node`? | compare `v6.0.0-rc.1...v6.0.0-rc.3`: 121 commits, two `!:`; tarball diffs | TXE immutables (not our surface) and the separator. `pxe.js` and wallet-sdk `dest/` byte-identical; aztec.js differs only in protocol-contract bytecode; stdlib schemas identical; stdlib fee math changes only upstream's L1 gas constants. One call site: `R/pxe/public-events.ts:327` (M6) |
| What moved in `aztec-packages` (the foundation toolchain)? | compare `v6.0.0-rc.1...v6.0.0-rc.6`: 41 commits, one `!:` (the separator port); no `v6.0.0-rc.3` tag exists | bb.js: a dead native bb process is retryable (Node only); no `noir/` change; the rest is `l1-contracts`. The noir commit stays `5a7ee9bf…` |
| Which versions exist? | npm | `@aztec-labs/*` `6.0.0-rc.3`; `@aztec-foundation/*` toolchain `6.0.0-rc.6`; `aztec-standards` `6.0.0-rc.3`; `@alejoamiras/presto` `6.0.0-rc.3` |

Q1 of the aztec-update skill is answered by the owner's decision record (F1-F4): **network reset, wallet-side cascade, with an in-place regime re-pin**. That record is the "owner's recorded decision" the new freeze text requires for a re-pin (M3).

## Outcome & Quality Bar

**For whom.** (a) A person who installs or updates Nulo after the next release and uses Testnet. (b) unleashed, which can bump only after `@nulo-sh/*` peers on rc.3. (c) The maintainer of the next bump.

**Excellent:**
1. A fresh wallet built on rc.3 creates, deploys and sends with native proving: both execution canaries prover-ON on Chrome and Firefox (local sandbox at rc.3). Against the live Testnet, the node identity matches the pins and the SponsoredFPC instance exists (P3); a manual live send is the owner's pre-release step.
2. Every pinned address has evidence: account vectors from the independent generator, the PrivateFPC from the fee-juice package's machine-asserted canonical JSON, the SponsoredFPC from a live instance. No pin moves without it.
3. One Aztec generation in the bundle, every lockfile change dispositioned, no age-gate exclude left in the tree, source-bound provenance for every bypassed package.
4. unleashed can bump the day the owner dispatches the publish: exact rc.3 peers, reproducible bytes.

**Good enough:** a developer profile from rc.1 meets today's integrity barrier until stale-network-reset ships its reset screen (M4). Testnet shows no default tokens until unleashed's rc.3 generation exists. Store art and listing text do not change.

**UI impact** (each forced by the reset; the token-list state is the owner's choice, F4): Settings → About shows `Aztec version - 6.0.0-rc.3`. Testnet shows no default token rows. Fee settings' Sponsored and Private rows name new addresses. An rc.1 developer profile shows the existing `AccountIntegrityBarrier`. No layout, copy or component changes.

## Assumptions

### Facts (verified at d3dc4415, on npm or on the live node, 2026-10-14)

- F1. Owner, age gate: "yes, use it", exclude-then-delete, provenance in the PR body.
- F2. Owner, regime: no new extension major, no compat-epoch move. Policy: stale-network-reset's Ask A1 ("Non-Mainnet derivation changes ship in place as an update; `REGIMES` stays append-only; Mainnet keeps the new-major rule ... #324 decides the rc.3 re-pin"). Tests move to the new truth, never loosened.
- F3. Owner, externals: plan as released. presto `6.0.0-rc.3` is on npm; presto-server and private-fee-juice rc.3 are being cut by the owner's agents. unleashed owns the PrivateFPC address; the wallet copies it.
- F4. Owner, token list: empty on the new chainId; the dynamic-token-list stack lands first; this lane edits `packages/token-list/src/class-ids.ts` and `infra/token-list/list.source.json` only.
- F5. `REGIMES` holds `nulo-v5` and `nulo-v6` as literals; `V6_REGIME = REGIMES["nulo-v6"]` (`R/account/address-freeze.ts:69-112`); `address-freeze.test.ts:19-53` hardcodes every entry. The record's pre-launch carve-out is closed: V6 shipped to AMO (`address-freeze.ts:11-16`, `BEFORE-LAUNCH.md` § 2).
- F6. `FROZEN_ARTIFACT_SHA256` and `FROZEN_ACCOUNT_CLASS_ID` are literals (`R/account/frozen-artifact.ts:20,23`). The descriptor has no separator or artifact input (`instantiation-descriptor.ts:22-31`); rc.3's constructor keeps `signing_pub_key_x`, `signing_pub_key_y`.
- F7. The vendored V6 artifact is byte-identical to `@aztec-labs/accounts@6.0.0-rc.1`'s (`4b4933a1…7f94`); rc.3's is `9aebda2a…cdc8`.
- F8. Account export files carry the regime id and four digests; import refuses any mismatch (`R/account/account-export.ts:38-44,106-107`).
- F9. `CURRENT_COMPAT_EPOCH = 5` (`S/backup/backup-migration-registry.ts:77`) stays.
- F10. Seeds go only into a profile with no network rows; nothing reconciles a stale row (`S/network/service.ts:250-308`). `BASELINE_VERSION = 1`, no migration (CLAUDE.md § Persisted-storage: pre-production).
- F11. The integrity check derives every Nulo_v1 row at session open and blocks the profile on the first mismatch (`S/account-integrity/coordinator.ts:136-188`).
- F12. presto rc.3 exact-depends on `@aztec-labs/*@6.0.0-rc.3`; holding it puts two generations in the bundle (skill, Gotchas).
- F13. `fee-methods.test.ts` and `selfpay-phase.test.ts` run the PrivateFPC from the fee-juice package (`tests/e2e/fixtures/aztec.ts:642`, `fixtures/selfpay-phase.ts:83`).
- F14. `@alejoamiras/private-fee-juice` ships `canonical-deployment.json` (`aztecVersion`, `salt`, `expectedAddress`, "machine-asserted by `src/ts/test/canonical.test.ts`"); unleashed's `private-fpc-canonical.json` mirrors it and its `private-fuel.test.ts` asserts equality with it.
- F15. `publish-packages.yml` runs from `dev` or `main` only, one lockstep version, owner-approved; `approved-digests.json` binds only `0.1.0`; `scripts/publish/packages.ts` holds no version or peer. `@nulo-sh/resolve-asset` has no Aztec dependency.
- F16. `scripts/publish/readme/wallet-crypto.md:5` says the `@aztec-labs/accounts` peer's artifact has a different class id from the wallet's. False at `0.1.0` (F7) and at rc.3.
- F17. No Aztec mainnet exists for this line (#80).
- F18. Rule text that forbids an in-place re-pin today: CLAUDE.md § Account-address freeze (the intro sentence and every bullet), `SECURITY.md:71-80`, `UPDATE.md:17` (coupling 3) and `:21` (coupling 7), the headers of `address-freeze.ts:1-26,108-111`, `address-freeze.test.ts:7-16`, `artifact-freeze.test.ts:17-20`, `frozen-artifact.ts:4-9`, `frozen-account-canary.test.ts:20-22`, and the skill's "frozen account surface" paragraph and line 98.

### Inferences

- I1. The rc.3 Standards Token class differs from rc.1's (oracle major moved). P4 reads it from the installed artifact.
- I2. The new Testnet has a SponsoredFPC at the V3-derived salt-0 address. P3 probes it before any pin moves.
- I3. fee-juice keeps salt 1, deployer zero ("a fixed project constant from 5.0.0 onward", its canonical JSON).
- I4. Someone may hold a V6 account from the live AMO listing; an rc.3 store update would show them the barrier until stale-network-reset ships (OA-1).

### Asks (OWNER-ASKS.md carries each with its default)

- A1. Release order: no store upload of an rc.3 build before stale-network-reset's reset screen is on `dev` (OA-1).
- A2. rc.1 account files are refused by the rc.3 build (F8), as V6 refused V5 files (OA-2).
- A3. Nightly's advisory `token-list-host-live` goes red once the empty list is published (OA-3).
- A4. Regime entry id `nulo-v6.1` (OA-4). A5. Conditional: no SponsoredFPC on the new Testnet (OA-5).

## Architecture & Implementation

### Arcs; the brief's arc 2 folds into arc 1

| Arc | Content | Waits on |
|---|---|---|
| 1 | The line, the chain cascade, the in-place re-pin, the drift detectors, the token-list state, three fill-ins | each fill-in, at its wait point |
| 3 | `@nulo-sh/*` `0.2.0`; the owner's dispatch | arc 1 on `dev` |
| close-out | Outcome, lessons, open items, archive | arc 3 |

The externals cannot merge after the line: presto must move with it (F12); the rc.3 PXE refuses the rc.1 PrivateFPC, so the fee e2e stay red without fee-juice rc.3 (F13); the canary job behind `extension-network-e2e-status` needs the rc.3 presto-server. So each external is a fill-in inside arc 1. Arc numbers stay as the brief and the decision record use them.

### Fill-ins (one value each; read from its source, never guessed)

| Fill-in | Value | Pin sites | Wait point | Gate |
|---|---|---|---|---|
| F-presto-server | the presto-server release the owner cuts for rc.3 | `.github/workflows/_extension-network-e2e.yml:192` (version), `:196` (tarball sha256), `:197` (binary sha256); re-check the log literals the gate greps (`:365-366`) | P6 | `lint:actions`, `test:ci-gating`; canaries in P7 |
| F-fee-juice | `@alejoamiras/private-fee-juice@6.0.0-rc.3` | `apps/extension`, `apps/playground`, `packages/aztec-runtime` `package.json`; `S/fpc/protocol-fpcs.test.ts` (artifact digest, `CANONICAL_PRIVATE_FPC`); `tests/e2e/helpers/fpc-seeds.ts:7-10` | P5 | fpc unit tests; `fee-methods`, `selfpay-phase` |
| F-token-stack | #388 and #389 merged on `dev` (#391 is the stack's close-out) | `class-ids.ts`, `list.source.json` | P4 | `infra/token-list` check; `token-list-pins.test.ts` |

Sources: `gh release view <tag> -R alejoamiras/presto --json assets` (each asset's `digest`) plus a local `sha256sum`; `npm view <pkg>@<v> dist.integrity dist.attestations`; the installed package's `canonical-deployment.json`. Never re-pin from a failing test's "received" value.

### Mechanics

**M1. Two version lines.** `@aztec-labs/*` → `6.0.0-rc.3`; the `@aztec-foundation/*` toolchain (`bb.js`, `l1-artifacts`, `noir-acvm_js`, `noir-noirc_abi`) → `6.0.0-rc.6`; `aztec-standards` and `@alejoamiras/presto` → `6.0.0-rc.3`. `scripts/aztec-hold-residue-check.ts` replaces `WORKSPACE_LINE` with `LABS_LINE`, `FOUNDATION_LINE`, `STANDARDS_LINE` and a `lineOf(name)` used by the lock, manifest and runtime checks; graph closure, retired-scope refusal and realpath identity stay. It is a local gate with no test file; P1 proves it with one success run and one failure control per constant. The notices policy splits too: `AZTEC_NODE_TAG` → `v6.0.0-rc.3`, `AZTEC_PACKAGES_TAG` → `v6.0.0-rc.6`; each override's `reviewedVersion` follows its package's line.

**M2. Age gate.** Start P1 after 2026-10-15 12:21Z, when every `@aztec-labs/*` and `@aztec-foundation/*` name has cleared (skill: "Prefer waiting"). Then only `aztec-standards` (clears 2026-10-20 19:04Z), presto (2026-10-21 16:54Z) and, at P5, fee-juice need excludes: exactly the names younger than 604800 s when `bun install` resolves (`npm view <name> time --json`). Commit them with the pins; delete them in P7 after the last resolve; prove it with `bun install --frozen-lockfile --force`. Per excluded name, record in the PR body: the tarball integrity, `npm audit signatures` from a scratch project (`npm install --ignore-scripts` first), and the SLSA attestation's repository, workflow, ref and source commit, checked to be a tagged commit of the publisher's repository. `reference/nulo-v6.1/` has its own seven-day gate and takes no exclude. Arc 3 edits no `package.json`.

**M3. The in-place re-pin.** Append an entry the same major binds to; never edit an old one.
1. Vendor `artifacts/SchnorrAccount.json` byte-exact from `@aztec-labs/accounts@6.0.0-rc.3`; check it equals the copy in `@aztec-labs/noir-contracts.js@6.0.0-rc.3` if that package ships one. Diff rc.1 against rc.3: function names and parameters, `isStatic` and other flags, and the constructor `buildFrozenConstructorCall` reads (`instantiation-descriptor.ts:97-110`); record it in `lessons/phase-2.md`. Rewrite `PROVENANCE.md` (package, version, lockfile integrity, publisher, sha256, class id; "previous entry `nulo-v6`: `@aztec-labs/accounts@6.0.0-rc.1`, sha256 `4b4933a1…7f94`, not vendored").
2. Move `FROZEN_ARTIFACT_SHA256` and `FROZEN_ACCOUNT_CLASS_ID`. The descriptor and its digest stay.
3. Append `REGIMES["nulo-v6.1"]` (literals; same KDF and descriptor). Its `ack` embeds its digests, names the in-place policy it ships under, and says it supersedes `nulo-v6` for V6 builds. `nulo-v5` and `nulo-v6` stay byte-identical; their acks state the policy in force when written, which the record's header now says. Bind `V6_REGIME = REGIMES["nulo-v6.1"]`. The V6 major therefore spans two entries; each build binds exactly one, the last.
4. Add `reference/nulo-v6.1/`, a copy of `reference/nulo-v6/` with the rc.3 pins, its own `bun.lock` and the new `ARTIFACT_SHA256`; run `bun install && bun derive-vectors.ts > vectors.json`, then once more and require an empty diff. `reference/nulo-v6/` stays.
5. Tests to the new truth. `address-freeze.test.ts`: append the hardcoded entry; retarget the live-module and binding tests to `nulo-v6.1`; add "the bound entry is the last entry". `artifact-freeze.test.ts` follows the literals. `derivation-vectors.test.ts` and `account-seed-vectors.test.ts` read `reference/nulo-v6.1/vectors.json`; the key-level equality with `reference/key-model-v2` stays. `account-export.test.ts`: new checksum, plus one refused class (a file from `nulo-v6`, the same major's previous entry). `regimeId` fixtures that assert what the build writes become `"nulo-v6.1"`.
6. Rule text (F18). The new text, in substance: an address is a versioned artifact of the regime its build binds; `REGIMES` is append-only and each build binds exactly one entry, the last; a red KAT or freeze test is re-pinned only on the owner's recorded decision, by appending an entry, re-vendoring with provenance and regenerating vectors from the independent generator; a non-Mainnet derivation change then ships in place as an update; a Mainnet-serving build never re-binds (new major); a red canary still holds the line. Arc 1 rewrites every F18 site, CLAUDE.md lines 109-114 included, because each is false the moment arc 1 merges. stale-network-reset keeps line 115 ("Runtime mismatch"), the skill's Branch B client-side reset and `ARCHITECTURE.md`; its § Docs is told that 109-114 are already amended (orchestrator). The skill's step 3 stays untouched (F4).

The rejected alternative, amending `nulo-v6` with a history field, keeps "one entry per major" literal but edits a shipped entry and its hardcoded test, with the carve-out closed (F5).

**M4. What a developer with an rc.1 profile sees.** Before stale-network-reset: the first unlock derives under V3, a Nulo_v1 row mismatches, the profile is blocked behind `AccountIntegrityBarrier` (F11); the exits are the lock screen's profile delete or a reinstall (pre-production, F10). An rc.1 full backup passes the epoch gate (F9), but restore seeds the new networks: its rows on the old Testnet chainId are refused per row (accounts: "No network for chain", `S/network/service.ts:404`; account state and transactions: "Skipped: its network is not one of the built-in networks", `X/composables/full-backup-restore.ts:278-295`), and only rows on a chain whose id did not move restore: a derived row then meets the barrier, an imported row fails closed at use and at export (`ImportedAccountUnusableError`). That is today's fail-closed path, unchanged by this plan. After stale-network-reset lands, the next unlock classifies Testnet as both causes and offers its reset. This plan builds none of it. The arc 1 PR body carries `SECURITY.md`'s three items: the invariant changed (M3.6), the plan for existing users (this paragraph), the cross-version vectors (M3.4-5).

**M5. Drift detectors.** SponsoredFPC: derive with `deriveSponsoredFpc()`, confirm a live SponsoredFPC instance with `bun run scripts/seed-preflight.ts <address> <class id>` (from `apps/extension`; its silent client prints origins only, and it also checks the node's identity against the new pins), then move `CANONICAL_SPONSORED_FPC` and `fpc-seeds.ts`. No instance: stop, OA-5. PrivateFPC: P5 copies `expectedAddress` from the installed fee-juice `canonical-deployment.json` after checking its `aztecVersion` is `6.0.0-rc.3`, its salt is `PRIVATE_FPC_PARAMS`' and the address equals `derivePrivateFpc()`; any difference stops the phase. `protocol-fpcs.test.ts` gains one assertion: `CANONICAL_PRIVATE_FPC` equals the package JSON. unleashed mirrors that same JSON under its own test (F14), so the wallet copies the address unleashed owns with no cross-repo gate and no cycle. `descriptors-real-artifact.test.ts` must pass unedited against rc.3 Standards.

**M6. Behaviour-preserving ports.** `public-events.ts:327` passes a block-hash reference the node holds; rc.3 also throws when the node's archive at that height differs. The function already throws on a non-member, so both reach the caller's one failure path; `public-events.test.ts` stays unedited. Schema patch, PXE and fee math need no port (Phase 0). Re-check each `UPDATE.md` coupling against the rc.3 `.d.ts` and source; the canaries are the behavioural proof for proving.

**M7. Token list after the stack.** Merge `origin/dev` once #389 has landed. Replace `BUNDLED_TOKEN_CLASS_IDS`' class with the one `getBundledTokenClassId()` returns under rc.3, comment included; set `list.source.json` to `"tokens": []`. Edit no third file: `shipped-token-list.test.ts` filters the served list by `CHAIN_IDS.TESTNET`, so it holds no rc.3-chain entry before or after the publish and proves nothing here. After merge, the owner approves `publish-token-list.yml`'s `sign` and merges its PR; nightly's advisory `token-list-host-live` then reds (OA-3).

### File-level change map

| Phase | Files |
|---|---|
| P1 | 7 `package.json` (pins), root `package.json` (3 patch keys), `patches/*` (3 renames), `bunfig.toml`, `bun.lock`, `scripts/aztec-hold-residue-check.ts`, `packages/third-party-notices/src/policy.ts`, `.github/actions/setup-aztec/{installer-pins.sha256,cli/package.json,cli/package-lock.json}`, version literals (`layout-identity.test.ts`, `resolve-asset/src/index.test.ts`, cosmetic fixtures), docs literals (`UPDATE.md`, package READMEs, `store/SOURCE-BUILD.md`, `store/listing.md` reviewer notes, `legal/README.md`) |
| P2 | `R/account/{artifacts/SchnorrAccount.json,artifacts/PROVENANCE.md,frozen-artifact.ts,address-freeze.ts}` and tests; `reference/nulo-v6.1/*` (new); `R/account/account-export.test.ts`; `regimeId` fixtures (`coordinator.test.ts`, `AccountIntegrityBarrier.test.ts`, `runtime-mismatch.test.ts`, `profile/service.integration.test.ts`); `backup-migration-registry.ts` comment; the F18 sites |
| P3 | `X/utils/chain-ids.ts`, `chain-ids.test.ts`, `aztec-node-factory-adapter.probe.test.ts:18`, `session-established.test.ts:719-722`; `protocol-fpcs.test.ts` and `fpc-seeds.ts` (SponsoredFPC); `UPDATE.md` |
| P4 | `packages/token-list/src/class-ids.ts`, `infra/token-list/list.source.json` |
| P5 | 3 `package.json`, `bunfig.toml`, `bun.lock`, `protocol-fpcs.test.ts`, `fpc-seeds.ts` |
| P6 | `_extension-network-e2e.yml` |
| P7 | `bunfig.toml` (excludes out); `scripts/ci-cd/audit-acks.json` (re-judged) |
| P8 | `scripts/publish/approved-digests.json`, `scripts/publish/readme/*.md` |

### Trade-offs and alternatives not taken

| Alternative | Why not |
|---|---|
| `nulo-v7`, a new major, a compat-epoch move | Ruled out by the owner (F2) |
| Amend `nulo-v6` with a history field | Edits a shipped entry and its hardcoded test (F5) |
| Outline B: wait for every external and unleashed's generation, then one PR; a toolchain-only PR first | Delays the reset a week against "ASAP"; its toolchain PR would break `setup-aztec-pins.test.ts` (CLI lock without the extension pin); the unleashed wait was a cycle (M5 removes it) |
| Hold presto or fee-juice at rc.1 | Two generations (F12); the rc.3 PXE refuses the rc.1 PrivateFPC |
| Derive the PrivateFPC and hand it to unleashed | Superseded by copying the package's canonical JSON (M5) |
| Edit the live token spec or `default-tokens.ts` | Outside the owner's two-file grant (F4); the spec cannot observe the change (M7) |
| A startup reconcile or a migration for the stale row | Pre-production rule (F10); stale-network-reset owns the reset |

## Security & Adversarial Considerations

- **Supply chain.** Wait for the gate where possible; excludes name only what is still inside it and leave before the PR is ready (M2). Provenance must bind to the publisher's tagged source, not merely exist. Every lockfile change gets a disposition (`scripts/lockfile-exception-diff.ts`). The CI toolchain lock is regenerated by `lock.sh` (npm ≥ 11.17.0) and its diff reviewed; the installer is read whole before its hash is pinned, and a changed Foundry repeats the attestation check (skill, Phase 1). The notices overrides are re-reviewed at the two tags. presto-server pins come from the release's asset digests and a local hash.
- **Funds sent to a wrong address.** Fee Juice credited to a PrivateFPC the wallet does not use is unrecoverable. The wallet's address equals the fee-juice package's machine-asserted JSON, which unleashed mirrors under its own test (M5). The SponsoredFPC pin needs a live instance.
- **Address equality is not network identity.** V3 changes addresses relative to V2; it does not bind an address to a rollup: identical inputs give one address on every rc.3 rollup. Network identity stays with the chainId and node-identity checks (`assertLiveChainIdentity`, the preflight).
- **Old-entry material.** An rc.1 account file is refused (F8); an rc.1 profile is blocked, never silently re-derived (M4); the bound entry is always the last, so no build can re-bind backwards.
- **Trust boundaries.** Backup import keeps its gates; a restored rc.1 profile still passes the integrity check. The dApp surface is unchanged. The PXE patch keeps its source pin.
- **Least privilege.** No agent dispatches `publish-packages.yml`, approves `publish-token-list.yml`'s `sign`, or flips `NULO_E2E_DISABLE_PRESTO`; publishing stays tokenless with provenance.
- **Secrets.** The Testnet endpoint carries a key in its path: probes read it from the file and print origins only.

## Phases

Expected reds. A phase whose gate allows a red lists each failing test by name with its assertion and cause in `lessons/phase-N.md`. An allowed cause is a V2-derived address, the rc.1 artifact or a class pinned at rc.1. Any other test failure fails the gate, as does any lint, typecheck or build error.

### Arc 1

#### P1. The line

1. Edit the pins (M1), rename the three patches and their root `patchedDependencies` keys, add the excludes (M2); then run `bun install`.
2. If a patch fails to apply, recreate it with `bun patch`, delete the root `node_modules/@aztec-labs/pxe` copy, and run `bun install --frozen-lockfile --force`.
3. Update the residue script, the notices (two tags), the toolchain pins (`.github/actions/setup-aztec/lock.sh 6.0.0-rc.3`), every version literal from recon, and the `bb-fetch-code-shim.ts` path if rc.6 moved it.
4. Clear `apps/*/node_modules/.vite`. Install the toolchain: `AZTEC_HOME=$AH aztec-up install 6.0.0-rc.3`.

**Validation gate.** `bun run lint`; `bun run typecheck:all`; `bun run lint:actions`; `bun run test:ci-gating`; `bun scripts/aztec-hold-residue-check.ts` exits 0, then exits 1 naming that line's packages in three one-run controls (each constant set to `6.0.0-rc.1` in turn, reverted after); `bun scripts/lockfile-exception-diff.ts <base bun.lock> bun.lock` with every entry dispositioned in `lessons/phase-1.md`; `ls` of `dest/browser/barretenberg_wasm/fetch_code/browser/index.js` in the installed bb.js; `bun run build:chrome`, `build:firefox`, `bun run --cwd apps/playground build`, `bun run --cwd apps/landing build`; `bun run test:all` with `rc=$?` and a grep for `FAIL `. Pass: all exit 0 except `test:all`, whose reds meet the expected-red rule.

#### P2. The re-pin (M3)

Run on or after 2026-10-15 12:21Z (the reference project's own gate).

1. Vendor and review the artifact, rewrite `PROVENANCE.md`, move the two literals.
2. Append `nulo-v6.1`, re-bind, generate and re-generate `reference/nulo-v6.1/vectors.json`.
3. Update the tests and fixtures (M3.5), then the F18 rule text (M3.6).

**Validation gate.** `bun run --cwd packages/aztec-runtime test src/account`; `bun run --cwd apps/extension test src/wallet/services/account-integrity src/wallet/services/account src/components/AccountIntegrityBarrier.test.ts src/wallet/services/profile`; the second vector run's diff is empty; `git diff d3dc4415 -- reference/nulo-v6 reference/key-model-v2` is empty; `rg` of the old artifact sha256 and class id repo-wide leaves only `REGIMES["nulo-v6"]`, its test entry, `PROVENANCE.md` and `reference/nulo-v6/`; `rg -n -i 'extension major|new.major|one regime|never bumped|never re-derived|not a re-pin'` over the F18 sites returns only Mainnet-scoped or historical text; lint; typecheck. Pass: all exit 0; `nulo-v5` and `nulo-v6` byte-identical to base in `address-freeze.ts` and its test; `test:all` reds only in `protocol-fpcs.test.ts` and the Standards Token class pin.

#### P3. The chain cascade and the SponsoredFPC (M5, M6)

1. Set `TESTNET_ROLLUP_VERSION = 3409706519`; update the chainId comments and the live-verified note; move the formula fixtures naming the old Testnet pair (hex `0xcb3bfe17`).
2. Probe and re-pin the SponsoredFPC (M5).
3. Re-check the `ensureContractSynced` callers and each `UPDATE.md` coupling (M6); update `UPDATE.md`.

**Validation gate.** `bun run test:all` (`rc=$?`, grep `FAIL `); lint; typecheck; the preflight output in `lessons/phase-3.md`; `rg` of `2914217885`, `2904119610` and the old SponsoredFPC address leaves only historical lines (archive, `reference/`). Pass: the reds are only the PrivateFPC case and, until P4, the Token class pin; `public-events.test.ts` and `descriptors-real-artifact.test.ts` pass unedited.

#### P4. F-token-stack (M7)

Wait point: #389 merged on `dev`. P5 and P6 may run meanwhile.

**Validation gate.** `git merge origin/dev`, conflicts resolved by reading both sides; `bun run --cwd infra/token-list check`; `bun run test:all`. Pass: all exit 0 apart from P5's pending red; `token-list-pins.test.ts` passes with the rc.3 class.

#### P5. F-fee-juice (M5)

Wait point: `@alejoamiras/private-fee-juice@6.0.0-rc.3` on npm.

1. Pin it in the three workspaces through M2.
2. Review the artifact against rc.1's (functions, flags, no initializer); re-pin `REVIEWED_PRIVATE_FPC_ARTIFACT`.
3. Copy the address (M5); move `CANONICAL_PRIVATE_FPC`, `fpc-seeds.ts`, and add the JSON-equality assertion.

**Validation gate.** `bun run --cwd apps/extension test src/wallet/services/fpc`; `NODE_OPTIONS=--dns-result-order=ipv4first AZTEC_HOME=$AH NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 bun run e2e:agent tests/e2e/network/fee-methods.test.ts tests/e2e/network/selfpay-phase.test.ts`. Pass: both exit 0.

#### P6. F-presto-server

Wait point: the rc.3 presto-server release on `alejoamiras/presto`.

1. Pin the version, tarball and binary hashes (§ Fill-ins).
2. Start it only if `ss -ltn 'sport = :59833'` shows the port free (else stop): `env -u BB_BINARY_PATH RUST_LOG=info PRESTO_ALLOW_ALL=1 PRESTO_HOME=~/.cache/nulo-backlog/aztec-rc3/presto setsid presto-server > ~/.cache/nulo-backlog/aztec-rc3/presto.log 2>&1 &`, on `127.0.0.1:59833`. No token reaches it (a token would make this a keyed run), so send one warm-up prove once `api.github.com/rate_limit` has room. Tear down only its own process group after P7.

**Validation gate.** `bun run lint:actions`; `bun run test:ci-gating`. Pass: both exit 0; the binary's `sha256sum` equals the pin.

#### P7. Excludes out, full gates

1. Delete every exclude; `bun install --frozen-lockfile --force`.
2. Run the dependency audit: `bun audit --audit-level=low --json > audit.json; bun scripts/ci-cd/audit-gate.ts audit.json --exit-code $? --mode enforce`. Re-judge each `audit-acks.json` entry whose reopen event is the next Aztec bump.
3. Run the suites, one `e2e:agent` run at a time in this worktree.

**Validation gate.**
- `bunfig.toml` equals base; the frozen install and the audit gate exit 0; `bun run audit:vue`; `bun run test:all`; `bun run test:ci-gating`; `bun run test:release`.
- Smoke, per browser: the armed build (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`, or `build:firefox`), then `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- --retry=0`, with `NULO_E2E_BROWSER=firefox` for Firefox.
- Network, proverless, per browser: `NODE_OPTIONS=--dns-result-order=ipv4first AZTEC_HOME=$AH NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 bun run e2e:agent`.
- Canaries, prover-ON, per browser: `AZTEC_HOME=$AH VITE_NULO_PRESTO_REQUIRED=1 NULO_E2E_RETRY=0 bun run e2e:agent tests/e2e/network/frozen-account-canary.test.ts tests/e2e/network/passkey-execution-canary.test.ts`; at least one `Proving succeeded` in `presto.log` between that run's start and end times.
- Pass: all green at retry 0; one rerun allowed for a known flake, with its log. A red canary holds the line and is never answered with a pin.

### Arc 3

#### P8. `@nulo-sh/*` 0.2.0

All three take `0.2.0`, one lockstep version (F15). `wallet-crypto` changes only its exact peers (`@aztec-labs/{accounts,foundation}` → rc.3), which breaks 0.x consumers: a minor. `wallet-sdk-schema-patch` changes its peers (`@aztec-labs/{aztec.js,stdlib}`); its patch is unchanged because rc.3's `WalletSchema` and stdlib schemas are byte-identical, which `apply.test.ts` and `dispatcher.test.ts` prove under `test:all`. `resolve-asset` has no Aztec peer and no code change; it moves only because the version is lockstep. `packages.ts` needs no edit.

1. READMEs: one line under Requirements naming the Aztec line; in `wallet-crypto.md`, replace the class-id claim (F16) with: keys alone do not give the wallet's address, which also depends on the wallet's vendored artifact and instantiation descriptor, which this package does not ship.
2. Rehearse with the workflow's toolchain (Node 24.12.0, its npm 11.6.2, Bun 1.4.2): `bun scripts/publish/stage.ts --all --version 0.2.0`, then `nvm exec 24.12.0 npm pack` each staged directory; record the three sha256 under `"0.2.0"` in `approved-digests.json`. Delete `dist-publish/`, stage and pack again from a clean tree.
3. Owner steps after arc 3 merges: dispatch `publish-packages.yml` from `dev` with `version=0.2.0` as a dry run and confirm its pack job matches the approved digests; then dispatch with `dry_run=false` and approve `npm-publish`.

**Validation gate.** `bun run test:release`; `bun scripts/publish/check-digests.ts 0.2.0 <second-pack dir>`; lint. Pass: all exit 0; every declared Aztec peer in the staged manifests is exactly `6.0.0-rc.3`.

## Decision ledger

| # | Decision | Source | Status |
|---|---|---|---|
| D1 | Fold the externals into arc 1 as fill-ins | M | accepted; both audits agree |
| D2 | Append `nulo-v6.1`, re-bind, assert the bound entry is last | M, C, F | accepted; amending `nulo-v6` rejected (F5) |
| D3 | Copy the PrivateFPC from fee-juice's `canonical-deployment.json`, assert equality | F (A1) | accepted; replaces "derive and hand to unleashed", which C also called underspecified (C11) |
| D4 | Residue check: three lines, three failure controls, no test file | C6, F (Q-c) | accepted |
| D5 | Rewrite every F18 site in arc 1, CLAUDE.md 109-114 included | F (C2), M | accepted; stale-network-reset keeps 115, Branch B and ARCHITECTURE |
| D6 | Start P1 and P2 after 2026-10-15 12:21Z; excludes only for what is still gated | F (A3, C7), C4 | accepted |
| D7 | P4 edits two files; the live spec is not its gate | C12, F (C3) | accepted; nightly red raised as OA-3 |
| D8 | Outline A over B | C, F | accepted |
| D9 | Live Testnet send is the owner's pre-release step; the Outcome says so | F (A4) | accepted |
| D10 | No CI sharding locally (sibling checkouts are off limits) | M | accepted; time cost only |
| D11 | Correct M4's backup claim; add no restore test | C (final 2) | accepted in part: the plan changes no restore code, and the unseeded-chain path is pinned (`useFullBackupImport.test.ts:1060-1086`, per-row errors `account/service.test.ts:205`) |

## Audit verdicts

### Dual audit, 2026-10-14

- **Codex (gpt-6.1-sol, high), fresh: conditional approve.** 12 findings, all verified and accepted: the V3 rollup claim (Security, reworded), I4's attribution, the wallet-crypto README claim (P8), the reference project's own gate (M2, P2), incoherent fill-in gates and expected-red precision (§ Phases rule, P4, P5), the residue control (M1), smoke and live-spec commands (P7, M7), presto-server ownership (P6), provenance bound to source (M2), the `aztec-packages` compare (Phase 0, M1), A1's ownership (D3), the third token file (D7).
- **Opus (Plan agent), fresh: conditional approve.** Accepted: A1 (D3), A2 (artifact review, M3.1), A3 (wait first, D6), A4 (D9), C1 (two tags, bb.js path), C2 (F18 sites, acks, owner stop, D5), C3 (D7, OA-3), C4-C8 (gates, toolchain, audit command, reference determinism, `fpc-seeds.ts`), C9 (clean re-pack, npm versions, the lessons link). Q-c: `aztec-standards` gets its own line.

### Final pass, 2026-10-14

- **Codex (gpt-6.1-sol, high), fresh session `01a13b87`: conditional approve.** Three findings, verified: P1 installed before the patch renames (fixed: renames precede the install); M4 overstated the backup path (fixed, D11; its proposed regression test rejected under Proportion); F18 missed `UPDATE.md:17` (added, and the P2 sweep widened). No finding on the re-pin mechanics, the supply chain, the other gates, security, the fill-ins or proportion. The conditions are met in this text, so the verdict stands as approve-with-fixes; no resumed round.

### Implementation review, arc 1 P1-P3, 2026-10-14

- **Codex (gpt-6.1-sol, high), fresh session `01a13beb`: approve with fixes.** Five findings, verified. Export stamped `nulo-v6.1` on a stored address the key no longer derives (accepted: `exportAccount` re-derives and refuses, imported → `ImportedAccountUnusableError`, derived → the runtime mismatch; two tests, each red without the fix). A restored `nulo-v6` imported row is not re-derived (accepted in part: the backup comment and M4 now say it restores and fails closed at use and export; no restore code, the state an in-place update leaves is the same and is handled at use). The skill's peer-rebind claim and the residue header (fixed). PROVENANCE understated the changed fields (fixed: verification key and debug metadata too). Plan paths in the rewritten freeze-test header (fixed); the reference generator's comment kept, so it stays a byte-diff of `reference/nulo-v6/`.
- **Opus (general-purpose), fresh: no correctness bug.** Overlaps on the skill, the backup comment and the header paths; adds CLAUDE.md's imported-account clause and `apps/extension/README.md:88` (both fixed). The untouched `address-freeze.ts` carve-out paths resolve under `archive/`, so they stay.

## Delivery

Trunk `dev`. `code_review` is `off` on every arc.

| Arc | Phases | Branch | PR title |
|---|---|---|---|
| 1 | P1-P7 | `worktree-aztec-rc3` | `feat(aztec): move to 6.0.0-rc.3 and the reset testnet, re-pin the account artifact` |
| 3 | P8 | `aztec-rc3-sdk` | `chore(publish): prepare the @nulo-sh packages 0.2.0 on aztec 6.0.0-rc.3` |
| close-out | — | `aztec-rc3-close-out` | `docs(plans): close the aztec-rc3 plan` |

- **Deviation (decision record, item 3):** arc 1 may open as a draft once P1-P3 are green and its Codex loop has converged on that diff: `gh stack init --adopt worktree-aztec-rc3`, then `gh stack submit --auto --draft` (or `gh pr create --draft --base dev`). Each fill-in lands as its own commit and gets a resumed Codex round; the PR turns ready only after P7.
- Arc 1 body: `Closes #324`; source-bound provenance per excluded package; the lockfile disposition; the presto-server release pinned; `SECURITY.md`'s three items (M4); each browser's e2e wall-clock (no scenario added). Labels after creation: `e2e:extension-network`, `e2e:extension-smoke`.
- Arc 3 body: `Refs #324`; the digests; the owner's dispatch steps.
- Parallelism: P4, P5 and P6 wait on outside events, in any order; nothing else is independent. No lanes.

## Post-implementation

Follow [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `d3dc4415`. Plan-specific settings:

- Step 1 is absent (`code_review: off`).
- Step 2 per arc while it is the stack tip: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`. Arc 1: once over P1-P3, then one resumed round per fill-in commit. Arc map: "arc 1 of 2 moves the line; arc 3 prepares the npm release on it". A final fresh session covers the net diff from `d3dc4415`. Hard stop at three rounds.
- Approval boundaries (stop for the orchestrator): a pin moved without its evidence, a held package, a new regime field, any edit to `nulo-v5` or `nulo-v6`, a third token-list file, or any change to what a screen shows.
- Close-out on `aztec-rc3-close-out`: merge `origin/dev`, read `index.md` and `lessons.md`, write the Outcome, promote lessons (the two-line foundation numbering; the oracle-major refusal), file open items (Testnet defaults waiting on unleashed's generation, `blocked:external`; OA-3's disposition), comment on #324's follow-ups, `git mv` into `archive/` in its own commit, `bun run check:plans` green. Then report and wait.
- Teardown after the merge: once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/aztec-rc3/plan.md` succeeds, `agent-worktree done aztec-rc3 --merged`. A `/loop` session checks on every firing; a `/goal` session arms one background wait after its wrap-up report.

## Seeds (draft until approval)

Use exactly one per session, inside this worktree (`agent-worktree resume aztec-rc3`). No ELI5 (orchestrator-owned).

**Recommended, `/goal`:**

```
/goal Phases P1-P8 marked ✓ in implementations-plan/aztec-rc3/plan.md (the file's phase headers), each backed by its validation gate reported passing in the transcript at retry 0, every allowed red listed per the expected-red rule; each fill-in's value read from its source as § Fill-ins says and quoted; for each phase `LESSONS_FILE=implementations-plan/aztec-rc3/lessons/phase-N.md` printed; `/code-review` NOT run; the codex loop (gpt-6.1-sol, high) converged on arc 1 (and each fill-in round) and arc 3, plus the final cross-arc pass, each quoted; no exclude left in bunfig.toml; the stack (arc 1, arc 3, close-out) on GitHub with the close-out's archive move (`git show --stat`); `bun run test:all` and `bun run lint` exit 0. Never merge, never dispatch a workflow.
```

**Fallback, `/loop`:**

```
/loop 15m Drive implementations-plan/aztec-rc3. Each firing: (1) read plan.md and lessons/ from the stack's top layer; if the plan is archived on dev, run the teardown and stop; if delivered, babysit CI only. (2) Pick the next phase; if it waits on a fill-in, check its source (npm, `gh release list -R alejoamiras/presto`, `gh pr view 389`) and work on another phase meanwhile. (3) Run the phase's gate exactly as written; mark ✓ only on a pass. (4) Decide with /codex high (gpt-6.1-sol) and log it in lessons; never pin a value without its evidence, never merge, never dispatch. (5) Arc boundary: the codex loop first, then `gh stack add aztec-rc3-sdk`.
```
