---
plan: passkey-unlock-1
tier: mid
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at face80099
trunk: dev
status: closed with #1142; the merge closes the plan
issues: "#1127 (Closes, A4)"
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-26. Planned 2026-10-25; A1 merged 2026-10-25, A2 and A3 2026-10-26.
- **Status:** closed with A4's PR, #1142 (`passkey-unlock-1-a4` → `dev`, `Closes #1127`), which carries this close-out. Four PRs against `dev`, not stacked. The merge closes the plan.
- **Shipped:** the seed and every key stay encrypted in the wallet's own storage; nothing that leaves it (a backup, an export) opens with the passkey alone. Gates ran at retry 0. A mutation is a one-site edit that a named test must fail on. A flake count is consecutive runs.
  - **A1, #1130, `0634a7954`:** A1.1 and A1.2 as planned, with D19 and D20.
    - Gates: lint, typecheck:all, test (929 files, 15,226 tests), test:all, baseline:storage unchanged, check:plans. No e2e: nothing a person sees changed.
    - Mutations: 59, then 71 on the final head (70 caught, 1 equivalent). Flake: 8 files 30/30, twice.
    - Review: Codex approved three times; Opus approved.
  - **A2, #1139, `74cf8995b`:** A2.1 to A2.4 as planned, with D21. Create, unlock, reveal and back up on the new row; retired rows and earlier passkey backups refused; stamp 0 and the passkey pinned backup re-cut. The Account row stayed hidden until A3.
    - Gates on `c13530bab`: lint, typecheck:all, test:all (924 files, 15,194 tests), audit:vue, baseline:storage unchanged, check:plans.
    - E2E: 9 smoke files on both browsers (`toolbar-panel` on Firefox), the update replay from v0.31.0, and the passkey execution canary prover-ON, 4/4.
    - Mutations: 62 (62/62 after the survivors' tests), then 77 on the final head (77/77).
    - Flake: 49 files 30/30. Smoke: Chrome 5/5; Firefox 4/5, the red in `toolbar-panel`'s unchanged file chooser under host load, then 7 green. Replay and the network matrix 5/5 per browser.
    - CI suites within a minute of before.
    - Review: Codex conditional approve twice, then approve; two Opus legs approved.
  - **A3, #1143, `bd4e666b9`:** A3.1 and A3.2, with D22 to D24:
    - the unlock choice after a phrase import or a restore (OA-2);
    - the passkey profile's account file (OA-3c);
    - "Use a passkey I already have" (OA-5 C);
    - the Unlock method page (OA-6 B);
    - strict mode for every profile (OA-10 B).
    - Gates on `1077905bb`: lint, typecheck:all, test:all (931 files, 15,377 tests), audit:vue, baseline:storage unchanged, check:plans.
    - E2E: 15 files on Chrome (60 tests) and 4 on Firefox (16). Canary 4/4. CI's first network run went red on a shared driver, fixed in `a63839581`.
    - Mutations: 74, then 84 (81 caught, 3 equivalent); the last fixes 5/5. Flake: 26 files (951 tests) 30/30, the errors test 30/30, e2e 5/5 per browser.
    - CI suites one minute slower each.
    - Review: Codex rejected three times, the cap, with each finding fixed and tested; two Opus legs gave conditional approve.
  - **A4, #1142:** A4.1, with D25 and D26: Terms 1.2 (material), Privacy 1.2.6 (patch), `@nulo/legal`, the listing and the README. The effective dates wait for the promote (`BEFORE-LAUNCH.md` § 4).
    - Gates at `33d1f152d`: lint, typecheck:all, test:all, check:plans. Smoke `legal-acceptance` 5/5 per browser; `@nulo/legal` 30/30; the listing and About tests 30/30.
    - No mutation pass: documents only.
  - **Close-out:**
    - Fixes from the final review (§ Review verdicts): Full Backup starts over when another window changes the profile's unlock (`3bf2cb897`, with a test and a rename control); the session docs, the listing's citation, the RP ID comment and ATTACK-SURFACE's reseal limitation (`1a09bba67`).
    - Gates: lint, typecheck:all, test:all (931 files, 15,379 tests), `scripts/check-no-local-paths.sh`, check:plans.
    - E2E: `passkey-backup`, `backup-roundtrip` and `own-window` on Chrome (6/6), and with `toolbar-panel` on Firefox (11/11).
- **Release notes (P86-18 A),** kept here for the owner's release text; no commit writes them into a release: "Passkey profiles now have a recovery phrase. Your passkey unlocks Nulo on this device, and your recovery phrase brings your wallet back on any device, with a password or a passkey. A passkey profile made with an earlier version can't be opened in this version: delete it, then create or import a profile."
- **The owner holds:**
  - the chaos campaign's acceptance (page 87: 30 seeds per browser and one fleet wave; S1 and S2 block), which #1142's merge waits on;
  - the promote `dev → main`, with both effective dates filled;
  - 1.1.0 (P86-22), which release-please makes from the arcs' `feat` commits;
  - the store submissions, with the Firefox notes (P86-19, the listing's § Release notes);
  - the message to known passkey users before the store release (P86-21);
  - the v1.0.0 GitHub release's notice (P86-23);
  - #1152.
- **Dispositions:**
  - D19 to D26 record where the tree won. Outline B was rejected (D3, D13). The options not picked are in OWNER-ASKS.md.
  - Privacy § 5.4's list went to the owner (#1152), since it is signed text.
  - #614's subject, the passkey backup's check, left with A2.
- **Lessons:**
  - The reader-gate and zod line joins the `getAll()` entry, and the unlock change joins the profile-switch entry.
  - The 6.0.0 oracle-major entry retired: the `aztec-update` skill owns it.
  - The shared-driver lesson went to the `e2e-testing` skill.
- **Known limits:** #1151.
- **Open items:** #1152 (`owner-decision`); `BEFORE-LAUNCH.md` § 4 (the two effective dates).
- **Seeds retired:** the `/goal` and `/loop` below.

# passkey-unlock-1: a passkey profile keeps a recovery phrase that its passkey unlocks

A passkey profile becomes a password profile with the passkey in the password's place: a normal 24-word recovery phrase, its master derived the standard way, sealed in the wallet's storage under a key the profile's passkey rebuilds. The property this lane establishes: **the seed and every key stay encrypted in the wallet's own storage; nothing that leaves it (a backup, an export) opens with the passkey alone.**

Four arcs, each one PR against `dev`, not stacked (the orchestrator's D-orch-1), each opened after its local gates and its Codex loop:
- **A1, core:** the passkey unlock key and the shared slot sealing in `@nulo/wallet-crypto`; in the profile service, one row classifier, one slot opener and a restore split, all behaviour-preserving. Nothing a person sees; does not wait for the owner.
- **A2, the switch:** passkey profiles create, unlock, back up and reveal their phrase on the new row; the old passkey derivation leaves; old passkey rows and backups are recognized and refused; stamp 0 and the passkey pinned backup are re-cut. Waits for OA-1, OA-2 (the row), OA-3a, 3b, 3d, OA-4, OA-5 (the name), OA-7, OA-12.
- **A3, the choices:** pick the unlock method after a phrase import or a backup restore, the passkey profile's account file, and what OA-5, OA-6 and OA-10 put in scope. Waits for OA-2, 3c, 5, 6, 10.
- **A4, the words and close-out:** legal, store listing, README; `Closes #1127`. Waits for OA-8, OA-9, OA-11.

Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Flows: [FLOWS.md](FLOWS.md). Consults and review rounds: [lessons/phase-0.md](lessons/phase-0.md).

The plan runs over the mid target (365 lines): four arcs' ledger, review rounds and outcome, none restated.

Paths are relative to `apps/extension/src/` unless they start with `packages/`, `apps/`, `legal/`, `scripts/`, `reference/`, `infra/` or a root file name. `P` = `wallet/services/profile`, `WC` = `packages/wallet-crypto/src`. Line numbers are at `face80099`.

## #1127 and the lane brief: what did not hold

- **#1127 holds** as a description of the decision and its scope.
- **"Core first without changing what a person sees" holds for the crypto layer and for behaviour-preserving service seams, not for the switch.** A passkey profile on the new row has a phrase that nothing shows, and the "Passkey" import option stops working; keeping both service paths alive until the screens move would be a copy kept to avoid a change. So A1 is the core and its seams, and the switch is A2.
- **"`seed.vue` tells a passkey profile to keep its passkey synced":** the sentence is `popup/pages/settings/security/export/index.vue:25-28`; `seed.vue` has no passkey branch.
- **"The two pinned full backups are re-cut":** only `passkey.json` changes meaning. `password.txt` stays byte-identical as the historical evidence of a 0.31.0 password backup; `passkey.json` is replaced by a new passkey backup.
- **"No stable store release carries the old stamp 0":** true for the stores. `v1.0.0` is a published GitHub release whose tag carries three pins; a sideloaded 1.0.0 is handled as 0.31.0 is (same passkey row shape).
- **The update path "from v0.31.0":** `fixtures/update/v0.31.0.storage.json` has no passkey row, the replay's passkey case registers a fresh profile on the candidate, and the live scenario cannot run while `dev` (Aztec 6.0.0) and 0.31.0 (6.0.0-rc.3) differ. A2 adds the case through the release's own screens (D10).
- **Legal:** `legal/terms.md` (§ 3, § 4.1, § 4.3, lines 198 and 502), `RISK_POINTS[1]`, privacy § 5.4 (`legal/privacy.md:171-174`) and `store/listing.md:207-209` also change; the brief named only the privacy row and § 5.4's domain.
- **Chaos seeds:** none applies. `send-chaos` drives sends on a burst account and never unlocks or backs up (recon).

## Outcome & Quality Bar

- **For whom:** a person who picks a passkey because they do not want a password, and later loses the device or the passkey; and the maintainer who next touches the profile row.
- **Excellent:**
  1. A passkey profile's accounts are the ones its phrase gives a password profile: a composition test creates a passkey profile, imports its phrase with a password, and compares the two masters; master to address is the frozen derivation `derivation-vectors.test.ts` already pins, so no composition test derives an address (`apps/extension/tests/COMPOSITION-TESTS.md`).
  2. Nothing outside the wallet's storage opens with the passkey alone: a passkey profile's backup and account file open only with their file password (at least 8 characters), neither carries `prfSalt`, and the slots open only under the row's own `prfSalt` (unit tests, each with a success control).
  3. A passkey profile made before this update is never hidden and never half-opened: listed, refused as the refusal matrix says (the typed error survives the popup boundary where a path returns it), and deletable; its backup is refused before any further prompt (composition, component and transport tests).
  4. A password profile updated from 0.31.0 opens and reads every row as before (the update replay on both browsers).
- **Good enough:** no salvage of a pre-update passkey profile's funds; no simultaneous password-and-passkey unlock on one profile.

## Assumptions

**Facts** (verified at `face80099`):
- F1. Password rows seal `guard`, `secret`, `entropy` as version-0 PBKDF2-600k frames (`WC/password-secret-box.ts`, `WC/encryption-key.ts`), `dekSealed` the same way (`P/service.ts:2159`); envelope MAC v3 keyed `HKDF(master‖dek)` (`P/profile-row.ts`). `EncryptionKey.decrypt` rejects any other frame version, so every slot reader must know the row's type.
- F2. Passkey rows are `{id, name, type, pxeGeneration, dekSealed, walletFingerprint, credentialId}` at `v0.30.2`, `v0.31.0`, `v1.0.0` and `face80099` (the row writers in `P/spec.ts` and `P/profile-row.ts` at each tag; the registry `wallet/storage/stored-shapes.ts:153-164` exists from 1.0.0).
- F3. The master is the only secret input to derived-account derivation (separately imported signing keys are independent); chain, type, index and the frozen regime are the others (`WC/derive-account-seed.ts`, `WC/account-derivation.ts`). Row keys come from `(master, id, pxeGeneration)` (`P/row-keyring.ts`).
- F4. `NULO_KDF_SPEC` contains the `passkeyMaster` line and is hashed into every regime (`packages/aztec-runtime/src/account/address-freeze.ts:60-70`); the freeze test checks the string, not which code derives it.
- F5. `aes-gcm-frame.ts` writes version-1 frames under any AES-GCM `CryptoKey`; `imported-keys-dek-box.ts` seals a DEK under one.
- F6. The profile root has no runtime codec: `entityStorage` reads it unchecked (`wallet/storage/stores.ts:247-250`); `stored-shapes.ts` runs in tests and the generator only.
- F7. Password backups are always encrypted under the profile password (`security-backup.test.ts`); passkey backups may be plain and carry a check keyed from the passkey (`WC/backup-mac.ts`). R5 decrypts only `password.txt` (`wallet/storage/stored-shapes/snapshot.test.ts:128`).
- F8. `CURRENT_COMPAT_EPOCH = 5` (`wallet/services/backup/backup-migration-registry.ts:81`).
- F9. The last stamp-0 re-cut (#1093, `0e4bec132`) emptied `PINNED_STAMPS`, ran `bun run baseline:storage -- --freeze`, and proved with `jq` that nothing else moved (`implementations-plan/archive/ui-keys-sealed-1/plan.md` § "The gate change: the re-cut").
- F10. `v1.0.0` is a published GitHub release; release-please makes 1.1.0 from a `feat:` (`.github/release-please-config.json`).
- F11. At `v0.31.0` the wallet seeded Testnet and Local Network only (`git show v0.31.0:…/network/seeds.ts`).
- F12. A passkey returns the same PRF output for the same input under user verification; today's unlock already relies on it.
- F13. The session bearer lives in `storage.session` (`P/session-manager.ts:189`), which survives a background restart and is cleared when the browser restarts.
- F14. `isNewPasswordValid` requires 8 characters and a match; `newPasswordHint` gives the hints (`utils/password.ts`). The passkey backup page checks only non-empty and matching (`composables/useFullBackupExport.ts:371`).
- F15. Retry state after a minted-but-unconfirmed passkey keeps only `{credentialId, userHandle}` (`wallet/utils/passkey-errors.ts:18`, `composables/useProfileCreateFlow.ts:91`, `popup/windows/passkey/index.vue:83`).

**Inferences** (to verify in the arc named):
- I1. `exportMnemonic` can take the create ceremony's credential data, so the phrase stage needs no second prompt (A2, a composition test).
- I2. The 0.31.0 build can create a passkey profile offline in the update replay before the update (A2). If it cannot, the plan stops and records why: no hand-written row in a recorded fixture.
- I3. Create, the confirming assertion and unlock all succeed on both browsers' virtual authenticators with a random 32-byte input, including Firefox's create that reports PRF enabled without an output and gets it from the confirming assertion, as today's tests model (A2, smoke e2e).

**Asks** (the owner, through the orchestrator): OA-1 to OA-12, all answered on decision page 86 (records P86-01 to P86-23, quoted per ask in OWNER-ASKS.md). Where a record departs from an ask's recommendation: OA-2 (P86-02, a restored backup opens the unlock choice on the method it was made with), OA-7 (P86-12, the second sentence is in).

## Decision ledger

The owner, 2026-10-25:
> "The idea would be to just use the passkey as a validator to unlock (or unencrypt) our local storage and have a normal-derived seed? Meaning, the 2fa would just be the in-place replacement of a password"
> "Please, orchestrate this change. I won't release 1.0.0 until we've fixed this correctly. I am in no-hurry. I want to do things right and safe."
> "Create all the affected screens, showcase to me the new workflows, create decisions page for it with different options on how to showcase it; and how we pretend to communicate it."
> "let's think the UX / UI of this whole change arc, so we can approve, implement it, fix our tests, re-test it, chaos-test it, etc."
> "And yes, I realized this will break everything for 0.3X.X users, I'm ok with that. That's why it's a 1.0.0 major release."
> "And yes, I understand we will need to re-do the task that froze the local storage schema (I can't recall how we called that feature) so this is the new full base."

| # | Decision | Rejected | Why |
|---|---|---|---|
| D1 | A passkey profile is a password profile with the passkey in the password's place: same phrase, master, fingerprint, DEK, row keys, envelope MAC v3 | a passkey master with a wallet-held factor and no phrase | the owner's decision; one account chain, no regime change |
| D2 | Unlock key = HKDF-SHA256(ikm = PRF output, salt = `prfSalt`, info `nulo:passkey-unlock:v1`) into a non-extractable AES-256-GCM key; `prfSalt` = 32 random bytes per profile, also the PRF input | a fixed PRF input + a separate stored secret; both | Codex consult: one random field is both the PRF input and the HKDF salt; a second stored secret adds nothing once storage is read |
| D3 | Passkey row = password fields + `credentialId` + `prfSalt`; slots and DEK as version-1 frames under the unlock key with the existing AADs; envelope MAC v3 | an `unlock` sub-object (Outline B); a v4 MAC over `credentialId`/`prfSalt` | Codex: a sub-object reshapes every password row for nothing; a swapped field fails the open, and a moved row fails v3's id binding |
| D4 | One runtime classifier in `P/profile-row.ts` (zod, shared with the stored-shape entry) sorts a row into password, passkey, retired (the old passkey shape) or unreadable; the retired variant forbids every new-only key (`guard`, `secret`, `entropy`, `envelopeMac`, `prfSalt`) by presence, so a damaged new row is unreadable, never retired. A1 keeps today's `z.discriminatedUnion` (the snapshot emits `oneOf`, so a plain union would change it); the three-way plain union lands with A2's re-cut | `.strict()` on the old shape; a classifier per caller | Opus L4, Codex 4: unknown extras on an old row still read; one classifier for runtime and snapshot |
| D5 | One slot opener `openSlots(row, credential)` in `P/service.ts` is the only reader of `guard`/`secret`/`entropy`/`dekSealed`; it refuses a retired row first with `RetiredProfileError`, registered in `packages/extension-messaging/src/errors.ts`. Paths that read other data before authenticating (account export, the full-backup run fence) stay closed for a retired profile and are tested for denial, not for that error; silent restore skips a retired row without throwing | a refusal per method | Opus M1: per-method refusals miss `exportAccount`, `exportResetHeldAccount`, the method change; one opener also keeps `service.ts` in its budgets |
| D6 | Create: the ceremony reports the `prfSalt` it evaluated inside `PasskeyCredentialData` (PATH A mints it in the popup; PATH B's request carries it and the service compares); retry state keeps it for `confirmMinted`; the service allocates the id and mints the entropy at persist, inside its lock; `userHandle` is random. No reservation, no `generateProfileId`, no `ProfileIdConflictError` retry for passkey create | a service-side reservation | Opus H1, Codex 3: a reservation can seal under a salt the passkey never evaluated, and holds entropy across a 6-minute prompt; this removes state |
| D7 | Phrase stage after create: the create flow receives the ceremony data with the profile, passes it once to `exportMnemonic`, then drops it | returning the words from create; a second prompt | no new RPC shape or state, one prompt |
| D8 | Backups: one body for both methods (master, entropy, per-backup transfer key) in the existing password-encrypted file; a passkey profile's file password is mandatory and meets `isNewPasswordValid`; restore takes `RestoreMaterial` plus the chosen unlock (A2: password; A3: either). A new passkey backup writes `profile.type: "passkey"` as description only | a backup keyed from the phrase | Codex consult: a same-phrase sibling could open it and reach the imported keys the DEK isolates |
| D9 | Compat epoch stays 5. `validateAndMigrateBackup` (`composables/useFullBackupImport.ts:140`) refuses an old passkey body by shape (no `entropy`, or an `imported-keys-dek-sealed` or `backup-mac` key present), after decryption, checksum, epoch and range. The pick and decrypt handlers of Restore and Restore again call it before they publish the selection (inside today's stale-selection fences), so the refusal shows before any further control or prompt; the run validates again before it writes | epoch 6 | 6 would refuse every 0.31.0 password backup |
| D10 | The replay source stays `v0.31.0`. Its passkey case creates a passkey profile through the 0.31.0 build's own screens, offline, before the update, and asserts the retired outcome | the live scenario; a hand-written fixture row | the live scenario cannot run across Aztec lines; a hand-written row proves nothing about what 0.31.0 wrote |
| D11 | `NULO_KDF_SPEC` byte-identical. Production `deriveMasterSecret`, `deriveDekWrapKey`, `deriveBackupMacKey`, `backup-mac.ts`, `importPasskey` and discovery recovery leave; the old passkey vectors (`key-vectors.test.ts` V3, V3b, V8) move under `reference/key-model-v2-hardening/` with its generator, labelled retired; the comments beside the spec say the line records profiles made before 1.1 | editing the spec | the constraint forbids a regime change |
| D12 | A2 re-cuts stamp 0 and replaces the passkey pinned backup; CLAUDE.md and every "never again" text quote the owner | an additive stamp | the owner's decision |
| D13 | Arcs A1 core and seams, A2 switch, A3 choices, A4 words | one arc; service-first with dual RPCs; Opus's A2a/A2b split | A2's service, storage, backup and R5 changes interlock; Opus's A2b (Get started, naming, sentences) would leave untrue copy on `dev` for a saving of a few hundred lines, so they stay in A2, and A2's phases carry targeted gates |
| D14 | The session bearer for passkey profiles is OA-10; under B it covers background restarts only: a browser restart still locks (F13) | a durable bearer | Codex 5: persisting past a browser restart is a new policy for the owner |
| D15 | On Firefox's toolbar panel, the reveal, account-file and unlock-method pages move to their own window (`utils/own-window.ts`), as full backup does; a unit test pins each call | PATH B for them | the existing pattern; window behaviour already has its e2e |
| D16 | Commits are `feat(crypto)`/`feat(passkey)`/`docs(legal)`, no `!`: the next release is 1.1.0 unless OA-9 says otherwise | | OA-9 |
| D17 | RP ID and `infra/passkey-rp` unchanged | | the new design needs nothing from the RP |
| D19 | (A1, amends D4 and the A1 change map; the tree wins) The runtime classifier reads only the fields that decide the unlock, picked from the stored-shape variants (password: `type`, `guard`, `secret`, `entropy`; passkey: `type`, `credentialId`), and returns only those; the repository keeps returning every decodable row; `openSlots` is its A1 caller. `unreadable` does not mean hidden | the stored-shape schema as the runtime gate; the repository hiding a row it rejects | six pinned tests (`P/service.integration.test.ts:4329-4357`, `:4446-4500`): a row with a deleted or non-string envelope MAC opens derived-only, and type-edited restore rows keep their refusals; gating on the writer schema turns a one-field MAC deletion into a hidden profile. Codex consult: agree, high confidence. A2 routes the passkey export and the silent restore through the classifier too, since `type === "passkey"` cannot tell retired from new |
| D20 | (A1) A row that does not classify as a password row gets each password path's wrong-password refusal before any decrypt; `P/service.open-slots.test.ts` pins it | today's: a type-edited row with intact slots opened on the export paths; a missing slot threw a `TypeError` | only rows no build writes change; one opener that classifies first is D5's design |
| D18 | Accessibility (the owner's 2026-10-19 delegation): the import unlock choice reuses `AuthMethodTabs` (roving tablist, one Tab stop); new controls are native `Button`s with the 2 px accent ring; a disabled save button is out of the Tab path | | CLAUDE.md § Keyboard & focus order |
| D21 | (A2, amends D9; the tree wins) The shape refusal reads only bodies typed `passkey`; the get request always names its credential; `restore` and `exportImportedKeysDek` stay password-only until A3; the full list is `lessons/phase-A2.md` § Deviations | refusing any body that carries an earlier passkey key | a password body meets its own gates whatever extra keys it carries, so no 0.31.0 password backup is refused by shape |
| D22 | (A3; the tree wins) Before any prompt that would leave a new passkey, the page asks `verifyUnlockCredential` whether the current password or passkey opens the profile as the change needs it (slots, pairing, imported-keys key and its envelope MAC); a phrase import runs the import's phrase checks before its card; the full list is `lessons/phase-A3.md` § Deviations | asking the new passkey first and letting the change refuse | a refused change would leave a passkey on the authenticator that opens nothing, once per retry |
| D23 | (A3) Import, restore, the account file and the unlock method run the passkey card in the page; on Firefox's toolbar panel the phrase import, the account file and the unlock method move to their own window first (D15); only create keeps PATH B, where "Use a passkey I already have" also runs | PATH B for every new step | D15's pattern, and one flow per window |
| D24 | (A3, OA-10 B) Every session opened with its DEK persists a bearer unless strict mode is on, whatever the unlock; the silent restore skips a row no unlock opens (retired or unreadable) | a bearer gate by profile type | D1: a passkey profile is a password profile with the passkey in the password's place |
| D25 | (A4) Terms 1.2 and Privacy 1.2.6 take `«FILL: effective date»` until the promote publishes them, with their `BEFORE-LAUNCH.md` § 4 entry; `launch-legal` refuses a promote into `main` while one remains | a date now | privacy 1.2.2 to 1.2.5's precedent: `dev` publishes nothing, and a patch takes effect on publication |
| D26 | (A4) Beyond the signed text, each the shortest sentence the live behaviour needs and each an owner ask (OWNER-ASKS.md § A4 asks): privacy § 9 drops "optional", § 3's session row says "the profile's session" (true once A3 lands OA-10 B); the README banner no longer names the passkey among what restores a profile; the history rows; the listing's citations. The listing's credential-id row stays as signed | rewording signed text | the signed text is the owner's; a gap is filled, a conflict is asked |
| D27 | (2026-10-26, the owner's answers on #1152, OWNER-ASKS.md § A4 asks) A4-1: the listing's credential-id row takes the asked text and privacy § 5.4 lists the profile's random value, an in-place edit of 1.2.6; A4-6: the Chrome form's PII entry names the passkey's name, which carries the profile name (OA-5 revised). The sentences that name the label "Nulo wallet" or keep profile names local (§ 5.4; the listing's label and profile-name rows and its Firefox declaration) stay, true at this head, until the profile-named passkey lands and the owner words them | a privacy 1.2.7 with its own history row; rewording those sentences now | 1.2.6 has not reached the trunk, so revising it is drafting, as 1.2.2 to 1.2.5 were each bumped once merged (Codex: holds); those sentences are signed text the answers did not cover |

**Outline B** (both reviews saw it): lift the unlock into `unlock: {kind: "password"} | {kind: "passkey", credentialId, prfSalt}` on every row, migrate password rows into it, and ship the code in one arc plus a docs arc. Rejected in D3 and D13.

## Architecture & Implementation

### The key hierarchy after the change

| Blob | Sealed under | Opens with |
|---|---|---|
| `guard`, `secret` (master), `entropy` | password row: version-0 PBKDF2-600k frames (unchanged); passkey row: version-1 frames under the unlock key, `PROFILE_AAD` | the password; or the passkey's output for the row's `prfSalt` |
| `dekSealed` | the same key as the slots, AAD `nulo:profile-imported-dek:v1` | the same |
| imported signing keys, sealed roots, PXE store, dApp-session MAC, envelope MAC | unchanged | an open session |
| full backup file | `nulo:full-backup:v2:` PBKDF2-600k frame under the profile password (password profile) or a file password typed at export (passkey profile, at least 8 characters) | that password |
| account file | `EncryptionKey`, AAD `nulo:account-export:v1`, under the profile password or a file password (at least 8 characters) | that password |
| session bearer | unchanged; passkey profiles get none unless OA-10 B | |

No file or log the wallet writes carries `prfSalt`: the profile slice of a backup is block-listed and rebuilt, the account file carries no row field, and `REDACTED_KEYS` (`wallet/logger/utils.ts`) gains `prfSalt` and `prf-salt`. Errors log a fixed category.

### Data and control flow

- **Create (passkey):** the popup draws `prfSalt` (PATH B: the background's request carries it) → ceremony create; if the authenticator gives no PRF at create, `confirmMinted` asserts with the same `prfSalt`, kept in retry state → the result `{id, prf, userHandle, prfSalt}` reaches `createPasskeyProfile` → inside the persist lock the service allocates the id, mints the entropy, derives the master, derives the unlock key from the result, seals slots and a fresh DEK, computes fingerprint and MAC, writes the row, opens the session → the flow calls `exportMnemonic(id, {credentialData})` for the phrase stage and drops the data (D7).
- **Unlock (passkey):** `getPasskeyUnlockParams(id)` returns `(credentialId, prfSalt)` (retired → `RetiredProfileError`) → ceremony get (`allowCredentials` + `eval`) → `unlockPasskeyProfile` re-reads the row under its lock, refuses a changed `credentialId`, `prfSalt` or `pxeGeneration`, opens through `openSlots`, runs `assertEntropyMasterPair`, verifies the MAC, opens the session. A wrong output makes the box return `null` → `PasskeyUnlockError`.
- **Backup export (passkey):** ceremony → `openBackupTransfer` through `openSlots` → the password body → the page requires a valid file password → `sealFullBackupText`.
- **Restore:** pick → decrypt → checksum, epoch, range → `validateAndMigrateBackup` refuses an old passkey body (D9) → the selection is published → unlock choice → the run re-validates → `RestoreMaterial {master, entropy, transferKey}` + the chosen unlock.
- **Retired row:** `classifyProfileRow` → `ProfileInfo.retired = true` (projection, never stored) → the matrix below refuses; delete removes it by storage keys.

**Refusal matrix** (each a test in `P/service.integration.test.ts`, `session-manager.test.ts` or `wallet/services/account/service.test.ts`, with a password-row success control). `RetiredProfileError`: `getPasskeyUnlockParams`, `unlockProfile`, `unlockPasskeyProfile`, `finalizeRestore`, `exportMnemonic`, `exportPlain`, `exportImportedKeysDek`, `openBackupTransfer`, `changeProfilePassword`, `changeUnlockMethod` (A3), `fillRowKeysHoldingLock`. Denied, whatever error comes first: `AccountService.exportAccount`, `exportResetHeldAccount`, `exportFullBackupKeys`. Skipped without a throw, service start-up unaffected: silent `restore`. Allowed: `getProfiles`, `deleteProfile`, `changeProfileName`. `RetiredProfileError` round-trips through `extension-messaging` (a transport test).

### File-level change map

**A1** (`feat(crypto)`), behaviour-preserving:
- `WC/password-secret-box.ts`: the guard, AAD and null-on-wrong-key logic moves into a slot sealer parameterized by `(seal, open)`; public API and bytes unchanged.
- `WC/passkey-unlock-key.ts` (new): `newPrfSalt()`, `derivePasskeyUnlockKey(prf, prfSalt)`; refuses a PRF result or salt that is not 32 bytes.
- `WC/passkey-secret-box.ts` (new): seal and unseal the three slots under the unlock key with `sealFrame`/`openFrame`.
- `WC/index.ts` exports them; `WC/public.ts` (npm) unchanged.
- `P/profile-row.ts`: `classifyProfileRow` over today's `z.discriminatedUnion` of the two variants, unchanged; `wallet/storage/stored-shapes.ts` takes its `profiles` schema from there (the emitted snapshot must stay identical: `bun run baseline:storage` prints "unchanged"); `P/repository.ts` reads through the classifier.
- `P/service.ts`: `openSlots(row, credential)` becomes the only reader of the password slots; `restore` takes `RestoreMaterial` for the password body (the passkey branch is untouched until A2).
- Tests: `passkey-unlock-key.test.ts` (KAT against `node:crypto` `hkdfSync`; 31-byte PRF and salt refused), `passkey-secret-box.test.ts` (round trip; wrong key, moved slot, another profile's `prfSalt` each `null`, with a success control), `profile-row.test.ts` (each variant, a partial row unreadable); `password-secret-box.test.ts` and `P/service.integration.test.ts` green unedited.

**A2** (`feat(passkey)`):
- Crypto: `WC/passkey-credential.ts` keeps the credential data type (with `prfSalt`) and `deriveUnlockKey`; `WC/backup-mac.ts` and its test go; `PASSKEY_PRF_LABEL` leaves `WC/constants.ts`; `wallet/crypto/key-vectors.test.ts` V3, V3b, V8 move to `reference/key-model-v2-hardening/` (D11); `WC/reduction-entropy.test.ts`, `imported-keys-dek-box.test.ts`, `zeroize-sites.test.ts`, `nonce-uniqueness.test.ts` follow.
- Ceremony: `wallet/services/passkey/spec.ts` (`PasskeyRequest.prfSalt`), `wallet/services/passkey/service.ts` (`resolvePasskeyRequest` derives with the request's salt and refuses a result reporting another), `wallet/utils/passkey-ceremony.ts` (PRF input from the request, the evaluated salt in the result, random `userHandle`, label per OA-5), `wallet/utils/passkey-errors.ts` (retry state keeps `prfSalt`), `wallet/utils/create-passkey-profile.ts` (no id reservation; returns profile and credential data), `wallet/utils/passkey-label.ts`, `popup/windows/passkey/index.vue`, `utils/passkey-copy.ts`.
- Profile service: `P/spec.ts` (`Profile` passkey variant, `ProfileInfo.retired`, `RestoreMaterial`; `getPasskeyUnlockParams` replaces `getPasskeyCredentialId`; `importPasskey`, `PasskeyBackupMaterial`, `generateProfileId` for passkey go), `P/profile-row.ts` (new variant, retired variant, `newPasskeyRow` with slots + `prfSalt`, MAC for both types), `P/service.ts` (create, unlock, `exportMnemonic` with a passkey credential, the matrix), `P/passkey-recovery-coordinator.ts` keeps the PATH A/B seam returning the unlock key; `recoverUnknown` and `recoverByCredentialId` go, `P/session-manager.ts`, `wallet/services/account/service.ts` (`exportPasskeyBackupKeys` goes; `exportFullBackupKeys` takes either credential), `packages/extension-messaging/src/errors.ts`, `wallet/logger/utils.ts`.
- Storage: `wallet/storage/stored-shapes.ts` (the classifier's three variants), `stored-shapes/goldens.json` (`profiles.passkey` keeps its value as the retired golden; new `profiles.passkeyPhrase`), `stored-shapes/pins.ts`, `snapshot.json` (generator only), `stored-shapes.writers.test.ts`, `stored-shapes/snapshot.test.ts` (R5 opens `passkey.txt` with the fixture password too), `backups/`.
- Backup: `composables/useFullBackupExport.ts` (mandatory valid file password), `composables/full-backup-restore.ts`, `composables/useFullBackupImport.ts` (the shape refusal in `validateAndMigrateBackup`, called at pick and decrypt; every backup asks a new password until A3), `components/composite/import/ImportFullBackupForm.vue`, `composables/useRestoreAgain.ts` (the early validation), `utils/full-backup-helpers.ts` (`passkeyBackupAuthenticator` goes), `composables/useProfileImportFlow.ts` (`handleImportPasskey` goes), `composables/useProfileCreateFlow.ts`.
- E2E harness: `tests/e2e/update-replay.test.ts` (encrypted passkey backup; the 0.31.0 passkey case), `tests/e2e/fixtures/update/recording.ts` (`passkey.txt`), `tests/e2e/helpers/backup-seal.ts`, `scripts/e2e/backup-seal.test.ts`, `tests/e2e/fixtures/passkey.ts`.
- UI per the signed page: `onboarding/pages/create.vue`, `onboarding/components/OnboardingPhraseStep.vue`, `onboarding/steps.ts`, `onboarding/pages/import.vue`, `popup/pages/import.vue`, `components/composite/import/ImportMethodPicker.vue`, `popup/pages/profile/new.vue`, `popup/pages/auth.vue`, `popup/components/popups/ForgotPasswordPopup.vue`, `popup/pages/settings/security/reset.vue`, `popup/components/modules/general/GetStartedCard.vue`, `utils/get-started.ts`, `popup/pages/settings/security/export/{index,seed,full}.vue` (the Account row stays hidden for passkey profiles until A3), `components/MigrationBarrier.vue`, `utils/profile-flow-notices.ts`, `utils/own-window.ts`.
- Docs (live behaviour): `SECURITY.md`, `packages/wallet-crypto/{ATTACK-SURFACE,README}.md`, `ARCHITECTURE.md` §§ 5, 7, 10, `apps/extension/tests/e2e/{PRF-NON-PORTABLE,README}.md`, `CLAUDE.md` § Persisted-storage, `.claude/skills/release/SKILL.md` step 1, the headers of `baseline.ts`, `generate.ts`, `snapshot.test.ts`, `pins.ts`, the comments around `NULO_KDF_SPEC`. Pinned replacement text is below.

**A3** (`feat(passkey)`): `P/service.ts` (`importMnemonic` and `restore` take a passkey credential; under OA-6 `changeUnlockMethod`: snapshot, prompts outside the lock, locked full-row revalidation, then the pairing check and the original envelope MAC over the DEK (as `changeProfilePassword` does, `P/service.ts:1216-1244`; a degraded row is refused, never converted, and no new DEK is minted), then one atomic reseal of slots and DEK with a new MAC, master, DEK and row keys kept; a failure after the commit is reported as a changed method that needs a fresh unlock, never as "nothing changed"; under OA-10 B the bearer for passkey rows, retired and degraded rows excluded), `components/composite/import/{ImportSecretForm,ImportFullBackupForm}.vue`, `composables/useProfileImportFlow.ts`, `popup/pages/settings/security/export/account.vue`, `popup/pages/settings/accounts/index.vue`, the account-export callers, under OA-5 C the "use a passkey I already have" request (a discovery get with the new salt) on PATH A and PATH B with its window step, under OA-6 `popup/pages/settings/security/unlock-method.vue` (new), `popup/pages/settings/{index,lock}.vue`, `utils/settings-search.ts`, `utils/own-window.ts`.

**A4** (`docs(legal)`): `legal/{terms,privacy}.md` + `legal/archive/`, `packages/legal/src/manifest.ts`, `apps/extension/store/listing.md`, `README.md`, close-out.

### Pinned replacement text (A2 docs)

- `SECURITY.md` § Passkey RP ID: the sentence "The wallet holds no factor of its own: … (imported keys come back only with a full backup)." becomes "A passkey profile's recovery phrase is sealed in the wallet's storage under a key rebuilt from the passkey for that profile; the seed and every key stay encrypted in the wallet's own storage, and nothing that leaves it (a backup, an export) opens with the passkey alone. A fresh install recovers from the recovery phrase or a full backup." The sentence after it stays word for word. The crypto-bound list names `nulo:passkey-unlock:v1` and keeps the three old labels as the record of profiles made before 1.1.
- `ATTACK-SURFACE.md`, the passkey paragraph becomes: "**A passkey profile has no offline attack either.** Its slots are sealed under a key rebuilt from the passkey's output for the profile's own random input, which only the authenticator computes, after user verification. A disk reader gets that input and ciphertext they cannot key; there is no password to guess. The passkey unlocks; it does not restore: a fresh install recovers from the recovery phrase or a full backup. Storage plus an approved passkey prompt opens the profile, as storage plus the password opens a password profile." The disk table: `dekSealed` "same (password) / the passkey unlock key"; a `prfSalt` row "plaintext; opens nothing without the passkey"; the passkey backup rows become "passkey full backup file · as the password full backup · the file password chosen at export"; the `backup-mac` row goes.
- No other sentence about passkeys is written beyond what the change map's docs need to stay true; a new sentence states a property of the new design, never of the old one.

### Non-obvious mechanics

- The retired variant forbids the new-only keys rather than all unknown keys (D4).
- The service binds a unlock result to the row's `prfSalt` under its lock; a create result's `prfSalt` is checked for 32 bytes and stored as reported.
- A passkey shared by two profiles (OA-5 C) means moving slots together with `prfSalt` between those two rows opens; v3's id binding catches it and the profile opens derived-only, as for two same-password rows today.
- The pairing check runs at every passkey unlock, as at password unlock.

### The re-cut (A2, phase A2.3)

#1093's procedure (F9), with these deviations: `passkey.json` is replaced and the R5 opener learns `passkey.txt`; no preservation rule changes. `<S>` is `apps/extension/src/wallet/storage/stored-shapes`; `<B>` is `~/.cache/nulo-backlog/passkey-unlock-1/base`.
1. Before A2.1, from the arc's base commit: `git show <base>:<S>/snapshot.json > <B>/snapshot.json`, the same for `goldens.json`; `bun run baseline:storage` prints "stored shapes unchanged" there.
2. Change the classifier; add the `profiles.passkeyPhrase` golden; set `"stamp": 0` on every golden; set `PINNED_STAMPS = []`; run `bun run baseline:storage -- --freeze`; paste the printed pin.
3. Prove against the base (the base has three stamps, the new file one): `jq -S '.stamps[-1] | del(.shapes.profiles, .expected["profiles.passkeyPhrase"], .additive)'` on `<B>/snapshot.json` equals `jq -S '.stamps[0] | del(.shapes.profiles, .expected["profiles.passkeyPhrase"], .additive)'` on the new one, `version` and `zod` included; `jq -S '[.goldens[] | select(.id != "profiles.passkeyPhrase") | del(.stamp)]'` is equal on both goldens; the new file's golden ids minus the base's are exactly `["profiles.passkeyPhrase"]`. The `profiles` shape diff is read in the PR.
4. Record the new passkey backup: commit everything a build reads (`tests/e2e/fixtures/update/source.ts:21-24` refuses a dirty tree), `bash apps/extension/scripts/e2e/build-update-candidate.sh chrome`, then `NULO_E2E_UPDATE_FROM=v0.31.0 NULO_E2E_UPDATE_TO=<candidate> NULO_E2E_BACKUP_RECORD=1` on Chrome (`apps/extension/tests/e2e/README.md` § In-place update); copy `passkey.txt` from `.e2e-state/pinned-backups/`; re-pin it; `password.txt` and its pin stay byte-identical; the old `passkey.json` moves to the restore test's fixtures.
5. `bun run baseline:storage` prints "unchanged"; every test under `wallet/storage` passes.
6. CLAUDE.md § Persisted-storage: after the #1051 sentence, "Stamp 0 was re-cut a second time on <date>, when passkey profiles moved to a sealed recovery phrase; the owner: 'And yes, I understand we will need to re-do the task that froze the local storage schema (I can't recall how we called that feature) so this is the new full base.' 1.0.0 reached no store." "A pin is never removed again" becomes "A pin is removed only on the owner's recorded decision, as these were." The same change in the release skill, `pins.ts`, `snapshot.test.ts`, `tests/e2e/README.md` and `ARCHITECTURE.md:119`.
7. After the last `dev` merge before the PR: refresh `<B>` from `origin/dev` (`git show origin/dev:<S>/…`), never from the candidate, and repeat steps 2, 3 and 5 against it; repeat step 4 only if the merge changed what a backup holds. The orchestrator holds other stored-shape PRs while A2 is open.

## Security & Adversarial Considerations

- **Threat model** (as properties):
  - A reader of storage (a disk image, a synced profile) gets ciphertext and `prfSalt`; the slots open only with the passkey's output for that input. No offline guessing path exists, unlike a password.
  - Everything that leaves the storage (a backup, an account file) opens with its file password, never with anything the passkey produces. The file password meets the wallet's 8-character rule under PBKDF2-600k.
  - Storage plus an approved passkey prompt opens the profile, as storage plus the password opens a password profile. The docs state this as a property; the wallet claims no protection beyond it.
  - Code running inside the extension: out of scope, as today.
  - A same-phrase sibling profile: same derived accounts by construction; never the DEK, imported keys or dApp grants (unchanged).
  - A hostile backup file: decryption, checksum (corruption only), epoch, range, then the shape refusal, before any further prompt or write; restore re-verifies `entropy` against the master (unchanged).
- **Ceremony binding:** a create seals under the salt the passkey reported evaluating; an unlock under the row's salt, re-checked under the lock; PATH B compares the window's result with its request.
- **Cryptography:** WebCrypto only (HKDF-SHA256, AES-256-GCM, PBKDF2-SHA256 600k); no new dependency. KATs against `node:crypto`.
- **Input validation:** PRF result and `prfSalt` are 32 bytes; a row is classified before any field is read.
- **Log hygiene:** `prfSalt` in `REDACTED_KEYS` both spellings; fixed-category error lines.
- **Least privilege / supply chain:** no manifest, permission, workflow or dependency change.
- **Residuals** (stated in ATTACK-SURFACE.md, not filed): an old ciphertext copy stays openable with its old credential after a method change, as after a password change today.

## Phases and gates

Fast layers: `bun run lint`, `bun run typecheck:all`, `bun run test`. A gate passes at exit 0 with every named file green at retry 0. Smoke runs first build the armed dist (`apps/extension/tests/e2e/README.md`, the armed build command the smoke setup names).

**A1.1** ✓ crypto: slot sealer, unlock key, passkey box. Gate: fast layers; `bun run test:all`; `git diff <A1 base> -- packages/wallet-crypto/src/password-secret-box.test.ts packages/wallet-crypto/src/public.ts` empty.

**A1.2** ✓ service seams: classifier, `openSlots`, `RestoreMaterial`. Gate: fast layers; `bun run test:all`; `bun run baseline:storage` "unchanged"; `P/service.integration.test.ts` green unedited.

**A2.1** ✓ (re-cut step 1 first) crypto removal, ceremony salt, service create/unlock/reveal, the matrix, typed error. Gate (targeted; callers move in A2.2, the snapshot in A2.3): `bun --bun vitest run` on `P/service.integration.test.ts`, `P/session-manager.test.ts`, `P/profile-row.test.ts`, `wallet/utils/passkey-ceremony.test.ts`, `wallet/utils/create-passkey-profile.test.ts`, `wallet/services/passkey/service.test.ts`, `popup/windows/passkey/index.test.ts`, the `extension-messaging` errors test, from `apps/extension` and the package; `bun run --cwd packages/wallet-crypto test`. New tests: composition create → lock → unlock and the master comparison (excellent 1); the matrix; the retry keeps and reuses its `prfSalt`; two profiles on one credential with different salts each open only their own; PATH B refuses a result with another salt.

**A2.2** ✓ backups and screens per the page. Tests: `composables/useFullBackupImport.test.ts` (old `passkey.json` refused by shape in `validateAndMigrateBackup`, before a prompt or a write; a new passkey backup restores as a password profile; no `prfSalt` in the body), `useRestoreAgain.test.ts` (the same refusal before a write), `useFullBackupExport.test.ts` (a 7-character or mismatched password never reaches encryption or download; a valid one does), `full-passkey.pins.test.ts` rewritten, component tests for every changed state, the own-window calls (D15). Gate (targeted): `bun --bun vitest run` on every test file the phase adds or edits, from `apps/extension`; `bun run lint`; `bun run typecheck:all`.

**A2.3** ✓ stored shapes and the re-cut (procedure above). Gate: the `jq` proof pasted; `bun run baseline:storage` "unchanged"; R1 to R5 green; then the arc's full gate: fast layers, `bun run test:all`, `bun run audit:vue`, screenshots of every changed screen in light and dark for the PR.

**A2.4** ✓ e2e on both browsers: smoke `passkey-paths`, `passkey-backup`, `passkey-retry`, `toolbar-panel` (Firefox), `onboarding-tab`, `onboarding-import`, `import-paths`, `security-backup`, `legal-acceptance`; network `network/passkey-execution-canary` prover-ON; the update replay from `v0.31.0` (release skill step 1). Commands: `cd apps/extension && bun run test:e2e -- <file> --retry=0`, again with `NULO_E2E_BROWSER=firefox`; `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/passkey-execution-canary.test.ts`, then with `NULO_E2E_BROWSER=firefox`. Scenario budget:
- `onboarding-tab`: passkey create shows the phrase stage, "I saved it", lock, unlock on the same address. Proves the real ceremony with a per-profile input through onboarding on both browsers; no cheaper layer runs a passkey. Estimate +6 s per browser.
- `passkey-paths`: the discovery-import case goes and its unlock case covers the new row. Estimate −8 s per browser.
- `passkey-retry`: the unconfirmed-create case also locks and unlocks. Proves the retry kept its salt through a real second prompt. Estimate +3 s per browser.
- The update replay's 0.31.0 passkey case (opt-in, pre-promote): the old row through a real update shows the retired state. Estimate +40 s per browser.
- Retired refusals, the backup shape refusal and the own-window calls: unit, composition and component tests; no e2e.
Gate: every file green on both browsers; the PR gives each suite's wall-clock before and after.

**A3.1** ✓ unlock choice on phrase import and restore (OA-2), account file (OA-3c), and what OA-5, OA-6 and OA-10 put in scope. Tests: composition phrase → passkey profile with the same master (excellent 1); restore → passkey; method change keeps master, DEK and row keys, a prompt cancelled or a row deleted during the prompt leaves the row unchanged; account file refused below 8 characters with a success control; passkey bearer restores after a background restart and never after strict mode is on. Gate: fast layers; `bun run audit:vue`.

**A3.2** ✓ e2e: `passkey-backup` restores a passkey profile's backup choosing a new passkey and lands on the same address (proves the restore's passkey path; replaces today's round trip, estimate +4 s per browser); under OA-5 C, `passkey-paths` creates a second profile with the existing passkey (proves the discovery request with a new salt; estimate +10 s per browser); under OA-6, `security` changes the method both ways (estimate +15 s per browser). Gate: those files green on both browsers.

**A4.1** ✓ legal and listing per OA-11, README per OA-8d. Gate: fast layers; `bun run test:all` (`@nulo/legal`); smoke `legal-acceptance` on both browsers (the re-acceptance sheet); `bun run check:plans`.

## UI impact

- A1: none.
- A2: `/onboarding/create`, the phrase stage, `/onboarding/import`, `/popup/import`, `/popup/profile/new`, `/popup/auth`, the "Lost your password?" popup, `/popup/settings/security/reset`, Home Get started and banner, `/popup/settings/security/export`, `.../seed`, `.../full`, the passkey card's tags, `MigrationBarrier`, the backup refusal. OWNER-ASKS OA-1, 2, 3a, 3b, 3d, 4, 5, 7, 12; FLOWS.md.
- A3: the import forms, `.../export/account`, `/popup/settings/accounts`, under OA-5 C the passkey tabs, under OA-6 and OA-10 `/popup/settings`, `/popup/settings/lock` and the unlock-method page. OA-2, 3c, 5, 6, 10.
- A4: the Terms acceptance sheet. OA-11.
- Sign-off: decision page 86, signed by the owner on 2026-10-25 (signoff-P86), records P86-01 to P86-23 on #1127 under "## Decision", mapped per ask in OWNER-ASKS.md; each PR body quotes the records it builds. Approval: the owner, 2026-10-25, "Start A1 now"; the orchestrator approves the plan as committed.

## Delivery

| Arc | Phases | Base | PR title (≤ 93) | Closes | code_review |
|---|---|---|---|---|---|
| A1 | A1.1–A1.2 | `dev` | `feat(crypto): seal profile secrets under a per-profile passkey unlock key` | — (part of #1127) | off |
| A2 | A2.1–A2.4 | `dev` after A1 | `feat(passkey): a passkey profile keeps a recovery phrase its passkey unlocks` | — (part of #1127) | off |
| A3 | A3.1–A3.2 | `dev` after A2 | `feat(passkey): choose how to unlock after a phrase import or a backup restore` | — (part of #1127) | off |
| A4 | A4.1, close-out | `dev` after A3 | `docs(legal): passkey profiles have a recovery phrase` | #1127 | off |

- One PR per arc, opened without labels after its gates and its Codex loop; `e2e:extension-smoke`/`e2e:extension-network` added only when the path filter would skip a suite the arc needs. Body: what and why (the change and its property, never a weakness), validation with outcomes, per-browser e2e wall-clock before and after, the signed asks quoted, the accessibility calls under the owner's 2026-10-19 delegation.
- Serial: each arc branches from `dev` after the previous merged. No promote to `main` until A4 merges; `dev` between A2 and A4 carries legal text not yet true, which no release ships.
- Parallelism: none worth it.

## Post-implementation

`implementations-plan/README.md` § Post-implementation standard at `face80099`, with these specifics:
- Review loop per arc at its boundary, before the PR: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; the prompt carries the arc's diff from `dev`, this plan and ledger, the arc map ("arc N of 4; later arcs build …"), the adversarial ask, the two verbatim rules, and the wording rule for committed text. Hard stop at three rounds, then report. After A4's loop, one fresh session over the net diff from `face80099` with the cross-arc ask.
- `/code-review`: off.
- Close-out as A4's final commits: merge `origin/dev`, read `index.md` and `lessons.md`; Outcome; lessons promotion (likely: "zod keeps unknown keys out of a strict object only: a legacy variant beside a newer one forbids the newer keys"); known limits filed closed; `STATUS.md` deleted; `git mv` into `archive/` in its own commit; `bun run check:plans` green.
- Teardown after A4 merges: `agent-worktree done passkey-unlock-1 --merged --trunk dev`. A `/loop` session checks each firing; a `/goal` session arms one background wait after its report.

## Review verdicts

- **Codex, key hierarchy (consult, before the plan):** approve with refinements (D2, D3, D8, D9, D11; lessons/phase-0.md).
- **Codex, round 1:** reject. Accepted: the wording trims in the plan files, the file-password rule (F14, D8), the create contract (D6), the runtime classifier and transport (D4, D5), the restart boundary (D14), the R5 opener and recorder (re-cut steps 4 and 7), targeted gates in A2 and the hidden Account row, the unlock-method boundaries (A3), the copy of OA-6 and OA-11, the incomplete options (OWNER-ASKS), the budgets and I4 (F1). Rejected: none.
- **Opus, round 1:** conditional approve. Accepted: H1 (D6), M1 (D5), M2 (re-cut), M3 (change map), M4 pinned text, M6 (OA-11 § 5.4), M7 (A3 owns OA-5 C), L1 (D9), L2 (budgets, D10), L3 (the armed build before smoke), L4 (D4), L5 (`jq` proof commands), L6 (`prfSalt` out of every file and log), L7 (the shared-credential row swap caught by v3), the owner-page gaps. Rejected: one extra sentence M4 proposed for `SECURITY.md`, beyond what the docs need to stay true (pinned replacement text); M5's A2 split (D13).
- **Codex, final fresh pass:** conditional approve; no new path opens a retired profile; leak check clean. Conditions, all accepted (a resumed round verified them and added four wording corrections, applied: A3's master comparison, the validator's test file, excellent 3, OA-4 C's button): A1 keeps the discriminated union (D4); A2.2's gate made targeted and the base captured before A2.1; the `jq` proofs, the candidate build command and the step-7 baseline corrected; address equality left to the pinned derivation, not a composition test (excellent 1); the backup refusal moved to pick and decrypt in `useFullBackupImport.ts` (D9); the method change verifies the original MAC before resealing and reports a post-commit failure truthfully (A3); typed-error precedence narrowed (D5); F2, F3, I3 and D6 wording; OA-4, OA-7 and OA-11 gaps. Rejected: none.
- **Codex, A1 round 1 (diff review):** approve; no material defect. Two comment nits, both accepted (`4db4f077b`).
- **Opus, A1 round 1 (diff review):** approve; no bugs. Accepted: the opener's test watches every `EncryptionKey` frame, the DEK's included, and covers the restore finalize; tests for every buffer the opener and the restore decoder wipe; the wallet-crypto file map; the password class without `type`; two delegate comments and a stale tag dropped (`43205d984`, `389b5cb5b`). Rejected: none.
- **Codex, A1 round 2 (resumed):** approve; fixes verified. Accepted: the wipe test checks a lower bound, not exact buffer counts; the README cites the tests that pin the guard and the AADs, and V8 beside the label it pins (`1476a4d84`). Rejected: none.
- **Codex, A1 round 3 (resumed):** approve; both fixes verified, no new finding. Loop converged.
- **Codex, A2 round 1 (diff review):** conditional approve. Accepted: the PRF output is wiped when the input does not decode; an empty password gets each path's own refusal again and `exportPlain` keeps "Password is required"; two comments back on what they describe (`8f42778ee`). Rejected: none.
- **Opus, A2 round 1 (ceremony and service):** approve. Accepted: the account exports' retired-row tests (`401267c0e`); the salt comment says each create mints its own salt, rather than a create refusing a stored salt (the name binding sends a retry to a fresh credential); the vectors line names the unlock key's test; a clause at `exportPlain`'s empty-password check (`7c3e5da20`). Rejected: none.
- **Opus, A2 round 1 (storage and backups):** approve. Accepted: the unread plain copy of the body dropped; a pick serial, so a pick a later one overtook publishes nothing (D9 claimed a pick fence the tree lacked), with Restore again's control for a current passkey body (`84eae1d90`); stale test labels and comments, ARCHITECTURE's vectors line, PRF-NON-PORTABLE's option A, a SECURITY.md clause trimmed (`84eae1d90`, `401267c0e`, `7c3e5da20`). Rejected: none.
- **Codex, A2 round 2 (resumed):** conditional approve; round-1 fixes verified. Accepted: a pick back from its chooser while a restore runs stops there, and a restore's start advances the pick count, so a pick still reading publishes nothing over the run, in Restore and Restore again, with a test of each moment (`3750163c7`). Rejected: none.
- **Codex, A2 round 3 (resumed):** approve; the round-2 fix verified (a Retry cannot start while a pick reads; a refused or duplicate restore leaves the count alone), no new finding. Loop converged.
- **Codex, A3 round 1 (diff review):** reject. Accepted: the commit checks it still holds the lock after its last read of the row, with a test revoking ownership during that read (`f27445217`); a network switch ends the account file's flow, invalidating a pending answer or export, with A→B→A tested; a success control for the held account's passkey file; a restating doc comment dropped (`9d71e56aa`). Rejected: deleting the SFC import-group labels, which CLAUDE.md § Vue SFC ordering convention requires.
- **Opus, A3 round 1 (method change and bearer):** conditional approve. Accepted: `verifyUnlockCredential` (D22) opens the slots, the pairing and the imported-keys key with its envelope MAC, and the page runs it before any new passkey, so a profile the change would refuse leaves none behind; the DEK is wiped when its MAC check throws; the change sends the password that was checked; the `Session.bearer`, RPC and reopen docs and a test name corrected; the composition test deletes during the prompt (`f27445217`, `9d71e56aa`). Rejected: the hub's Lock row copy (user-visible text outside the signed records; OWNER-ASKS); moving the reseal's derivations out of the lock (the commit keeps its order; the comment now says what runs where).
- **Opus, A3 round 1 (import, discovery, account file):** conditional approve. Accepted: a phrase import runs its phrase checks before the passkey card (D22); a test for the restore at a taken input; a re-picked backup reopens on its own method; the account file's Save-on-Enter answers only `isPopupSubmitKey` (the listener stays where the password branch had it); 8-character success passwords; the own-window header and the reuse link's focus ring (`f27445217`, `9d71e56aa`). The network-switch finding was answered by Codex round 1's reset. Rejected: the create flow reusing `useNewProfilePasskey` (A2's path, with its own tests); refusing a declined duplicate before the card (needs a new RPC; OWNER-ASKS, as a known limit).
- **Codex, A3 round 2 (resumed):** reject; round-1 fixes verified. Accepted, all four (`6786ebb9f`): Continue stops after a password check that ended for another profile; the credential check compares the whole live row with its snapshot under the lock, shared with the commit; a bearer restore rechecks strict mode after the envelope-MAC check, its last await; the network reset ends only a passkey profile's file not yet made, so a password profile's stages and a made file survive as before. Each new test fails with its fix reverted. Rejected: none.
- **Codex, A3 round 3 (resumed):** reject; round-2 fixes verified. Accepted: a change of the profile's unlock from another window ends the account file's flow (`1077905bb`); its test fails with the fix reverted. The suggested fix kept a made file; the flow drops it too, since the made file's copy follows the unlock. Rejected: none. The loop stopped at its three-round cap with this finding fixed, not on an approve.
- **Codex, A4 round 1 (documents against A1, A2 and A3's map):** conditional approve. Accepted: privacy § 9's "optional" dropped (every full backup leaves encrypted); the declaration note cites where the random identifier is made and handed over (`09f631930`). Held for the owner: the listing's credential-id row says "No", while each prompt hands the id and the profile's input to the browser and the authenticator (D26). Rejected: "(WebAuthn PRF)" in the README's developer-facing Status list.
- **Opus, A4 round 1 (mechanics):** the versions, material flag, sheet, null dates, permalinks, archives and consent pin hold. Its three points were already dispositioned: the A3 wording ships after A3 (Delivery), the credential-id row and the README banner bullet are owner asks (D26). Rejected: none.
- **Codex, A4 round 2 (resumed):** no new finding; both fixes verified. Loop converged.
- **Codex, final fresh pass (the net diff from `face80099`, cross-arc):** reject.
  - Accepted: Full Backup starts over on a change of the profile's unlock made elsewhere, as the account file does, with a test and a rename control (`3bf2cb897`).
  - Accepted: `SECURITY.md` and `ARCHITECTURE.md` described a passkey session as never persisted, though A3 made every profile follow strict mode, and the RP ID comment called passkey wallets unrecoverable after an RP change (`1a09bba67`).
  - Rejected: none.
- **Opus, final cross-arc leg:** conditional approve; no path breaks the property.
  - Accepted: the session docs (Codex found them too), the e2e skill's restart line, the listing's moved citation, ATTACK-SURFACE's reseal limitation that the plan said it stated, and two stale comments (`1a09bba67`).
  - Held for the owner: privacy § 5.4's list (#1152).
  - Known limit: a restore's passkey card runs before the service checks the backup's entropy against its master, and a declined duplicate warning keeps its passkey (#1151).
  - Rejected: none.
- **Codex, final round 2 (resumed):** approve, no new finding. The fixes held in both directions. Loop converged.

## Seeds (retired)

```
/goal Arc <N> of implementations-plan/passkey-unlock-1/plan.md is done: every phase of the arc marked ✓ with its validation gate reported passing in the transcript, LESSONS_FILE=implementations-plan/passkey-unlock-1/lessons/phase-<N>.md printed, the Codex loop converged (a resumed pass with no new material point quoted), the arc's PR open against dev with its checks green, `bun run test` and `bun run lint` exit 0.
```

```
/loop 15m Drive arc <N> of implementations-plan/passkey-unlock-1 forward per its plan.md: reality check (plan, lessons, git status, the PR's checks), next pending phase, fast layers after each edit, the gate before ✓, the Codex loop at the arc boundary, then the PR. Decide with Codex, never wait; never merge; stop after three failures on one step.
```
