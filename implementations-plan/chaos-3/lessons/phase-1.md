# Phase 1 lessons: chaos-3, arc 1

## 1.1, the model

- **Counter, not a list (D2).** `mintedCredentials(w) = w.next.credential - 1`; the old count of distinct profile credentials undercounted a declined passkey import and a replaced credential. The model test checks, over 1,000 seeds per caps set and both starts, that the counter moves by one exactly at a mint (create, passkey import or restore kept or declined, a method change's new passkey) and never past `credentialSlots`.
- **Draw counts over 1,000 seeds** (Chrome / Firefox / network): the rarest variants are an onboarding reuse (9 / 10 / 11, it needs every profile deleted first) and a passkey account file answered by another credential (35 / 47 / 35). Every variant is drawn on every caps set; the model test pins it.
- **`otherCredentials` changed meaning (D8):** every minted credential but the target's own. The unlock, reveal and account-file `other` variants now also draw a replaced or a declined credential.
- **verifyAll's passkey re-export** protects the re-exported file under the imported file's own password, not a fresh one: that password is already a needle and opens the original, so no new run state is needed. The property checked is unchanged (the re-export carries the imported signing key).
- **Gate ordering.** `typecheck:all` covers the drivers, so the 1.1 gate ran once 1.2's drivers compiled; the model test (30/30) does not import them.

## 1.2, drivers, collectors, checkers

- **I1 holds** on Firefox: a discovery narrowed to one credential (`pickDiscovered`) answers at once with three credentials held (list a), and the answer's `rawId` is the planned credential's. **I2 holds**: the import, restore, account file and Unlock method pages ran their passkey card in the anchor tab on both browsers.
- **Seven hand lists** in the lane's scratch directory outside the repository, each run at retry 0 on both browsers on the final 1.2 code:
  - (a) three passkey profiles, a phrase import reusing the second's credential, `verifyAll`: green on both.
  - (b) a passkey phrase import declined at the duplicate warning (its mint kept), creates up to the three slots, one reusing the declined import's credential, a refused unlock by another credential: green on both.
  - (c) an account file imported into a password profile, a change to a passkey, `verifyAll`'s passkey re-export: green on both.
  - (d) strict off, a passkey to new passkey change, a restart, the replaced credential refused, the new one opening: incomplete on both, only the planned restart's log window.
  - (e) every `changeUnlockMethod` variant and the race: red on both, only #1178's Unlock method line (`known[#1178=1]`), as D10 predicted.
  - (f) every passkey account file variant, the file imported into a password profile: green on both.
  - (g), added because (a)-(f) left two variants undriven: onboarding's reuse after every profile was deleted, a passkey restore minting and one reusing (with a duplicate confirmed), a passkey phrase import minting: green on both.
- **The launcher's `do` lacked the seeded step's prologue (D16).** The launcher check's first Chrome session went red: `do unlockPasskey` with another credential left its refusal toast, and the next `do unlockPasskey` settled on it at once, reported `refused`, and the wallet opened behind it (O1: "open, but p0 shows /popup/auth"). Seeded runs never met it: `runOne` dismisses notices first. Fixed by one prologue, `beforeDriver`, for both callers; the per-driver capture installs became redundant and went. Rerun: both browsers, every command dispatched, outcomes as named (refused, then committed), no finding, no incomplete line.
- **`changeUnlockMethod`'s param is `change`, not `to`:** the launcher's `do` validates a `to` as a profile symbol and would refuse `new-passkey`.
- **The answer-sequence check is pure** (`bindCeremonies` in `checkers.ts`) so the model test breaks it: another credential, a discovery the wallet narrowed itself or without PRF input, a missing create, a create on a bound id, an extra create, a get on an unminted credential.
- **Gate.** Model test 249 green; `scripts/e2e/chaos-session.test.ts` and `chaos-seed.test.ts` green; seeds 7001-7003: Chrome red (7001, 7003) only on #1131 and incomplete (7002) only at its planned restart, Firefox green (7001) and red (7002, 7003) only on #1131; `account-import-export.test.ts` and `backup-imported-account.test.ts` green on Chrome.

## 1.3 — campaign triage

- 2026-10-28, Firefox seed 7008 step 17 (`exportAccountFile`, a passkey profile, approve): the driver timed out pressing Download. A passkey profile's Save downloads the file on its own (`account.vue` `handleSaveFile` ends in `handleDownload`), so the driver's later press met a button disabled by the page's own, unstubbed download. Chrome finished that download fast enough that the press went through and the second download was captured; Firefox did not. Classified as a harness defect; the passkey Save now arms the capture before the press, settles on the protected banner or the save's failure toast, and reads the page's own download. The shared `account-io` helper is back to its original shape. Rerun of 7008 on both browsers: no unfiled violation.
- 2026-10-28, the per-seed time before and after: the host is shared, so the campaign's batch times move with other lanes' load. The comparison is five seeds (7001-7005) per browser run with the base commit's harness files checked out over the head, then at head, both browsers at once each time; the wallet build is the same armed dist, since the arc changes no product file.
