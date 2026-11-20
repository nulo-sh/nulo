---
plan: fee-public-warning-build-1
tier: light
status: in progress
issues: "#1890"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon inline (greps, no Explore agent); one Codex gpt-6.1-sol high read-only pass over plan and net diff after the build (lane brief, bounded work)
base: origin/dev at 033dfcd9c
trunk: dev
post_implementation_hardening: not scheduled
---

# fee-public-warning-build-1: Mainnet app windows open on Public Fee Juice, with Send's short warning

Page 198, signed by the owner on 2026-11-20 ("p198 signed."), builds P194-02 = C (the owner, 2026-11-19: "Open on Public Fee Juice with a warning like Send's that it names the account."). On a network that offers no sponsor (Mainnet today), an app window (the execute window, the Change and Revoke authorizations popups) with nothing remembered, whose private Fee Juice is read as empty and whose public Fee Juice can pay, opens on Public Fee Juice and runs its estimate; whenever Public Fee Juice pays in an app window, the card shows Send's warning box with Send's short sentence and Send's fix lines. Paths are under `apps/extension/src/` unless they name another root.

## The issue, checked (#1890)

**Demonstrated** at the base: `popup/windows/execute/OperationCard.fee.test.ts`, "private Fee Juice read as zero, public Fee Juice held: nothing is chosen for the person" (green at `033dfcd9c`: the trigger reads "Select method", no settings). Path: Mainnet operation; protocol PrivateFPC registered, private balance read `"0"`, public `5 FJ`; no app pick saved. The snapshot commits and reconciles (`composables/useFeeSnapshot.ts:91-106`); no saved pick resolves, so `settledSelection` calls `appDefault` (`composables/useFeeSelection.ts:189-204`), which finds private Fee Juice ineligible and `defaultSponsor` empty, because discovery lists no sponsor off Testnet and the local network (`wallet/services/fpc/sponsored-fpc-chains.ts:6`, `wallet/services/fpc/service.ts:189`). Consequence: no estimate until the person picks. The issue's claims hold; it offered A or B, and the owner chose C (B plus a warning).

**Where Send's sentence lives** (drawing lane's report, verified): `components/composite/send/publish-facts.ts` `feeWarningShort` ("Paying the fee from public Fee Juice shows your address." for a hidden recipient); the box is `publish-mark.module.css` `.warning_box`; the fix lines are `FeeSettingsCard.vue`'s sheet block ("Pay it from private Fee Juice", "Get private Fee Juice"). Send shows it when `payerKindOf(settings) === "account"` on a private origin (`publish-facts.ts:80-103`).

## Assumptions

**Facts** (at `033dfcd9c`)
1. Send's private-origin walk reaches Public Fee Juice only on a private balance positively read as `"0"` with the PrivateFPC row present; an unread or failed private read holds (`popup/components/modules/send/fee-privacy.ts:66-79`). Its public-origin walk steps past an unread private balance (`:81-89`).
2. A snapshot commits only after both legs settle (`useFeeSnapshot.ts:123-131`, `:184-190`); a failed private leg commits `privateFeeJuice: null`, a failed whole read `undefined`. Before the commit the window defaults nothing (`prefillSelection` fills only a lock or a saved pick).
3. Fee Juice settings exist only on a positive, non-zero public read (`fee-helpers.ts:125-130`); the window's Confirm needs settings and an estimate.
4. The FPC service lists Nulo's sponsor exactly on the chains `offersSponsoredFpc` names, and filters it everywhere else (`wallet/services/fpc/service.ts:176-202`).
5. Send reads balances fresh on every mount because its public default rests on a private zero that the reader's 5-minute cache may hold stale (`useFeeSelection.ts:153-156`); the app windows read fresh only when locked. #1889 (closed known limit) recorded forcing app windows to read fresh as the owner's call.

**Asks**
- **Ask 1, the walk.** The brief says "Mirror Send's public-side walk exactly" and lists, as a defect to look for, a window that opens on Public Fee Juice while the private balance is unread or failed. Working assumption: the step that lands on Public Fee Juice is the private-origin walk's (Fact 1), whose predicate is shared, not copied (D2); an unread or failed private read keeps "Select method", as Send holds. The public-origin walk would open on Public Fee Juice over an unread private balance.
- **Ask 2, fresh reads.** Not adopted (Fact 5): Mainnet windows keep the reader's cache, so a private credit made outside the wallet inside the cache window can still read `"0"`, and the window opens on Public Fee Juice with the warning and the bridge link. OWNER-ASKS.md OA-1; #1889 gets a comment.

## Decisions

| # | Decision | Rejected | Why |
|---|---|---|---|
| D1 | `appDefault`: private Fee Juice when it can pay, then `defaultSponsor`; only where the network offers no sponsor (`!offersSponsoredFpc(chainId)`), then Public Fee Juice when the private balance is read as empty and public can pay | gate on `defaultSponsor` being empty | a sponsor-offering network with its sponsor momentarily ineligible or unlisted would open on Public Fee Juice; the brief keeps today's default wherever a sponsor is offered (Fact 4) |
| D2 | `privateReadAsEmpty(privateFj, know)` exported from `fee-privacy.ts`, used by `walkPrivateOrigin` and `appDefault`; public eligibility is `isEligible` | calling `resolveSendSelection("private", …)` and keeping an `fj` result; an inline copy | one predicate cannot drift; the walk call would return rows built without the card's verdicts and reads indirectly |
| D3 | The box shows while the settings the card submits pay from public Fee Juice: `feeWarningShort(publishFacts("private", "private", payerKindOf(derivedSettings, null)))`, Send's own functions | keying on `effectiveMethod.type === "fj"` | Send's rule reads the submitted settings; it cannot show before Confirm could use them, never shows next to the nudge for an empty balance (Fact 3), and leaves with any other payer |
| D4 | The window's box is its own live region (`app-fee-warning-live`), mounted with the card under the payer control (selector or locked row), testids `app-fee-warning`, `-fix`, `-bridge` | one region shared with Send's sheet | Send's sits inside its radio group with its sentence from the page; sharing needs surface-conditional testids and classes |
| D5 | Fix lines: the switch while the derived PrivateFPC's row is enabled and covers the estimate (`remedyMethod`, its origin guard widened to an unlocked app window); the bridge link while that row cannot; a locked row shows neither switch nor, while private can cover, link | a switch on the locked row | P198-03: the app-set payer cannot be changed |
| D6 | The fix moves focus to the payer trigger (`onWarningFix`, as on Send) | focus left on the removed button | accessibility call, the owner's 2026-10-19 delegation |
| D7 | Change and Revoke get it by construction: both mount the same card branch (`fallsBack`, no lock); `fallsBack`'s short-sponsor fallback unchanged | popup-specific code | P198-02 = 1 ("the same box as in the window") |

## UI impact

The app windows' fee card (execute window at 400 px; Change and Revoke popups at 360 × 600):
- **No sponsor offered, nothing remembered, private read as `"0"`, public can pay.** Before: "Select method", no cost rows. After: "Public Fee Juice", the estimate runs, Send's box under the trigger with "Get private Fee Juice". Frames `fpwb-2-c`, `fpwb-4-change`, `fpwb-4r-revoke`.
- **Public Fee Juice pays, any way chosen** (picked, remembered, a sponsor's fallback, set by the app). After: the box, with "Pay it from private Fee Juice" when private can cover (`fpwb-5-remembered`); it leaves on another payer (`fpwb-3b-picked-other`). On the locked row, no switch (`fpwb-6-app-set-link`, `fpwb-6b-app-set`, never drawn: the owner looks before the PR lands).
- Unchanged: every sponsor-offering network's default, private-first, unread or failed reads, Send.

Sign-off: page 198, P198-01 = 1, P198-02 = 1, P198-03 approved (the owner, 2026-11-20 13:28Z). No other copy, row, format, stored key or glossary term.

## Security & Adversarial Considerations

- **Address published unasked.** The default names the account as public fee payer only under D1's conditions, and the box says so before Confirm (D3: same computed as the settings). Unread, failed and cached-stale private reads: Ask 1, Ask 2.
- **Another identity's pick.** The default runs only in the reconcile, for the committed identity, after the saved pick for that profile and address; a pick made during the read wins (`touchedSince`); unchanged.
- **dApp influence.** A dApp picks the network and may lock `fj`; it cannot reach the public default on a sponsor network, nor hide the box for a locked `fj`.
- **Estimate racing a switch.** The fix is a pick (`handleMethodPicked`), the menu's own path: new settings, a new estimate keyed on them.
- No permission, message, storage, log line or dependency change.

## Phase 1: build, tests, gates

1. Tests first, red at the base: `useFeeSelection.test.ts` (the default table: no sponsor offered gives Public Fee Juice; public read empty, or private unread, gives nothing); `OperationCard.fee.test.ts` (the zero case flips to Public Fee Juice with the box and the bridge link; the unread case stays, with no box); `FeeSettingsCard.test.ts` (the default and the box, on the window's and the popups' card; a sponsor network keeps its sponsor, or nothing when it lists none; private that can pay keeps private; a switch away and back; a remembered public pick with the switch; a locked payer with no switch, the link only while private cannot cover; no box beside the nudge; the box with a short sponsor's fallback). Then the build. Commit.
2. Gates: `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run test:all`; `bun run check:plans` after staging.
3. E2E: specs whose window pays from public Fee Juice on the sandbox (a sponsor network, so the default is unchanged there): `tx-sendTx-selfPay` (locked `fj`, the box now shows), plus `tx-sendTx-default` as the sponsor-network control. One `e2e:agent` run on Chrome, one with `NULO_E2E_BROWSER=firefox` (the brief). No new scenario.
4. Captures: the drawing lane's capture page (real components over fake clients, uncommitted, the sketch swaps removed), page 198's state and sizes, 2x, light and dark, into the lane's scratch `shots/` with `captions.json`.

**Results** (head `7e84f8ca2`): 8 new tests red on the base source, green after; a mutation of D1 to `if (sponsor) return sponsor` reds "its sponsor unlisted". Lint, typecheck, `test` (1,050 files, 18,835 tests) and `test:all` (18 workspaces) green; `check:plans` 0 findings. E2E proverless, both specs 3/3 on Chrome (271 s wall) and Firefox (219 s). Frames: 7 of 7, light and dark; `fpwb-2-c`, `-3b-picked-other`, `-5-remembered` and `-4-change` pixel-identical to their page-198 counterparts. Revoke (never drawn): its card scrolls, 656 px of content in 558, and the Revoke button sits at 582-622 px, below the 600 px fold until scrolled; Change's stays above it (546-586 px). The box is 78 px tall.

## Audit verdicts

- **Codex, the one bounded pass** (gpt-6.1-sol, high, read-only, session `01a1f943`, plan and diff at `540a7e9ad`): `findings: 0 material, 2 minor`. F1 (minor, demonstrated): the short-sponsor fallback test never checked the box; taken, the test now asserts it. F2 (minor, comments): `onWarningFix`'s comment still named Send's radio, and `remedyMethod`'s comment restated its condition; both taken. Checked sound: the reconcile waits for both legs, unread private never counts as empty (Ask 1's reading), D1's chain gate against unlisted, set-aside or checking sponsors, D3 for every way the payer is chosen, identity fencing, the fix through the pick path with estimates invalidated on settings change, Change and Revoke on the same card mode. Targeted verification: the card's suite green at `7e84f8ca2`.

## Post-implementation

Contract: this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `033dfcd9c`. Step 1 absent (`code_review: off`). Step 2, bounded: ONE Codex pass (`run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`) over this plan and `git diff origin/dev...HEAD`, both verbatim rules, the brief's adversarial list; then targeted verification of material fixes. Approval boundary (stop): a stored key, a forced read, new copy, or a default on a sponsor network.

## Delivery

One PR against `dev`, opened ready, never merged by the lane: `feat(fees): mainnet app windows open on public fee juice with send's warning`. Body: the owner's words (P194-02, P198-01/02/03), the frames (one commit adds them, the next removes them), the app-set frames awaiting the owner's look, the rule C match line, the gates, the Codex verdict, `Closes #1890`. Close-out in the same PR.

## Seeds

- `/goal`: on a network with no sponsor, an app window with nothing remembered and private Fee Juice read as empty opens on Public Fee Juice; Send's box shows whenever Public Fee Juice pays; one PR, checks green.
- `/loop`: watch the PR's required checks; on red, fix at the cause and rerun the affected specs.
