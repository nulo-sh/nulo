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
issues: "#875 (A3 Closes; A1, A2 Refs)"
post_implementation_hardening: not scheduled
---

# mainnet-arrival-1: a default network a later build adds reaches every existing profile

Three arcs, each one PR against `dev`, not stacked (the orchestrator's D-orch-1, D-orch-2). **A1** (#882, merged) adds every default network a profile was never offered when the profile opens, and records the offer (phase 1); no default is new in this build, so nothing a person sees changes. **A2** builds the arrival the owner picked (phase 2). **A3** proves a real in-place update on Chrome and Firefox (phase 3) once migration-rule-1's update harness is on `dev`, then closes the plan. Phase 4 is the freeze rule for the Mainnet seed itself (#80, out of scope). Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). `X` = `apps/extension/src`, `S` = `X/wallet/services`.

## The owner's answer (decision page 62, P62-01 follow-up, 2026-10-19)

> Okei, I definitely want us to add a missing default network to existing profiles, which includes everything you've mentioned: tests, new user-flow, and artifacts / claude-designs showcasing maybe 3 or 4 ways of the flow. The "reset" flow that we did for Testnet was pretty awesome, so maybe we can do something similar. Though it will only happen once or twice for users at most in their life. It's still worht investing a lot of testing, and thought into it.

## The owner's pick on OA-1 (decision page 66, P66-01, 2026-10-19)

> **D**, "a one-time full-screen arrival in the style of the Testnet reset takeover", with this note: "though I have conflicts with "create your first" since it's virtually created. I'm afraid the user will think it will submit a transaction."

So no copy on the arrival may read as if pressing a button creates something on chain or sends a transaction: the network is already there, the person only chooses whether to switch to it. Where the owner said nothing, the plan's recommendation stands, each the orchestrator's call on the owner's D, 2026-10-19: the arrival waits behind the barriers, the reset takeover and the Terms sheet; it shows until answered; a hand-added Mainnet gets no arrival; the interrupted-birth case is accepted (OA-1).

## #875, the lane brief, and what did not hold

- **#875 demonstrated** at `2f591ddd`: `getOrInitNetworks` returns the stored rows whenever the profile has one (`S/network/service.ts:266-267`), and so does `seedDefaultsForProfile` (`:314-315`).
- **"The row shape does not change, so it is not a storage migration"** (#875) holds for the rows. The backfill still needs one new per-profile key, a new stored shape under #865's guard (§ The record and #865).
- **"Arc 1 = phases 1 and 3"** (lane brief): phase 3 needs migration-rule-1's update harness, which is a plan on its branch, not code on `dev` (its A3 waits for its A1). As the brief says, phase 3 sequences after it: it moves to A3 (D-orch-2).
- **"Race-safe with unlock"** (lane brief) found one race the brief does not name: unlock drains queued dApp discoveries in the worker (`S/wallet-sdk/background.ts:779-788`) before the popup's bootstrap reaches `getOrInitNetworks`, so a dApp waiting on the new chain would be told the wallet has no such network. Phase 1 covers it (D5).

## Outcome & Quality Bar

- **For whom:** a person whose wallet updates itself to the build that adds Mainnet, with a profile they set up months ago; the contributor who adds the next default.
- **Excellent:** (1) after the update, the profile lists the new default the first time it opens, and every network the person deleted or edited stays as they left it; (2) nothing else moves: accounts, their addresses, the active network (until the owner's pick says otherwise), the per-chain classification; (3) a dApp asking for the new chain at the unlock that follows the update is served, not refused; (4) adding the next default of an unused kind (`mainnet`) is one entry in `DEFAULT_SEEDS`, with no record or constant to edit; a default of a new kind also extends `ChainKind`, a schema change under #865.
- **Good enough:** a profile restored from a backup gets every default of the restoring build, as today (backups carry no network rows); a crash between a fresh profile's first and second seed write leaves the second unseeded, as today.

## UI impact

- **A1: none.** This build's `DEFAULT_SEEDS` (Testnet, Local Network) equals the kinds every earlier build seeded, so no profile is ever missing an offered seed: nothing is added, and `servesChain` answers as today. A test pins both with the real seeds (Phase 1 test 17).
- **A2: the arrival** (P66-01, D). Before: an existing profile that gains a default sees nothing but a new row in Networks. After: once, until answered, a full screen replaces Home: the reset takeover's top bar (the active network's chip without its square, LOCK), an eyebrow, a title naming the new network, a body naming the one the person is on, a box of what switching does, and two buttons, switch to the new network or stay. Its words are OA-2, pictured in [screenshots/](screenshots/); the PR stays a draft until the owner signs them. No default is new in this build, so nobody sees it until the build that adds Mainnet.

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
  - `getOrInitNetworks` keeps `seedingProfiles` and `activateSeededLocked` for a fresh profile only; `seedDefaultsForProfile` keeps its restore epochs and writes its target's active pointer only when it seeded a fresh profile. **No pass ever writes the active pointer of a profile that had rows** (the owner's D keeps that: only the person's switch moves it).
  - The added rows are not emitted (`onNetworkAdded` has no listener outside the client; fresh seeding emits none); the popup takes them from the return value.
- **`servesChain`** (D5): a chain is served when a live row holds it, when the profile is being freshly seeded (unchanged), or when `seedsToOffer` would add a seed on it now. It reads the record before the rows: the pass writes rows before the record, so a record that already names the kind is always read beside rows that hold its row. An empty profile with no record gets every seed chain from the same rule, so the `rows.length === 0` clause folds into it.
- **Purge**: `purgeForProfile` removes the record beside `activeKey` (`:1175`). Not in any backup slice: a restore is a fresh profile.
- **Logging**: no new line beyond the existing per-seed `logError`; a record that does not read logs `logDebug("network seed record unreadable")` with no value.

### The record and #865

The key is a new `chrome.storage.local` root. When this was planned, migration-rule-1's A1 (its registry `X/wallet/storage/stored-shapes.ts` and the scan over `nulo:` literals) was not on `dev`; it landed as #890 with the entry, and A2's registration is D25. The rule was: whichever lands second registers it: if A1 of this lane lands first, migration-rule-1's scan finds the literal and its registry takes the entry (`read: "codec"`, `encoding: "json"`, the schema exported from `seed-offers.ts`); the record is a raw repository on `decodeRow`, as their plan registers the others (D13). If theirs lands first, A1 here adds the entry, adds a `full` and a `minimal` golden, and runs `bun run baseline:storage` (before the freeze: the one stamp is rewritten; after it: `-- --additive "new per-profile key; no earlier rows"`). A2's `announce` is an optional field: additive after the freeze. Nothing here bypasses the guard; the record is never migrated for pre-1.0.0 history (P62-02).

### Phase 2 (A2) · the arrival (the owner's D)

- **State (D16).** The record gains an optional `announce: ChainKind[]` (`seed-offers.ts`), written in the offer's own write: on a profile that had networks, the kinds the pass wrote plus any not-offered kind a row **of that kind** holds (only a seeding pass writes a seeded kind, so it is an interrupted pass's row; a hand-added network is always `custom`, `addNetwork` → `_buildNetwork(…, "custom")`, so a hand-added Mainnet never announces). A fresh or restored profile announces nothing. With nothing announced the stored bytes stay A1's `{"offered":[…]}`; A1's codec strips the field, so the change is additive.
- **RPCs (D17).** `getNetworkArrival()`: lock-free, the first announced kind (kind order) a row of the active profile holds, else null (also for a corrupt record). `answerNetworkArrival(networkId)`: under the network lock and the execution fence, drops the row's kind through `recordOffersLocked` (A1's fence and compensation); a kind not announced is a no-op.
- **Answer (D18).** Stay calls `answerNetworkArrival`. Switch calls only the guarded `activate`; `setActiveNetwork` answers the arrival of the network it activates when the stored pointer moves there from another live row, whichever screen made the switch (Settings → Networks too). Re-asserting the pointer at boot, or falling back from a missing one, answers nothing; an answer write that fails is logged and leaves the arrival.
- **Precedence (D19).** Pure `networkArrivalView` (`X/popup/network-arrival.ts`), beside `takeoverView`, which now exports its route predicates: null when locked, before a session, in a dApp window, on the takeover's yielding routes, while the takeover shows, while the Terms sheet shows **or has no verdict yet**, and while the arrived network is the active one. The sheet's `visibility` emit becomes immediate, synchronous and `undefined` until its first status read and after it unmounts. The barriers are not gated: they cover the whole popup at z 10000 and the arrival is used up only by a press, as the takeover already relies on.
- **Shell.** `useNetworkArrival` (C1) reads at every session open and active-network change, drops a read a newer one or a lock overtook and one for another profile, and owns Stay. `app.vue` renders `<StaleNetworkTakeover v-if>` / `<NetworkArrival v-else-if>` / `<Header v-else>` and hides the route under either.
- **Layout (D20).** The takeover's screen layout is the L3 composite `X/components/composite/TakeoverLayout.vue` (types in `takeover.ts`), its CSS moved verbatim; the takeover renders it with `testid-prefix="stale-network"`, so every testid is byte-identical (its 28 component tests pass unedited), and keeps its loading and progress screens. The arrival (`X/components/network-arrival/`) passes `network-arrival`, an unflagged chip and a `primary` eyebrow mark.
- **Accessibility, the panel's calls under the owner's 2026-10-19 delegation (D21).** No focus move on mount, as the takeover: the arrival appears right after an Enter (unlock, the Terms sheet's Continue), and a focused Switch would take that key's auto-repeat. Native buttons with the layout's 2 px accent ring on `:focus-visible`; the primary refuses a repeat or composing Enter; no document-level Enter; the lock button keeps its `aria-label`.
- **Copy.** `X/components/network-arrival/copy.ts`, variant A of OA-2; the component test writes it out as the normative copy.
- **Known limit #904.** A second open surface (popup beside the side panel) keeps an answered arrival until it reopens; a press there is harmless (the answer is idempotent, the switch lands on the same network). The guarded activation already accepts the same for cross-window switches (`X/utils/guarded-network-activation.ts`).
- **#865 (D25).** migration-rule-1's registry landed first (#890): `networkSeeded: rawRow(SEED_OFFERS_ROOT, SeedOffersSchema)` reads the schema `seed-offers.ts` exports, so `announce` needs no registry edit. Before the freeze `bun run baseline:storage` (no flag; `propose` ignores `--additive` while `pins.ts` is empty) rewrites stamp 0 with `announce` optional and `required` unchanged; the full golden carries `announce`, the minimal one keeps A1's `{"offered": []}`. After the freeze the same change would take `-- --additive`.

### Phase 3 (A3) · the real update, Chrome and Firefox

- **Harness:** migration-rule-1's `tests/e2e/fixtures/update/` (`inPlaceUpdate({ from, to, populate, verify })`), once on `dev`; never a second one.
- **The extra seed, e2e builds only:** `VITE_NULO_E2E_EXTRA_SEED` with `VITE_NULO_E2E_EXTRA_SEED_CONFIRM`, armed only when both are set and throwing when one is (`X/e2e/config.ts`'s token-seeds rule: a seed is offered to a person, so it is not inert); `seeds.ts` spreads `X/e2e/extra-seed.ts` (kind `mainnet`, L1 1, a test chainId, a closed loopback endpoint) behind it; the build stamp `NULO_E2E_EXTRA_SEED_BUILD_STAMP` goes on `_build-extension.yml`'s absent-marker list. Only the update candidate's build arms it, and checks its stamp there; `agent.sh` clears both variables, since a third default in the shared network-suite build would change every fresh profile and `seedStaleMainnet`'s verdicts (`tests/e2e/helpers/stale-network.ts:257`).
- **When it runs:** as the harness decides (migration-rule-1's D12: opt-in, by hand before each promote), plus A3's gate; the release skill's promote step for the build that adds Mainnet names it.
- **From / to:** `from` is the published v1.0.0 zip, its digest pinned in the harness as 0.31.0's is (a profile opened under 1.0.0 carries the record if A1 is in 1.0.0; the no-record path is unit-tested either way); population follows the harness's mechanism, live where both Aztec lines sync with the run's sandbox, else its recorded replay. `to` is the A3 head built armed by migration-rule-1's `build-update-candidate.sh`, whose version suffix makes `__VERSION__` differ from `from`'s, so the integrity coordinator re-derives every account as on a real update (`S/account-integrity/coordinator.ts:119-124`). The gate names both inputs (`NULO_E2E_UPDATE_FROM`, `NULO_E2E_UPDATE_TO`).
- **Scenario** `tests/e2e/network/default-network-arrival-update.test.ts`, both browsers, two cases. (a) Populate in `from`: a password profile, two derived accounts and an imported one on Local Network (active), a contact, a custom network, Testnet deleted. Update. Verify: the extra default listed (`network-row[data-network-name]`), Testnet still absent, the active network as the pick defines, every account row's address unchanged and shown, no `migration-*` or `account-integrity-blocked` testid, the record written. (b) Keep Testnet, and before the update plant a stale Testnet row (`tests/e2e/helpers/stale-network.ts`) and an older accepted Terms version: the takeover, the Terms sheet and the arrival never show two at once (sampled after every step) and appear in OA-1's order.
- **Failure mode, cheaper layers, runtime.** The released build's own rows, read by the new build through the real boot (migration gate, integrity coordinator, classifier, bootstrap, takeover arbitration) after a real in-place update. A composition test cannot derive addresses (bb, `apps/extension/tests/COMPOSITION-TESTS.md` D3/D6) or run the popup shell's arbitration; a smoke e2e that writes rows by hand never runs the old build. Estimate 4 min Chrome, 6 min Firefox; measured in A3's gate.

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
| D1 | Arcs | A1 = phase 1 now; A2 = phases 2 + 3 after the pick and migration-rule-1's A3 (superseded by D-orch-2) | right, harness absent | right |
| D2 | Record form | per-profile JSON object `{ offered }`, zod codec (store: D13) | fits | fits |
| D3 | Seed identity | `kind` (stable across a reset), not chainId; kinds and chainIds pinned unique | survives reset | same; pin chainIds too |
| D4 | Profiles with rows and no record | offered = `KINDS_SEEDED_BEFORE_RECORD`, pinned by a test; A1 before any added default | needs a release cutoff | I1 holds; pin the constant |
| D5 | Unlock drain race | `servesChain` serves a seed chain `seedsToOffer` would add; record read before rows | real; fix read order | real; same read order |
| D6 | Write order | rows, then the record; a row found by kind or chain is recorded without a write | crash-safe | crash-safe |
| D7 | Arrival state | A2: optional `announce` in the offer's write, also for an interrupted pass's row; delivery semantics in OA-1 | interruption loses it | same |
| D8 | Update test | A3, on the harness, `from` = pinned v1.0.0, `to` = the candidate build (version changed), extra seed armed there only | reuse the candidate builder | not in `agent.sh`; no plan-base `from` |
| D9 | Unreadable record | adds nothing, keeps the bytes; a storage failure propagates (was: read as absent) | absent ≠ unreadable | — |
| D11 | Final pass r1 (Codex conditional) | test 15 parks the reader between its reads; rename proven by mutation only; the interrupted-new-profile arrival disclosed in OA-1 | accepted | — |
| D13 | Store (implementation) | raw `storage.local` read through `decodeRow` (`X/wallet/utils/raw-row.ts`), the fail-closed repositories' absent/corrupt/valid read, instead of `ValueStorage`, whose `get` throws alike on a storage failure and a bad value (D9 needs the two apart); migration-rule-1 registers such repositories as `read: "codec"`, and its `new ValueStorage(` rule does not apply | deviation, tree wins | — |
| D12 | Final pass r2 (Codex, resumed) | **approve**: "All three conditions are addressed … A1 can start." | approve | — |
| D10 | Red-on-base proof | success controls red on the base; never-happens checks red under named mutations (was: every test red on the base) | — | base cannot red them |
| D14 | A1 review r1 | compensation restores the record a deletion overtook (was: removes it); restore-into-existing and new-profile concurrency tests; two comments trimmed | low (comments), fixed | 3 low, fixed |
| D15 | A1 review r2, r3 (Codex, resumed) | r2: the compensation comment claimed "never to none", false with no prior record; reworded. The write-back cannot outlive a completed deletion: the purge takes the same lock. r3: **clean** | r2 low, fixed; r3 clean | — |

| D-orch-2 | Sequencing (the orchestrator's call, 2026-10-19) | A2 = phase 2 only, one PR now, `Refs #875`; A3 = phase 3 after migration-rule-1's A3 lands its harness, with the close-out and `Closes #875` | — | — |
| D-orch-3 | D's details the owner left open (the orchestrator's call on the owner's D, 2026-10-19) | precedence after the barriers, the takeover and the Terms sheet; until answered; no arrival for a hand-added Mainnet; the interrupted-birth arrival accepted | — | — |
| D16 | Arrival state | optional `announce` in the offer record, written in the offer's write; a fresh profile announces nothing; A1 bytes when empty | sound; compensation restores both fields | sound; fresh profile must start empty (fixed) |
| D17 | RPCs | `getNetworkArrival` (lock-free, kind order: this build seeds no Mainnet, so the e2e's planted row has no seed order) and `answerNetworkArrival` (locked, fenced, through `recordOffersLocked`) | concurrent answers serialize; second is a no-op | kind order, not seed order |
| D18 | What answers it | Stay, or `setActiveNetwork` moving the pointer to it from another live row (was: the popup answers when active equals arrived) | equality answers a failed switch and a re-asserted pointer: high | boot fallback answers unseen: medium; answer in the service on a real move |
| D19 | Precedence | pure gate; the Terms sheet's verdict immediate, synchronous, `undefined` until read and after unmount; barriers not gated (z 10000, used up only by a press) | barriers need tri-state too (rejected: the takeover relies on z-order, the arrival's mount only closes popups under an opaque barrier) | no barrier emit; sync Terms emit; reset on unmount |
| D20 | Layout | L3 composite `TakeoverLayout` + `takeover.ts`, testid prefix, takeover testids byte-identical | stays within the pick | L3 bans respected |
| D21 | Accessibility (the panel under the owner's 2026-10-19 delegation) | no focus move on mount; never focus Switch (an unlock or Continue Enter's auto-repeat would press it); native buttons, 2 px accent ring, repeat Enter refused | — | same; focus the `h1` if anything |
| D22 | E2E | one smoke scenario, both browsers: the shell's boot wiring (Terms first, shows again at an unanswered reopen, stays answered) no cheaper layer runs; second surface's stale arrival a known limit (#904) | justified; record runtimes | reopen leg only if cheap |
| D23 | A2 review r1 | refresh on the network list and gate on it (a deleted or renamed arrival network); "Not now" leaves the route before it dismisses; dead import, two comments, `{ error }`, OA-2 variant scaffolding removed | 1 medium, 1 low, fixed | same medium + 5 low, fixed |
| D24 | A2 review r2 (Codex, resumed) | **clean**: "No new material findings." Loop converged | clean | — |
| D25 | `announce` in the stored-shape registry (#890 landed first) | no registry edit (the entry reads `SeedOffersSchema`); full golden carries `announce`; `bun run baseline:storage` rewrites stamp 0 before the freeze, sums stable on a rerun | r3 **clean**: "No material findings." | — |

## Security & Adversarial Considerations

- **Threat model.** Stored rows and records are hostile input at the storage boundary. A record naming kinds the profile never saw can only withhold a default (the person can add the network by hand); one that does not parse withholds every new default and is kept as it is, so corruption never re-adds a network the person deleted (D9), and no record can add a network the build does not seed. An attacker who can write `chrome.storage.local` already owns the wallet; nothing here widens that.
- **Seed rows are build constants.** The pass writes only `DEFAULT_SEEDS` entries through the existing `_buildNetwork` (chain 0 only on a loopback L1 31337) and `seedOneNetworkLocked`; `assertCanonicalStoredL1` keeps validating a seeded row against `SEED_L1_BY_KIND`. No endpoint comes from storage, a backup or a dApp.
- **dApp surface.** D5 widens what `servesChain` answers only for chains of this build's seeds that the profile was never offered: the same rule an empty profile has today. A dApp cannot plant a seed or a record; `servesLiveChain` still refuses a quarantined chain.
- **Classification and the freeze.** The pass never adds a second row on a chain (one row per chain keeps a moved chain classifiable) and never touches accounts or the active pointer, so the integrity coordinator's verdict is the same before and after it (Phase 1 test 16).
- **Test-only code.** A3's extra seed is double opt-in, dead-code-eliminated, and refused in every release build by the absent-marker grep. No new dependency; no gate loosened.

## Assumptions

- **Facts.** Recon's table (file:line in [recon.md](recon.md)); `decodeRow` reports a stored value that does not decode as `corrupt`, never `absent` (`X/wallet/utils/raw-row.ts`); vitest runs a file's tests in order, so a `describe` that appends a seed to `DEFAULT_SEEDS` and removes it in `afterEach` cannot reach the file's "Testnet and Local Network only" pin.
- **Inferences.** (I1) Every pre-record build seeded Testnet and Local Network (checked at `v0.31.0` and `dev`; 1.0.0 is cut from `dev`). (I2) The 6.0.0 bump moves Testnet's chainId (migration-rule-1's I4), which D3 survives by design. (I3) migration-rule-1's A3 lands the harness with the `inPlaceUpdate` shape and the `NULO_E2E_UPDATE_FROM`/`_TO` opt-in its plan names; if it changes, A3 adapts to what lands.
- **Asks** (working assumption in brackets): OA-1, answered (P66-01, D); OA-2, the arrival's words [variant A ships in the code; A2 stays a draft until signed].

## Phases and gates

Every gate also runs `bun run lint` and `bun run typecheck:all` (exit 0), and `bun run check:plans` after staging plan files. Host rule: build and e2e only at load1 < 150.

### Phase 1 (A1) · the record, the pass, `servesChain`, the purge — done (#882)
- Steps: (1) `seed-offers.ts` with `seedsToOffer` and its tests; (2) `offerDefaultsLocked` and both entry points; (3) `servesChain`; (4) the purge; (5) a comment on #80 (Phase 4).
- Tests, the smallest set; each never-happens check is paired with a success control.
  - `S/network/seed-offers.test.ts` (pure): (1) an empty profile gets every seed whatever the record says; (2) rows and no record: the baseline kinds are not added, a new kind is; (3) a row of the kind on another chainId (a moved Testnet) is recorded, not added; (4) a custom row on the new seed's chainId is recorded, not added; (5) a recorded kind with no row (deleted) is not added; (6) an unreadable record adds and records nothing; (7) pins: `KINDS_SEEDED_BEFORE_RECORD` equals `["local", "testnet"]`, and `DEFAULT_SEEDS` kinds and chainIds are unique.
  - `S/network/service.test.ts`, a new `describe` that appends an extra `mainnet` seed to `DEFAULT_SEEDS` in `beforeEach` and removes it in `afterEach`: (8) an existing profile opens: the extra row is added with its seed's identity, every old row and the active pointer are byte-identical, the record holds three kinds, and a second open writes nothing (`recordWrites`); (9) the extra default deleted stays deleted, and renamed keeps its name with no twin; (10) two concurrent opens add one row; (11) a deletion mid-pass leaves no row and no record; (12) a quarantined seed chain is skipped and unrecorded, then added once the journal is gone; (13) an unreadable record keeps its bytes and adds nothing, and a rejecting storage read rejects the open; (14) `purgeForProfile` removes the record; the restore entry point records every kind for a fresh profile; (15) `servesChain` is true for the extra chain before the open, and false once it is recorded and deleted; and a `servesChain` parked between its two storage reads while a whole pass commits (the row, then the record) still answers true (D5's interleaving: with the reads reversed it answers false); (16) `classifyChains` over the rows before and after the pass gives the same entries for a profile with a stale Testnet row and moved accounts.
  - `S/network/service.test.ts`, outside that `describe`: (17) with the real `DEFAULT_SEEDS`, an existing profile that deleted Local Network gets no row and `servesChain(…, 0)` stays false; its message says that adding a default edits this test, never `KINDS_SEEDED_BEFORE_RECORD`.
- Gate: `cd apps/extension && bun --bun vitest run src/wallet/services/network src/wallet/services/stale-network` exit 0; then `bun run test` and `bun run test:all` exit 0. Proof of the tests (D10), recorded in `lessons/phase-1.md`: the success controls 8, 12's second half and 15's first half fail against the base source, each after reaching the behaviour it checks; each never-happens check fails under a named mutation of the new code (baseline emptied, identity by chainId, no hold by chainId, an existing seed row overwritten, unreadable read as absent, rows read before the record, record written before rows); a check the base already passes (9's rename) counts only under its mutation. Smoke e2e `cd apps/extension && bun run test:e2e -- tests/e2e/settings-crud.test.ts tests/e2e/endpoints.test.ts tests/e2e/sw-restart-network.test.ts tests/e2e/stale-network.test.ts --retry=0` green; network e2e `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/networks.test.ts tests/e2e/network/connect-unserved-chain.test.ts` green (Chrome; no fixture, focus, window or WebAuthn change, so no Firefox twin).

### Phase 2 (A2) · the arrival — done (draft PR until OA-2 is signed)
- Tests: `seed-offers.test.ts` (announce: added, held by kind, custom not, empty profile not; normalized bytes); `service.test.ts` "the arrival of the new default" (announced on open and shown until answered; fresh and restored profiles announce nothing; an interrupted pass's row announced; a custom row not; Stay answers for good with A1 bytes and a second answer writes nothing; a switch from another live row answers, a re-assert, a dangling or missing pointer do not; corrupt record; a deletion during the answer restores it); `network-arrival.test.ts` (every gate, each with a showing control); `useNetworkArrival.test.ts` (11 cases); `TakeoverLayout.test.ts` (11); `NetworkArrival.test.ts` (copy written out, both buttons, busy, chip and lock answer nothing); `LegalAcceptanceSheet.test.ts` (the tri-state emit); the takeover's 28 tests unedited.
- E2E (D22): `tests/e2e/network-arrival.test.ts`, one scenario. Failure mode: the shell's real boot (`app.vue` has no harness) mounting the arrival after the Terms sheet, again at an unanswered reopen, and never after Stay. Estimate 40 s per browser; measured 8.1 s Chrome, 17.6 s Firefox (retry 0).
- Gate: `bun run lint`, `typecheck:all`, `audit:vue`, `test:all` exit 0; the new file plus `stale-network.test.ts` and `legal-acceptance.test.ts`, smoke at retry 0, Chrome and Firefox; screenshots in [screenshots/](screenshots/) (360×600 at 2×, both themes, Chrome).

### Phase 3 (A3) · the update e2e
- Starts when migration-rule-1's A3 is on `dev`. Steps: (1) the armed extra seed, its stamp, grep and runner wiring, with `bun run test:ci-gating`; (2) the scenario; (3) fixes at their cause.
- Gate: `NULO_E2E_RETRY=0 NULO_E2E_UPDATE_FROM=v1.0.0 NULO_E2E_UPDATE_TO=<the candidate's dist for the browser> NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/default-network-arrival-update.test.ts` green on Chrome, then with `NULO_E2E_BROWSER=firefox` and the Firefox candidate (or the harness's replay command, if population needs it); without the opt-in the file reports itself skipped; per-browser wall-clock recorded; a release build (`bun run build`) greps clean of the stamp; `bun run test:ci-gating` exit 0.

## Delivery

- One PR per arc against `dev`, branch `mainnet-arrival-1-a<N>` off `origin/dev`, no stack (D-orch-1); opened only after the arc's gates pass and its Codex loop converges; no label at creation (add `e2e:extension-network` only if the path filter skips a suite the arc needs).
  - A1: `feat(network): offer every default network a profile was never offered when it opens` (Refs #875). Merged, #882.
  - A2: `feat(network): the arrival of a new default network on existing profiles` (Refs #875), quoting P66-01 and its note by id and text; a **draft** until the owner signs OA-2's words.
  - A3: `test(e2e): a real in-place update meets the arrival on Chrome and Firefox` (Closes #875); its last commits are the close-out.
- Parallelism: A3 waits for migration-rule-1's A3 on `dev`; it touches none of A2's files but the arrival's selectors.

## Post-implementation

The execution contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `2f591ddd`. Specific to this plan:
- **While implementing:** comments to CLAUDE.md § Code-comment style; attempts in `lessons/phase-N.md`; `agent-worktree status mainnet-arrival-1 "<arc> phase N green: <next>"` at each gate; three failures on one step ends the arc as `ARC_FAILED`.
- **Review loop, per arc:** `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol` over `git diff origin/dev...HEAD`, with this plan, the ledger, the arc map ("arc N of 3: A1 the offer record and pass, A2 the arrival, A3 the update e2e and the close-out"), the adversarial ask and the standard's two rules verbatim; `resume-codex.sh` until a round has no new material finding, hard stop at three rounds. One Opus review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1. Not stacked, so no cross-arc pass; each later arc's prompt also asks for drift from the earlier ones.
- **Delivery:** as above, then `gh pr checks <n> --watch` once; a known flake one rerun, breakage a fix and the loop again. Never merge.
- **Close-out (A3's last commits):** merge `origin/dev`, read `index.md` and `lessons.md`; the Outcome block; lessons promoted (seed identity is the kind; a default added later needs the offer record); open items as issues; `STATUS.md` deleted; `git mv` into `archive/` in its own commit, the index line moved; `check:plans` green.
- **Teardown after the merge:** once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/mainnet-arrival-1/plan.md` succeeds, `agent-worktree done mainnet-arrival-1 --merged`; relay a refusal.

## Seeds

```
/goal All three arcs of implementations-plan/mainnet-arrival-1/plan.md shipped as PRs against dev (A2 ready once the owner signs OA-2): each phase marked ✓ with its gate's output in the transcript, each arc's Codex loop converged (a resumed pass reporting no new material finding, quoted), `bun run test` and `bun run lint` exit 0 on each arc head, A3's close-out commit (`git show --stat`) archiving the plan.
```

```
/loop 15m Drive implementations-plan/mainnet-arrival-1 forward from plan.md and STATUS.md (authoritative, not the chat). Next pending phase of the current arc; fast layers after each edit; the phase gate as written; Codex at gpt-6.1-sol high for any decision; arc boundary = the Codex loop then the PR. A2 leaves draft only on the owner's signed OA-2; A3 starts only with migration-rule-1's harness on dev. Never merge, never touch a sibling worktree, never yield with a run in flight. When A3's close-out is on dev, run the teardown and stop.
```
