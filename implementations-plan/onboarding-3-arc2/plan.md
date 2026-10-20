---
plan: onboarding-3-arc2
tier: mid
status: completed (2026-10-20); closed in #743's final commits
issues: "#769 (folded from onboarding-4), #881, #722; this arc's PR is #743"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 explorers (sonnet); dual audit (Codex gpt-6.1-sol high + Opus Plan leg); final fresh Codex pass
base: worktree-onboarding-3 at 3f9f958c (the build the owner tested)
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-20
- **Status:** completed. Its delivery is #743, a draft against `dev` that also carries arc 1 ([archive/onboarding-3](../archive/onboarding-3/plan.md)) and onboarding-4's arc ([archive/onboarding-4](../archive/onboarding-4/plan.md), #769); this close-out is its final commits. The orchestrator takes #743 out of draft and merges it.
- **Shipped:**
  - P50-01 B (#769): a later profile's card shows only what it lacks.
  - The matrix, M1 to M23, each cell pinned by a unit, Home or e2e step.
  - P67-02 B: "Get Fee Juice" is done for good the first time the profile holds Fee Juice (`nulo:ui:getStartedFeeJuiceHeld@<id>`, written by Home).
  - P67-03, the owner's note: a Testnet reset changes nothing on the card; no reset mark (D34). P67-04 A: no card for an import.
  - P69-01 C (#881): the card is numbered steps. The next step's number is filled; a done step's number turns into a check and the row stays, inert, with "Done"; the count sits on the label's line; the card leaves once every listed step is done (phase 7).
  - The seven `nulo:ui:getStarted*` and profile marks registered in the stored-shape registry, with goldens and a writer test.
  - How Aztec works opens `https://nulo.sh/how-aztec-works`, the landing's page (#722).
- **Superseded or dropped:** OA-17's O0 to O4, by P69-01. OA-21's Q1, Q2 and Q4 to Q6 were pictures only, drawn by a scratch spec that was never committed; no code of theirs exists.
- **Known limits:** #867.
- **Open items:** #936, an `owner-decision` issue: the count and the numbers while the funded banner holds the phrase step (D38).
- **Lessons:** none promoted. `lessons.md` is 97 B under its budget, and the one candidate (commit the regenerated auto-import files with a new `src/utils/` export, [lessons/phase-6.md](lessons/phase-6.md)) is reported by CI's build on the first push.
- **Seeds retired:** the `/goal` and `/loop` seeds below; they are not instructions.

# onboarding-3, arc 2: the owner's second round on #743

The addendum to [the arc 1 plan](../archive/onboarding-3/plan.md). It is a separate directory because that plan is archived. The arc's work stays on #743 (branch `worktree-onboarding-3`, a draft held for the owner's build test). Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are relative to `apps/extension/` unless they start with `implementations-plan/` or `packages/`.

## The owner's words (2026-10-19, build test of 3f9f958c)

> "…I created a new profile with password and that new password gets the whole "Get Started". […] All-in-all the very least: we should check if it has fee juice to remove hte "Get fee juice" and probably the "How Aztec Works"."
>
> "The text inside each of the rows in "get started" has a padding on the left and on the right […] I think we will probably need 4/5 screenshots / ideas to see how they look without the padding."
>
> "…research all the matrix of possibilities: first onboard imports account and then creates new one. imports account with no gas, no balance, no nothing. Has recently "resetted" their Testnet state (we should not show anything probably). First onboard, just create passkey / password: we show everything, etc."

Signed and folded in phase 1: **P50-01 = B** (#769): "Only what the new profile lacks: a second password profile shows the phrase row alone; a second passkey profile shows nothing." The owner tested 3f9f958c, which did not have this rule. At 3f9f958c the owner's first case showed the whole card. With the rule, it shows the phrase row alone.

**UI impact.** Home's Get started card only. (1) The fold: a profile created beside another shows the phrase row alone (password) or no card (passkey), signed as P50-01 B above, pictures from onboarding-4. (2) "Get Fee Juice" leaves for good the first time the profile is seen holding Fee Juice, signed as P67-02 B below; before, it came back whenever the selected account held none. (3) Nothing else changes on screen: the two quoted rules already hold, OA-19 and OA-20 keep today's form by the owner's answers, and the row layout keeps today's form until the owner picks from OA-21.

## The owner's answers (2026-10-19, decision page 67 and chat)

The owner's rule for every page: a note supersedes or adds to the option clicked.

- **Usability:** "ok, then assume #743 it's approved on usability, we just now need to pick from the get started designs."
- **P67-01 (OA-17), how the rows sit: open, then answered by P69-01 C (below).** Page note: "I don't like any tbh... "A" ends up being the best. Because the other ones don't look like tasks to go through. They become even more confusing. Can we get some more ideas in the table?" In chat: "Regarding p67-01 don't ship it -- I am asking for more options because I liked none. My notes superseed the option chosen, or they add; not saying that A should be the one." The new options are OA-21 (#881). #743 does not merge before the pick is built.
- **P67-02 (OA-18): B**, "It leaves for good the first time the profile holds Fee Juice." Phase 6 builds it.
- **P67-03 (OA-19), a note in place of a pick:** "I think it should show no card. We should "migrate" the user in the sense: if the user did not finish everything, then we should migrate the state of the user. If he already knew how to get gas, then, we don't show gas. If he has already backed-up the phrase on the previous testnet, then we don't ask for it on the new testnet. Same for how aztec works. Understand my point? Like, it's the same user, he hasn't forgotten all those things, nor has he lost his phrase just because Testnet resetted." Read: a reset changes nothing on the card; done stays done, open stays open. Every flag is per profile and the reset never touches the UI keys (F4), and P67-02 B removes the one row that read the network, so no reset mark is built (D34).
- **The scope of "done"**, in chat: "Ok, let's go with your take then." The take: the phrase row counts per profile; the learning rows (How Aztec works, Get Fee Juice, Make proofs faster) count per person, shown only on the install's first created profile (P50-01 B). An accepted gap: deleting the first profile before those rows are done hides them for good. That is today's behaviour, and nothing is built for it.
- **P67-04 (OA-20): A**, no card for imports. Nothing changes.

**Decision page 69 (2026-10-20), the owner's pick with no note:**
- **P69-01 (OA-21): C**, "Numbered steps: the next step's number is filled, a done number turns into a check and the row stays; the count sits on the label's line." It answers P67-01. Phase 7 builds it.

## Outcome & Quality Bar

For a person who opens Home after making or bringing in a profile, on a fresh install or beside other profiles, and before or after a Testnet reset. Excellent: (1) each matrix cell below has a test or an e2e step that shows its rows, not a reading of the code; (2) the two quoted rules hold and are pinned: the install's first created profile shows every row that applies, and "Get Fee Juice" is absent while the selected account holds Fee Juice; (3) every other cell where the rows would change is an owner ask, with pictures, and ships as today. Good enough: the padding ask is pictures only; the product ships today's form.

## Assumptions

**Facts** (verified at 56361a49, the merged head):
- F1 `getStartedView` (`src/utils/get-started.ts:126-137`): `imported` gives no card and no banner; `notFirst` keeps only the phrase row and its banner (`firstProfileItems`, `:111-119`); `feeJuiceShown` is `feeJuice === "none" && !hidden` (`:106`). Rule 2 holds already. A unit case pins it (`get-started.test.ts:154`), but no Home test does.
- F2 The service writes `notFirst` on a create when any row not tombstoned exists, an imported one included (`service.ts:1452-1456`). It writes `imported` on the phrase, passkey and both backup imports (`:2161`, `:2209`, `:2385`, `:2541`). Settings › Accounts › Import adds an account to the active profile and writes no flag (`popup/pages/settings/accounts/import.vue:116-125`).
- F3 Fee Juice and token funds follow `selectedBalanceScope` (profile, network, account; `stores/balances.store.ts:54-63`); the flags follow the profile (`general.vue:69`); `prestoReached` is one global config key (`wallet/config/config.ts:59`).
- F4 A Testnet reset (`wallet/services/network-reset/service.ts:518-578`) purges the old chain's accounts, tokens, FPCs, journal and transactions. Only a deletion or a row commit removes the per-profile UI keys (`profile-deletion/coordinator.ts:135`, `service.ts:1462`). After the reset Home mounts again (`popup/reset-completion.ts:38-42`).
- F5 While the takeover is up, the RouterView is absent (`popup/app.vue:573`, `popup/stale-takeover.ts:10`). On a quarantined chain the shell clears the account, so `selectedBalanceScope` is null and the view is `null` (`popup/network-switch.ts:100-107`).
- F6 The worker caches a gas read for 5 minutes under `${networkId}:${accountAddress}` (`wallet/services/execution/gas-balance-reader.ts:28,73`). A settled tx or a PrivateFPC change marks it stale, so the next read recomputes, while `peek` still serves the last value; only a profile switch evicts it (`:122-153`; `execution/service.ts:560-583`). A reset's FPC purge emits `onFpcDeleted` for each row (`fpc/service.ts:91-96`), so a purged PrivateFPC row marks the cache stale. Home's tokens-menu Refresh reads token rows only (`TokensView.vue:247-249`); Home's gas read runs when GasBalanceCard mounts or its scope changes (`GasBalanceCard.vue:104-118`).
- F7 Smoke stubs the node with HTTP 400 (`tests/e2e/fixtures/node-stub.ts`), so its gas read is degraded and reads "none". Only the network suite can hold Fee Juice: `feeJuiceReadyExtension` registers a first password profile, then bridges and claims public Fee Juice to it (`tests/e2e/fixtures/extension.ts:871-935`).
- F8 `GetStartedCard` puts `SettingItem` rows (`padding: 16px 20px`, hairline inset 20 px) in an `ItemsContainer` box (1 px border). Both are shared by 32 and 27 Settings surfaces (`src/components/ui/Settings/`). Token rows have no horizontal padding (`TokenCard.vue:125-132`).

**Inferences** (the gates check them):
- I1 The matrix finds no plain bug in the card (the phase 2 tests prove each cell). The one production change is P67-02 B (phase 6).
- I2 A Fee Juice arrival reaches the card at the first gas read that sees it: a Home mount after the cache went stale (a settled tx) or expired (5 minutes). That freshness policy belongs to the balance cache, not to the card, and Home's balance readout follows the same read.
- I3 A lock or an unlock evicts the gas cache (`profile/service.ts:290,967` → `execution/service.ts:571`), so a reset found at unlock starts clean. A reset found inside a live session, with addresses kept and a warm cache, can show the old chain's Fee Juice. It lasts until a later gas read bypasses that cache: at once when the purge marked it stale (a PrivateFPC row), otherwise past the TTL. In that window F stays hidden; the backup reminder is unaffected. Plausible, unverified, outside the card: #867, a closed `known-limit` issue. Under P67-02 B such a read writes the flag, which is what the owner asked for: the same profile did hold Fee Juice.

**Asks**: none silent. OA-17 to OA-20 in [OWNER-ASKS.md](OWNER-ASKS.md). The arc ships today's form for each.

## The matrix (phase 2 measures it)

Rows: **P** "Save your recovery phrase", **B** "Back up this wallet", **A** "How Aztec works", **F** "Get Fee Juice", **R** "Make proofs faster"; **!** the urgent banner; **∅** no card. Under P69-01 C each row is a numbered step, open or checked (**✓**, inert, "Done"); the card leaves once every step it lists is checked. The defaults are: a fresh network, an empty account, nothing done, and Presto not reached. From M6 on, a row is for the install's first created profile with the card not hidden, unless it says otherwise (a later or imported profile never shows A, F or R). Evidence marked **new** landed in this arc. Test files are under `src/` unless they start with `tests/`. Lines are at the close-out head.

| # | Case | Password | Passkey | Evidence |
|---|---|---|---|---|
| M1 | The install's first profile, created (tab or popup) | P A F R numbered 1 to 4, with the count and Hide | B A F R, the same | `utils/get-started.test.ts:125,138`; `popup/pages/general.test.ts:155,244`; `GetStartedCard.test.ts:34,44`; e2e `security-backup:58` |
| M2 | A profile created beside another | P alone: no count, no Hide | ∅ | `get-started.test.ts:205,211`; `general.test.ts:255,261`; `service.integration.test.ts:1469`; e2e `security-backup:86` |
| M3 | Imported from a phrase, a passkey or a full backup | ∅, never ! | ∅ | `get-started.test.ts:198`; `general.test.ts:228,236`; `service.integration.test.ts:1436` (each import's call site); e2e `passkey-paths:166` (both browsers), network `hero-prices-unavailable:47` |
| M4 | Imported, then a profile created (the owner's case) | P alone | ∅ | **new** `service.integration.test.ts:1489` |
| M5 | First profile after every other was deleted | as M1 | as M1 | `service.integration.test.ts:1524` |
| M6 | An account added by Settings › Accounts › Import | the profile's steps; F follows the selected account until the profile's flag is set | same | **new** `general.test.ts:201` |
| M7 | Empty account | F open | F open | `general.test.ts:155` |
| M8 | Fee Juice held, or arriving after creation | F ✓ at the read that sees it (I2), and the profile's flag is written; ! replaces P, so the steps are A F R, numbered from 1 | F ✓ | **new** `general.test.ts:148` (password), `:181` (arrival while mounted, the flag written); **new** network e2e step `fee-methods:358` (on a real node: A, F ✓, R and the stored flag) |
| M9 | Fee Juice already there at import | as M3 | as M3 | network `hero-prices-unavailable:47` |
| M10 | Fee Juice spent back to zero | F stays ✓ (P67-02 B); with no tokens, P returns open in place of ! | F stays ✓ | **new** `general.test.ts:181` (passkey); `get-started.test.ts:178` (the flag); `:125,142` (P and !) |
| M11 | Tokens only | ! replaces P; F open, also while the gas read is still out | steps unchanged | `general.test.ts:140,171`; `get-started.test.ts:171` (an unread read leaves F open) |
| M12 | A failed first Fee Juice read (a failed refresh keeps the last value) | F open | F open | `general.test.ts:133` (arc 1's D3: a failed read claims nothing) |
| M13 | Deployed or not | no input | no input | `GetStartedInput` has no such field (typecheck) |
| M14 | Another network or account selected | flags kept; F stays ✓ once Home has seen any account of the profile holding Fee Juice, else it follows the selected one | same | **new** `general.test.ts:201` |
| M15 | After a Testnet reset (takeover) | nothing changes (P67-03): ✓ stays ✓, open stays open | same | **new** e2e step `stale-network` S1a (the Fee Juice flag survives the real purge: P open, F ✓); the other flags by the purge's scope, the old chain's rows only (F4); `general.test.ts:201` (a new chain id is a new scope, holding none) |
| M16 | A quarantined chain, or the takeover up | no Home, so no card | same | **new** e2e step `stale-network` S1a (no Home scroller under the takeover) |
| M17 | Hide used | P alone (! once funded); no card once P is ✓ | ∅ | `get-started.test.ts:188,194`; `general.test.ts:308` |
| M18 | Phrase saved (tab or Settings) | P ✓ in place; ! leaves | — | `get-started.test.ts:162`; e2e `onboarding-tab:134`, `security-backup:73` |
| M19 | How Aztec works opened | A ✓ | A ✓ | `get-started.test.ts:171`; e2e `security-backup:65` |
| M20 | Presto reached (global) | R ✓ | R ✓ | `general.test.ts:319,331` |
| M21 | Full Backup saved | — | B ✓ | `get-started.test.ts:167`; `settings/security/export/full.test.ts` |
| M22 | Imported, nothing held | ∅ | ∅ | as M3 (P67-04 A) |
| M23 | Every step the card lists is ✓ | ∅; ! stays while it applies | ∅ | **new** `get-started.test.ts:215` |

**Verdict per cell.** M1 ships rule 1 (the owner: "First onboard, just create passkey / password: we show everything"). M8 ships rule 2 ("check if it has fee juice to remove hte "Get fee juice""), read under P69-01 C as F checked. M2 and M4 are P50-01 B. M10 and M14 are P67-02 B, M15 is P67-03 and M22 is P67-04 A. P69-01 C turns every "leaves" of the earlier rounds into "✓" and adds M23. Every other cell follows a signed rule. No cell is a plain bug in the card (I1); I3 is outside it.

## Architecture & Implementation

The arc changes five things: (a) a merge that brings P50-01 B into #743; (b) tests that pin the matrix; (c) pictures for the asks; (d) the PR body; (e) P67-02 B. The view rule stays the single source (`getStartedView`), so every cell's test is a one-line input to it, or one Home mount through the real storage facade.

**P67-02 B.** One more per-profile UI key, `nulo:ui:getStartedFeeJuiceHeld@<id>`, in `src/utils/profile-ui-keys.ts` beside the other Get started flags, so a profile deletion or a row commit removes it and no backup carries it. `feeJuiceShown` also needs the flag unset (since P69-01 C, the flag checks the step instead). Home writes it (`general.vue`, a watcher) when the selected account's gas read is positive and the profile's flags are read and unset: the read the row already follows, on the one screen that shows the row. Pre-production, the new key needs no migration (CLAUDE.md § Persisted-storage shape changes). The stored-shape registry of lane migration-rule-1 was not on `dev` then (b6208221); phase 7 registers the key once it is.

**P69-01 C.** `getStartedView` returns `steps: { item, done }[]` in the drawn order instead of the items still open. A step's done flag is the one that used to remove its row: `phraseSaved`, `backupSaved`, `aztecOpened`, `feeJuiceHeld` or a positive Fee Juice read, and `prestoReached`. The phrase step is listed for a password profile unless the banner takes it, and the others for the install's first created profile while the card is not hidden. Get Fee Juice is now listed while its read is out, open; before, that read left the row out. When every listed step is done the view lists none, so the card leaves. `GetStartedCard` numbers the steps, fills the first open one, puts a check in a done step's place, and makes a done row inert (no handler, so `SettingItem` renders no button), with "Done" in the chevron's place. The count "n of m done" sits beside Hide when more than one step is listed.

**Alternatives not taken.**
- *The worker writes the flag on any positive gas read.* A second writer of a UI key, in a service that knows nothing of the card; the row only shows on Home, whose read decides it.
- *A property test over every combination of the view's inputs.* It restates the rule as a second implementation and names no cell. The matrix's targeted cases name the case each one proves (D26).
- *A new e2e spec per cell.* Each cell that needs a browser gets one step in an existing spec that already reaches that state (D27).

## Security & Adversarial Considerations

- **Threat model.** No new input, message or permission. One new per-profile storage key (P67-02 B), a reminder preference like the others. The flags stay reminder preferences, never proof of a backup. A forged flag needs a writer of `chrome.storage.local`, which already holds more than the card; a forged Fee Juice flag hides only the Fee Juice row, never a backup row.
- **Wrong screen (the risk that matters).** For a created password profile whose phrase is unsaved, no flag but `phraseSaved` checks the phrase step or ends the banner (`getStartedView`, `get-started.ts`). Under P69-01 C a done step stays on screen, checked: a forged flag marks a step done where it used to remove the row, and a lost write leaves the step open. M15's step proves a Testnet reset keeps the flags. Signed behaviours, not changed here: a Settings reveal marks the phrase saved (`seed.vue:70`, arc 1); Hide removes a passkey profile's backup step (`firstProfileSteps`, P33-01 D); an unread input shows nothing until it lands (`getStartedView` returns `null`); a lost `imported` write shows the card, the safe side. The panel recommends no ask option that removes an open backup row. OA-19 D, which would remove it, is listed only because the owner said "nothing", and is marked not recommended.
- **Capture spec.** It styles through `adoptedStyleSheets` or inline custom properties (an extension page's CSP refuses an injected `<style>`), never commits, and stubs `window.open`.
- **Supply chain.** No dependency or manifest change.

## Phases

Fast gate `F`: `bun run lint && bun run typecheck:all && bun run test`, each exit 0. Smoke runs from `apps/extension` against an armed build (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:<browser>`): `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 NULO_E2E_RETRY=0 bun run test:e2e tests/e2e/<file>`, and the Firefox twin under `NULO_E2E_BROWSER=firefox`. Smoke claims its own egress ports in `~/.agents/ports.md`. Network runs from the root: `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/<file>.test.ts`. Start a build or an e2e run only while load1 < 150. A wait is a bounded loop inside one tool call. Matrix ids (M1 to M23) stay out of test names and comments.

**1. Fold onboarding-4 and `dev`.** ✓ (2026-10-19)
- `git merge origin/onboarding-4-a1` (9c0d5c25, clean; 8 signed commits; its archived plan kept), then `origin/dev` (56361a49, clean, 6 commits), then `bun install --frozen-lockfile`.
- Gate: `F` (pass; one source-walker test timed out at load 200 and passed on its rerun) and `bun run test:all` (pass).

**2. The matrix, measured.** ✓ (2026-10-19; [lessons/phase-2.md](lessons/phase-2.md))
- Change map:
  - `src/popup/pages/general.test.ts`: back the balances mock with a `reactive` map keyed by `activityScopeKey(scope)`, as the real store is (`stores/balances.store.ts:692-694`). Then a mounted Home sees an entry change. New cases:
    - (M6, M14) a second account, then a second network with another chain id: the rows follow each scope's entry, and the flags stay;
    - (M8, M10) a passkey first profile: while Home is mounted, its entry goes from zero to positive. F leaves, B, A and R stay, and no ! shows. The entry then goes back to zero, and F returns;
    - (M8, password) a positive read with the phrase unsaved: ! shows, and the rows are A and R alone.
  - `src/wallet/services/profile/service.integration.test.ts` (M4): import from a phrase, then create a password profile. Expect `notFirst` on the created profile, and `imported` alone on the imported one.
  - `tests/e2e/stale-network.test.ts` S1a (M15, M16):
    - After `createAccount("Savings")` (which leaves the page on Accounts), go to Home, `waitForHomeReminders`, press `get-started-hide`, and wait for the rows to be P alone. Then lock.
    - Under the takeover, expect no Home scroller (so no card).
    - After the reset toast, `waitForHomeReminders`. Expect the rows to be exactly `["get-started-phrase"]`.
    - Failure mode: the reset purge touches per-profile UI keys. Only the real purge over real storage shows this. Estimated +2 s.
  - `tests/e2e/network/fee-methods.test.ts` "public gas only…" (rule 2 on a real node), in its second block:
    - After the Home hash, `waitForHomeReminders`.
    - Expect the rows to be exactly `["get-started-aztec", "get-started-presto"]`. Exclude `get-started-hide` from the row selector.
    - The block's mount reads gas after the first block's settled send marked the cache stale. The fixture's minted tokens raise the banner, so the step does not assert it.
    - Failure mode: a claimed Fee Juice on a real node reaches the card through the worker's read and Home's store. Smoke has no node (F7). Estimated +1 s.
- Red proofs, each restored after:
  - invert `feeJuiceShown` to `!== "none"`: the new Home cases fail;
  - make the service's "another profile" check skip imported rows: the new M4 case fails.
- Gate: `F`. Smoke `stale-network` on Chrome and Firefox. Network `fee-methods` on Chrome (CI runs its Firefox twin). Pass: all green at retry 0.

**3. The rules per cell.** ✓ (2026-10-19; #867 filed and closed)
- D25 records the verdicts above.
- Add OA-18 to OA-20 to `OWNER-ASKS.md`, each with the cases, the options and the panel's recommendation. "What ships now" is today's rows.
- File I3 as a closed `known-limit` issue (dedupe first).
- Gate: the pictures exist (phase 4), and `bun run check:plans` passes after staging.

**4. Pictures: the row padding (OA-17) and the matrix asks.** ✓ (2026-10-19; 30 PNGs in `screenshots/`)
- Write one capture spec, `tests/e2e/zz-capture-arc2.test.ts`. Run it once on the Chrome armed build. Delete it by its exact path, so it never reaches a commit.
  - It uses `listedExtension`: the first password profile, with the card P A F R. Smoke holds no token, so Holdings shows its empty box.
  - It styles each option through a constructed stylesheet, scoped under `[data-testid="get-started"]`. A row's hairline is an `::after`, which `element.style` cannot reach. The card's box has no testid, so the sheet reaches it by structure under the card's testid. That breaks the e2e selector rule only in a spec that is never committed.
  - At 360×600 the card fills the space under the pinned balance, so each padding option has two frames: the top, and the content scrolled 150 px (the card's end and Holdings). It sets the `theme` attribute for light and dark and waits with `settleThemeTransitions`.
- Write the PNGs to `implementations-plan/onboarding-3-arc2/screenshots/`. Each caption reads "mockup", except O0 and the "today" pictures.
- Padding options (D30):
  - O0: today, the bordered box with the text 21 px inside it.
  - O1: no box; hairlines between the rows across the content width; the text on the page's edges.
  - O2: a full-width band; lines above and below it from popup edge to popup edge; the rows padded 24 px, so the text sits on the page's edges.
  - O3: O2 tinted (`--nulo-surface-low`), with no lines.
  - O4: the Holdings rhythm: no box and no hairlines; rows `8px 0`, as `TokenCard` rows are.
- Matrix pictures (D31):
  - OA-18: today (F back) and B (F gone).
  - OA-19: C (the backup row alone). A and B are OA-18's pictures.
  - OA-20: A (no card) and B (F alone).
- Gate: 20 padding PNGs and 10 matrix PNGs (OA-19 A and B reuse OA-18's), light and dark, each 360×600. `git status` shows no capture spec.

**5. Timing and delivery.** Local gates ✓ (2026-10-19; [lessons/phase-5.md](lessons/phase-5.md)); push and CI below.
- Measure `security-backup` on Chrome and on Firefox at retry 0, each with load1 < 150 (D32):
  - before: 3f9f958c, built in a temporary detached worktree under the cache directory and removed afterwards;
  - after: the final head.
- Record the measured duration of the two files that phase 2 extends (`stale-network` S1a on both browsers, `fee-methods` on Chrome), before (3f9f958c's build, or its CI log for the network file) and after.
- For the whole suite, take each browser's CI shard durations at 3f9f958c and at the new head. The PR body already uses that source.
- The PR body:
  - add `Closes #769`;
  - quote P50-01 B;
  - add onboarding-4's pictures (`implementations-plan/archive/onboarding-4/screenshots/`);
  - add the matrix summary, the asks with their pictures, the timings and a Validation entry.
- Gate: `F`, `bun run test:all`, `bun run check:plans`. Then the full smoke suite on Chrome and on Firefox, because a smoke spec changed and the base moved. Then the Codex fix loop (below). Then push, and run `gh pr checks 743 --watch` once. Pass: the five required checks are green.

**6. Round 2: the owner's answers (P67).**
- OA-21 first (#881): six layouts drawn in the live popup by a scratch capture spec (deleted after each run; never committed), 36 PNGs `screenshots/oa21-*`, the ask in `OWNER-ASKS.md` (D35). ✓ (52651804)
- P67-02 B, change map:
  - `src/utils/profile-ui-keys.ts`: the key and its builder.
  - `src/utils/get-started.ts`: the flag in `GetStartedFlag` and `KEYS`; `feeJuiceShown` needs it unset.
  - `src/composables/useGetStarted.ts`: the flag in `NOTHING_DONE`.
  - `src/popup/pages/general.vue`: the watcher that writes it.
- Tests:
  - `get-started.test.ts`: the key list, the read, and a case where the flag keeps F away on an empty read for both types.
  - `general.test.ts` (M10, M14, M15): an arrival writes the flag once and a spend back to zero keeps F away; after one account held it, another account and a new chain id holding none show no F, and P stays.
  - `stale-network` S1a (M15, P67-03): the Fee Juice flag stored before the lock; after the reset the rows are P, A and R. Smoke has no node, so the flag Home writes on a positive read is stored directly (D36).
  - `fee-methods` "public gas only…": the stored flag is `true` once Home has seen the claimed Fee Juice.
- Red proofs, each restored after: leaving the flag out of `feeJuiceShown` fails the pure case and both Home cases; dropping the watcher's write fails both Home cases.
- Pictures: the built cell, a first password profile once it has held Fee Juice and holds none (`p67-02-fee-juice-held-*`, a scratch capture on the armed Chrome build, deleted after its run). M10, M14 and M15 all draw it.
- Gate: `F`; smoke `stale-network` and `security-backup` on Chrome and Firefox; network `fee-methods` on Chrome; the fix loop; push; the five required checks.

**7. Round 3: P69-01 C, numbered steps (#881).** Local gates ✓ (2026-10-20; [lessons/phase-7.md](lessons/phase-7.md)); Firefox `fee-methods` is CI's call.
- Merge `origin/dev` (no rebase). `profile-ui-keys.ts` takes dev's exported roots plus this arc's seven; the stored-shape registry (migration-rule-1, now on `dev`) gets the seven keys as `true`-only flags, their goldens, a regenerated snapshot and a writer test.
- Change map:
  - `src/utils/get-started.ts`: `steps` in place of `items`; `firstProfileSteps`; the card leaves once every listed step is done (D37, D38).
  - `src/popup/components/modules/general/GetStartedCard.vue`: the numbers, the check, the inert done row, the count, the list roles (D39, D40).
  - `src/popup/pages/general.vue`: passes `steps`.
- Tests: the pure view (every "leaves" case now reads "done", plus Hide over done steps and M23); the card on the real `SettingItem` (the order, the numbers, the next step, a done step's check, "Done" and missing action, the count's role, Hide); Home's cells; the e2e steps in `security-backup`, `onboarding-tab`, `stale-network` S1a and `fee-methods`, which read `data-done` on the row's testid and the count's testid (D41).
- Red proofs, each restored after: an always-on click handler, the next step taken as the first, and the count shown for one step each fail the card's tests; dropping the Fee Juice flag from the done test fails two pure and two Home cases.
- Pictures: the built card on the armed Chrome build (`q3-*`): a first password profile with nothing done (and scrolled), two done, the Fee Juice flag set, the phrase step alone, and a first passkey profile. A scratch spec drew them and was deleted after its run.
- Gate: `bun run audit:vue`; the full smoke suite on Chrome and Firefox; network `fee-methods` on Chrome and Firefox; the fix loop; push; the five required checks.
- Results, retry 0:
  - Smoke, the full suite: Chrome 266 passed, 16 skipped, none failed (2,089 s); Firefox the same counts (2,891 s).
  - Network `fee-methods`: Chrome 8/8. Firefox 7/8 twice, and the base `ab74f44b` failed the same way: the shield's 60 s toast wait in "public gas only…", a step before the card. This host ran the sends about 2.5 times slower than CI ([lessons/phase-7.md](lessons/phase-7.md)).
  - The fix loop converged at round 2 (below).

## Decision ledger

| # | Decision | Chosen | Rejected |
|---|---|---|---|
| D25 | Rows per cell | the matrix verdicts above; only the two quoted rules and P50-01 B decide rows | changing a hedged cell without the owner (the brief) |
| D26 | Matrix evidence | one targeted case per cell, through the real view rule or one Home mount | a property test over every input (a second copy of the rule) |
| D27 | Browser evidence | steps in specs that already reach the state: `stale-network` S1a and `fee-methods` | new specs (each pays a launch and a registration); a phrase-import step in `import-paths` (Opus: no failure mode `passkey-paths` and the service test do not already prove; Codex wanted it; the worker-to-Home path is the same for every import) |
| D28 | Plan directory | `onboarding-3-arc2/` | reopening `archive/onboarding-3/` (an archived plan is evidence; `git mv` back would break the links that cite it) |
| D29 | Outline | A (ask the hedged cells) | B (both legs: it decides hedged cells, adds a flag Home writes on a read path and a UI-key write from the reset service, and its reset step drops the passkey backup row) |
| D30 | Padding options | O1 to O4 above (Opus); recommend O1 (both legs) | moving the box 21 px out (leaves it 3 px from the popup's edge, which no screen has); a leading ring (a checkbox that never checks, since rows leave when done); a flat 12/16 px inset (Codex; keeps the inset the owner asked about) |
| D31 | Recommendations | OA-18 A, OA-19 A, OA-20 A (both legs, moderate) | OA-18 B (per profile while Fee Juice is per account and network; adds stored state); OA-19 D (removes an open backup reminder) |
| D32 | Timing | the brief's file, before and after per browser; the suite from CI shard durations | the full local suite at both commits per browser (Opus; about 2.5 h at this host's load, and noisier than CI's runners) |
| D33 | P67-02 B's writer | Home, on the read the row follows | the worker on any gas read (a second writer of a UI key, in a service that knows nothing of the card) |
| D34 | P67-03 | no reset mark: the flags are per profile and survive the purge (F4), and B removes the one row that read the network | a reset mark (OA-19 C and D, both declined by the owner's note) |
| D35 | OA-21 options | Q1 to Q6 (`OWNER-ASKS.md`); recommend Q3, numbered steps that turn into checks | a ring per row whose row then leaves (it never gets its check); invented copy (each drawing uses only today's titles and values, plus the counts and "Next") |
| D36 | S1a's reset step | the Fee Juice flag stored before the lock; the rows after the reset are P, A and R (since P69-01 C: P, A, F ✓ and R) | Hide before the lock (it hides F itself, so it cannot show the flag at work); a gas stub in smoke (a node fixture for one flag) |
| D37 | Q3's model | the view lists each step with its done flag, in the drawn order; no card once every listed step is done | a progress record of its own (a second source for what the flags already say) |
| D38 | The banner and the phrase step (**not signed**: OA-21 told the owner the count covers the four steps the profile started with; owner-decision #936) | the signed rule holds: a funded password wallet with its phrase unsaved gets the banner, and the phrase step leaves the list, so the steps read A F R, numbered from 1, "n of 3 done"; saving the phrase then brings P back as step 1, checked, and the count to "of 4" | keeping P listed beside the banner (the phrase asked for twice, and a signed cell changed) |
| D39 | Accessibility (the owner's delegation) | the steps are a list, so assistive tech hears each step's position and the total; the number and the check are `aria-hidden`; a done step says "Done" in words; the next step is `aria-current="step"`; the count is a polite `role="status"`, announced when it changes while Home is open | `aria-label` on the number box (a name on a generic element, which screen readers do not read reliably); a count announced on every mount |
| D40 | The card's script | plain `<script setup>`, as most of the extension's SFCs: with `lang="ts"`, vue-tsc types the JS `SettingItem`'s slots as `{}` | typing `SettingItem`'s slots (a shared row changed for one consumer) |
| D41 | E2E reads of a done step | `data-done` on the row's testid, and the count's own testid | text or role selectors (CLAUDE.md § testid preservation rule) |

## Audit verdicts

**Dual audit** (2026-10-19). Codex gpt-6.1-sol high, read-only, session `01a154e8`: approve with changes. Opus 5.5 Plan leg: approve with changes. Both reject outline B and recommend A on OA-18 to OA-20 and O1 on OA-17.

| Finding | Leg | Disposition |
|---|---|---|
| F6 says the tokens-menu Refresh forces a gas read; it reads token rows only | both, demonstrated | fixed: F6 rewritten; the `fee-methods` step relies on the mount after a settled send |
| The `fee-methods` step: the first block's read means F never renders, so "wait to leave" proves nothing; `get-started-hide` matches the row selector; the banner comes from tokens | Opus, demonstrated | fixed: `waitForHomeReminders`, then the exact rows with Hide excluded; no banner claim; relabelled "rule 2 on a real node" |
| The balances mock is a plain variable, so a mounted Home never sees a change | both, demonstrated | fixed: a `reactive` map keyed by scope |
| M15's step (Hide first) cannot show F returning | both, demonstrated | fixed: the step proves the flags survive; F after a reset rests on the scope case |
| A reset can serve the old chain's Fee Juice | Opus (no hook), Codex (the FPC purge invalidates) | the purge does mark it stale (`fpc/service.ts:91-96`, `execution/service.ts:579-583`), but `peek` still serves the old value until the first read lands: I3, a closed known limit |
| Security says no option removes the backup row; Hide removes a passkey's, and OA-19 C ("as Hide does") and D contradict it | both, demonstrated | fixed: Security restated; OA-19 C reworded as its own rule; D marked not recommended |
| Reveal clears the reminder; a lost `imported` write shows the card; unread inputs show nothing | Codex | stated under Security as signed behaviour; no change |
| M10 (P returns when no tokens), M12 (first read only), the M6+ prerequisites | both | fixed in the matrix |
| The `import-paths` step is redundant | Opus vs Codex | dropped (D27) |
| Timing: the suite, not only the file | Opus | the suite from CI (D32) |
| No `UI impact` line; Post-implementation cites a non-trunk commit and a diff git cannot compute; matrix ids in test names | Opus | fixed |
| The capture spec cannot reach `::after` with `element.style`, and the box has no testid | Opus | fixed: a constructed stylesheet under the card's testid; the never-committed exception stated |
| Padding: O2/O3 leave a 3 px gap; O4's ring | Opus; Codex (a 12/16 px variant) | O2/O3 become full-width bands, O4 becomes the Holdings rhythm (D30) |

**Final fresh Codex pass** (2026-10-19, gpt-6.1-sol high, read-only, session `01a154fa`): approve with changes. D27, D30 and D32 stand. It found the `fee-methods` step deterministic: its fixture is the file's only consumer, nothing runs the Presto check, and `prestoReached` is global.

| Finding | Disposition |
|---|---|
| S1a's `createAccount` leaves the page on Accounts, so the Hide press needs Home first | fixed in phase 2's change map |
| I3's "up to 5 minutes": a TTL changes only what a later read returns; a warm peek is not dimmed | I3 reworded; the lock/unlock eviction narrows it to a reset found inside a live session |
| M4 "already covered at `service.integration.test.ts:1466`" | not taken: that test is this arc's new case, already in the tree the pass read |
| The edited files' runtimes are not measured | fixed in phase 5 |

**Fix loop, round 1** (2026-10-19, Codex gpt-6.1-sol high, session `01a15527`, over `56361a49..HEAD`; one Opus 5.5 diff review beside it). Codex: one Low. Opus: seven Lows, no bug.

| Finding | Leg | Disposition |
|---|---|---|
| `getStartedRows` leaves Hide out, so the later profile's no-Hide check was lost | both | fixed: `security-backup` asserts `get-started-hide` absent |
| No card under the takeover cannot fail: on a quarantined chain the view is null even if Home mounted | Opus | fixed: assert Home's scroller absent |
| Matrix citations stale; M10's password half uncited | Opus | fixed |
| The mock's own key differs from the store's | Opus | fixed: `activityScopeKey` |
| Comments: S1a header, the mock, the `fee-methods` step | both | fixed |

**Fix loop, round 2** (resumed session `01a15527`, verify only): "Clean — high confidence from static inspection." The loop converged at round 2.

**Round 2 fix loop, round 1** (2026-10-19, over `55a1304d..HEAD`: Codex gpt-6.1-sol high, session `01a15638`; an Opus 5.5 diff review beside it). Codex: "Clean — moderate confidence from static inspection." Opus: one High, the rest Low.

| Finding | Leg | Disposition |
|---|---|---|
| The regenerated `src/types/auto-imports.d.ts` and `.eslintrc-auto-import.json` (the new key builder) were not committed; CI's build diffs `src/types/` and would fail | Opus, demonstrated | fixed: committed |
| Nothing pins "no write while the gas read is unread" (`!== "none"` would end the row on every first mount), and `toHaveBeenCalledTimes(1)` could not catch a missing guard | Opus | fixed: the arrival case mounts on an unread read, asserts no write, and reads Fee Juice twice; each mutation now fails it |
| Comments: the view's comment repeats Home's and says "any read"; `immediate` does nothing (the flags are always unread at setup); the `fee-methods` comment claims what the step does not test | Opus | fixed |
| M14's "any account held" (only what Home saw counts); M15's evidence for the other flags | Opus | fixed in the matrix |
| A stale peek from before a reset writes the flag (I3); dust Fee Juice ends the row | both | accepted: the owner's "same user" reading; before this change dust already hid the row while held |

**Round 2 fix loop, round 2** (resumed session `01a15638`, verify only): "Clean — high confidence from static inspection." The loop converged at round 2.

**Round 3 fix loop, round 1** (Codex gpt-6.1-sol high, session `01a158e5`; an Opus 5.5 diff review beside it):

| Finding | Source | Disposition |
|---|---|---|
| While the funded banner holds the phrase step, the count reads "of 3" and the steps renumber; OA-21 told the owner the count covers the four steps the profile started with | Opus, demonstrated | not changed: the owner's call, filed as #936; D38 marked not signed |
| An unread Fee Juice read now lists F open, where the row used to be absent; plan text said the listed steps were unchanged | Opus, demonstrated | kept (the step is listed for the profile; not known to be held is open); the plan, M11 and the PR body say so |
| The order test used the canonical order, and nothing asserted the struck title; nothing pinned a step turning done while shown | both | fixed: a shuffled order, the done class asserted, a `setProps` case; the first two red-proven |
| Stale comments (`general.vue`'s watcher, `firstProfileSteps`) and a test comment restating its line | both | fixed |
| Plan text: the registry "absent", D36's P A R, M1's unpinned "0 of 4", "M1 to M22" | both | fixed |
| The chevron's unnamed `role="img"` svg | Codex | not taken: inherited by every `SettingItem` row in Settings, and the card adds none |

## Delivery

No new PR. The arc pushes to `worktree-onboarding-3` with plain pushes and never forces. #743 stays a draft and never merges before the owner's next build test. Its title stays as it is (81 characters). Its body closes #769, #881 and #722. The three sibling branches built on 3f9f958c (`structure-2-a3`, `test-infra-1-a4`, `onboarding-4-a1`) are never pushed to.

## Post-implementation

[`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard), at `dev` f214e5cb, with these values:
- Step 1 is absent (`code_review: off`).
- Step 2 is one loop over `git diff 56361a49..HEAD`, the arc's own commits after the two merges (their PRs reviewed the folded code). It runs `run-codex.sh` with gpt-6.1-sol at high, read-only. One Opus diff review runs beside round 1. Stop at three rounds.
- Step 3 is the push and the watch above.
- Step 4 (close-out) ships in #743's final commits, after P69-01 C is built.
- Round 2 runs the same loop over this round's own commits (after 55a1304d). Round 3 runs it over `git diff ab74f44b..HEAD` plus the merge's own resolutions.

## Seeds

- `/goal`: "Arc 2 of onboarding-3 is done when #743 carries P50-01 B and P67-02 B, the matrix tests and e2e steps pass at retry 0, OWNER-ASKS.md holds OA-17 to OA-21 with pictures, the five required checks are green, and #743 is still a draft until the OA-21 pick is built."
- `/loop`: "Read implementations-plan/onboarding-3-arc2/STATUS.md; run the next phase's gate as plan.md writes it; record the outcome; stop at a red gate after three tries."
