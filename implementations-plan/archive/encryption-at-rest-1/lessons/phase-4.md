# Arc A4 (P8–P10): accounts, tokens, networks, fee payers, and the close

## Where the code differs from the plan, and why

- **One keyed tail for both account roots.** An account row and its imported key keep `["account", profileId, chainId, …]` and replace the address with the same keyed hash, so a key row still sits at its account's storage id and every lookup by `(profile, chain, address)` stays one key. The address lives only inside the seal.
- **The pair converts together.** An unlock seals a plaintext account with its plaintext key row in one write and removes both plaintext keys in a second, so a crash leaves both forms and never a sealed key without its account (`sealed-accounts.composition.test.ts`, the crash case). The dual read prefers the sealed copy, so the leftover plaintext pair is harmless until the next unlock removes it.
- **The orphan key sweep moved to the profile's unlock.** At service start no row key exists, so a sealed account cannot be seen, and a sweep there would read every sealed key as orphaned. At unlock it counts an account in either form, readable or not, and re-checks under the per-tuple lock an import holds. Two profiles holding the same imported address keep both pairs (the two-profile case).
- **Deletion reads addresses from natural ids only.** `rawAddressesForProfile` skips a hashed tail; a deletion in a worker with no row keys removes the plaintext rows and leaves the sealed ones to the keyless sweep, which a 1.0.x tombstone still drives (the tombstone case).
- **The integrity digests are keyed.** The stamp and the stale-network record store the account set's digest under the profile's keyed hash, so neither names an address. A stamp written by a build before this one mismatches once and earns one re-derivation, then is keyed (`coordinator.test.ts`). The pre-open check and the password change's check read the sealed accounts through the keyring, and recovery mode lists them.
- **Tokens, networks and fee payers convert under the lock their writers hold.** The token chain sweep takes no token lock, so a token converts only while no sweep ran since its section began. A resumed token add compares the exact sealed value it wrote, not the plaintext it meant.
- **The seeder's marker and the registration counts are one-row-per-profile sealed roots** (`PROFILE_ROW_LAYOUT`), each read by its owner's decoder. With every content root sealed, the per-profile value store kind and the codec overload of `entityStorage` had no store left and went.
- **`dappRegistrations` is sealed, not listed.** It names each app that registered with a profile on a chain: the same class as the sealed dApp sessions, and OA-3's "app permissions".
- **An unopened sealed row is hidden as an undecodable one is.** `getAll()` leaves it out, so ids come from `getKeys()` (`nextNumericId`) and the deletion snapshots read raw entries; a lookup by content (`findToken`) treats it as absent, as it did a codec-hidden row.
- **The root census** (`storage/root-census.test.ts`) fails on a registered key family that is neither sealed nor on its reviewed plaintext list with a reason. The `nulo:ui:*` preferences stand there as known limit #1062.
- **Stamp 4 is additive** (stamp 3 went to #1027, which reached `dev` first): a plaintext row still reads through the dual read and is sealed at its profile's next unlock. One sealed golden per root, sealed by the generator.
- **E2E readers go through the owning service.** The smoke suite also runs against the shipped zip, which has no sealed-row reader, so a spec reads accounts, tokens and fee payers over RPC on any build; the network service serves no network to a locked profile, so a seed run locked takes the networks read before the lock. A rewrite of an account drops the scope's sealed rows and writes each account back at its address as plaintext, since a spec cannot compute the keyed hash (`tests/e2e/helpers/identity-rows.ts`).
- **The update replay scans the identity roots.** After the unlock every account, key, network, token and fee-payer row is an envelope at a key naming no recorded account, and each root stores as many rows as its service reads.

## Populated install: unlock to Home, and the incoming load

The update replay's recorded v0.31.0 profile (4 accounts, 1 imported key, 3 networks, 1 token, 2 fee payers, 2 receipts, contacts, history and a dApp session), its endpoints made unreachable, written into a production candidate of this branch and into one of the base commit `5c35ca934`, rounds alternating which build goes first. Unlock to Home is timed from the Enter that submits the password to Home's hero settled (`balance-amount` or its unknown mark shown, the skeleton gone): the first unlock, which converts the rows, and three cold unlocks per round, each in a fresh browser on the converted profile. The incoming load is the activity feed's read (`getIncomingTransfers`) over 2 000 plaintext note records added to the recorded account, after the next unlock sealed them, median of 5 per round.

| 8 rounds, medians | Chrome base → A4 | Firefox base → A4 |
|---|---|---|
| first unlock to Home | 1 223 → 1 239 ms | 1 862 → 1 856 ms |
| cold unlock to Home (24 each) | 1 168 → 1 195 ms | 1 521 → 1 488 ms |
| incoming load, 2 002 records | 254 → 236 ms | 682 → 602 ms |
| load1, start → end | 163 → 79 | 76 → 129 |

Within the 50 ms rule on both browsers; per-round pairs vary in sign (Chrome cold −607 to +122 ms), so the host's noise exceeds any difference. A first 5-round Chrome run at load1 near 200 read +314 ms cold and was too noisy to use: its own spread was 1 000 ms. What the unlock path adds is a keyed digest (one HMAC) and an AES-GCM open of each identity row a service reads.

## Downgrade to A3's build

Measured on Chrome as A3 measured it: the update replay's recorded v0.31.0 profile, its endpoints made unreachable, unlocked and sealed by the A4 candidate (11 rows in A4's roots: 4 accounts, 1 imported key, 3 networks, 1 token, 2 fee payers), then written into a production build of `5c35ca934` (`dev` with #1043, A3's build), unlocked and left on Home for 40 s. The same profile sealed by A3's build itself logs no `KEEPING` line there.

- **The noise.** A3's build logs **123** `failed validation — KEEPING (not deleting)` lines at error level, 116 of them between the unlock and Home: networks 71, accounts 36, tokens 5, fee payers 4. It reads every sealed row of these roots on each pass, so the count grows with use as A3's did.
- **What it shows.** It reaches Home with no barrier and no takeover, but it can read none of A4's rows, so it seeds again: one plaintext account (the profile's first derived account, at its old address) and two plaintext default networks, at fresh ids, with the active network and account moved to them. The custom network, the imported account and the second account are hidden; the integrity stamp is rewritten.
- **Back on A4.** The next unlock keeps every sealed row and reads 3 Testnet accounts and **5** networks: the re-seeded account shares its sealed twin's keyed id, so the conversion keeps the sealed copy and removes the plaintext one, but the two re-seeded networks sit at new ids and are sealed as new rows. A rollback and return therefore leaves the default networks listed twice until the person deletes the copies. This is KL-9 (#1059), which the plan accepts because it supports no downgrade; its issue records the round trip.
- **update-check-3** (the orchestrator's check of `dev` over #1043's storage, carried here): `dev` before #1043 cannot read the sealed trust row, so a first-receive sheet covers every popup page until answered; History lists no received row; 144 (Chrome) to 154 (Firefox) error-level `KEEPING` lines land in about two minutes.
- **The quieter read stays proposed, not built** (`lessons/phase-3.md`): it would quiet only a rollback onto a build that already carries it, and it cannot stop the re-seeding above, which needs the old build to tell "sealed by a newer build" from "empty".

## Review

- **Codex r1 (gpt-6.1-sol, high): APPROVE, two low.** Both comments: `sealLegacy`'s doc said the sealed write and the legacy removal share one dispatch (they are two calls; a crash between leaves twins, which reads dedupe), and a restating comment on `storedText`. Fixed in `01636e41c`.
- **Opus, beside r1: APPROVE, four low.** (1) "The next unlock retries" was false within one worker: `RowKeyring.fill` returns false for keys already held, so a later unlock announces nothing and a failed pass waits for the next worker; the eleven log lines, the account service and ARCHITECTURE §5 now say so. (2) The migration template's examples migrated the accounts root, now sealed and refused by the registry. (3) The token add awaited the network's liveness between its deletion fence and its commit (older than this arc; the post-commit check compensated); it re-asserts the fence before the commit. (4) Two plan-ledger ids in the root census's reasons. All in `01636e41c`. Its check of items 1, 2, 3 and 6 (keyed ids, the orphan sweep, the integrity digests, the races) found each holding, with the paths it traced.
- **Codex r2: APPROVE, two low.** The template's new root, `nulo:core:profiles`, is block-listed for backup import, so a migration copied from it would block older backups: the examples now migrate the deletion tombstones. A restore comment still promised the orphan sweep at the next unlock. Fixed in `844b6a5d5`.
- **Codex r3: APPROVE**, nothing new.
- **`type-roles` re-attested** the auth-registry producer digest after its log line changed (`4bc9dc78e`): the two `send_transaction` producer sites are unchanged.

## Gates

All at retry 0, code at `4bc9dc78e` (the commits after it touch only `implementations-plan/`), on one host shared with other agents; load1 is the 1-minute load average on 188 cores at a run's start and end.

| Gate | Result |
|---|---|
| `lint`, `typecheck:all`, complexity check | green; no suppression added |
| `test:all` | green (extension 909 files, 15 035 tests; load1 131 → 132); a run before the digest re-attestation had the one `type-roles` red above |
| `test:ci-gating`, `check:plans` | 687 pass; 0 findings |
| Network, proverless, Chrome: `backup-restore-integrity`, `backup-migration-roundtrip`, `profile-reimport-matrix` and the nine specs whose readers changed | 12 files, 33 tests, 944 s (load1 89 → 127) |
| The same, Firefox | 12 files, 33 tests, 1 037 s (load1 118 → 76) |
| `frozen-account-canary`, prover-ON | Chrome 2 tests, 180 s (load1 130 → 105); Firefox 2 tests, 278 s (load1 62 → 94) |
| Update replay from v0.31.0, candidates built at `4bc9dc78e` | Chrome 3 passed, 59 s (load1 119 → 124); Firefox 3 passed, 72 s (load1 119 → 127) |
| Smoke, full, fresh armed builds, the two browsers partly side by side | Chrome 61 files passed, 9 skipped, 1 949 s (load1 127 → 129); Firefox 65 passed, 5 skipped, 3 013 s (load1 131 → 157); `backup-migration` and `security-reset` green in both |

**E2E runtime budget.** No new spec file or scenario. The update replay gains the identity scan (Chrome 55 → 59 s, Firefox 77 → 72 s against A3's runs); the moved readers call one RPC where they parsed one row. Against A3's full smokes (Chrome 2 376 s beside Firefox at load1 89 → 268; Firefox 3 038 s alone), this arc's ran 1 949 s and 3 013 s.
