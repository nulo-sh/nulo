---
plan: fee-default-1
tier: light
status: building (one draft PR against dev, never marked ready by the lane)
issues: "#1879"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon inline (greps and `git log -S`, no Explore agent); no plan audit round; one Codex gpt-6.1-sol high read-only pass over plan and net diff after the build (lane brief, bounded work)
base: origin/dev at c1bca82cb
trunk: dev
post_implementation_hardening: not scheduled
---

# fee-default-1: the first transaction window opens on private Fee Juice when it can pay

The app windows' fee card (the execute window, the two authorization popups) picks a payer unasked when nothing is remembered for the account. Today that default is Nulo's sponsor, else nothing; since Mainnet stopped offering the sponsor, a Mainnet window with nothing remembered opens with no method even when private Fee Juice could pay. After this change the default is private Fee Juice when a balance read shows it can pay, then Nulo's sponsor, else nothing. Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consult: [lessons/phase-1.md](lessons/phase-1.md). Paths are under `apps/extension/src/` unless they name another root.

## The issue, checked (#1879)

**Demonstrated** (red component test at the base, `popup/windows/execute/OperationCard.fee.test.ts`, "private Fee Juice can pay: the window opens on it…": `expected 'Select method' to contain 'Private Fee Juice'`). Initial conditions: an operation on Mainnet; the account holds private Fee Juice (the protocol PrivateFPC registered, a positive private balance read); no app pick saved for the account. Events: a dApp's `aztec_sendTx` opens the execute window; the card loads the saved picks (`composables/useFeeSelection.ts:231-238` at the base), the snapshot commits and reconciles (`useFeeSnapshot.ts:90-106`). Order: no saved pick resolves, so `settledSelection` falls to `defaultSponsor` (`useFeeSelection.ts:189-194` at the base; `fee-helpers.ts:280-282`), which finds no sponsor because discovery offers none off Testnet and the local network (`wallet/services/fpc/sponsored-fpc-chains.ts:7`). Invariant broken: a window whose account can pay opens on a payer that can pay. Consequence: the trigger reads "Select method", no settings reach the window, no estimate runs and Confirm waits for a pick the person was never told to make (a stuck-looking flow, not lost funds).

**Rule or regression.** Neither a decided rule nor a code regression: an unset default.
- "Nulo's sponsor, else nothing" is in the starting commit (`e1c75331a`, `FeeSettingsCard.vue` `settledSelection`), written when every chain offered the sponsor, so "else nothing" covered only a deleted, set-aside or loading sponsor.
- `5d41de8ef` (#1652, 2026-11-03, plan `archive/fixes-1.2.0-2`) removed the sponsor on Mainnet. Its UI impact reads: "With no sponsor, a card picks as it does today when none exists (Fact 3)", and its Fact 3: "app windows: Nulo's sponsor, else nothing". That carried the edge-case fallback onto Mainnet's main path; no plan, issue or owner decision says a funded account's first window opens unselected. `archive/fees-and-sponsors/OWNER-ASKS.md` OA-11 records "With no sponsor and no fee juice, nothing is selected", which is the no-payer case, unchanged here.
- Closed known limits searched (`fee default`): none on this path (#754 is an edited sponsor's label).

**Claims that did not hold.** The brief's "per-app and per-account pick maps": the app windows keep one pick per account, keyed by address (`utils/fee-picks.ts:17-19`, `useFeeSelection.ts:181`); there is no per-app map. On Testnet and the local network the bug does not reproduce for a fresh account: Nulo's sponsor is the default there.

## Assumptions

**Facts** (at `c1bca82cb`)
1. The owner, 2026-11-19, testing the 1.3.0 candidate: "The first Transaction Popup to open, does not select private fee juice by default, it comes with an empty-selected fee."
2. A default is never saved: only `pickForApp` calls `persistSelection` (`useFeeSelection.ts:294-299` at the base), and sending persists nothing (`git grep saveFeePick`). A remembered pick wins over the default at load (`prefillSelection`) and at reconcile (`resolveSavedSelection` first); a pick made during the read wins over both (`touchedSince`).
3. On a first load the reconcile runs before the gate opens, so `methods` is built without balances (`useFeeSnapshot.ts:86-106`): a `private_fpc` row there is not `disabled` even when the balance is zero or unread. `isEligible` (`fee-privacy.ts:30-41`) reads the balances themselves: the PrivateFPC row present and a private balance read as a non-zero string.
4. `buildFeeMethods` offers the private row only for the protocol PrivateFPC (`fee-helpers.ts:216`); a non-protocol one yields a row with `fpc: null`.

**Asks:** OA-1, Mainnet with private Fee Juice unable to pay but public Fee Juice able: should the window default to public Fee Juice? Left as today (nothing selected) until answered. OA-2, where Nulo's sponsor is offered (Testnet, local): private Fee Juice first (built, D2) or the free sponsor first?

## Decisions

| # | Decision | Rejected | Why |
|---|---|---|---|
| D1 | `appDefault(c)` in `useFeeSelection.ts`: the `private_fpc` row when `isEligible` holds on the committed balances, else `defaultSponsor`, else nothing; `settledSelection` calls it where it called `defaultSponsor` | Send's `resolveSendSelection("private", …)` | that walk falls to public Fee Juice on a private balance read as zero: a new default the owner did not ask for (OA-1) |
| D2 | Private Fee Juice before Nulo's sponsor on every chain | sponsor first, private only where no sponsor is offered | the owner's words ask for private Fee Juice as the default, unconditionally; the brief orders it first. Consequence: on Testnet an account holding private Fee Juice now opens on it instead of the free sponsor (UI impact) |
| D3 | Eligibility from `isEligible` over `snapshot.gasBalances`, not the row's `disabled` | `!row.disabled` | Fact 3: on a first load a zero or unread balance leaves the row enabled; a mutation of D1 to `!disabled` reds 9 tests |
| D4 | No stored key, no migration, no view change: the default stays unsaved and `chosenUnasked` keeps marking it (an edited PrivateFPC drops it, as an edited sponsor default is dropped) | saving the default | Fact 2; the brief |
| D5 | F1 (an unsaved pick lost to the default on a recovery) is a known limit, not a code change | an in-memory overlay of the mount's own picks over storage, built and reverted | each version of the overlay opened a new ordering path in review (a mount-life overlay masked a newer pick stored by another card; ending it at a stored save exposed a read already in flight; a refused save outlived its FPC's deletion): read/write coordination, design growth for a path that predates this change and needs a degraded first read plus a save not yet stored |

## UI impact

The app windows' fee card (execute window, Change and Revoke authorizations popups), only when no pick is remembered for the account:
- **Mainnet, private Fee Juice can pay.** Before: trigger "Select method", no cost row, Confirm waits. After: trigger "Private Fee Juice", the estimate runs, "You pay" shows. Frames `fd-before-*`, `fd-after-*`.
- **Testnet or local network, private Fee Juice can pay.** Before: Nulo's sponsor ("Sponsored", You pay Nothing). After: Private Fee Juice (the account pays from its private balance). D2, OA-2. Frames `fd-testnet-before-*`, `fd-testnet-after-*`.
- **Private Fee Juice cannot pay** (read as zero, unread, failed, or no protocol PrivateFPC): unchanged; Nulo's sponsor where offered, else nothing. Frame `fd-cannot-pay-*` (Mainnet).
No copy, layout, row or format changes. Sign-off: the owner's words (Fact 1) ask for this default; the frames go to the owner through the orchestrator, and the PR stays a draft until then.

## Security & Adversarial Considerations

- **A default over a remembered pick:** the saved pick and a pick made during the read are consulted first (Fact 2). Tested: a saved Public Fee Juice pick and a pick made during the read both win while private Fee Juice can pay; an unpicked default re-derives from recovered balances. Known limit (Codex F1, D5): after a degraded first read, a pick whose save is not yet stored when the recovery re-reads storage gives way to the default, as it gave way to the sponsor before this change.
- **A default that cannot pay:** eligibility needs a positive read (D3); zero, `null`, a failed whole read and a non-protocol PrivateFPC each fall back (one test per class). A private balance below this fee is caught where a picked Private Fee Juice is today, by the estimate.
- **Balance read racing the default:** the default is computed inside the synchronous commit from the balances it commits; before the commit nothing is defaulted; a recovery reconcile re-derives it from the new balances only while nobody picked. The committed balances can be the reader's cache (5 minutes, invalidated by this wallet's settled transactions only): a balance moved from elsewhere inside that window gives today's no-default (cached zero) or a Private Fee Juice whose estimate refuses (cached positive). Known limit (Codex F2): forcing a fresh read on every app window would slow every window, a behaviour change outside this lane.
- **dApp influence:** a dApp chooses the operation's network and can lock "fj"; a lock still wins (`reconcileSelection`). It cannot make the wallet pick private Fee Juice unless the account's own balance can pay. Paying privately publishes no payer address; nothing new crosses a boundary. No permission, log line, storage, message or dependency changes.

## Phase 1: the default, its tests, the gates

1. Red first: `useFeeSelection.test.ts` (the default by class; the remembered-pick and during-read controls; the default re-derived on a recovery), `OperationCard.fee.test.ts` (wire-shaped Mainnet window: opens on Private Fee Juice and saves nothing; zero and unread leave it unselected). The identity-switch test in `FeeSettingsCard.test.ts` gives identity B a zero private balance so B's default still differs from A's saved pick, and asserts no emission after B's commit names A's pick. Then D1. Commit.
2. Gate, retry 0: `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run test:all`; `bun run check:plans` after staging; the new tests red on the base `useFeeSelection.ts`.
3. E2E, Chrome, one `e2e:agent` run of the network specs that read the windows' fee card testids: `tx-sendTx-default`, `tx-sendTx-sponsoredFpc`, `tx-sendTx-selfPay`, `tx-sendTx-feePayer`, `fee-sponsor-funding`, `fee-shortfall-recheck`, `popup-escape-layered`, `type-roles-windows`. Of these only `fee-shortfall-recheck` holds private Fee Juice (`feeJuiceImportedExtension` mints 1,000 FJ, `fixtures/aztec.ts:566`), and it drives Send, whose rule is unchanged; every spec that opens an app window while holding private Fee Juice (`selfpay-phase`, `same-token-concurrent-sends`, `send-chaos`) picks a payer explicitly or is locked. No Firefox: no focus, window or fixture change.
4. Captures: a Vite capture page (the real `OperationCard` over fake clients, uncommitted, under `apps/extension/capture/`), 400 px, 2x, light and dark, into the lane's scratch `shots/` with `captions.json`: `fd-before`, `fd-after`, `fd-cannot-pay` (Mainnet), `fd-testnet-before`, `fd-testnet-after` (for OA-2).

## Audit verdicts

- **Codex, the one bounded pass** (gpt-6.1-sol, high, read-only, session `01a1f571`, plan and diff at `91f749aaf`): `findings: 2 material, 2 minor`. F1 (material, plausible, traced, red in the unit harness): after a degraded first read, a pick whose save is not yet stored gives way to the default on the recovery. F2 (material, plausible): the reader's 5-minute cache can stale the default. F3 (minor): the identity test checked only the final settings, taken. F4 (minor, demonstrated): Phase 1 step 3 said no listed spec funds private Fee Juice, corrected. On D2 Codex leans sponsor-first where a sponsor is offered (moderate): OA-2; the build keeps the brief's order. Commit order sound; no comment finding.
- **Targeted verification, two resumed rounds** over an overlay built for F1: round 2 verified F1, F3, F4 and found the mount-life overlay masked a newer pick another card stored (material); round 3 found ending it at a stored save exposed a read already in flight, and a refused save outlived its FPC's deletion (2 material). Three rounds is the hard stop. The overlay was reverted (D5): F1 and F2 are closed known limits, filed at close-out. The shipped rule book is the round-1 diff; the F3 test and a recovery-default test stay.

## Delivery

One draft PR against `dev`, never marked ready or merged by the lane, opened without labels: `fix(fees): the first transaction window opens on private fee juice when it can pay` (79 characters). Body: the owner's words, the rule C line ("Orchestrator match (rule C): the window now opens on private Fee Juice when it can pay, the owner's words."), the Testnet consequence (D2), OA-1, the frame ids, the gates, the Codex verdict, `Closes #1879`. Commits conventional, signed, ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `c1bca82cb`. Step 1 is absent (`code_review: off`). Step 2, bounded form: ONE Codex pass (`run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`) over this plan and `git diff origin/dev...HEAD`, with both verbatim rules, asked for a path where the default overrides a remembered pick, one where it selects a method that cannot pay, and a race between the balance read and the default; then targeted verification of material fixes. Approval boundary (stop): a stored key, a migration, a view change, or a default beyond private Fee Juice. Close-out as the PR's final commits; merging and teardown are the orchestrator's.

## Seeds

- `/goal`: the app windows' fee card opens on private Fee Juice when it can pay and nothing is remembered; a remembered pick still wins; one draft PR, checks green.
- `/loop`: watch the draft PR's required checks; on red, fix at the cause and rerun the affected specs.
