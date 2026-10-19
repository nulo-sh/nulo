---
plan: mainnet-arrival-1
tier: mid
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 2f591ddd
trunk: dev
issues: "#875 (A2 Closes; A1 Refs)"
post_implementation_hardening: not scheduled
---

# mainnet-arrival-1: a default network a later build adds reaches every existing profile

Two arcs, each one PR against `dev`, not stacked (the orchestrator's D-orch-1). **A1** adds every default network a profile was never offered when the profile opens, and records the offer (phase 1); no default is new in this build, so nothing a person sees changes. **A2** builds the arrival flow the owner picks (phase 2) and proves a real in-place update on Chrome and Firefox (phase 3), then closes the plan. Phase 4 is the freeze rule for the Mainnet seed itself (#80, out of scope). Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). `X` = `apps/extension/src`, `S` = `X/wallet/services`.

## The owner's answer (decision page 62, P62-01 follow-up, 2026-10-19)

> Okei, I definitely want us to add a missing default network to existing profiles, which includes everything you've mentioned: tests, new user-flow, and artifacts / claude-designs showcasing maybe 3 or 4 ways of the flow. The "reset" flow that we did for Testnet was pretty awesome, so maybe we can do something similar. Though it will only happen once or twice for users at most in their life. It's still worht investing a lot of testing, and thought into it.

## #875, the lane brief, and what did not hold

- **#875 demonstrated** at `2f591ddd`: `getOrInitNetworks` returns the stored rows whenever the profile has one (`S/network/service.ts:266-267`), and so does `seedDefaultsForProfile` (`:314-315`).
- **"The row shape does not change, so it is not a storage migration"** (#875) holds for the rows. The backfill still needs one new per-profile key, a new stored shape under #865's guard (§ The record and #865).
- **"Arc 1 = phases 1 and 3"** (lane brief): phase 3 needs migration-rule-1's update harness, which is a plan on its branch, not code on `dev` (its A3 waits for its A1). As the brief says, phase 3 sequences after it: it moves to A2, whose other dependency (the owner's pick) its assertions need anyway.
- **"Race-safe with unlock"** (lane brief) found one race the brief does not name: unlock drains queued dApp discoveries in the worker (`S/wallet-sdk/background.ts:779-788`) before the popup's bootstrap reaches `getOrInitNetworks`, so a dApp waiting on the new chain would be told the wallet has no such network. Phase 1 covers it (D5).

## Outcome & Quality Bar

- **For whom:** a person whose wallet updates itself to the build that adds Mainnet, with a profile they set up months ago; the contributor who adds the next default.
- **Excellent:** (1) after the update, the profile lists the new default the first time it opens, and every network the person deleted or edited stays as they left it; (2) nothing else moves: accounts, their addresses, the active network (until the owner's pick says otherwise), the per-chain classification; (3) a dApp asking for the new chain at the unlock that follows the update is served, not refused; (4) adding the next default of an unused kind (`mainnet`) is one entry in `DEFAULT_SEEDS`, with no record or constant to edit; a default of a new kind also extends `ChainKind`, a schema change under #865.
- **Good enough:** a profile restored from a backup gets every default of the restoring build, as today (backups carry no network rows); a crash between a fresh profile's first and second seed write leaves the second unseeded, as today.

## UI impact

- **A1: none.** This build's `DEFAULT_SEEDS` (Testnet, Local Network) equals the kinds every earlier build seeded, so no profile is ever missing an offered seed: nothing is added, and `servesChain` answers as today. A test pins both with the real seeds (Phase 1 test 17).
- **A2: the arrival surface the owner picks** (OA-1). Nothing in A2 is built before the pick is quoted in its PR; the pick's own `UI impact` line is added to this plan then.

## Architecture & Implementation

### Phase 1 (A1) · offer every default a profile never had

- **Record** `S/network/seed-offers.ts` (new): key `nulo:core:network-seeded@<profileId>` (the token seeder's `nulo:core:token-seeded@` naming), value `{ offered: ChainKind[] }` as a JSON string, read through `decodeRow` with the zod codec `z.object({ offered: z.array(ChainKindSchema) })` (D13). An object, not a bare array, so a later field is additive (D2). A read has three outcomes (D9): `absent` (no key); `read` (its kinds); `unreadable` (bad JSON or a failed codec), for which the pass adds nothing, writes nothing and keeps the bytes, and `servesChain` predicts nothing. A storage read that rejects propagates: the bootstrap fails and retries, as on any storage failure.
- **Seed identity is `kind`** (D3). The classifier, the reset and `SEED_L1_BY_KIND` already key a seed by kind; a Testnet reset moves the row's chainId in place (`:1039-1066`), so a chainId-keyed record would read the moved Testnet seed as new and add a second Testnet row. A test pins that `DEFAULT_SEEDS` kinds, and their chainIds, are unique.
- **Policy**, a pure function in the same module:

  ```ts
  export const KINDS_SEEDED_BEFORE_RECORD: readonly ChainKind[] = ["testnet", "local"]
  export type SeedOffersRead = { state: "absent" } | { state: "read"; offered: ChainKind[] } | { state: "unreadable" }
  export function seedsToOffer(seeds: readonly DefaultSeed[], record: SeedOffersRead, rows: { kind?: ChainKind; chainId: number }[]):
    { add: DefaultSeed[]; offered: ChainKind[] } | null   // null: unreadable, leave everything
  ```

  - **Offered so far**: an empty profile was offered nothing, whatever a record says (the wallet needs a network; today's invariant). Otherwise the record's kinds, or `KINDS_SEEDED_BEFORE_RECORD` when it is absent: every supported build before the record (0.31.0 to the build A1 lands in) seeded exactly Testnet and Local Network (D4). The constant is never edited, and A1 lands before any build adds a default (Phase 4). A pin test hard-codes it with that reason (the address-freeze pattern), so the Mainnet seed's PR cannot "fix" a red test by adding `mainnet` to it, which would withhold Mainnet from every profile made before the record.
  - **`add`**: seeds whose kind was not offered and that no row holds, by kind or by chainId (a custom row a person added on the new seed's chain keeps its chain; one row per chain is what keeps a moved chain classifiable, `classify.ts:38`).
  - **`offered`** (what to record): the offered-so-far kinds plus every not-offered seed a row already holds. The caller adds the kinds it actually wrote.
- **One pass, both entry points.** `getOrInitNetworks` and `seedDefaultsForProfile` call one locked helper, `offerDefaultsLocked(profileId, rows, fence, deletion)`, which replaces their early return and their seed loop. The caller reads the rows once, under the lock, so it knows a fresh profile and sets `seedingProfiles` before the first write; the helper returns `{ rows, added, primaryId }`:
  1. read the record; `seedsToOffer`;
  2. for each seed in `add`: skip it unrecorded when `isChainQuarantined(profileId, seed.chainId)` (as `addNetwork` refuses, `:527`; the next open retries); else `seedOneNetworkLocked` (unchanged: deletion-fenced on both sides, compensating), a per-seed catch logging as today;
  3. re-assert the fence; write the record, sorted and deduplicated, only when it changes, fenced and compensated like a row; rows first, record second, so a worker killed between the two re-finds the row by kind and records it (D6);
  4. return the profile's rows, old and added.
  - `getOrInitNetworks` keeps `seedingProfiles` and `activateSeededLocked` for a fresh profile only; `seedDefaultsForProfile` keeps its restore epochs and writes its target's active pointer only when it seeded a fresh profile. **No pass ever writes the active pointer of a profile that had rows** (A2's pick may change that).
  - The added rows are not emitted (`onNetworkAdded` has no listener outside the client; fresh seeding emits none); the popup takes them from the return value.
- **`servesChain`** (D5): a chain is served when a live row holds it, when the profile is being freshly seeded (unchanged), or when `seedsToOffer` would add a seed on it now. It reads the record before the rows: the pass writes rows before the record, so a record that already names the kind is always read beside rows that hold its row. An empty profile with no record gets every seed chain from the same rule, so the `rows.length === 0` clause folds into it.
- **Purge**: `purgeForProfile` removes the record beside `activeKey` (`:1175`). Not in any backup slice: a restore is a fresh profile.
- **Logging**: no new line beyond the existing per-seed `logError`; a record that does not read logs `logDebug("network seed record unreadable")` with no value.

### The record and #865

The key is a new `chrome.storage.local` root. migration-rule-1's A1 (its registry `X/wallet/storage/stored-shapes.ts` and the scan over `nulo:` literals) is not on `dev`. Whichever lands second registers it: if A1 of this lane lands first, migration-rule-1's scan finds the literal and its registry takes the entry (`read: "codec"`, `encoding: "json"`, the schema exported from `seed-offers.ts`); the record is a raw repository on `decodeRow`, as their plan registers the others (D13). If theirs lands first, A1 here adds the entry, adds a `full` and a `minimal` golden, and runs `bun run baseline:storage` (before the freeze: the one stamp is rewritten; after it: `-- --additive "new per-profile key; no earlier rows"`). A2's possible new field is an optional one: additive after the freeze. Nothing here bypasses the guard; the record is never migrated for pre-1.0.0 history (P62-02).

### Phase 2 (A2) · the arrival flow, after the owner's pick (OA-1)

Built only once the pick is quoted. Whatever the pick, the shape is fixed now:
- **State.** If the pick shows anything once, the pass records an optional `announce: ChainKind[]` in the same record write as the offer: the kinds it added to a profile that had rows, plus any not-offered kind a row of that kind already holds (only a seeding pass writes a seeded kind, so that row is an interrupted pass's; a custom row on the seed's chain is the person's and is never announced). A fresh or restored profile announces nothing, with one exception OA-1 discloses: a new profile whose first seeding the worker kills between two writes reopens as a profile with rows and no record, and announces once. Whether delivery is at most once (taken when read, like `takeResetNotice`) or kept until the person answers is OA-1's; the second adds an acknowledgment RPC. "Listed with nothing moving" needs no state.
- **Surface.** A pure `arrivalView(...)` beside `takeoverView` (`X/popup/stale-takeover.ts:34`) decides it, and `X/popup/app.vue` mounts it. It returns null on `windows-*`, pre-session and `YIELDING` routes, while a migration or integrity barrier shows, while the reset takeover shows, and while the Terms sheet shows (OA-1's precedence; recommended: arrival last). A full-screen pick extracts the takeover's private layout (`Content`, `SCREENS`, `StaleNetworkTakeover.vue:51-153`) into a shared component rather than copying it.
- **Switch.** A pick that moves the active network does it through `setActiveNetwork` from the popup when the person sees the arrival, never from the worker's pass, so the network lock order and the takeover's rules stay as they are.

### Phase 3 (A2) · the real update, Chrome and Firefox

- **Harness:** migration-rule-1's `tests/e2e/fixtures/update/` (`inPlaceUpdate({ from, to, populate, verify })`), once on `dev`; never a second one.
- **The extra seed, e2e builds only:** `VITE_NULO_E2E_EXTRA_SEED` with `VITE_NULO_E2E_EXTRA_SEED_CONFIRM`, armed only when both are set and throwing when one is (`X/e2e/config.ts`'s token-seeds rule: a seed is offered to a person, so it is not inert); `seeds.ts` spreads `X/e2e/extra-seed.ts` (kind `mainnet`, L1 1, a test chainId, a closed loopback endpoint) behind it; the build stamp `NULO_E2E_EXTRA_SEED_BUILD_STAMP` goes on `_build-extension.yml`'s absent-marker list. Only the update candidate's build arms it, and checks its stamp there; `agent.sh` clears both variables, since a third default in the shared network-suite build would change every fresh profile and `seedStaleMainnet`'s verdicts (`tests/e2e/helpers/stale-network.ts:257`).
- **When it runs:** as the harness decides (migration-rule-1's D12: opt-in, by hand before each promote), plus A2's gate; the release skill's promote step for the build that adds Mainnet names it.
- **From / to:** `from` is the published v1.0.0 zip, its digest pinned in the harness as 0.31.0's is (a profile opened under 1.0.0 carries the record if A1 is in 1.0.0; the no-record path is unit-tested either way); population follows the harness's mechanism, live where both Aztec lines sync with the run's sandbox, else its recorded replay. `to` is the A2 head built armed by migration-rule-1's `build-update-candidate.sh`, whose version suffix makes `__VERSION__` differ from `from`'s, so the integrity coordinator re-derives every account as on a real update (`S/account-integrity/coordinator.ts:119-124`). The gate names both inputs (`NULO_E2E_UPDATE_FROM`, `NULO_E2E_UPDATE_TO`).
- **Scenario** `tests/e2e/network/default-network-arrival-update.test.ts`, both browsers, two cases. (a) Populate in `from`: a password profile, two derived accounts and an imported one on Local Network (active), a contact, a custom network, Testnet deleted. Update. Verify: the extra default listed (`network-row[data-network-name]`), Testnet still absent, the active network as the pick defines, every account row's address unchanged and shown, no `migration-*` or `account-integrity-blocked` testid, the record written. (b) Keep Testnet, and before the update plant a stale Testnet row (`tests/e2e/helpers/stale-network.ts`) and an older accepted Terms version: the takeover, the Terms sheet and the arrival never show two at once (sampled after every step) and appear in OA-1's order.
- **Failure mode, cheaper layers, runtime.** The released build's own rows, read by the new build through the real boot (migration gate, integrity coordinator, classifier, bootstrap, takeover arbitration) after a real in-place update. A composition test cannot derive addresses (bb, `apps/extension/tests/COMPOSITION-TESTS.md` D3/D6) or run the popup shell's arbitration; a smoke e2e that writes rows by hand never runs the old build. Estimate 4 min Chrome, 6 min Firefox; measured in A2's gate.

### Phase 4 · the freeze rule for the Mainnet seed (#80)

The Mainnet seed itself lands only on a build whose Aztec 6.0.0 execution canaries (`tests/e2e/network/frozen-account-canary.test.ts`, `passkey-execution-canary.test.ts`) are green prover-on on Chrome and Firefox: a Mainnet-serving build binds the account-address regime for this extension's life (CLAUDE.md § Account-address freeze). A second order holds too: A1 lands on `dev` before any build adds a default, since `KINDS_SEEDED_BEFORE_RECORD` is only true of builds that seeded Testnet and Local Network. A1's delivery comments both on #80; nothing in this lane adds the seed.

### Trade-offs and alternatives not taken

- **Outline B, tombstones** (the token seeder's `outcome: "deleted"`): `deleteNetwork` writes a tombstone; the pass adds every seed with no row and no tombstone. Rejected: every deletion made before the tombstone ships is invisible, so each 1.0.0 profile that deleted Local Network gets it back with Mainnet; it also adds a write to `deleteNetwork` and the reset path.
- **A seed-set version stamp** per profile (`since: "1.x"` on each seed): the same one value, coupled to version ordering and dev builds' versions. Rejected.
- **Backfill in the worker on `onActiveProfileChanged`**: `EventHandler.invoke` drops async handlers' promises, so it still races the discovery drain on the same event; `servesChain` closes that race without a second trigger (D5).
- **An empty record written before a fresh profile's first row** (drops `seedingProfiles`, closes the crash gap above): rejected as a change to working fresh-profile code no finding needs.

## Decision ledger

| # | Question | Decision | Codex r1 | Opus r1 |
|---|---|---|---|---|
| D1 | Arcs | A1 = phase 1 now; A2 = phases 2 + 3 after the pick and migration-rule-1's A3 | right, harness absent | right |
| D2 | Record form | per-profile JSON object `{ offered }`, zod codec (store: D13) | fits | fits |
| D3 | Seed identity | `kind` (stable across a reset), not chainId; kinds and chainIds pinned unique | survives reset | same; pin chainIds too |
| D4 | Profiles with rows and no record | offered = `KINDS_SEEDED_BEFORE_RECORD`, pinned by a test; A1 before any added default | needs a release cutoff | I1 holds; pin the constant |
| D5 | Unlock drain race | `servesChain` serves a seed chain `seedsToOffer` would add; record read before rows | real; fix read order | real; same read order |
| D6 | Write order | rows, then the record; a row found by kind or chain is recorded without a write | crash-safe | crash-safe |
| D7 | Arrival state | A2: optional `announce` in the offer's write, also for an interrupted pass's row; delivery semantics in OA-1 | interruption loses it | same |
| D8 | Update test | A2, on the harness, `from` = pinned v1.0.0, `to` = the candidate build (version changed), extra seed armed there only | reuse the candidate builder | not in `agent.sh`; no plan-base `from` |
| D9 | Unreadable record | adds nothing, keeps the bytes; a storage failure propagates (was: read as absent) | absent ≠ unreadable | — |
| D11 | Final pass r1 (Codex conditional) | test 15 parks the reader between its reads; rename proven by mutation only; the interrupted-new-profile arrival disclosed in OA-1 | accepted | — |
| D13 | Store (implementation) | raw `storage.local` read through `decodeRow` (`X/wallet/utils/raw-row.ts`), the fail-closed repositories' absent/corrupt/valid read, instead of `ValueStorage`, whose `get` throws alike on a storage failure and a bad value (D9 needs the two apart); migration-rule-1 registers such repositories as `read: "codec"`, and its `new ValueStorage(` rule does not apply | deviation, tree wins | — |
| D12 | Final pass r2 (Codex, resumed) | **approve**: "All three conditions are addressed … A1 can start." | approve | — |
| D10 | Red-on-base proof | success controls red on the base; never-happens checks red under named mutations (was: every test red on the base) | — | base cannot red them |

## Security & Adversarial Considerations

- **Threat model.** Stored rows and records are hostile input at the storage boundary. A record naming kinds the profile never saw can only withhold a default (the person can add the network by hand); one that does not parse withholds every new default and is kept as it is, so corruption never re-adds a network the person deleted (D9), and no record can add a network the build does not seed. An attacker who can write `chrome.storage.local` already owns the wallet; nothing here widens that.
- **Seed rows are build constants.** The pass writes only `DEFAULT_SEEDS` entries through the existing `_buildNetwork` (chain 0 only on a loopback L1 31337) and `seedOneNetworkLocked`; `assertCanonicalStoredL1` keeps validating a seeded row against `SEED_L1_BY_KIND`. No endpoint comes from storage, a backup or a dApp.
- **dApp surface.** D5 widens what `servesChain` answers only for chains of this build's seeds that the profile was never offered: the same rule an empty profile has today. A dApp cannot plant a seed or a record; `servesLiveChain` still refuses a quarantined chain.
- **Classification and the freeze.** The pass never adds a second row on a chain (one row per chain keeps a moved chain classifiable) and never touches accounts or the active pointer, so the integrity coordinator's verdict is the same before and after it (Phase 1 test 16).
- **Test-only code.** A2's extra seed is double opt-in, dead-code-eliminated, and refused in every release build by the absent-marker grep. No new dependency; no gate loosened.

## Assumptions

- **Facts.** Recon's table (file:line in [recon.md](recon.md)); `decodeRow` reports a stored value that does not decode as `corrupt`, never `absent` (`X/wallet/utils/raw-row.ts`); vitest runs a file's tests in order, so a `describe` that appends a seed to `DEFAULT_SEEDS` and removes it in `afterEach` cannot reach the file's "Testnet and Local Network only" pin.
- **Inferences.** (I1) Every pre-record build seeded Testnet and Local Network (checked at `v0.31.0` and `dev`; 1.0.0 is cut from `dev`). (I2) The 6.0.0 bump moves Testnet's chainId (migration-rule-1's I4), which D3 survives by design. (I3) migration-rule-1's A3 lands the harness with the `inPlaceUpdate` shape and the `NULO_E2E_UPDATE_FROM`/`_TO` opt-in its plan names; if it changes, A2 adapts to what lands.
- **Asks** (working assumption in brackets): OA-1, the arrival flow, its precedence, its delivery, and a hand-added Mainnet [A1 ships no visible change; A2 waits for the pick].

## Phases and gates

Every gate also runs `bun run lint` and `bun run typecheck:all` (exit 0), and `bun run check:plans` after staging plan files. Host rule: build and e2e only at load1 < 150.

### Phase 1 (A1) · the record, the pass, `servesChain`, the purge
- Steps: (1) `seed-offers.ts` with `seedsToOffer` and its tests; (2) `offerDefaultsLocked` and both entry points; (3) `servesChain`; (4) the purge; (5) a comment on #80 (Phase 4).
- Tests, the smallest set; each never-happens check is paired with a success control.
  - `S/network/seed-offers.test.ts` (pure): (1) an empty profile gets every seed whatever the record says; (2) rows and no record: the baseline kinds are not added, a new kind is; (3) a row of the kind on another chainId (a moved Testnet) is recorded, not added; (4) a custom row on the new seed's chainId is recorded, not added; (5) a recorded kind with no row (deleted) is not added; (6) an unreadable record adds and records nothing; (7) pins: `KINDS_SEEDED_BEFORE_RECORD` equals `["local", "testnet"]`, and `DEFAULT_SEEDS` kinds and chainIds are unique.
  - `S/network/service.test.ts`, a new `describe` that appends an extra `mainnet` seed to `DEFAULT_SEEDS` in `beforeEach` and removes it in `afterEach`: (8) an existing profile opens: the extra row is added with its seed's identity, every old row and the active pointer are byte-identical, the record holds three kinds, and a second open writes nothing (`recordWrites`); (9) the extra default deleted stays deleted, and renamed keeps its name with no twin; (10) two concurrent opens add one row; (11) a deletion mid-pass leaves no row and no record; (12) a quarantined seed chain is skipped and unrecorded, then added once the journal is gone; (13) an unreadable record keeps its bytes and adds nothing, and a rejecting storage read rejects the open; (14) `purgeForProfile` removes the record; the restore entry point records every kind for a fresh profile; (15) `servesChain` is true for the extra chain before the open, and false once it is recorded and deleted; and a `servesChain` parked between its two storage reads while a whole pass commits (the row, then the record) still answers true (D5's interleaving: with the reads reversed it answers false); (16) `classifyChains` over the rows before and after the pass gives the same entries for a profile with a stale Testnet row and moved accounts.
  - `S/network/service.test.ts`, outside that `describe`: (17) with the real `DEFAULT_SEEDS`, an existing profile that deleted Local Network gets no row and `servesChain(…, 0)` stays false; its message says that adding a default edits this test, never `KINDS_SEEDED_BEFORE_RECORD`.
- Gate: `cd apps/extension && bun --bun vitest run src/wallet/services/network src/wallet/services/stale-network` exit 0; then `bun run test` and `bun run test:all` exit 0. Proof of the tests (D10), recorded in `lessons/phase-1.md`: the success controls 8, 12's second half and 15's first half fail against the base source, each after reaching the behaviour it checks; each never-happens check fails under a named mutation of the new code (baseline emptied, identity by chainId, no hold by chainId, an existing seed row overwritten, unreadable read as absent, rows read before the record, record written before rows); a check the base already passes (9's rename) counts only under its mutation. Smoke e2e `cd apps/extension && bun run test:e2e -- tests/e2e/settings-crud.test.ts tests/e2e/endpoints.test.ts tests/e2e/sw-restart-network.test.ts tests/e2e/stale-network.test.ts --retry=0` green; network e2e `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/networks.test.ts tests/e2e/network/connect-unserved-chain.test.ts` green (Chrome; no fixture, focus, window or WebAuthn change, so no Firefox twin).

### Phase 2 (A2) · the arrival flow
- Starts when the orchestrator quotes OA-1's pick. Steps and tests follow the pick; at least `arrivalView`'s precedence table (unit, every surface pair), the take-once RPC (unit), and the pick's component tests (≥ 10 cases for an L3 composite).
- Gate: `bun run test`, `bun run test:all` exit 0; screenshots at 400×600 in both themes attached to the PR; `bun run test:e2e -- tests/e2e/stale-network.test.ts tests/e2e/legal-acceptance.test.ts --retry=0` and their Firefox twins green.

### Phase 3 (A2) · the update e2e
- Starts when migration-rule-1's A3 is on `dev`. Steps: (1) the armed extra seed, its stamp, grep and runner wiring, with `bun run test:ci-gating`; (2) the scenario; (3) fixes at their cause.
- Gate: `NULO_E2E_RETRY=0 NULO_E2E_UPDATE_FROM=v1.0.0 NULO_E2E_UPDATE_TO=<the candidate's dist for the browser> NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/default-network-arrival-update.test.ts` green on Chrome, then with `NULO_E2E_BROWSER=firefox` and the Firefox candidate (or the harness's replay command, if population needs it); without the opt-in the file reports itself skipped; per-browser wall-clock recorded; a release build (`bun run build`) greps clean of the stamp; `bun run test:ci-gating` exit 0.

## Delivery

- One PR per arc against `dev`, branch `mainnet-arrival-1-a<N>` off `origin/dev`, no stack (D-orch-1); opened ready for review only after the arc's gates pass and its Codex loop converges; no label at creation (add `e2e:extension-network` only if the path filter skips a suite the arc needs).
  - A1: `feat(network): offer every default network a profile was never offered when it opens` (Refs #875).
  - A2: `feat(network): the arrival of a new default network on existing profiles` (Closes #875), quoting OA-1's pick by id and text; its last commits are the close-out.
- Parallelism: A2 waits for A1 on `dev`, the pick and migration-rule-1's A3; its two phases touch disjoint files and may be built in either order.

## Post-implementation

The execution contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `2f591ddd`. Specific to this plan:
- **While implementing:** comments to CLAUDE.md § Code-comment style; attempts in `lessons/phase-N.md`; `agent-worktree status mainnet-arrival-1 "<arc> phase N green: <next>"` at each gate; three failures on one step ends the arc as `ARC_FAILED`.
- **Review loop, per arc:** `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` over `git diff origin/dev...HEAD`, with this plan, the ledger, the arc map ("arc N of 2: A1 the offer record and pass, A2 the arrival flow and the update e2e"), the adversarial ask and the standard's two rules verbatim; `resume-codex.sh` until a round has no new material finding, hard stop at three rounds. One Opus review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1. Not stacked, so no cross-arc pass; A2's prompt also asks for drift from A1.
- **Delivery:** as above, then `gh pr checks <n> --watch` once; a known flake one rerun, breakage a fix and the loop again. Never merge.
- **Close-out (A2's last commits):** merge `origin/dev`, read `index.md` and `lessons.md`; the Outcome block; lessons promoted (seed identity is the kind; a default added later needs the offer record); open items as issues; `STATUS.md` deleted; `git mv` into `archive/` in its own commit, the index line moved; `check:plans` green.
- **Teardown after the merge:** once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/mainnet-arrival-1/plan.md` succeeds, `agent-worktree done mainnet-arrival-1 --merged`; relay a refusal.

## Seeds

```
/goal Both arcs of implementations-plan/mainnet-arrival-1/plan.md shipped as ready PRs against dev: each phase marked ✓ with its gate's output in the transcript, each arc's Codex loop converged (a resumed pass reporting no new material finding, quoted), `bun run test` and `bun run lint` exit 0 on each arc head, A2's close-out commit (`git show --stat`) archiving the plan.
```

```
/loop 15m Drive implementations-plan/mainnet-arrival-1 forward from plan.md and STATUS.md (authoritative, not the chat). Next pending phase of the current arc; fast layers after each edit; the phase gate as written; Codex at gpt-6.1-sol high for any decision; arc boundary = the Codex loop then the PR. A2 starts only with OA-1's pick quoted and migration-rule-1's harness on dev. Never merge, never touch a sibling worktree, never yield with a run in flight. When A2's close-out is on dev, run the teardown and stop.
```
