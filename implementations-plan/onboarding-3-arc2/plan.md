---
plan: onboarding-3-arc2
tier: mid
status: approved by the panel (2026-10-19); implementing
issues: "#769 (folded from onboarding-4; this arc's PR is #743)"
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

# onboarding-3, arc 2: the owner's second round on #743

The addendum to [the arc 1 plan](../archive/onboarding-3/plan.md). It is a separate directory because that plan is archived. The arc's work stays on #743 (branch `worktree-onboarding-3`, a draft held for the owner's build test). Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are relative to `apps/extension/` unless they start with `implementations-plan/` or `packages/`.

## The owner's words (2026-10-19, build test of 3f9f958c)

> "…I created a new profile with password and that new password gets the whole "Get Started". […] All-in-all the very least: we should check if it has fee juice to remove hte "Get fee juice" and probably the "How Aztec Works"."
>
> "The text inside each of the rows in "get started" has a padding on the left and on the right […] I think we will probably need 4/5 screenshots / ideas to see how they look without the padding."
>
> "…research all the matrix of possibilities: first onboard imports account and then creates new one. imports account with no gas, no balance, no nothing. Has recently "resetted" their Testnet state (we should not show anything probably). First onboard, just create passkey / password: we show everything, etc."

Signed and folded in phase 1: **P50-01 = B** (#769): "Only what the new profile lacks: a second password profile shows the phrase row alone; a second passkey profile shows nothing." The owner tested 3f9f958c, which did not have this rule. At 3f9f958c the owner's first case showed the whole card. With the rule, it shows the phrase row alone.

**UI impact.** Home's Get started card only. (1) The fold: a profile created beside another shows the phrase row alone (password) or no card (passkey), signed as P50-01 B above, pictures from onboarding-4. (2) Nothing else changes on screen: the two quoted rules already hold, and OA-17 to OA-20 ship today's form until the owner answers.

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
- I1 No production rule changes in this arc: the matrix finds no plain bug in the card (the phase 2 tests prove each cell).
- I2 A Fee Juice arrival reaches the card at the first gas read that sees it: a Home mount after the cache went stale (a settled tx) or expired (5 minutes). That freshness policy belongs to the balance cache, not to the card, and Home's balance readout follows the same read.
- I3 A lock or an unlock evicts the gas cache (`profile/service.ts:290,967` → `execution/service.ts:571`), so a reset found at unlock starts clean. A reset found inside a live session, with addresses kept and a warm cache, can show the old chain's Fee Juice. It lasts until a later gas read bypasses that cache: at once when the purge marked it stale (a PrivateFPC row), otherwise past the TTL. In that window F stays hidden; the backup reminder is unaffected. Plausible, unverified, outside the card: #867, a closed `known-limit` issue.

**Asks**: none silent. OA-17 to OA-20 in [OWNER-ASKS.md](OWNER-ASKS.md). The arc ships today's form for each.

## The matrix (phase 2 measures it)

Rows: **P** "Save your recovery phrase", **B** "Back up this wallet", **A** "How Aztec works", **F** "Get Fee Juice", **R** "Make proofs faster"; **!** the urgent banner; **∅** no card. The defaults are: a fresh network, an empty account, nothing done, and Presto not reached. From M6 on, a row is for the install's first created profile with the card not hidden, unless it says otherwise (a later or imported profile never shows A, F or R). Evidence marked **new** lands in this arc. Test files are under `src/` unless they start with `tests/`.

| # | Case | Password | Passkey | Evidence |
|---|---|---|---|---|
| M1 | The install's first profile, created (tab or popup) | P A F R, Hide | B A F R, Hide | `utils/get-started.test.ts:110,114`; `popup/pages/general.test.ts:180`; e2e `security-backup:55`, `onboarding-tab:133` |
| M2 | A profile created beside another | P alone | ∅ | `get-started.test.ts:175,180`; `general.test.ts:191,197`; `service.integration.test.ts:1452`; e2e `security-backup:83` |
| M3 | Imported from a phrase, a passkey or a full backup | ∅, never ! | ∅ | `get-started.test.ts:168`; `general.test.ts:164,172`; `service.integration.test.ts:1432` (each import's call site); e2e `passkey-paths:165` (both browsers), network `hero-prices-unavailable:46` |
| M4 | Imported, then a profile created (the owner's case) | P alone | ∅ | **new** `service.integration.test.ts`: a create beside an imported profile is `notFirst` |
| M5 | First profile after every other was deleted | as M1 | as M1 | `service.integration.test.ts:1484` |
| M6 | An account added by Settings › Accounts › Import | the profile's rows; F follows the selected account | same | **new** `general.test.ts`: F follows the selected scope |
| M7 | Empty account | F shows | F shows | `general.test.ts:135` |
| M8 | Fee Juice held, or arriving after creation | F leaves at the read that sees it (I2); ! replaces P | F leaves | **new** `general.test.ts` (arrival while mounted); **new** network e2e step `fee-methods` (rule 2 on a real node) |
| M9 | Fee Juice already there at import | as M3 | as M3 | network `hero-prices-unavailable:46` |
| M10 | Fee Juice spent back to zero | F returns; with no tokens, P returns in place of ! | F returns | **new** `general.test.ts` (M8's case, reversed) → **OA-18** |
| M11 | Tokens only | ! replaces P; F shows | rows unchanged | `general.test.ts:121,152` |
| M12 | A failed first Fee Juice read (a failed refresh keeps the last value) | F shows | F shows | `general.test.ts:113` (arc 1's D3: a failed read claims nothing) |
| M13 | Deployed or not | no input | no input | `GetStartedInput` has no such field (typecheck) |
| M14 | Another network or account selected | flags kept; F follows it | same | **new** `general.test.ts` (as M6) → **OA-18** |
| M15 | After a Testnet reset (takeover) | flags kept; F follows the new chain, which holds none (I3) | same | flags: **new** e2e step `stale-network` S1a (Hide survives); F: the M14 case (a new chain id is a new scope) → **OA-19** |
| M16 | A quarantined chain, or the takeover up | no Home, so no card | same | **new** e2e step `stale-network` S1a (no card under the takeover) |
| M17 | Hide used | P alone (! once funded) | ∅ | `get-started.test.ts:159,164`; `general.test.ts:244` |
| M18 | Phrase saved (tab or Settings) | P and ! leave | — | `get-started.test.ts:140`; e2e `onboarding-tab:113,133`, `security-backup:75` |
| M19 | How Aztec works opened | A leaves | A leaves | `get-started.test.ts:152`; e2e `security-backup:65` |
| M20 | Presto reached (global) | R leaves | R leaves | `general.test.ts:267` |
| M21 | Full Backup saved | — | B leaves | `get-started.test.ts:148`; `settings/security/export/full.test.ts` |
| M22 | Imported, nothing held | ∅ | ∅ | as M3 → **OA-20** |

**Verdict per cell.** M1 ships rule 1 (the owner: "First onboard, just create passkey / password: we show everything"). M8 ships rule 2 ("check if it has fee juice to remove hte "Get fee juice""). M2 and M4 are P50-01 B. M10, M14, M15 and M22 are asks (OA-18 to OA-20): the owner hedged on the reset and on an empty import, and the other two share the reset's mechanism. They ship as today. Every other cell follows a signed rule. No cell is a plain bug in the card (I1); I3 is outside it.

## Architecture & Implementation

No production rule or component changes. The arc changes four things: (a) a merge that brings P50-01 B into #743; (b) tests that pin the matrix; (c) pictures for the asks; (d) the PR body. The view rule stays the single source (`getStartedView`), so every cell's test is a one-line input to it, or one Home mount through the real storage facade.

**Alternatives not taken.**
- *Ship a "Fee Juice once held" latch now* (a per-profile `feeJuiceSeen` flag that Home writes). The owner hedged on those cells, and it adds persisted state, so the decision is the owner's (OA-18).
- *A property test over every combination of the view's inputs.* It restates the rule as a second implementation and names no cell. The matrix's targeted cases name the case each one proves (D26).
- *A new e2e spec per cell.* Each cell that needs a browser gets one step in an existing spec that already reaches that state (D27).

## Security & Adversarial Considerations

- **Threat model.** No new input, storage key, message or permission. The flags stay reminder preferences, never proof of a backup. A forged flag needs a writer of `chrome.storage.local`, which already holds more than the card.
- **Wrong screen (the risk that matters).** For a created password profile whose phrase is unsaved, no flag but `phraseSaved` removes both the phrase row and the banner (`get-started.ts:103,132-135`). M15's step proves a Testnet reset keeps the flags. Signed behaviours, not changed here: a Settings reveal clears the reminder (`seed.vue:70`, arc 1); Hide removes a passkey profile's backup row (`get-started.ts:104`, P33-01 D); an unread input shows nothing until it lands (`:128`); a lost `imported` write shows the card, the safe side. The panel recommends no ask option that removes an open backup row. OA-19 D, which would remove it, is listed only because the owner said "nothing", and is marked not recommended.
- **Capture spec.** It styles through `adoptedStyleSheets` or inline custom properties (an extension page's CSP refuses an injected `<style>`), never commits, and stubs `window.open`.
- **Supply chain.** No dependency or manifest change.

## Phases

Fast gate `F`: `bun run lint && bun run typecheck:all && bun run test`, each exit 0. Smoke runs from `apps/extension` against an armed build (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:<browser>`): `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 NULO_E2E_RETRY=0 bun run test:e2e tests/e2e/<file>`, and the Firefox twin under `NULO_E2E_BROWSER=firefox`. Smoke claims its own egress ports in `~/.agents/ports.md`. Network runs from the root: `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/<file>.test.ts`. Start a build or an e2e run only while load1 < 150. A wait is a bounded loop inside one tool call. Matrix ids (M1 to M22) stay out of test names and comments.

**1. Fold onboarding-4 and `dev`.** ✓ (2026-10-19)
- `git merge origin/onboarding-4-a1` (9c0d5c25, clean; 8 signed commits; its archived plan kept), then `origin/dev` (56361a49, clean, 6 commits), then `bun install --frozen-lockfile`.
- Gate: `F` (pass; one source-walker test timed out at load 200 and passed on its rerun) and `bun run test:all` (pass).

**2. The matrix, measured.**
- Change map:
  - `src/popup/pages/general.test.ts`: back the balances mock with a `reactive` map keyed by `activityScopeKey(scope)`, as the real store is (`stores/balances.store.ts:692-694`). Then a mounted Home sees an entry change. New cases:
    - (M6, M14) a second account, then a second network with another chain id: the rows follow each scope's entry, and the flags stay;
    - (M8, M10) a passkey first profile: while Home is mounted, its entry goes from zero to positive. F leaves, B, A and R stay, and no ! shows. The entry then goes back to zero, and F returns;
    - (M8, password) a positive read with the phrase unsaved: ! shows, and the rows are A and R alone.
  - `src/wallet/services/profile/service.integration.test.ts` (M4): import from a phrase, then create a password profile. Expect `notFirst` on the created profile, and `imported` alone on the imported one.
  - `tests/e2e/stale-network.test.ts` S1a (M15, M16):
    - After `createAccount("Savings")` (which leaves the page on Accounts), go to Home, `waitForHomeReminders`, press `get-started-hide`, and wait for the rows to be P alone. Then lock.
    - Under the takeover, expect no `get-started`.
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

**5. Timing and delivery.**
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

## Delivery

No new PR. The arc pushes to `worktree-onboarding-3` with plain pushes and never forces. #743 stays a draft and never merges before the owner's next build test. Its title stays as it is (81 characters). Its body gains `Closes #769`. The three sibling branches built on 3f9f958c (`structure-2-a3`, `test-infra-1-a4`, `onboarding-4-a1`) are never pushed to.

## Post-implementation

[`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard), at `dev` f214e5cb, with these values:
- Step 1 is absent (`code_review: off`).
- Step 2 is one loop over `git diff 56361a49..HEAD`, the arc's own commits after the two merges (their PRs reviewed the folded code). It runs `run-codex.sh` with gpt-6.1-sol at high, read-only. One Opus diff review runs beside round 1. Stop at three rounds.
- Step 3 is the push and the watch above.
- Step 4 (close-out) waits for the owner's answers to OA-17 to OA-20. An ask still open at close-out becomes an `owner-decision` issue.

## Seeds

- `/goal`: "Arc 2 of onboarding-3 is done when #743 carries P50-01 B, the matrix tests and e2e steps pass at retry 0, OWNER-ASKS.md holds OA-17 to OA-20 with pictures, the five required checks are green, and #743 is still a draft."
- `/loop`: "Read implementations-plan/onboarding-3-arc2/STATUS.md; run the next phase's gate as plan.md writes it; record the outcome; stop at a red gate after three tries."
