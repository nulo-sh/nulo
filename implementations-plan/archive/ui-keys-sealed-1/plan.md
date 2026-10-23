---
plan: ui-keys-sealed-1
tier: mid
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 5c35ca93; the arc branches from dev once encryption-at-rest-1 A4 and #1027 have merged
trunk: dev
issues: "#1051 (closes); #1062 (reopened on OA-1 A, closed by the PR); #1050 (stays open, the owner's call); #1096 and #1097 (closed known limits)"
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-23.
- **Status:** closed with its one PR, #1093 (`worktree-ui-keys-sealed-1` → `dev`, `Closes #1051`, `Closes #1062`), which carries this close-out. The merge closes the plan.
- **Shipped:** on the owner's page 84 answers (P84-06, OA-1 A; P84-07, OA-2 as drafted):
  - **`UiPreferenceService`** serves the pinned tokens, the app and Send fee-pick maps and the selected account, sealed under the profile's row keys. Each write is one `set`, behind the session fence and the service lock. The popup and the dApp windows reach them only through its RPC, and `saveFeePick` moved here from `ProfileService`.
  - **The maps:** one row per profile. The pre-seal structured maps convert in place through `SealedRootOptions.legacy: "structured"`.
  - **The selection:** one device row, `nulo:ui:selectedAccount@device`, read only by the profile it names. The bare `nulo:ui:activeAccount` moves into it at the first read by a profile that holds that account. The deletion's `purgeForProfile` runs before the keyless sweep, and throws when the lock's watchdog displaced it.
  - **The baseline re-cut, once.** Step 5 was equal for the maps and again for the pointer, with six added golden ids ([lessons/phase-1.md](lessons/phase-1.md)). CLAUDE.md records the re-cut.
  - **Privacy Policy 1.2.4**, as approved.
  - **Home open timing:** within 50 ms of the merge base on both browsers (Chrome 681 → 658 ms, Firefox 1165 → 1008 ms, ready; [lessons/phase-3.md](lessons/phase-3.md)).
  - **Gates**, at retry 0 on both browsers: the full smoke suite, the eight network files, and the three update scenarios ([lessons/phase-2.md](lessons/phase-2.md), [lessons/phase-3.md](lessons/phase-3.md)).
- **Dispositions:**
  - OA-1 B (per-profile rows) and C (the pointer left plaintext) were not picked, and C's contract (§ Delivery) was not built.
  - D12 built the maps first, in a draft PR, then the pointer on the same branch once the answers came.
  - `scope-follow.core`'s send case was removed under KL-1, signed with P84-06.
  - Review: Codex r1 and the Opus leg gave conditional approve, with every finding fixed or filed (#1097); Codex r2 approved ([lessons/phase-4.md](lessons/phase-4.md)).
- **Lessons:** none promoted. `lessons.md` sits at its 8 KiB budget, and the arc's general gotcha, a holder that the lock's watchdog displaced, is already its `Lock` entry. The CDP-vs-BiDi `undefined` array slot went to `apps/extension/tests/e2e/FIREFOX.md`, which owns browser differences.
- **Known limits:** #1096 (KL-1) and #1097. #1060, #1053, #1056 and #338 are unchanged.
- **Open items:** none new. #1050 stays open by the owner's call (commented).
- **Seeds retired:** the `/goal` and `/loop` below.

# ui-keys-sealed-1: the popup's `nulo:ui:*` preferences behind the worker, sealed, and the stored-shape baseline re-cut once before 1.0.0

One arc, one PR against `dev` (the orchestrator's D-orch-1), `Closes #1051` and, unless OA-1 is C, `Closes #1062`. A new worker service serves the pinned tokens, the two fee-pick maps and the selected account, sealed under the profile's row keys; the popup and the dApp windows reach them only through its RPC. The baseline is re-cut once (the one gate change, § The gate change). The PR merges only after the owner's recorded OA-1 and OA-2 sign-off. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## The owner's decision

The owner, 2026-10-22, in chat: "I'd leave #1050 for now open, and actually, since we have some spare room on our crew... wouldn't it make sense to do #1051 and re-shape, or 're-reset' (I don't know the term) of #865 since we haven't actually done any release nor the 'final shape' has hit any users yet?" The orchestrator's reading, which the owner can overrule at this plan's sign-off: no stable release carries the stamps #938's freeze and its successors appended, so the baseline is re-cut once, instead of building a retirement path for a structured shape. #1050 stays open.

The owner's page 84 answers, signed 2026-10-23:

- **P84-06 (OA-1): A.** "One last selection, as today. Every case looks as today except two profiles sharing an account: profile A selects the shared account, a switch to profile B opens B on its own first account."
- **P84-07 (OA-2): approved as drafted.** The change note "Pinned tokens, fee-payer choices and the last-selected account are now stored encrypted too." and § 3's exception paragraph as [OWNER-ASKS.md](OWNER-ASKS.md) drafts it.

## The claims and what did not hold

- **"CLAUDE.md § Persisted-storage's pre-production rule ('a shape change simply redefines the launch baseline')".** Gone: #938 (`246c8851`) replaced it. The re-cut uses the generator's existing unfrozen path and is recorded in CLAUDE.md as a one-time, dated exception (D7).
- **"The pin, snapshot and goldens are regenerated by `bun run baseline:storage` (never hand-edited)".** Holds for `snapshot.json` and for the MACs and seals in `goldens.json`. The golden rows are the generator's input, authored by hand; the generator never changes a golden's `stamp`. `pins.ts` takes the printed pin by hand, as every pin does.
- **"The four structured shapes leave the registry".** Three leave: the pin and fee-pick maps become sealed shapes at the same keys. The bare `nulo:ui:activeAccount` key stays registered, unchanged, as the pre-seal pointer every release before this build wrote: the candidate still reads it (to move it), and the update replay requires every release row to read under the candidate's registry (CLAUDE.md § Persisted-storage; `stored-shapes/reads.ts` `unreadRows`). The sealed pointer is a new root (D1).
- **"No release has reached a user".** No stable release carries stamps 1-4, but the nightly pre-release `v0.31.0-nightly.26296` carries stamps 0-1 (`git tag --contains 11439b1be`). The re-cut changes no stored row, so a nightly install's pre-seal keys convert as 0.31.0's do.
- **"If `activeAccount` is read before unlock anywhere".** It is not: the lock screen, the profile picker and onboarding read only `nulo:ui:lastActiveProfile` (recon).
- **"The stamps 1-3 that A2, A3 and ui-cosmetics-1 appended".** `dev` has stamps 1-2; A4 and #1027 each append one, so the re-cut folds stamps 1-4.
- **#1051, "moving them needs the guard to grow a reviewed retirement path first".** Superseded by the owner's decision.
- **Recon:** fee picks already have one worker writer (`ProfileService.saveFeePick`); the replay's recording holds the pointer but no pin or fee-pick row, and the live update says "Not populated: fee picks, pinned tokens" (`network/update-in-place.test.ts:15`).

## Outcome & Quality Bar

- **For whom:** a person whose browser profile or disk someone else reads (a synced profile, a disk image, another extension with storage access); a maintainer who inherits the guard.
- **Excellent:**
  1. After the first unlock, no key in `chrome.storage.local` holds a pinned contract, a fee pick or an account address in plaintext, and each reads back through the service as it read before.
  2. Nothing a person sees changes except what OA-1 approves: Home opens on the remembered account with its pins, Send and the fee card keep their picks. Popup open → Home ready and Home's first paint stay within 50 ms of today on both browsers.
  3. The guard is as strong after the re-cut as before: every rule runs unchanged, the re-cut is proven to change nothing but the named shapes, and it adds no flag or mode a later change could reuse.
- **Good enough:** a profile never unlocked after the update keeps its pre-seal values (known limit #1060).

## UI impact

The visible budget is the lane brief's record: SECURITY.md § Storage privacy and `legal/privacy.md` § 3 drop the KL-12 lines; a privacy patch bump after A4's 1.2.3, its manifest `changes` line one sentence the owner can edit at sign-off.

- **Home, Holdings, a token page, the token picker, Send, the fee card, Settings → Fee payers, the accounts list, the execute window: none.** Same values, through the service.
- **The lock screen and the profile picker: none.** They read none of these keys, before or after.
- **Which account a profile opens on after a profile switch: changed, signed (P84-06, OA-1 A).** Two profiles that hold the same account (one phrase twice, or one imported account in both): today profile B opens on the account A last selected; now it opens on its own first account. KL-1: a dApp window's account follow that meets a wallet send starting at the same moment is no longer dropped, so the next popup opens on the followed account.
- **Privacy Policy § 3 and its version: changed, signed (P84-07, OA-2 as drafted).** The exception list loses "pinned tokens, fee-payer choices and the last-selected account"; version 1.2.4; Settings → About shows its existing privacy-update notice with the one sentence.
- **Developer Mode → logs, the source filter: gains two rows** (`ui-preference`, `ui-preference-client`; D16).

## Architecture & Implementation

### Proposed architecture

- **`UiPreferenceService`** (`src/wallet/services/ui-preference/{spec,service,client}.ts`, new), the `ContactService` skeleton: `dependencies = [ProfileService.name, AccountService.name]`, one `Lock`, four sealed stores built through `sealedEntityStorage(..., (id) => profileService.rowKeys(id))`. It owns every read and write of these keys. `ProfileService.saveFeePick` moves here with its parser and merger unchanged (D3).
- **The stores** (`src/wallet/storage/stores.ts`). The three maps use A4's `PROFILE_ROW_LAYOUT` (one row per profile, at the profile's id); the pointer's layout is the one OA-1's answer needs, so every write is one `set` and no cross-row cleanup exists (Codex R2-1):

| Store | Root, stored key | Row codec, read | Pre-seal form |
|---|---|---|---|
| `uiPinnedTokens` | `nulo:ui:pinnedTokens@<profileId>` | `z.unknown()`, `sanitizePinMap` | the same key, a structured map |
| `uiFeePicks` | `nulo:ui:feePaymentMethods@<profileId>` | `z.unknown()`, `readAppPicks` | the same key, a structured map |
| `uiSendFeePicks` | `nulo:ui:sendFeePaymentMethods@<profileId>` | `z.unknown()`, `readSendPicks` | the same key, a structured map |
| `uiSelectedAccount`, OA-1 A | `nulo:ui:selectedAccount@device` (new): one row, overwritten by each writer, owned by `row.profileId` | `{ profileId, address }`, address at most 128 chars, codec | the bare value key `nulo:ui:activeAccount` |
| `uiSelectedAccount`, OA-1 B | `nulo:ui:selectedAccount@<profileId>` (new), `PROFILE_ROW_LAYOUT` | `z.string().max(128)`, codec | the same bare key |

- **`SealedRootOptions.legacy: "structured"`** (`sealed-entity-storage.ts`, D4), set on the three map roots: the dual read serves a non-string value at a row's key as that row's pre-seal plaintext, through the codec; `sealLegacy` seals `JSON.stringify` of it at the same key in one `set`, and commits only while the stored value still serializes to that text and the profile still holds its keys. Without the option nothing changes for the other roots.
- **The registry** (`stored-shapes.ts`): the three map entries become sealed shapes (`encoding: "json"`, `sealed: true`, `legacy: "structured"` copied from `STORES`); `uiActiveAccount` stays as it is (structured, read-only: no build writes it any more); `uiSelectedAccount` is new. `sanitizePinMap` moves to `src/utils/pinned-tokens.ts`, so neither the worker nor the registry imports a composable.
- **The guard learns the pre-seal form** (`stored-shapes/baseline.ts`): `shapeRecord` emits `legacy`, `wire` stores a golden without `sealed` of such a shape as is (structured) rather than as a JSON string, and `downgradeOf` refuses dropping `legacy`, as it refuses dropping `sealed`. So R3 keeps proving that the pre-seal maps read as they read today.
- **Lifecycle:** a deletion and a same-id adoption remove both forms of the three maps by key (`PROFILE_UI_KEY_PREFIXES`, unchanged); `purgeSealedRowsOf` walks the new roots through `SEALED_ROOTS`. With OA-1 B the prefix list also gains `nulo:ui:selectedAccount@`. With OA-1 A the device row is the one physical slot two profiles write, and the keyless sweep's read-then-remove is no compare-and-delete: B's write landing between them would be removed (Codex R3-1, an in-memory interleaving). So `UiPreferenceService.purgeForProfile(p)`, the `ContactService.purgeForProfile` pattern, runs in the deletion coordinator's typed purges before `dropRowKeys` and the sweep: under the service lock that every pointer writer holds, it removes the device row when its envelope names `p` (read keylessly, so a resumed deletion with no keys works; a row it cannot parse names nobody and stays), and takes no `ProfileService` lock inside its own. With `p` reserved and its row gone first, the sweep cannot meet another profile's row there.

### Interfaces

```ts
// ui-preference/spec.ts. A method answers only the active session's profile. A read for any
// other profile, a locked wallet or a profile whose deletion began returns the empty value
// (undefined, {}, empty maps) and logs a fixed category at debug; a write resolves false.
type Methods = {
	getSelectedAccount(profileId: string): string | undefined
	setSelectedAccount(profileId: string, address: string): boolean // a string, at most 128 chars
	getPinnedTokens(profileId: string): PinMap // sanitized on read and on write
	setPinnedTokens(profileId: string, map: PinMap): boolean
	getFeePicks(profileId: string): { app: Record<string, AppPick>; send: Record<string, SendSlots> }
	saveFeePick(profileId: string, update: FeePickUpdate): boolean // parseFeePickUpdate, as today
}
```

No events: the pin composable keeps its `chrome.storage.onChanged` trigger on the key name and re-reads through the RPC (D8).

### Data and control flow

1. **Unlock.** `onRowKeysReady(p)` → `sealLegacy(p)` on each map root, under the service lock (every writer of these roots holds it), as A1-A4 convert theirs.
2. **Reads** go through the dual read, so a map not yet converted reads as before.
3. **Fences** (the `ContactService` pattern, `contact/service.ts:98-115`, whose reads lack the final session re-check: the contract is the one written here): a method captures the session's profile and the deletion fence before it waits for the lock. A read re-checks the session after its last await and returns the empty value if it moved. A write prepares its seal, then checks the lock section is current (`isCurrent`), the deletion fence and the session, and commits with no await in between. Row keys outlive a lock and a switch (`profile/service.ts:339-346`), so `whileHeld` alone proves only that the profile was not deleted.
4. **The pointer** (`get`/`setSelectedAccount`, under the lock, with item 3's fences on every mutation, the claim's included):
   - a stored row answers `p` only when it is `p`'s (A: the device row's `profileId`; B: `p`'s own row); the test holds two profiles' keys at once, since retained keys open another profile's row;
   - when no pointer row is stored at all, the bare key `nulo:ui:activeAccount`, if it holds an address of one of `p`'s accounts (`AccountService.getAccountsRaw(p)`, every chain), is sealed as `p`'s row and then removed, only while it still holds what was read; another profile's address is left for its owner;
   - a write seals `p`'s row (A: overwrites the device row) and removes the bare key, as today's write overwrites it;
   - a bare key found beside a stored pointer row is removed without being read into it: the row is newer, so a crash between a seal and its removal converges at the next call (physical occupancy decides, not a successful open).
5. **The popup.** `setupActiveAccountRun` awaits `getSelectedAccount` where it awaited `storageLocalGet`; its fence and its "no await between the check and the commit" invariant (`app.store.ts:480-485`) stay. No popup-side copy exists, so a page opened before the worker answers shows what it shows today for a missing preference.
6. **The execute window's follow** (`scope-follow.ts`): `writeActiveAccount` returns without a call when `unless()` holds, else calls `setSelectedAccount`, which posts at once on the window's connected client (`packages/extension-messaging/src/background/client.ts:52`) and the call's own deadline bounds the window's wait (not a request the worker already took: KL-1); no new waiter. The worker's session fence drops a write whose session ended before its commit. A wallet send that begins between the page's check and the worker's commit is not caught: KL-1, signed with OA-1.

### File-level change map

- **New:** `src/wallet/services/ui-preference/{spec,service,client}.ts`, `service.test.ts`; `src/utils/pinned-tokens.ts`.
- **Storage:** `sealed-entity-storage.ts` (the option) and its test; `stores.ts`; `stored-shapes.ts`; `stored-shapes/baseline.ts` (`shapeRecord`, `wire`, `downgradeOf`) and `baseline.test.ts` (one case per new refusal; the structured sample at `:188` becomes `uiRestoreOutcome`, same assertion); `stored-shapes/{goldens.json,pins.ts,snapshot.json}` (the re-cut); `stored-shapes.writers.test.ts` (the three maps and the pointer held to the service's writes, as A4 holds `tokenSeeded`); `root-census.test.ts` (the three maps leave `PLAINTEXT`, the new root joins the sealed roots; `uiActiveAccount`'s reason becomes "the pre-seal pointer, kept until its profile claims it or a selection overwrites it"). `uiActiveAccount` keeps its goldens as a reader contract and gets no writer: the writers test binds new writes to `uiSelectedAccount` and asserts the service only removes the bare key.
- **Worker:** `src/wallet/runtime.ts`; `profile/{service,spec,client}.ts` (`saveFeePick` leaves in P2, with its callers); with A, `profile-deletion/coordinator.ts` (one typed purge step); `src/utils/profile-ui-keys.ts`; `cross-profile-isolation.test.ts`.
- **Popup and windows:** `src/utils/core.ts` (a long-lived `uiPreference` client); `stores/app.store.ts`; `composables/{usePinnedTokens,useFeeSelection}.ts` (I/O through the client the parent hands in, C1); `NewAccountPopup.vue`; `pages/profile/new-profile-helpers.ts`; `pages/settings/accounts/import.vue`; `windows/execute/index.vue`; `FeeSettingsCard.vue`; `pages/settings/fpcs/index.vue`; the four `usePinnedTokens` consumers; their colocated tests.
- **e2e:** one helper reads the four through `callService`; every raw read in recon § e2e moves to it; `network/update-in-place.test.ts`; `fixtures/update/verify.ts`; the replay recording; `sealed-storage.test.ts`.
- **Docs and legal:** `SECURITY.md` § Storage privacy; `packages/wallet-crypto/ATTACK-SURFACE.md`; `legal/privacy.md`; `legal/archive/privacy-1.2.3.md`; `packages/legal/src/manifest.ts`; `CLAUDE.md` § Persisted-storage; `ARCHITECTURE.md` § 5; `.claude/skills/release/SKILL.md`; the `pins.ts` header.

### The gate change: the re-cut

The one weakening this lane makes: it removes the record of stamps 1-4 and makes the current registry stamp 0. No stable release carries them.

1. Merge `dev` after A4 and #1027. Run `bun run baseline:storage`: it must print "stored shapes unchanged". Keep that commit's `snapshot.json` and `goldens.json` as the comparison base (`git show <merge>:<path>`).
2. Make P1's code changes. R1, R3 and the goldens block red, as they must.
3. Edit `goldens.json` by hand. Delete no golden and change no `value`. Add one `.sealed` golden (`sealed: true`) for each map shape, and for `uiSelectedAccount` a plaintext `.full` and `.minimal` (the row form the dual read serves, D10) plus a `.sealed`, as A4 authors every sealed shape: a sealed `.full` would hold the envelope's keys and red the goldens block's property check (`snapshot.test.ts`, Opus r2 U1). Set `"stamp": 0` on every golden.
4. Set `PINNED_STAMPS` to `[]`. Run `bun run baseline:storage -- --freeze`: the generator writes `snapshot.json` as one stamp 0, seals the new goldens and prints the pin. Paste it as `PINNED_STAMPS[0]`.
5. **Prove the re-cut changed nothing else** (lessons/phase-1.md and the PR body carry the output):
   - `jq --argjson old "$(git show <merge>:<snapshot>)" --argjson new "$(cat <snapshot>)"` over the base's last stamp and the new stamp 0: `version`, `zod` and every shape record but `uiPinnedTokens`, `uiFeePicks`, `uiSendFeePicks` and `uiSelectedAccount` are equal; the three map records differ only in `encoding`, `sealed` and `legacy` (`sealedDescribed` keeps their schema and decoder, so a changed `read` or `schema` is a mistake, such as a `z.unknown()` codec);
   - every old golden id keeps its decoded value: `($old.stamps[-1].expected) as $b | ($new.stamps[0].expected) as $a | all($b | keys[]; . as $id | ($a | has($id)) and $b[$id] == $a[$id])` is `true`, so each existing golden, the six pre-seal map goldens included, decodes as before (a proof over the goldens, not over every input);
   - the added golden ids are exactly the six of step 3, and each old golden record is equal to its base with `stamp` dropped (`del(.stamp)`, joined by `id`); `PINNED_BACKUPS` and `stored-shapes/backups/` are unchanged.
6. `bun run baseline:storage` prints "stored shapes unchanged"; every test under `src/wallet/storage` passes with no rule edited.

What stays: `snapshot.test.ts`, `generate.ts` and every rule; R4 still refuses an empty pin list, so the PR cannot land unfrozen. Emptying the pins and re-freezing was always possible and stays so; the CLAUDE.md note forbids it after this one time. The note: "Stamp 0 was re-cut once, on <date>, before any stable release carried a later stamp, when the pin and fee-pick maps <and, unless OA-1 is C, the selected account> moved behind the worker sealed (#1051); the owner: '<quote>'. The folded stamps' reasons: <stamps 1-4's `additive.reason`>. A pin is never removed again."

### Trade-offs

In the decision ledger. The competing outline B put each preference in its domain service under new `nulo:core:` names, with the same structured-legacy option and a `retired` scan kind.

## Decision ledger

| Id | Question | Chosen | Rejected, and why |
|---|---|---|---|
| D1 | Roots | the three maps at today's keys; the pointer a new root `nulo:ui:selectedAccount`; the bare key stays registered | new names for the maps (twin rows, and the old names stay named for the keyless delete); the pointer as a root named like the bare key (the scan claims the literal, but `shapeOfKey` matches only `root@…`, so the release's key would read as unclaimed: Opus F1) |
| D2 | The pointer's layout | the one OA-1's answer needs: A one device row naming its writer's profile, B one row per profile; each write is one `set` | per-profile rows with A's semantics by removing the others' rows (plan r1): a worker stop between the seal and the removals leaves two remembered selections, and no reopen repairs them (`app.store.ts:485` returns without a write; Codex R2-1) |
| D3 | The RPC's home | a new `UiPreferenceService`; `saveFeePick` moves into it | `ProfileService` (2 867 lines); B's domain split (three services, one legacy form converted three times) |
| D4 | The pre-seal maps | `legacy: "structured"` on the shared store: dual read plus `sealLegacy` | a conversion local to the service (plan r0, Codex r1's preference): the replay reads every release row through the store's dual read (`reads.ts`), so a service-only conversion leaves them unread before unlock (Opus F1, demonstrated) |
| D5 | Old names in the scan | claimed by the registered entries that keep them | a `retired` kind (B: a list for names already registered) |
| D6 | One arc or two | one | plumbing first (a worker writer of plaintext structured values the next PR rewrites; R1 couples the store change to the re-cut) |
| D7 | The re-cut | the unfrozen path, once, proven by § The gate change step 5 | a `--recut` flag (a reusable unfreeze); a retirement path (the owner chose the re-cut) |
| D8 | Cross-page pin sync | `chrome.storage.onChanged` on the key name, then an RPC read | a service event (a new contract for the one consumer that has a trigger) |
| D9 | e2e | no new scenario: the live update populates the three maps, the replay is re-recorded, `sealed-storage.test.ts` seeds all four | a new smoke spec |
| D10 | A planted non-envelope JSON string at a map root | the dual read serves it and the unlock seals it, as at every sealed root (#1053) | unreadable (Codex F1: a second legacy rule for three roots; a planted structured map is read today, so the writer gains nothing) |
| D11 | The follow's `unless` | checked right before the call, which the client's request deadline bounds; the worker's session fence; KL-1, signed with OA-1 | a worker-side journal check or a cancel message (a new contract and coordination for one caller); waiting for `onConnected` before the call (plan r1: no request exists yet, so no deadline fires and an approved window can hang: Codex R2-3) |
| D12 | Building before OA-1 and OA-2 are answered | the three maps, P1 to P3, and the privacy text as drafted, in a draft PR. The pointer waits, and so do the re-run of § The gate change steps 3 to 5 for its ids, its network files and the exact-pointer update checks (the orchestrator's placeholder rule). Resolved by P84-06 and P84-07: the pointer was built in layout A on the same branch and every gate re-ran over it | waiting for the answers with the maps unbuilt |
| D13 | The Home timing | an opt-in second case of `sealed-storage.test.ts` (`NULO_E2E_HOME_TIMING=1`), run on both builds through `EXTENSION_PATH` | timing inside the conversion case on every smoke run: about 30 s per browser per PR for a printout that proves no failure mode, and the base build cannot pass that case |
| D14 | Step 5's reader | `jq --slurpfile`, read as `$x[0]` | `--argjson`, which fails with "argument list too long" on the base snapshot |
| D15 | `usePinnedTokens`' two migration-barrier pins | replaced by "a write the worker refuses reports stale"; the refusal itself is pinned in the service's tests | kept: the composable no longer goes through the storage facade, so the barrier they held is not on its path |
| D16 | The log viewer's source filter | gains `ui-preference` and `ui-preference-client` (`useLogFilters.scan.test.ts` requires a row per service and client); a developer surface, named under the PR's UI impact | an exemption in the scan |

## Security & Adversarial Considerations

- **T1, a storage reader:** after the first unlock, each value is ciphertext; key names show profile ids and which profiles hold a pointer row; envelopes show owners, sizes and write times (#1056).
- **T3, an offline writer:** can delete a row, roll it back at the same key, or plant a pre-seal value, which the dual read serves and the next unlock seals (#1053). A planted pin shows only for a token the profile holds; a planted fee pick names an FPC id resolved against the profile's sealed FPC rows; a planted bare pointer is claimed only when it is one of the profile's accounts.
- **Another profile's session:** every method answers the active session's profile only, re-checked after its awaits; a pointer row opens only through its own profile's read. `cross-profile-isolation.test.ts` gains the service.
- **A dApp page:** cannot reach the service (`extension-messaging/src/core/sender-auth.ts:22`).
- **Input validation at the RPC:** the pin map through `sanitizePinMap` (lower-case 64-hex contracts, at most `PINNED_TOKENS_MAX` = 3 per chain, 32 chains); a fee-pick update through `parseFeePickUpdate`; an address a string of at most 128 characters. Every read re-sanitizes.
- **Deletion and adoption:** a write that outlives the profile's keys rejects at commit; the keyless sweep and `profileUiKeys` remove the rest. A request that starts after a same-id adoption remains #338.
- **Logging:** no address, map, pick or envelope reaches a log line under any key; a refusal logs a fixed category at `debug` (the `logging-policy` skill).
- **Cryptography and supply chain:** nothing new: A1's row seal (AES-256-GCM through WebCrypto); no dependency added.

## Assumptions

- **Facts:**
  - v0.31.0 stores the same four keys in the same forms, on the same Aztec line (6.0.0-rc.3), so the live update can run.
  - `SealedEntityStorage` reads and converts JSON strings only (`tryParse`, `rawStringEntries`); `reads.ts` reads a sealed shape's plaintext rows through it, and `shapeOfKey` matches a root only as `root@…`.
  - `rowKeys` outlive a lock and a switch (`profile/service.ts:339-346`); `AccountService.getAccountsRaw(p)` reads a profile's accounts on every chain.
  - `PROFILE_ROW_LAYOUT` and `sealedDescribed` exist on A4, not on `dev`.
  - No backup slice names a `nulo:ui:` key; `realMigrations` is empty and every device stays at schema version 1.
  - The unfrozen generator rewrites stamp 0, prints the pin under `--freeze`, refuses a golden whose `stamp` is not 0, and compares nothing with the stamps it drops (`baseline.ts:559-565`).
  - The duplicate-phrase guard is soft (`profile/service.ts:2204-2215`); one external account can be imported into two profiles.
- **Inferences** (verified in P1-P3):
  - Chrome and Firefox fire `storage.onChanged` when a structured map is replaced by an envelope string.
  - The release's UI can pin a token and save a Send and an app fee pick inside the live scenario without release-side fixtures.
  - A4's and #1027's stamps fold with every `expected` value unchanged (step 5 proves it or stops the arc).
- **Asks:** OA-1 [A, P84-06]; OA-2 [approved as drafted, P84-07].

## Phases and gates

Every gate also runs `bun run lint`, `bun run typecheck:all` and `bun run test` from the worktree root.

### P1: the service, the stores, the guard, the re-cut ✓

- **Tests:**
  - `sealed-entity-storage.test.ts`: with the option, a structured row reads through the dual read, `sealLegacy` seals it in place, and a value changed between the read and the commit is not overwritten; without it, a structured row still reads as nothing (control).
  - `ui-preference/service.test.ts`, on `FakeBrowserApi` with real row keys: each map converts at `onRowKeysReady` and reads back unchanged; the pointer claim (no pointer row and one of `p`'s accounts: claimed and removed; another profile's: left; any stored pointer row: the bare key removed unread; a stop between a claim's seal and the removal: converges at the next call); with two profiles' keys held, neither reads the other's pointer (A: the device row of the other reads as undefined); refusals, one per class (another profile, a lock, a switch during a read, a switch or lock between a write's post and its commit, the same during the claim, a reserved profile, an over-long address); a deletion between a seal and its commit leaves no row; with A, `purgeForProfile` removes the deleted profile's device row and keeps another's, and a deterministic interleaving (B's write released between the coordinator's steps) keeps B's row through the whole purge.
  - `baseline.test.ts`: dropping `legacy` is refused; a pre-seal golden of a `legacy` shape is stored structured.
- `ProfileService.saveFeePick` and its RPC stay until P2 moves their callers, so every caller compiles at this gate.
- **Gate:** `bun run --cwd apps/extension test src/wallet/services/ui-preference src/wallet/storage src/wallet/services/profile`; § The gate change steps 5-6; `bun run test:all`. Pass: exit 0; step 5 equal.

### P2: the popup and the windows through the RPC ✓

- No popup or window code reads or writes these values through storage: `git grep` finds no `storageLocalGet`, `storageLocalSet` or `chrome.storage.local` call naming `nulo:ui:activeAccount`, `pinnedTokensKey`, `feePicksKey` or `sendFeePicksKey` outside the service, the registry and tests. The key names stay for `usePinnedTokens`' `onChanged` trigger and queue (D8). `ProfileService.saveFeePick` leaves with its callers.
- The e2e helper and every raw read (recon § e2e) move here, each assertion's intent kept, since the smoke suite reads the bare pointer this build stops writing (`accounts.test.ts:70`, `fixtures/extension.ts:1029`); P3's network gate runs the network ones.
- **Tests:** the colocated tests of `app.store.setup-active-account`, `usePinnedTokens`, `useFeeSelection`, `new-profile-helpers` and `scope-follow.core` move from storage stubs to a client stub with every assertion kept, except `scope-follow.core`'s three facade cases (`:242-286`), whose barrier the pointer no longer passes: the writer makes no call when `unless` holds at the call and one call when it does not; the lock or switch case moves to the service's commit fence (P1); the send case is KL-1, removed with the owner's OA-1 sign-off quoted in the PR, never silently.
- **Gate:** `bun run --cwd apps/extension test src/stores src/composables src/popup`; `bun run test:all`; smoke: `cd apps/extension && bun run test:e2e -- --retry=0` and `NULO_E2E_BROWSER=firefox bun run test:e2e -- --retry=0`. Pass: exit 0 on both.

### P3: e2e, the update, the measurement ✓

- `update-in-place.test.ts` populates a pin, a Send pick and an app pick through the release's UI. Failure mode: rows the release's own code wrote stop converting or reading; only an in-place update has them. Estimate +40 s Chrome, +60 s Firefox. Re-record the replay on Chrome (`NULO_E2E_UPDATE_RECORD=1`); `HELD` gains `uiPinnedTokens`, `uiFeePicks`, `uiSendFeePicks`.
- `verify.ts` and the scenarios, per phase (Codex R2-2: both scenarios change the selection on purpose before their last check):
  - locked, before the unlock: each pre-seal value present and read under the candidate's registry, as today;
  - after the unlock, in `updateProblems`: each map key holds an envelope and the service returns the release's map; the bare pointer is moved, not lost, only when it is gone and a sealed pointer row is stored. No count exception, no lost-key exemption;
  - the exact pointer, where the scenario keeps the selection: the live update, right after its unlock on the release's network (`update-in-place.test.ts:253`, before its Testnet switch at `:268`), reads `getSelectedAccount` equal to the release's bare value; the replay, which activates Testnet before the unlock while the recorded pointer names a sandbox-chain account, reads the bootstrap's choice for Testnet (its first account, as today).
- `sealed-storage.test.ts`: the four join its pre-seal seed and its "no plaintext after unlock" check. Failure mode: the conversion in a real browser's storage, in the required smoke lane (the update scenarios are opt-in). Estimate +5 s per browser. It prints popup open → Home ready and Home's first contentful paint (median of 5 after one unmeasured open), run on a build of the merge base (A4's base-build procedure: a scratch worktree under `~/.cache/nulo-backlog/ui-keys-sealed-1/`) and on the candidate, both browsers. Over 50 ms slower stops for a decision.
- **Gate**, retry 0, both browsers, `e2e:agent` through `agent.sh`:
  - smoke: the full suite (fixtures change);
  - network (`NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/<file>.test.ts`, then `NULO_E2E_BROWSER=firefox`): `account-switch-isolation`, `execute-scope-account`, `incoming-arrival`, `incoming-transfers`, `profile-reimport-matrix`, `pin-to-home`, `fee-methods`, `tx-sendTx-sponsoredFpc`;
  - the update: `bash apps/extension/scripts/e2e/build-update-candidate.sh <browser>`, then `update-in-place.test.ts` and `update-replay.test.ts`; `build-update-candidate.sh <browser> --extra-seed`, then `default-network-arrival-update.test.ts` (its release writes the bare pointer and its verify calls `updateProblems` after an unlock: Opus r2 U2); each with `NULO_E2E_UPDATE_FROM=v0.31.0` (or the latest stable tag then), as `tests/e2e/README.md` § In-place update gives them.
  - Pass: every file green; each suite's wall-clock before and after recorded.

### P4: docs, legal, close ✓

- SECURITY.md § Storage privacy: the `nulo:ui:*` line keeps "per-profile Get Started flags and how the last restore ended", and the bare pre-seal pointer until its profile claims it or a selection overwrites it; the four join the sealed list. `ATTACK-SURFACE.md`: the four rows. `legal/privacy.md` § 3 per OA-2, 1.2.4, `legal/archive/privacy-1.2.3.md`, the manifest entry (`material: false`). CLAUDE.md, ARCHITECTURE.md § 5, the release skill: the sealed-roots lists and the re-cut note.
- **Gate:** `bun run --cwd packages/legal test`; `bun run test:all`; `bun run test:ci-gating`; `bun run check:plans`. Pass: exit 0.

## Delivery

- Single arc, single PR: `gh pr create --base dev`, title `feat(storage): seal pinned tokens, fee picks and the selected account behind the worker` (87 characters).
- Before opening, with OA-1 A or B: reopen #1062 with a comment (its reopening condition is met: the owner chose the re-cut), so the PR's `Closes #1062` closes it; in every variant, comment on #1050 that it stays open. With A or B, file KL-1 as a closed `known-limit` issue.
- The body: what changed and why; the gate change with the owner's words and step 5's output; UI impact with OA-1 and OA-2 quoted by id and text; the measurement; each suite's wall-clock before and after; `Closes #1051`, and `Closes #1062` (C: `Refs #1062`); "waits for OA-1 and OA-2" until the owner's sign-off of both is recorded in it (CLAUDE.md § UI changes).
- **OA-1 C** (the pointer stays plaintext) is a variant with its own contract, built as such rather than trimmed later:
  - three `.sealed` goldens, no `uiSelectedAccount` shape or root; step 5's added ids are those three;
  - no pointer RPC, claim, ownership lookup or purge case, and no KL-1: the pointer's writers, the bootstrap's read and `scope-follow`'s facade `unless` stay as on `dev`, with their tests; `uiActiveAccount` keeps its writer test, `HELD` entry and census line ("the selected account, plaintext by the owner's OA-1 C");
  - privacy § 3 keeps "the last-selected account" among the exceptions; title `feat(storage): seal pinned tokens and fee picks behind the worker`; #1062 is not reopened, gets a comment narrowing it to the pointer, and the PR says `Refs #1062`;
  - the gates' deltas: P2's `git grep` drops `nulo:ui:activeAccount`; P3's pointer checks stay as on `dev` (the bare key held through the update, no `getSelectedAccount` read) and the e2e helper and `sealed-storage.test.ts`'s seed cover the three maps; everything else in P1-P4's gates, and the post-implementation loop, run on that diff (Opus r2 U3).
- Open without labels; add `e2e:extension-network` only if the path filter skips the network lane.
- Parallelism: none; P2 and P3 rest on P1.

## Post-implementation

Execution contract: this plan plus [`implementations-plan/README.md` § Post-implementation standard](../../README.md#post-implementation-standard) at `5c35ca93`. Specific here:

- **Loop placement:** single arc, once over the whole diff from the merge base, after P4. Codex: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; the Opus diff review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1. Hard stop at three rounds.
- **The ask adds:** the gate change by name; "attack the conversion and the pointer claim: a write between read and commit, a deletion or a switch meanwhile, the bare key claimed by the wrong profile".
- **Close-out** as the PR's final commits; **teardown** after the merge: `agent-worktree done ui-keys-sealed-1 --merged` once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/ui-keys-sealed-1/plan.md` succeeds.

## Audit verdicts

- **Codex r1** (gpt-6.1-sol, high): reject, F1-F8. Adopted: F1 as D10 (the JSON-string case now converts, consistent with #1053, rather than unreadable); F2 (the claim checks `p`'s accounts); F3 (a stored row wins); F4 (the `ContactService` fences); F5 (D11, KL-1); F6 (OA-1 covers shared imported accounts and nothing ships before the answer); F7 (step 5); F8 (`verify.ts`). Rejected: its D4 preference for a service-local conversion, on Opus F1's evidence.
- **Opus r1** (Plan agent): reject, F1-F10. Adopted: F1 (D1, D4: the store option, the bare key stays registered, the pre-seal goldens kept); F2 (step 5); F3 (the nightly); F4 (the re-cut text says the unfreeze stays possible); F5 (the test holds two profiles' keys; moot with per-profile rows); F6 (fences); F7 (reads return the empty value); F8 (D11); F9 (D10); F10 (the claim, now ownership-checked).
- **Codex r2** (resumed): reject, R2-1 to R2-4; accepted D4, D10, F2, F4, F7. Adopted all four: R2-1 (D2, the pointer's layout per OA-1, one `set` per write); R2-2 (`verify.ts` per phase); R2-3 (D11, no connection waiter); R2-4 (KL-1 inside OA-1), and the C variant's own contract (§ Delivery), the per-id `jq` projection, "until claimed or overwritten".
- **Codex r3** (resumed, last): reject, R3-1 (with A, the keyless sweep can remove another profile's device row; demonstrated in an interleaving), R3-2 (KL-1's owner text too narrow); verified R2-1 to R2-4 and the C contract. Adopted both: `purgeForProfile` before the sweep (§ Lifecycle), OA-1's wording.
- **Opus r2** (Plan agent, beside Codex r3): conditional approve, U1-U5; F1-F10 verified resolved, the device row held every attack, D11's removed send case judged an owner-gated change, not a loosening. Adopted all: U1 (demonstrated: `uiSelectedAccount`'s `.full`/`.minimal` plaintext plus a `.sealed`, six added ids), U2 (`default-network-arrival-update.test.ts` in P3's gate), U3 (the C variant's gate deltas), U4 (the map records may differ only in `encoding`, `sealed`, `legacy`; `--argjson`), U5 (OA-1's wording).
- **Codex final** (fresh session, gpt-6.1-sol, high): **conditional approve** (with conditions: fix F1-F3; record explicit OA-1 and OA-2 sign-off before delivery). No new architectural blocker; R3-1's purge verified. Adopted all: F1 (demonstrated: P2's smoke gate reads the bare pointer P2 stops writing, so the e2e raw reads move into P2, and `saveFeePick` leaves with its callers in P2); F2 (P2's grep bans storage I/O, not the key names D8 keeps); F3 (the seed, the issue references and the re-cut note follow OA-1); the sign-off condition (§ Delivery, OA-2's "what ships now"). Noted: the deadline bounds the window's wait, not a request the worker took (item 6); `ContactService`'s reads lack the final re-check (item 3).

- **Implementation review** (the diff `a2f9e7d0..HEAD`, after P4): Codex r1 (gpt-6.1-sol, high) and the Opus leg beside it both **conditional approve**. Adopted: the selection purge throws when the lock's watchdog displaced it, so the deletion keeps its tombstone (Codex 1 = Opus 4, demonstrated in memory, a regression case added); the Home timing case reads the first account through RPCs the base also serves (Codex 2 = Opus 1); the pointer's re-cut proof in `lessons/phase-1.md` (Opus 2); four comment fixes. Filed: Opus 3, a read refused by a switch-and-return inside one RPC, as closed `known-limit` #1097. Codex r2 (resumed): **approve**, no new material finding. Log: [lessons/phase-4.md](lessons/phase-4.md).

## Known limits

- **KL-1 (signed with P84-06; closed `known-limit` #1096):** a follow's pointer write is not dropped when a wallet send in the window's scope begins after the page's `unless` check (the request's wait for the connection or the worker, if any, the lock wait and the seal); today it is dropped up to the storage dispatch. Consequence: the next popup opens on the account the person just confirmed a payload for; the send's own account is unchanged, and the popup's scope guard still refuses moving a live popup during a send. Reopen on a report of the popup opening on another account during a send, or a reader of the pointer that acts during a send.
- Unchanged and still true: #338, #1053, #1056, #1060.

## Seeds

- `/goal`: "Ship ui-keys-sealed-1 per `implementations-plan/ui-keys-sealed-1/plan.md`: P1-P4 each marked ✓ with its gate passing at retry 0 in the transcript; § The gate change step 5 equal; the Codex loop converged in at most three rounds; the PR open against `dev` with `Closes #1051` and, per OA-1, `Closes #1062` (A or B) or `Refs #1062` (C), opened only after the loop, its body quoting the owner's OA-1 and OA-2 sign-off; the close-out commits on it."
- `/loop 15m`: "Drive implementations-plan/ui-keys-sealed-1 forward per its plan.md: reality check (plan, lessons, `git status`, the PR's checks); next pending step; fast gates after each edit; a decision goes to Codex at high, never waits; a phase is ✓ only when its gate passes; after P4, the Codex loop, then delivery, then the close-out; stop at the merge check."
