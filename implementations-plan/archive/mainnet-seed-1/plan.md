---
plan: mainnet-seed-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dda72e321
issues: "#80"
---

## Outcome

- **Date:** 2026-10-24. Planned and implemented the same day.
- **Status:** ready on the owner's call (D17): #1117 against `dev`, marked ready without the live read, which follows on 2026-10-26 once the v6 upgrade executes; the timed export moves to after the flip. The orchestrator merges.
- **Shipped:** the Mainnet seed (D1) as the default network (D19), on the owner's call of 2026-10-24, with the e2e holding a stand-in per seeded node (D20), the fresh-profile check (D21) and the flip's copy (D22) for the owner's sign-off; its explorer entry; the e2e test Mainnet retired, the helpers and update scenarios on the real seed (D5); `check:seeds` plus the advisory nightly job, reusing `assertLiveChainIdentity` and printing no node words (D2, fix round 1); the declared refusal and the arrival's no-dial assertion (D6); captures on both browsers (D8); the owner's answers to OA-1 to OA-7 (D10-D16), applied on the branch; the PXE store gate (D18). Measured: 4 to 8 s per full backup export per browser.
- **Dropped, rejected, superseded:** D9's skip of accountless chains (it would drop a dApp's registrations); D6's declared refusal for Mainnet, superseded by a stand-in per seeded node (D20); "Testnet stays active", superseded by D19; copy changes (D3, asked as OA-1).
- **Known limits:** #1115 (an export dials a never-opened seeded network), #1116 (a custom network sharing a seeded chain id loses its imported account on restore), #1119 (a seeded Mainnet beside a custom network named Mainnet, OA-7); #808 closed again (OA-6). **Open items:** #80, open until #1117 merges. **Lessons:** none promoted (`lessons.md` is at its budget; the two arc gotchas are in [lessons/phase-1.md](lessons/phase-1.md) and the e2e README).
- **Seeds retired:** the `/goal` and `/loop` seeds below are history, not instructions.

# mainnet-seed-1: the Mainnet default network (#80)

One arc, one DRAFT pull request against `dev` that `Closes #80` (no stack: D-orch-1). It adds the Mainnet seed, its pin, its explorer and a live check of the pin, and retires the e2e-only test Mainnet. The PR merges only after the seeded endpoint reports the pinned pair on the live network (owner, #80, 2026-10-23). Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Outcome & Quality Bar

- **For whom.** A person whose wallet updates to the build that adds Mainnet; the owner, who merges it once Aztec Mainnet v6 is live.
- **Excellent.** (1) The pin is proven against the live node before the merge, and nightly records drift. (2) An existing profile meets one arrival and nothing else changes; a new profile gets the row; Testnet stays active; no e2e-only seed is left.
- **Good enough.** No Mainnet token list, sponsor or bridge (none exist: #77, #117). Surfaces past the visible budget ship unchanged, each with an ask.

## Assumptions

**Facts** (verified at `dda72e321`, 2026-10-24):
- F1. `dev` carries 6.0.0 (`TESTNET_ROLLUP_VERSION` 679261766, `apps/extension/src/utils/chain-ids.ts:27`); #1107 merged with both execution canaries green prover-ON on Chrome and Firefox, locally and in CI; #882 is merged.
- F2. A default is one `DEFAULT_SEEDS` entry (`seeds.ts:43-62`); `SEED_L1_BY_KIND.mainnet` is already 1; the stored-shape snapshot already enumerates kind `mainnet`, so no stamp is expected. No released build stored a `mainnet` row.
- F3. `walletChainId(1, 2070860440)` = 2070860441, the test Mainnet `tests/e2e/helpers/stale-network.ts:39` already uses.
- F4. The keyless dRPC Mainnet endpoint answers `node_getNodeInfo` with nodeVersion 5.2.0, l1ChainId 1, rollupVersion 4248422647 (the Alpha chain); a CORS preflight from an extension origin answers 204.
- F5. `aztecscan.xyz` is the Mainnet frontend of the explorer the wallet links on Testnet (same routes); its API reports Mainnet on rollup 4248422647 and followed the July move.
- F6. Nothing dials an unselected row in the background. A full backup export and the contacts export dial every row, and build an Active one's PXE for `getSenders` (`account-state/service.ts:97-128,189,239-258`); a dApp can register senders and contracts on a chain with no account (`execution/service.ts:1230-1242`); a restore probes only networks with work (`importChainSync.ts:74-78`); a dApp asking for Mainnet is now served.
- F7. A wrong pin passes seeding and account creation and fails at the first send (`packages/aztec-runtime/src/utils/chain-identity.ts:49-75`); a later corrected pin blocks Mainnet with no reset (`network-reset/service.ts:83,389,460`).
- F8. `typecheck` includes `tsconfig.e2e.json` (`apps/extension/package.json:24`). CI runs all five lanes on a draft PR (`pr-quick.yml:12-13`).
- F9. Known limit #808 reopens "before the first Mainnet build".

**Inferences.** I1: the Foundation's pair is correct: a claim until the live check passes, written so in code, tests and the PR. I2: aztecscan.xyz will index the v6 rollup; links may 404 until it does. I3: dRPC serves v6 at the same URL.

**Asks** (OWNER-ASKS.md; each ships as written there): OA-1 README and listing wording; OA-2 the get-gas link on Mainnet; OA-3 Mainnet's chain label in dApp windows; OA-4 Privacy § 5.1 beside a keyless endpoint; OA-5 the export banner's count; OA-6 #808's renewed disposition.

**Known limit, filed by the arc.** Once the pin is right, a full backup export on a profile that never opened Mainnet builds a Mainnet PXE and dials its node (F6). Skipping chains with no account would drop a dApp's registrations (D9). Verification step: the timed export before the merge (Delivery).

**Brief claims that did not hold.**
- "Flipping `isPrimaryActive` is a one-line call": a flip also falsifies Terms § 5 and its summary (`legal/terms.md:13,164`), README line 8 and the listing's reviewer note, and a Terms change is material (minor bump, re-acceptance).
- #80's body names `default-tokens.ts`, gone: tokens come from the signed list by chainId, with no Mainnet entries; no per-chain fee policy exists in code. #77 and #117 stay open.
- The live check is a script run on demand, not an env-gated test, and it reuses the signing path's identity assertion (D2).

## Architecture & Implementation

- **The seed.** `chain-ids.ts` gains `MAINNET_ROLLUP_VERSION = 2070860440`, its provenance (the Foundation via the owner, 2026-10-23, unverified until the live check), and `CHAIN_IDS.MAINNET`. `network-endpoints.ts` gains `MAINNET_RPC_URL = "https://aztec-mainnet.drpc.org"` by `printf >>`. `DEFAULT_SEEDS` gains `{ name: "Mainnet", rpcUrl: MAINNET_RPC_URL, chainId: CHAIN_IDS.MAINNET, l1ChainId: MAINNET_L1_CHAIN_ID, kind: "mainnet", isPrimaryActive: false, endpointLabel: "dRPC" }`. Comments saying no build seeds Mainnet are corrected.
- **The explorer.** `EXPLORER_BASE_URLS.aztecscan[CHAIN_IDS.MAINNET] = "https://aztecscan.xyz"`; the lag note covers both hosts.
- **The arm, retired whole (D1)**, every consumer in recon § The e2e arm. The arrival scenario updates into the plain candidate and names `seedForKind("mainnet")`.
- **The live check (D2).** `apps/extension/scripts/seed-identity.ts` reads `getNodeInfo` for every seed but `local` through `createPreflightNodeClient(seed.rpcUrl)` and passes it to `assertLiveChainIdentity({ chainId: seed.chainId, l1ChainId: seed.l1ChainId }, info)` from `@nulo/aztec-runtime/utils`, the assertion every signing path runs (canonical u32 values, exact L1, the composite; its tests hold the 2^32 alias). It prints one line per seed naming the seed and the reported pair, never the URL; it prints a caught error as `scrubUrls(message)` and exits 1 on any mismatch or error. Script `check:seeds`; nightly runs it as an advisory job.
- **Smoke helpers on the seeded row (D5).** `seedNetworkArrival` writes only the offer record announcing the seeded Mainnet row. `seedStaleMainnet` adopts that row: endpoint `DEAD_NODE`, the moved account copied onto it, made active. `E2E_MAINNET_CHAIN_ID` gives way to `CHAIN_IDS.MAINNET`.
- **Update scenarios (D5).** `arrivalExpected(entries)` (helpers) reads the release's stored rows and offer record: true when Mainnet's kind is neither among its rows nor offered. `update-replay.test.ts` and `network/update-in-place.test.ts` then call `stayOnArrival(page, current)` (wait, check the title names the seed, press Stay) before their UI reads, or assert no arrival.
- **Alternative not taken.** Re-kinding the arm: only `devnet` and `custom` remain, which no seed may carry.

## Decision ledger

| Id | Question | Decision | Why |
|---|---|---|---|
| D1 | The e2e arm | Retire it whole | Its consumer moves to the real seed; all three seedable kinds are now seeded, so the arrival scenario proves only the promote that first ships Mainnet, and its header and the release step say so. |
| D2 | Live check | A script beside `seed-preflight.ts` over every remote seed, through the runtime's `assertLiveChainIdentity`; advisory nightly job | Opt-in by being run (no `skipIf`, no jsdom, not swept into `bun run test`); reads `DEFAULT_SEEDS`, so it cannot drift from what ships; the merge check is the signing check, so a bare XOR cannot pass a non-u32 alias; the Testnet pin fails the same way; the silent client never prints the keyed URL. Advisory records drift; a notifier would be a new protocol (owner's). |
| D3 | README and listing copy | Unchanged in the arc; OA-1 and the PR's before/after; signed words land on the branch before the merge | Program rule: past the no-ask records, the arc ships without it. |
| D4 | Chain label in dApp windows | Unchanged; OA-3 | Past the visible budget. |
| D5 | Helpers and update scenarios | Adopt the seeded row; Stay only when the release lacks Mainnet | Two `mainnet` rows on one chain is a state no build writes; an unconditional wait times out once a release seeds Mainnet. |
| D6 | The Mainnet host under the egress guard | A declared refusal, with the flows that dial it | Every full backup and contacts export dials it (F6). Holding a second stand-in would rework the launch's single `HeldNode` and `guard.watch` (`egress-guard.ts:360,445-451`). The refused CONNECT costs one retried status read per full backup export (backoff `[1,2,3]`, `utils/fetch.ts:79-83`): measured per browser, never absorbed by a timeout. |
| D7 | #808's reopening condition | Reopen it with the trace; the disposition is the owner's (OA-6) | Its condition is the owner's own; Mainnet refuses capture and resume, but the non-Mainnet mixed-regime path still stands (`network-reset/service.ts:561`). |
| D8 | Screenshots | Arrival on both browsers; the get-gas row; markdown as before/after text | The capture skips Firefox (`network-arrival.test.ts:64`): a local edit lifts it for one run, reverted. The link and words take no chain input (`fee-helpers.ts:333`, `FeeSettingsCard.vue:454-466`). |
| D9 | Exports and never-used networks | No change; a closed known limit with the timed export as its verification step | Skipping chains with no account would drop a dApp's senders and contracts registered without one (F6). Asking the PXE whether a store exists would add a cross-process contract, a plan change for the owner. The cost, a Mainnet PXE built inside the popup's 60 s call (`extension-messaging/src/background/client.ts:17`) and a dial to its node, is unmeasured until v6 is live. |
| D10 | OA-1, README, listing and legal README | The owner, 2026-10-24: "A: Reword both now" | Proposal A's words in `README.md:8` and the reviewer note in `listing.md`; `legal/README.md` says the build seeds Mainnet beside the default Testnet. |
| D11 | OA-2, the get-gas link on Mainnet | The owner, 2026-10-24: "B: Keep it" | No change: a Mainnet person is sent to the Testnet bridge until a Mainnet bridge exists. |
| D12 | OA-3, the chain label in dApp windows | The owner, 2026-10-24: "A: 'MAINNET'" | One `getChainName` case, read as TESTNET is (upper-cased by its callers), with a unit test. |
| D13 | OA-4, Privacy § 5.1 | The owner, 2026-10-24: "B: Say 'Testnet' in the sentence" | Privacy 1.2.5, a patch (not material, nobody re-accepts): § 5.1 names the Testnet endpoint as the one on the Developer's provider account. 1.2.4 archived, a BEFORE-LAUNCH block for the new date. |
| D14 | OA-5, the export banner's count | The owner, 2026-10-24: "A: Accept, no change" | Imported accounts on Mainnet's chain leave the count, since a restore re-creates Mainnet. |
| D15 | OA-6, #808 | The owner, 2026-10-24: "A: Close it again as a known limit" | #808 closed again with its trace; reopen on a person's report. |
| D16 | OA-7, a duplicate "Mainnet" name | The owner, 2026-10-24: "B: Leave it, a known limit" | #1119, closed; reopen on a report of a profile showing two rows named Mainnet. |
| D17 | Merge before the live read | The owner, 2026-10-24: "I want us to assume Mainnet is live (because it's going live on Monday) and publish to the stores with Mainnet enable." Then: "please drive this through, including the chrome uploads ... Please make sure everything will work correctly and as expected before uploading it." | The L1 read stands in for the node's: governance proposal 5 is queued, executable from 2026-10-26T04:41:35Z, and adds rollup `0xE37A2663Cc9c119BA41572C40fAb0bbb23a5402f` (version 2070860440, circuits equal to Testnet 6.0.0's) to the registry. Until the node serves it, every signing path refuses the node (`assertLiveChainIdentity`). |
| D18 | A Mainnet PXE store opened before the flip | `createChainRuntime` refuses before the store opens unless the node serves the network's chain id; chain 0 skips the read | A store keeps the rollup address it first opened against and refuses every other, never wiping (`opfs-store.ts`), and nothing handles the refusal, so a first Mainnet PXE op before the flip would leave a store that never opens after it. Composite only: the PXE's `NetworkInfo` carries no L1. |
| D19 | The default network | The owner, 2026-10-24 near 23:55Z: "FYI: set alpha mainnet as default, not testnet", then "Flip now, upload whenever you finish the flip work reviewed by Codex on that lane. I want us to ship to the stores with MAinnet as default." Earlier, P69-03 (2026-10-20, #864): "Once we ship Mainnet though, Mainnet will be default." | `isPrimaryActive` moves to Mainnet. A new profile, and a bootstrap or import with no active pointer, start on Mainnet; an existing profile keeps its pointer and meets the arrival as before. Supersedes "Testnet stays active" (Outcome & Quality Bar, UI impact). |
| D20 | The e2e under the flip | Design B, picked with Codex (high): every guarded launch holds a stand-in for each seeded remote node it does not send direct, watched per host; specs that need the Testnet token list switch to Testnet through the UI; specs that intercept the active node use `DEFAULT_NODE_ORIGIN`, derived from `PRIMARY_SEED` | No e2e-only flag or seed override, so a green run proves the shipped default. Supersedes D6: a full export meets Mainnet's stand-in, a fast 400, not a refused CONNECT with backoff. Rejected: A (Testnet would need its own refusal, with backoff, in every list spec); C (a fixture option is B's switch without B's hold). |
| D21 | The check that a fresh profile lands on Mainnet | One smoke e2e in `network-arrival.test.ts`, in the pre-upgrade state: Mainnet's stand-in answers with the Alpha rollup. It asserts the Mainnet row's chain id, the active pointer, no arrival, the `invalidchain` status, a selected account, and Testnet one switch away with its own account | It doubles as the pre-upgrade degradation check, Codex's top risk: a fresh profile must reach Home against a node serving another chain. Only an e2e sees onboarding end to end; `service.test.ts` pins `PRIMARY_SEED`. |
| D22 | Copy under the flip | Terms 1.1's short version and § 5, the README banner's network line, the store reviewer note; Terms stays 1.1 (P69-02 C). `legal/README.md`'s banner item left with #893 | Before/after in the PR body; the owner signs on return. Flagged, unchanged: the get-gas link (OA-2), the empty Mainnet token list, the unfunded sponsor rows (#117), the store screenshots (#801), About's "Wallet version - X - Testnet" label. |
| D23 | Privacy 1.2.5's date | The orchestrator, 2026-10-25: 25 October 2026 in the version line, its history row and the manifest; archived 1.2.4's header and its 1.2.2 to 1.2.4 rows the same | #893 dated 1.2.2 to 1.2.4 on 25 October; the 1.0.0 Release PR's launch-legal check refuses any «FILL» left in `legal/terms.md` or `legal/privacy.md`. |

## Security & Adversarial Considerations

- **Wrong or stale pin** (F7): the live check gates the merge; nightly records drift; the provenance says "unverified" until the check passes, and the merge commit rewrites it with the live read.
- **Secrets.** The endpoint file is never opened: check it with `git diff --numstat -- <file>` and `git diff -U0 -- <file> | grep -cFx '+export const MAINNET_RPC_URL = "https://aztec-mainnet.drpc.org"'` only, requiring their expected counts (a hunk header copies the nearest earlier line); format it with `biome format --write <file> >/dev/null 2>&1`; every reviewer diff excludes it (`':!apps/extension/src/wallet/constants/network-endpoints.ts'`) and carries the added line alone. The live check names seeds, never URLs, and scrubs errors. The Mainnet endpoint is keyless.
- **Hostile node.** It can report any pair: the check proves reported identity, not chain authenticity. The send-time identity check refuses a drifted endpoint (F7); the stored L1 is checked against the code constant (`service.ts:467-480`).
- **Hostile backup or dApp.** Restore seeds networks itself, never from the file; a forged Mainnet address quarantines Mainnet alone (`classify.ts:37`). A dApp asking for Mainnet meets the existing chain-mismatch view (`chain-mismatch.ts:15-23`).
- **Privacy.** The Mainnet host is dialed when a person selects Mainnet, a dApp asks for it, or an export runs (F6, the known limit); Privacy § 5.1 covers default third-party endpoints (OA-4).
- **Supply chain, crypto, least privilege.** No dependency or cryptography; the nightly job keeps read-only permissions, pinned actions and `persist-credentials: false`.
- **Address freeze.** Merging makes this the first Mainnet-serving build: regime `nulo-v6.2` binds Mainnet for this extension ID's life (CLAUDE.md § Account-address freeze).

## UI impact

- **Settings → Networks and the switcher**: a "Mainnet" row, endpoint titled "dRPC" (brief record: the seed), after Testnet and Local Network, by name among added networks (`settings/networks/index.vue:33-37`).
- **An existing profile, once**: the arrival, "Mainnet is in your wallet … STAY ON TESTNET" (brief record: copy signed P66-01 D); screenshots on Chrome and Firefox.
- **A new or restored profile**: the Mainnet row, no arrival; Mainnet is active (D19). Before the v6 upgrade executes, Home shows Mainnet unavailable (`invalidchain`); captures of a fresh Home on both browsers, dark and light.
- **Mainnet links** open `aztecscan.xyz` (brief record: the explorer entry).
- **A consequence of the seed set**: the full export's "Some imported accounts need their network" banner stops counting imported accounts on Mainnet's chain, which a restore now re-creates (OA-5).
- **Unchanged, with asks or issues**: README line 8 and the reviewer note (OA-1); the get-gas link on Mainnet (OA-2, screenshot); `AZTEC:2070860441` in the connect window's account rows (OA-3); the fee picker's Sponsored and Private rows on Mainnet, unfunded there (#117).

## Phases

**Phase 1: the seed, the explorer, the arm retired.** Files: `chain-ids.ts` and test; `network-endpoints.ts`; `seeds.ts`; `explorers.ts` and test; `network/service.test.ts`, `stale-network/classify.test.ts`, `account-integrity/coordinator.test.ts`; the arm's consumers (recon), `e2e/config.test.ts`, `biome.json`, `_build-extension.yml`, `tests/e2e/README.md`, `.claude/skills/release/SKILL.md`.
1. Read the endpoint file's last byte with `tail -c1 <file> | xxd -p`. Append the constant with `printf`, format silently, inspect as Security says.
2. Add the pin, the seed and the explorer entry. Pin 2070860441 in `chain-ids.test.ts`; add a Mainnet case and its unknown-chain control to `explorers.test.ts`.
3. In `service.test.ts`, name the three seeds and Mainnet's "dRPC" label; use the real Mainnet seed in place of `EXTRA`, withheld for the earlier build; update the deleted-Local test. In the classify and coordinator tests, move the address-only Mainnet cases to `CHAIN_IDS.MAINNET` and assert that a Mainnet row off the seed's chain has a network cause.
4. Delete the arm; point the arrival scenario at the real seed; rewrite the README block and the release step for one candidate.
- **Gate:** `bun run lint`, `bun run typecheck:all`, `bun run test:all`, `bun run test:ci-gating` exit 0; `snapshot.test.ts` passes with no new stamp (if not, record why before `bun run baseline:storage`); `git grep -n "EXTRA_SEED\|extra-seed\|extraSeed" -- apps .github biome.json .claude` prints nothing.

**Phase 2: the live check and its nightly job.** Files: `apps/extension/scripts/seed-identity.ts` (new), `apps/extension/package.json`, `.github/workflows/nightly.yml`, `scripts/ci-cd/aggregators.test.ts`, `CI.md`.
1. Write the script as D2 says; add `"check:seeds": "bun run scripts/seed-identity.ts"`.
2. Add job `seed-identity-live` beside `token-list-host-live` (same `needs`, `if`, 5 minutes, `continue-on-error`, no credentials); name it in `NIGHTLY_ADVISORY` and CI.md.
- **Gate:** `bun run lint:actions`, `bun run test:ci-gating`, `bun run test` exit 0; `bun run --cwd apps/extension check:seeds` prints Testnet OK and Mainnet MISMATCH (rollupVersion 4248422647, pinned 2070860440), exits 1, and its output holds no URL path.

**Phase 3: the e2e on the real seed.** Files: `helpers/network-arrival.ts`, `helpers/stale-network.ts`, `fixtures/egress-guard.ts` and the README's host table (D6), `update-replay.test.ts`, `network/update-in-place.test.ts`, and the specs that import the changed helpers.
- **Gate:** the four builds (`bun run --cwd apps/extension build:chrome`, `build:firefox`, `bun run --cwd apps/landing build`, `bun run --cwd apps/playground build`) exit 0, and `_build-extension.yml`'s marker loop over both `dist` finds nothing. Then the armed smoke build. On Chrome and Firefox, `--retry=0`: `network-arrival`, `stale-network`, `legal-acceptance`, `contacts-import`, `security-backup`; then `build-update-candidate.sh <browser>` and, with `NULO_E2E_UPDATE_FROM=v0.31.0`, `default-network-arrival-update.test.ts` and `update-replay.test.ts`. Every file green, no egress-guard failure. Per-browser wall-clock of each file at base and head; `security-backup` names D6's cost.

**Phase 4: evidence and records.**
1. Capture the arrival on both browsers (`NETWORK_ARRIVAL_CAPTURES=1`, D8) and the get-gas row with Mainnet active where it renders; revert the Firefox edit.
2. Reopen #808 with D7's trace. File D9's known limit (closed, `known-limit`): reopen if the timed export or a person shows a full export slowed or failed by a network the profile never opened.
- **Gate:** `git status` shows no capture-only edit; `bun run check:plans` exits 0 after staging.

## Delivery

- Branch `worktree-mainnet-seed-1`, from the `dev` head of the arc's start; merge `origin/dev` before the final gates.
- `gh pr create --draft --base dev`, title `feat(network): seed aztec mainnet beside testnet, held for the live pair` (72 characters), no label. Never marked ready by this lane; never merged.
- Body: what and why; gates with outcomes; the touched e2e files' per-browser wall-clock, and each lane's suite wall-clock from `dev`'s last CI run and this PR's; screenshots; OA-1's before/after; that `network/update-in-place.test.ts` is changed but not runnable on this line; `Closes #80`. **Before merge (owner and orchestrator):** `bun run --cwd apps/extension check:seeds` green, then the provenance rewritten to that read; a timed full backup export, on each browser, on a profile that never opened Mainnet, against the live node; #1107's canaries (link); OA-1..OA-6 answered and applied; the endpoint (keyless dRPC, or a keyed one replaced on the branch); `isPrimaryActive` (a flip needs the Terms change above); the regime binding (Security); #893's banner reconciled if it lands first.

## Post-implementation

Steps 2-4 of `implementations-plan/README.md` § Post-implementation standard at `dda72e321`, single-arc placement, `code_review: off`:
- Codex: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; the diff from the arc's base with the endpoint file excluded (Security); hard stop at three rounds. One Opus `general-purpose` review beside round 1.
- The full local gates on the final head, push, the draft PR, `gh pr checks <n> --watch` once. Close-out (Outcome, `git mv` into `archive/`) are the PR's final commits; the Outcome's status reads "draft, held for the live pair".
- Teardown (step 5) after the merge, by the session that notices it.

## Audit verdicts

- **Round 1, Codex** (gpt-6.1-sol, high, `01a16d37`): conditional approve, four P2, all accepted: Phase 1 cannot pass alone (F8; the `chainId: 42` Mainnet tests); the Stay helper must be conditional (D5); the export banner's count is a visible consequence (OA-5); #808 is the owner's to re-dispose (D7). Looks fine: D1, D2's home and generality, D3, D6's cost trace, no stored-shape change.
- **Round 1, Opus** (Plan leg): conditional approve. Accepted: the hunk-header leak (Security); Phase 1 (as Codex); D9 (later withdrawn, round 2); the restore fact (F6); nightly pins and "records" (D2); the script shape (D2); the fee picker rows (UI impact); D1's scope. Partly accepted: running the full suites at base and head on both browsers locally; replaced by CI's lane timings (CI runs every lane on the draft) and the touched files' local timings.
- **Round 2, Codex** (resume of `01a16d37`): conditional approve, three P2, all accepted: D9 drops a dApp's registrations on an accountless chain (`discovery-flow.ts:503`, `execution/service.ts:1230-1242`), so D9 is withdrawn for a known limit and D6 returns to a declared refusal; a bare XOR passes a non-u32 rollup alias (`chain-id.ts:5`), so D2 reuses `assertLiveChainIdentity`; D9's harness gap (`restore-surface.pins.test.ts:56`) is moot with D9 gone. Also taken: check only the exact added endpoint line. Verified: the hunk-header fix, the arm and Stay fixes, OA-5, OA-6, the phase order.
- **Round 3, Codex** (resume): **approve**, no new material finding. Verified D9's withdrawal and the known limit's framing, D6's declared refusal (`account-state/service.ts:254` reads a refused status as Inactive and builds no PXE), D2's reuse and its tests, the count-only endpoint checks, every phase gate. Noted: a scrubbed error keeps a URL's scheme and host, never its path.
- **Fix round 1, Codex** (gpt-6.1-sol, high, `01a16d97`): conditional approve, two P2. Accepted: `check:seeds` printed a node's error text, which can echo a path or credential; it now prints fixed lines, with a redaction test. Settled as a known limit with Codex (round 2): an imported account on a custom network sharing a seeded chain id is refused on restore, a class Testnet already had (#1116).
- **Fix round 1, Opus** (general-purpose): no P0-P2; four P3, all taken: `seedStaleMainnet`'s doc and a guard; an assertion that the arrival never reaches the Mainnet node, since its refusal is global; OA-7 (a duplicate "Mainnet" name); `legal/README.md` under OA-1.
- **Fix round 2, Codex** (resume): **approve**, no new material finding.
- **Owner-answers batch, Codex** (gpt-6.1-sol, high, `01a16e40`): **approve**, no material finding: the new copy is true of the seed, 1.2.5 is correctly a patch (1.2.4 archived byte-identical), the `getChainName` case and its fallback use are right, and the ledger quotes match the asks.
- **Store gate (D18), Codex** (gpt-6.1-sol, high, `01a17032`): **approve**, no material finding: the gate covers the one production `openChainStore` caller, on init and rebind alike; the Testnet reset purges without booting the old runtime; exports skip a mismatched network; both e2e stubs keyed on the RPC sequence stay compatible; the error carries numbers only.
- **The flip (D19-D23), design consult, Codex** (gpt-6.1-sol, high, `01a17058`): design B, a stand-in per seeded remote node; risks ranked, all addressed in [lessons/phase-2.md](lessons/phase-2.md).
- **The flip, fix round 1, Codex** (gpt-6.1-sol, high, `01a17094`): reject, 1 P1, 3 P2, 1 P3. Taken: two stale-network specs on Testnet, the fresh-profile check held before registration with a cold start and a post-upgrade case, About's "- Testnet" dropped. Not taken: the get-gas link (OA-2, D11).
- **The flip, fix round 2, Codex** (resume): reject, 1 P1, taken: the chaos reset spec gives Testnet its accounts first.
- **The flip, fix round 3, Codex** (resume): **approve**, no P0-P2 left.

## Seeds

- `/goal` Phases 1-4 ✓ in implementations-plan/mainnet-seed-1/plan.md with each gate's output in the transcript; Codex loop converged; draft PR `feat(network): seed aztec mainnet beside testnet, held for the live pair` open against `dev`, never ready, never merged.
- `/loop` Read implementations-plan/mainnet-seed-1/plan.md and STATUS.md; run the next unticked phase to its gate; stop after three failures on one step; once Phase 4 is ✓, run Post-implementation; never mark the PR ready.
