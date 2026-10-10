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
