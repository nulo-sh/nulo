# Phase 0: planning consults

## Recon

- Two Sonnet explorers: (a) the execute window's embedded-fee block, the funding probe, the `register_token` card,
  the Confirm gates, the popup's channel to the signed list; (b) Delete Profile, the forgot-password popup, the
  account export page, delete chain, the imported-account model. The planner read the capability window itself.
- The approved pictures and the mockup diff were read in place, outside the repository; nothing was copied in.

## Codex plan r1 (gpt-6.1-sol, high, read-only, session `01a15b8b`)

Verdict: **conditional approve**. Findings and dispositions:

1. Locked enumeration (arc 2): `NetworkService.getNetworks()` calls `requireActiveProfile()`, which throws while
   locked (`network/service.ts:419-425`, `require-active-profile.ts:24-33`), so I3 cannot hold for the reset page
   reached from the lock screen. Verified. Accepted: the section lists accounts only while unlocked; a locked
   reader would read account rows behind the lock, so it is not built (OA-1). (The final pass corrected this
   round's "both reads refuse": `getAccounts` has no session check; only `getNetworks` refuses.)
2. Export first cannot reach an imported account on another chain: `export/account.vue` lists only the active
   chain's rows. Verified. Accepted as OA-2 (arc 2): which page Export first opens is the owner's.
3. OA-1 chose an unpictured state. Accepted: arc 2's PR opens as a draft until OA-1 and OA-2 are answered; the
   "ships now" form is stated, not decided.
4. D11's failed read: if both price reads fail, `mapped` stays false and Confirm stays off with no message.
   Accepted as written: D11 waits for the first price snapshot, which carries the list the worker loaded at start
   (`token-list/service.ts:112-116`); a price service that answers neither read needs a worker whose storage
   reads fail, which the wallet does not support: a known limit filed at close-out.
5. Phase 4 tests miss a list that flags the token mid-window and a direct `approve()` while blocked. Accepted:
   both added; the e2e flagged case ticks with the keyboard.
6. A paused reset's `reset.imported` already merges live imports (`importedNames(journal, live)`). Verified.
   Accepted: use it when a reset is paused, the live list otherwise; a same-name control.
7. E2E measurement must compare the same file selection. Accepted: before and after on the two changed files per
   browser; `audit:vue` added to phase 5.

## Opus 5.5 plan r1 (Plan agent)

Verdict: **conditional approve**, 11 findings. Dispositions:

1. Locked enumeration (as Codex 1): accepted, OA-1.
2. Details ticks events while the events switch is Off, since it reads the request over the held grants. Settled
   by the approved picture: the lane brief gives the B window A's Details (`p77-cap-a-details`), drawn with the
   events tick. D15, pinned by a window test.
3. A payload can declare another fee payer while a call makes the PrivateFPC the kernel's payer; the card then
   reads as today's. Plausible, unverified. Same consequence as the surface the owner already judged (the figure is
   shown and capped). Accepted as a narrowed quality bar and a known limit; the clean fix carries the kernel's payer
   on the estimate, a contract change outside the lane.
4. With the PrivateFPC, `provenShort` holds Confirm while D8 hides the probe line. Rejected as an ask: the
   installed `PrivateFPC` source shows `pay_fee` deducting the max gas cost from the caller's credit, and credit is
   only minted from claims into the pool, so a pool short of the fee limit means every credit is short; the notice
   names the cause.
5. A locked Delete Profile would list account names without a password: accepted, OA-1 option B carries it.
6.–11. Accepted: class-row testids; fixture and smoke-spec files; `type-roles.test.ts` in arc 2; one
   `tokenFlagHold` joining an existing return, per-type collectors; malformed scopes fail Off; the broadcast test
   and the dispose order; address-keyed merging and the Export first testid. Line numbers in `details-table.ts`
   corrected (a concatenated read had shifted them).

## Codex final pass (gpt-6.1-sol, high, fresh session `01a15b9d`)

Verdict: **conditional approve**; D1-D15 hold, I1 holds, I2 is timing no gate rests on. Findings, all arc 2, all
verified and accepted:

1. Delete Profile misses imports a paused reset purged and holds only in its journal
   (`network-reset/service.ts:134,550-563`; `getAccounts` reads live rows). Fix: merge `reset.heldImported`, keyed
   by address; a purged case paired with a recreated control.
2. Delete was actionable before its warning's read answered. Fix: Delete held until the read answers, a failed read
   refused with the page's existing toast, as delete chain refuses an unknown hold (`networks/[id].vue:147-156`).
3. "Both reads refuse while locked" was wrong: `getAccounts` has no session check (`account/service.ts:241,177`).
   Corrected in the plan, OA-1 and r1's disposition; the decision (no locked read) stands.
4. The full backup page refuses while a reset is pending (`export/full.vue:70-85`), so OA-2's B cannot reach
   journal-held imports. Added to OA-2; the recommendation now falls back to A while a reset is pending.
5. Phases 6-7 named "the touched tests": replaced by filtered `test` commands.

Confirmation turn (same session): fixes 2-5 close their findings; fix 1 merged by address alone, which would name
one address imported on two chains once (account identity is `(profileId, chainId, address)`, `account/spec.ts`).
Accepted: merge by `(chainId, address)`, the held import keyed on its network's chain (rewritten before any row is recreated); a two-chain control.

## E2E baseline attempt (before arc 1)

- 2026-10-20 23:10Z, Chrome, `register-token` + `cap-request-partial` on the base: exit 86, the local Aztec node
  never answered within 90 s ("Address already in use" from the CLI's own anvil, expected; then no answer) with
  load1 at 180-200. Host saturation, no code involved. Retry once the load falls, in phase 5.

## Arc 1 review round 1

- Codex r1 (session `01a15bc4`): one low finding, two comments restating their declarations; fixed in `75c15eca4`.
- Opus r1: `effectiveGrants` replaces a type wholesale but `dataGrant` merges data field-wise, so any view built
  from `effectiveGrants` alone under-reads held data a data re-request keeps. Details now unions the held data cap.
  Also: the plan's trade-off said `usePrices` already ran in the execute window; it ran only in the fee window.

## Arc 1 phase 5, Chrome network e2e

- r1 (load1 110-230): 6 of 8 files green; two spec errors, no product fault. The playground adds the dApp's
  row as `pending` at the request, so "no answer yet" is "no settled row", never "seq unchanged" (the
  pattern `tx-sendTx-default` already uses). `dataAnswer` always states `addressBook` to the dApp, while the
  stored grant carries only what was granted. r2 on the two files: green.
