# Phase 0: planning consults and findings

## Recon (2026-10-09)

- Three sonnet explorers: one reuse sweep (ten capabilities), one mapper for arcs 1 and 1b, one for arcs 2 and 3. Findings in `../recon.md`.
- `gh issue view` printed nothing on this host without `--json` (exit 0, empty output); `GH_PAGER=cat gh issue view <n> --json ...` works.
- #148's in-repo claim does not hold as a wallet fact: the keys-then-address order and the key-store-only early return are upstream `PXE.registerAccount` (`@aztec-labs/pxe` 6.0.0-rc.1). Verified by reading `dest/pxe.js:359-371`, `key_store.ts:361-383`, `address_store.ts:19-45`.
- #223's prerequisite (tests observing both wipe orders) already exists: `unseal-wipe.test.ts`.
- #226: `normalizeBackupData` already validates every root slice, so only `profile` and the retired `network` field overstate.

## Consults

Recorded below as they run: the dual audit (Codex and an Opus Plan agent) and the final fresh Codex pass.

### Round 1, Codex (gpt-6.1-sol, high, read-only; session 01a12295-d17f-7e60-9f44-6007cce98882)

Verdict: reject. Blocking: #231's passkey count used the session DEK, not the DEK the backup carries; #192's record was armed after `finalizeRestore` and option B could not rebuild Retry; owner asks shipped the planner's recommendation as "what ships now" (SR2 says the part stays as it is); #223's helper changed the load path's DEK-vs-key-bytes order. Also: watchdog wording overpromised, the tombstone slice lacked an outer bound and a deletion fence, F13 misdescribed the never-overwrite rule, the two e2e fixtures share version 9001, the PXE source-pin fallback could not prove a heal, network gates lacked `--retry=0`, and the watchdog's reason renders verbatim on the recovery screen (new copy). Each finding checked against the tree before adoption; dispositions in plan.md § Audit verdicts.

### Round 1, Opus 5.5 Plan agent

Verdict: conditional approve, seven conditions: keep `id` in the profile guard and bound it (a hostile file picks the restored profile's storage id); let the #223 helper own all three wipes; add an Apache-2.0 modified-file notice and an audit run for the `@aztec-labs/pxe` patch; put the watchdog's reason on the owner list and narrow its claims (a hung `chrome.storage` hangs restore too; Chrome's idle kill often comes first); back #221's proof with a real-PXE network e2e; make the #98 e2e and the registry negative control able to fail; close Codex's four blockers, which it confirmed against the tree. Also: prefer the one-line PXE patch (drop the early return), patch `dest` only, keep a text pin as a complement; fetch only the encrypted account file (#230); add names at render time in the viewer (#189); a lease so a running restore does not read as abandoned (#192); "Restore again" creates a second profile through the duplicate dialog (owner should see).

### Round 2, Codex (resumed session 01a12295-d17f-7e60-9f44-6007cce98882)

Verdict: conditional approve. Round-1 blockers confirmed resolved. Conditions: `inspectDek` must run outside the probe's unseal `catch` (a hook failure would lose the wipe and read as an unrecoverable DEK); the #98 seed-pass control was vacuous (the token returns through the token slice) and its fence sat outside the marker lock; the #192 record's writes needed one cross-context serialization authority (Dismiss runs in the popup) and could not be armed from backup network ids before the networks stage remaps them; `revoke()` must reject reads already parked on storage; #226's integrity mapping changes visible text, and #223's export order change must be recorded, not called a preservation. All eight verified and accepted: Web Lock per profile (`navigator.locks`, as `scope-follow.ts` already uses), `restoreDeletedMarkers` with the fence inside the lock, a destination `seeded` marker as the control (`seedOne` writes it even when the row is restored), `assertBackupProfile` in `executeRestore` keeping today's "Import failed" screen, OA-9 added.

### Final fresh pass, Codex (new session 01a122b2-5a47-7ac1-984a-15c11d974c49)

Verdict: reject, one blocking finding: OA-9's "what ships now" shipped a new detail sentence while unanswered; keeping the same screen does not license new words. Mediums: the #192 record needed a per-run token (a reused password-restore id lets an earlier run's delayed trim edit a later run's record) and a runtime decoder; closing before `finalizeRestore` runs no rollback (torn imports are reaped after seven days); the malformed-profile tests contradicted the selection and eligibility gates; arc gates lacked `audit:vue`. All six verified and fixed in plan.md: arc 1 adds no composable check (types only; the service's id rule is the one behavioural change, stated in OA-9), run token and decoder, corrected torn-import claim, `audit:vue` in arcs 1, 2 and 3. Lesson: "what ships now" must be byte-for-byte today's screen, not "the same screen with a fixed sentence".

## Decision ledger, planning rounds (moved from plan.md at the arc 3 revision, 2026-10-14)

D11 is retired (OA-5 C: #98 not carried); D12 to D15 are superseded by plan.md rows D-arc3-1 to D-arc3-8.

| # | Decision | Alternatives | Panel | Why |
|---|---|---|---|---|
| D1 | Keep the lane map's arcs (1, 1b, 2, 3) plus a docs-only close-out layer | merge 1b into 1; split arc 1 by risk | neither leg objected | Arc 1b touches no file arc 1 touches (a dependency patch), so it reviews alone; the lane map's order holds for reviewers. |
| D2 | One helper owns the DEK, plaintext and copy and wipes them together right after the scalar | keep each path's cleanup (callback helper); wipe key bytes early but keep the DEK late (round-1 draft); reorder export only; fold in the reseal sites | Codex: the round-1 draft broke the DEK-vs-bytes clause; Opus: the helper should own all three | Same tick for DEK and bytes on both paths, DEK first as on load today; every buffer dies earliest; one pinned order. Export's statement order changes on purpose, which the spy harness pins (I1; Codex round 2 asked that this be recorded, not called a preservation). Reseal sites need bytes, not a scalar. |
| D3 | A Buffer-free strict `fromHex`; integrity's dead `catch` becomes an explicit refusal | run the existing call under both bindings; a lenient decoder | both legs prefer strict | The tested decoder is the shipped one by construction; the handle is always generated hex (F3). |
| D4 | Engine-level watchdog (60 s policy) that revokes staging; no journal authentication; non-vacuous registry tests | a host-side alarm watchdog; a journal checksum or MAC | both legs: engine ownership, no auth; both asked for narrowed claims (I4) | The engine owns restore and counting, and staging confines the abandoned `up()` (F8). No pre-unlock key (F9); a checksum detects nothing a forger cannot recompute. |
| D5 | No new profile check in the composable; `RestoreData.profile` is `unknown` and the read casts to the unchecked shape; the service replaces a restored id that is not `^[0-9a-f]{8}$` | a guard returning a projection (round-1 draft); a check in `validateAndMigrateBackup` with the integrity message (round-1 revision); an assertion in `executeRestore` with a new detail sentence (round-2 revision) | Opus S1 and Codex: the draft dropped `id`; Codex round 2: the integrity mapping is visible; final pass: the new sentence is unapproved copy | Every refusal a composable check could add changes what a person reads, so it waits on OA-9; the types alone make `RestoreData` honest, and the gates and the service already refuse what today's screens refuse. The id rule closes the file's choice of storage key and changes nothing on an exported file (child rows are remapped unconditionally, `useFullBackupImport.ts:351`; derivation does not read the profile id). |
| D6 | The resolver calls `restoreCtaBlocked` | add `failed` to the resolver's own check | both legs | One predicate for the button and the key; the alternative also misses import eligibility. |
| D7 | Patch upstream `registerAccount`, one line (drop the early return), `dest` only, with a behavioural test and a text pin | check both stores before returning (round-1 draft); wallet-side detection; reorder upstream's writes; no in-repo change | both legs: the patch; Opus: the one-line form | Only a patch heals; the address store has no public write; detection repairs nothing and would edit the freeze directory. The one-line form reads no extra state and relies on the idempotent write. |
| D8 | Pass the kind hint in `getNodeStatus` | a separate local-only status path | no objection; Opus adds the dead-URL test | `_getChainId` already takes the hint. |
| D9 | Filter in `backupNetworkState` | filter in `getContracts` | no objection | `getContracts` is also an RPC whose callers expect the full list. |
| D10 | Proof first, on a real PXE, skip only if it holds | skip at once; never skip | Codex: realistic sponsor states; Opus: real-PXE e2e | P1-05 states this order and its failure exit; fakes cannot see lazy contract sync or fee notes. |
| D11 | A new optional `non-storage` slice, omitted when empty, bounded and fenced | extend the token slice's rows; a `value-projection` slice; an envelope-level field outside `data` (older versions would ignore it) | Opus: fine; Codex: bound, fence, document the migration consequence | The registry is the one place restorable data is declared; the envelope field would be a second channel. The forward-compatibility cost goes to the owner (OA-5), with the envelope field as an option. The fence is checked inside the seeder's marker lock, where `purgeForProfile` also runs (Codex round 2). |
| D12 | A write-ahead per-profile record armed right before `finalizeRestore` from the remapped set of networks the tail will try, every write under one Web Lock per profile and bound to its run's token, decoded on every read, with a lease | record at the end of the tail; record after finalize (round-1 draft); arm at profile creation (round-1 revision); an in-page promise chain; a background service owning the record; persist the backup payload for option B | Codex: armed too late, lost trims, B cannot rebuild Retry; round 2: backup ids are not yet remapped at creation, an in-page chain does not serialize the popup's Dismiss; Opus: lease, deletion via `PROFILE_UI_KEY_PREFIXES` | The tail runs in the page (F19); arming before finalize closes the crash gap, and the unfinalized profile's rollback removes the record; a Web Lock serializes every extension page with a primitive the repo already uses, where a new service would add an RPC surface for one UI key, and the run token orders writers across reused profile ids, which the lock alone cannot (final pass); a torn import keeps its record unread until the seven-day sweep deletes the profile; option B's Retry opens the file picker, so nothing hostile is persisted. |
| D13 | Retry outcome kept in the composable; a pure text helper; viewer names at render | compute the line in the template; write names into rows | Opus: rows matched by identity | Testable without mounting; render-time names keep `retryReplacedRows` working. |
| D14 | Fetch the protected file at Create; Download only once protected; handler re-check | mirror `full.vue` and keep the plain fetch (round-1 draft) | Opus: no plaintext file in the page | `account.vue` encrypts in the service, so the plain body has no use once Download needs protection. |
| D15 | Count unopened rows under the DEK the file carries, on both paths | session DEK on the passkey path (round-1 draft); password path only | Codex: wrong DEK authority; Opus: name the RPC, read rows once | The count must describe the file; the probe DEK is what opens the file's rows at restore. The callback runs outside the unseal `catch`, so its failure aborts instead of reading as an unrecoverable DEK (Codex round 2). |
| D16 | The watchdog reason reuses the engine's interrupted wording | a new sentence | both legs: new copy is the owner's | No new copy ships without sign-off (OA-6). |

### Competing outline (cheapest-first), sent to both audits

- Arc 1 as five one-line fixes: reorder only the export path's `finally` to match load (#223); run the existing `Buffer` decode under both bindings and pin today's behaviour (#203); delete `network` from `RestoreData` only (#226); a `chrome.alarms` check in the boot gate that writes a blocked status if `running` outlives five minutes (#146); add `failed` to the resolver's `progress` check (#207).
- Arc 1b: wallet-side detection only. `NuloAccount.ensureRegistered` re-reads `getRegisteredAccounts` after `registerAccount` and throws a typed error.
- Arcs 2 and 3 as in the main plan.

Both legs rejected the outline row by row: the export-only reorder dedupes nothing; pinning the lenient decode keeps garbage-accepting behaviour; deleting `network` alone leaves the profile cast; the alarm adds a second owner of the journal state, is as stuck behind a hung store, and misses the backup-import migrator; the `failed`-only check misses import eligibility; detection leaves the account broken and touches the freeze directory.

## Audit findings, planning rounds (moved from plan.md at the arc 3 revision)

### Round 1 (2026-10-09)

- **Codex (gpt-6.1-sol, high): reject**, with blocking findings: the #231 passkey count used the wrong DEK; the #192 record was armed after `finalizeRestore` and option B could not rebuild Retry; OWNER-ASKS shipped recommendations as "what ships now"; #223 changed the DEK-vs-bytes order.
- **Opus 5.5 Plan: conditional approve**, conditions (a) to (g): keep and bound `id` in the profile guard; the #223 helper owns all three wipes; Apache-2.0 notice and audit gate for the patch; the watchdog's copy to the owner and narrowed claims; a real-PXE e2e for #221; the #98 e2e and the registry control able to fail; close Codex's blockers.

Findings and dispositions (each verified against the tree first):

| # | Source | Sev | Finding | Disposition |
|---|---|---|---|---|
| 1 | Codex, Opus | High | #231 passkey count used the session DEK, not the DEK the file carries | Accepted: `exportPasskeyBackupKeys` counts under the probe DEK in-process, rows read once (D15). |
| 2 | Codex | High | #192 record armed after `finalizeRestore`; crash gap | Accepted: armed as soon as the new id exists, before finalize (D12). |
| 3 | Codex | High | #192 option B cannot rebuild Retry from `{ networkIds }` | Accepted in substance: the page's own shot spec has B's Retry open the file picker; nothing of the backup is persisted (D12). |
| 4 | Codex | High | OWNER-ASKS defaults ship the planner's recommendation | Accepted: every "what ships now" is today's form or an already-approved part (SR2). |
| 5 | Codex, Opus | High | #223 draft reversed the load path's DEK-vs-bytes order | Accepted: the helper owns all three and wipes them together, DEK first (D2, I1). |
| 6 | Opus | High | Profile guard dropped `id`; a hostile file picks the restored profile id | Accepted: a non-generated id is replaced (D5). The composable validation it led to was later withdrawn (F-1). |
| 7 | Codex | High | #221 proof could pass on an unrealistic fixture | Accepted: both sponsor states, probe vs needed read, real-PXE e2e (D10). |
| 8 | Opus | High | #98 e2e passes if seeding never ran | Accepted: a non-deleted default token must return in the same restore. |
| 9 | Codex | Medium | Abandoned `up()` keeps reading live storage | Accepted: `StagingArea.revoke()`; tests for a late read and a late write; wording says the watchdog bounds the wait, not execution. |
| 10 | Codex, Opus | Medium | Tombstone slice: no outer bound, no deletion fence | Accepted: array check, length bound first, canonical addresses, `captureRestoreEpochs`/`assertRestoreEpoch`. |
| 11 | Codex, Opus | Medium | F13 misdescribed the never-overwrite rule | Accepted: F15 restated; the test asserts a `deleted` marker stays `deleted`. |
| 12 | Codex, Opus | Medium | Watchdog claims overpromised (sync loops, hung storage, Chrome idle kill) | Accepted: I3 and I4 restated as a policy bound with stated exclusions. |
| 13 | Codex | Medium | #192 trims race and can recreate a dismissed record; success must be the real result | Accepted: awaited per-network hook, serialized trims that never create, real registration results. |
| 14 | Codex, Opus | Medium | Registry fixtures share version 9001; empty-store runs vacuous; results ignored | Accepted: dedupe by identity, seeded rows, success asserted, value-key negative control. |
| 15 | Codex, Opus | Medium | PXE source pin cannot prove a heal | Accepted: the behavioural test is required; the text pin is a complement; a failed-then-retried write case added. |
| 16 | Codex, Opus | Medium | The watchdog reason renders verbatim (new copy) | Accepted: reuse the existing interrupted wording; OA-6. |
| 17 | Codex | Medium | #98 slice bypasses the engine; future marker changes cannot migrate | Accepted: README line; consequence stated in Architecture. |
| 18 | Codex | Medium | Reminder dismissal, deleted networks, reopened Retry are product choices | Accepted: OA-4 covers deleted networks; dismissal and Restore again are on page 1's options; OA-7 adds the second-profile consequence. |
| 19 | Opus | Medium | Apache-2.0 modified-file notice; audit gate on a lockfile change | Accepted: comment in the patched branch, `OVERRIDES` note, audit gate and build in the 1b gate. |
| 20 | Opus | Medium | #230 builds a plaintext file the page can no longer release | Accepted: fetch the protected body at Create (D14). |
| 21 | Opus | Medium | #192 cannot tell a running restore from an abandoned one | Accepted: the lease. |
| 22 | Opus | Medium | "Restore again" makes a second, suffixed profile | Accepted: OA-7. |
| 23 | Opus | Medium | Viewer names written into rows break `retryReplacedRows` | Accepted: names at render time. |
| 24 | Opus | Medium | `applyOne` near its line budget | Accepted: the race lives in `runWithWatchdog`. |
| 25 | Opus | Medium | Prefer the one-line PXE patch, `dest` only | Accepted (D7). |
| 26 | Codex | Low | "40 MiB" is code units, not bytes | Accepted: F14. |
| 27 | Codex | Low | Network gates kept two retries; tests must actually run | Accepted: `--retry=0` everywhere; "every named spec ran". |
| 28 | Opus | Low | Kind hint skips the chain check for local-kind networks | Accepted: dead-URL test. |
| 29 | Opus | Low | The e2e should read a status attribute, not a CSS class | Accepted: `data-status`. |
| 30 | Opus | Low | F2 overclaims; F3 holds on create only | Accepted: F2 and F3 restated; Outcome criterion 2 says "the wallet's own buffers". |
| 31 | Opus | Low | `endpoints.test.ts` is a smoke spec; `full-backup-restore.test.ts` does not exist | Accepted: paths fixed. |
| 32 | Opus | Low | Only the `{ type: "Buffer" }` encoder branch sees Buffers | Accepted: the pin says which branch it covers. |
| 33 | Opus | Low | The malformed-profile message must be named | Accepted, then superseded by F-1: no new message ships; OA-9 holds the choice. |
| 34 | Opus | Low | #207 is a keyboard change; mention it | Accepted: the PR says so. |
| 35 | Opus | Low | #230 removes the only UI path to a plain account file | Accepted: OA-8. |
| 36 | Opus | Low | Extend the existing journal tests instead of a new one | Accepted. |
| 37 | Codex | — | Competing outline, row by row | Agreed with the main plan on every row; see the outline above. |

None rejected.

### Round 2 (2026-10-09)

- **Codex (resumed session, gpt-6.1-sol, high): conditional approve**, with conditions: race-safe reminder and tombstone writes; isolate `inspectDek` failures from DEK-unseal failures; fix the seed-pass control; record #223's order change and #226's visible error change. It confirmed: the four round-1 blockers are resolved; every accepted full-backup restore reaches `validateAndMigrateBackup` (`useFullBackupImport.ts:569,602`), shared by popup and onboarding; replacing a non-generated password profile id changes no derivation; dropping the PXE early return reaches only `addCompleteAddress` and the final return; the `inspectDek` hook is not a layering problem.

| # | Sev | Finding | Disposition |
|---|---|---|---|
| R2-1 | High | `inspectDek` inside the probe's unseal `catch` loses the wipe on a hook failure and misreports it as an unrecoverable DEK; rows-read-once undefined when the probe does not open | Accepted: narrow `catch`, callback in its own `try/finally` owning the DEK, failure aborts; no probe means rows read once, no count; tests for both (D15). |
| R2-2 | Medium | #223 changes export's statement order; "nothing can observe it" is false | Accepted: I1 and D2 record the order change as a deliberate reading of the clause. |
| R2-3 | Medium | #98 control passes without a seed pass (the token returns through the token slice) | Accepted: assert a destination `seeded` marker entry; verified `seedOne` writes `seeded` when the row is present (`token/seeder.ts:437-443`). |
| R2-4 | Medium | Tombstone fence checked outside `markDeletedByUser`'s lock | Accepted: `restoreDeletedMarkers` checks the fence inside the marker lock; test a deletion while it waits (D11). |
| R2-5 | Medium | Reminder trims serialized in-page only; Dismiss in another context or a deletion can be overwritten | Accepted: one Web Lock per profile for arm, renew, trim and clear; renew and trim never create; an orphan after a racing deletion is never shown and is removed by the reader (D12). |
| R2-6 | Medium | Backup network ids are not yet remapped when the profile is created | Accepted: arm right before `finalizeRestore` from the remapped set the tail will try (D12). |
| R2-7 | Medium | `revoke()` must also reject reads already awaiting storage; the abandoned `up()` can catch and continue | Accepted: re-check after the await; parked-read test; wording says later `ctx` calls reject. |
| R2-8 | Medium | #226's integrity mapping changes what a person reads | Accepted: the assertion keeps today's "Import failed" screen; OA-9 offers the integrity message (D5). Superseded by F-1. |

None rejected.

### Final fresh pass (2026-10-09)

- **Codex (fresh session, gpt-6.1-sol, high): reject**, with one blocking finding: OA-9's "what ships now" shipped an unapproved sentence ("backup profile is malformed"). It found no further material problem in D1-D4, D6-D11 or D13-D16, confirmed the PXE patch reaches only the address write and that the real address store refuses conflicting entries, and confirmed every other "what ships now" keeps today's behaviour or depends on a signed page-1 record. Every finding below was verified against the tree and fixed in the plan; no further Codex round ran (the brief asks for one final pass).

| # | Sev | Finding | Disposition |
|---|---|---|---|
| F-1 | High | OA-9 ships new copy while unanswered (D5 reasoning fails) | Accepted: arc 1 adds no composable check and no words; the types alone stop overstating; OA-9's "what ships now" is today's behaviour; the integrity message is the owner's option (D5). |
| F-2 | Medium | The malformed-profile test contract contradicts the entry gates (selection refuses a missing type, Restore stays disabled) | Accepted: verified `useFullBackupImport.ts:483,715`; the composable tests are gone with the check; OA-9 describes today's gates accurately. |
| F-3 | Medium | Reminder writes lack an incarnation fence: an earlier restore's delayed trim can edit a later restore's record for a reused id | Accepted: a per-run token in the record, compared inside the lock; test added (D12). |
| F-4 | Medium | The persisted reminder record is read without runtime validation | Accepted: a bounded decoder, malformed reads as absent, a far-future lease as expired; tests added. |
| F-5 | Medium | Closing before `finalizeRestore` runs no rollback; torn imports are reaped only after seven days | Accepted: verified `profile/service.ts:194,1632-1650`; claim corrected; the reader shows only finalized profiles. |
| F-6 | Medium | Arc gates omit `bun run audit:vue` (CLAUDE.md requires it before a UI PR) | Accepted: arcs 1, 2 and 3 gates run `audit:vue`; arc 1b already builds. |

None rejected.
