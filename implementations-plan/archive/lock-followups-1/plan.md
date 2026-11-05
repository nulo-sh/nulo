---
plan: lock-followups-1
tier: light (Codex audit at high plus the Opus Plan leg, then a fresh final Codex pass)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 210d02f1f
trunk: dev
issues: "#1281 (arc 1; its first ordering is the closed known limit #1315), #1282 (arc 2)"
post_implementation_hardening: not scheduled
---

# lock-followups-1: two lock-screen follow-ups

Arc 1 makes a lock screen keep its selection when a settle's stale pointer read crosses a newer write naming that selection (#1281, second ordering). The first ordering is a closed known limit, #1315 (D1). Arc 2 makes Settings' Disable auto-close hand keyboard focus to Close, as the onboarding phrase step already does (#1282). Both fixes stay inside the behaviour `lock-ux-1` and `lock-window-1` approved; neither changes what a screen shows. Evidence: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none).

## Outcome

- **Date:** 2026-10-28. Planned and both arcs implemented in one session; arc 2 started from `dev` after arc 1 merged, so it is a plain PR, not a stack.
- **Status:** completed. Arc 1 merged as #1320 (closes #1281). Arc 2 and this close-out ship as one PR into `dev`; its merge closes #1282 and archives this plan.
- **Shipped:** #1320, a settle gives way when the last pointer event heard during its reads names a selection its list still holds (`auth.vue`); arc 2 (`0381a3c77`), Disable auto-close on the Settings phrase screen hands focus to Close, which refuses the repeat of that Enter (`SecretCountdownClose.vue`).
- **Dropped or rejected:** #1281's first ordering, as known limit #1315 (D1): the issue's object comparison mistakes an activation's same-id write for a pick, and the exact signal is a cross-module mechanism for one page. The write-count signal of audit round 2 (D1). No `lessons.md` line: it holds 8191 of 8192 bytes and none of its entries is superseded; the candidate stays in [lessons/phase-0.md](lessons/phase-0.md).
- **Known limits:** #1315.
- **Open items:** none.
- **Seeds retired:** the `/goal` and `/loop` below are a record, not an instruction.

## Findings (paths at 210d02f1f)

- **F1, #1281 ordering 1, demonstrated (code trace); known limit #1315.** A selected; another window picks B and `followPick("pB")` awaits its list (`apps/extension/src/popup/pages/auth.vue:281-285`); the person re-picks A here (`SelectProfilePopup.vue:60`, the chooser's own object), whose pointer event is not heard yet; B's list returns, `selectedHere` compares ids (`auth.vue:286`), and B is selected. The person's own event then restores A. The screens disagree only if that restoring lookup rejects or the person's write fails.
- **F2, #1281 ordering 2, demonstrated (code trace).** A selected, locked; a settle starts (mount, the deletion of the selection, or the replay after a held pick) and its pointer read answers B (`auth.vue:251-253`). Another window writes A: `followPick("pA")` returns at once, as A is selected (`auth.vue:284`). The settle's list returns, the selection is unchanged (`auth.vue:255`), and it selects B (`auth.vue:257-258`). Invariant broken: a settle does not replace a selection that the newest pointer write names. Consequence: this window shows B; every other shows A, with no later event to correct it.
- **F3, #1282, demonstrated (code trace).** On Settings › Recovery phrase after the reveal, a keyboard press of Disable auto-close emits `disableAutoClose`; `seed.vue` sets `isAutoCloseDisabled` and the link's `v-if` removes the focused button (`apps/extension/src/components/composite/SecretCountdownClose.vue:42`), so focus falls to `<body>` (the next Tab then starts outside the footer; not measured here). The onboarding twin hands focus to its surviving exit and refuses a repeat Enter there (`OnboardingPhraseStep.vue:37-41,105`). Consequence: a keyboard user loses their place; nothing leaks.
- Both issues' claims hold as written. Closed known limits searched ("lock screen pick", "auto-close focus"): none covered either before #1315.

## Outcome & Quality Bar

- **For whom**: a person with the wallet open in two windows who picks a profile on a lock screen; a keyboard user on the recovery-phrase screen.
- **Excellent**: a settle never replaces a selection that the newest pointer write names and the list still holds; after Disable auto-close, Tab continues from Close, and a held Enter neither closes the screen nor reveals it again.
- **Good enough**: F1 keeps today's behaviour (#1315); where a follow's own lookup rejects, the screen stays where it was (no retry is added).

## Assumptions

**Facts** (verified at 210d02f1f; detail in recon.md):
1. `followPick` increments `follows` before any early return (`auth.vue:282`), so every pointer event heard here moves it; `onLastActiveProfileChanged` passes the event's own value (`lastActiveProfile.ts:21-29`).
2. A settle's existing guard (`auth.vue:255`) returns when the list failed, the page left, a session opened, the selection moved or the selection is held; it records a hold only when it reaches `heldBack()`.
3. `export/full.vue:133-137,358-361` and `export/account.vue:355-359,549-552` focus their Close through `useTemplateRef(...).value?.$el?.focus()` and give it `@keydown.enter="refuseRepeatEnter"`; the local `Button` forwards `$attrs` to the native button (`components/ui/Button.vue:16,55-57`).
4. `seed.vue:141-144` acts on Enter only for an `<input>` or `<textarea>` target and skips a key already `defaultPrevented`.
5. `tests/e2e/helpers/profile-chaos/model.ts:354` cites `src/popup/pages/auth.vue:382` (`data-testid="auth-delete-retired"`); `profile-chaos-model.test.ts` (inside `bun run test`) fails when that line moves.
6. `auth.test.ts` drives pointer events and deletions through the hoisted `elsewhere` mock with deferred reads (`auth.test.ts:50-64,653-697`); `OnboardingPhraseStep.test.ts:65-85` proves the onboarding hand-off with `pressOn`.

**Inferences**:
- I1. An event heard during a settle's reads does not prove the read is older: the read can answer a newer write whose event is still on its way. That event starts a follow, which normally moves the selection through the existing guards when its lookup succeeds.
- I2. The browser delivers a page its storage events in write order (an existing assumption; neither the mocks nor the trace prove it).

**Asks**: none. The focus target in arc 2 is an accessibility call under the owner's 2026-10-19 delegation (D3), not a UI change.

## Architecture & Implementation

**Arc 1 (#1281), `auth.vue` only.** `followPick` records the newest event's id (`let heard`, set beside `++follows`). `settleProfile` takes `follows` before its reads and, after its existing guard (Fact 2), returns when all three hold: `follows` moved, `heard` is the selection, and its list holds `heard`. The newest write then already names what the screen shows. A deleted selection, or an event with no id, never stops a settle. The TSDoc above `settleProfile` gains one clause; the `auth.vue:382` citation in `profile-chaos/model.ts` follows its line.

**Arc 2 (#1282), `SecretCountdownClose.vue` only.** A template ref on Close; the link's handler emits `disableAutoClose`, then focuses Close (`close.value?.$el?.focus()`), as `keepOpen` does in onboarding. Close exists until the parent re-renders, so no render wait is needed. Close gains `@keydown.enter="refuseRepeatEnter"`, as both export pages' Close has. `seed.vue` is unchanged.

**Trade-offs.** Arc 1 adds one page variable, arc 2 one template ref. No lifecycle, stored field, cross-module signal or retry.

## Decision ledger

| # | Question | Decided | Rejected, and why |
|---|---|---|---|
| D1 | F1 (#1281 ordering 1) | C: no change; closed known limit #1315 (Codex r3 and Opus agree) | the selection's object (draft; Codex r1, Opus: an activation's same-id write, which can begin and end inside one lookup, reads as a pick and keeps A where the base follows B); a count of pointer writes started here in `lastActiveProfile.ts` (r2; Codex: a cross-module coordination signal whose only consumer is this page, with a residual of its own); a chooser-only pick signal (same kind, smaller); re-reading the pointer, or watching the chooser's open state (Opus: each fails on a single fault with no event to repair it) |
| D2 | How a settle learns a newer write named the selection | `follows` moved, `heard` is the selection, and the settle's list holds it | the draft without the list check (Codex r1, Opus: a stale event naming a deleted selection, or none with nothing selected, stopped a needed settle); give way on any event (an event naming a gone profile or no id makes `followPick` select nothing); select `heard` instead of the read (changes the settle's pick pinned at `auth.test.ts:691`, and the read can be newer, I1); a settle generation bumped by `followPick` (a second counter beside `follows`) |
| D3 | Where focus goes after Disable auto-close | Close, the control the link timed; it refuses a repeat Enter | the page heading (moves the person away from the footer they acted in); keeping the link mounted but hidden (changes what the screen shows). Accessibility call under the owner's 2026-10-19 delegation, stated in the PR body |
| D4 | One PR or two | two arcs, stacked, then the close-out | one PR: the arcs share no file, and the lane brief asks one arc per issue |

## Security & Adversarial Considerations

- **Threat model**: no new untrusted data path. F1 and F2 are agreement between a person's own windows; the screen unlocks the profile it shows and clears a typed password when the id changes (`auth.vue:120-131,323-331`), so neither ordering sends a password to a profile the person did not see.
- **Input**: the pointer arrives through `chrome.storage.onChanged`. The worker asks Chrome to limit the local area to trusted contexts and continues if refused (`wallet/index.ts:54`, `wallet/utils/storage-access.ts`); Firefox has no `setAccessLevel`, so a content script could also write it there, which needs a compromised renderer and is unchanged here. `followPick` matches the id against the service's list, and a settle gives way only to a listed selection.
- **Keyboard**: arc 2 removes a held-Enter path to Close; Close still needs a fresh press. The words still clear on Close, a lock or a switch (`seed.vue:61-86`).
- Crypto, supply chain, permissions, logging: untouched.

## Arcs, phases and gates

Every gate, from the repo root: `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`, `bun run audit:vue`. Pass: every command exits 0. Smoke e2e: build the armed extension (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`, or `build:firefox`), then from `apps/extension` run `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/<file> --retry=0` (Firefox: add `NULO_E2E_BROWSER=firefox`). No arc adds an e2e scenario: the component layer drives the exact interleaving, which an e2e run cannot schedule.

**Phase 1, arc 1 (#1281) ✓** (`auth.vue`, `auth.test.ts`, `tests/e2e/helpers/profile-chaos/model.ts`).
1. Write three cases in "the profile it shows follows other windows" and run them on the base: the regression must fail, both controls must pass.
   - Regression, "a pointer write naming the selection during a settle's reads keeps it": before `mountAuth({}, A)`, mock the pointer read to answer `pB` and the list to be deferred, holding `pA` and `pB`; `pick("pA")`; release; expect `pA`.
   - Control, "a stale event naming a deleted selection does not stop its settle": A selected; the list (without `pA`) deferred after `delete("pA")`, the pointer read answering `pB`; `pick("pA")`; release; expect `pB`.
   - Control, "with nothing selected, an event with no id does not stop the settle": cleared selection, deferred list; the pick listener called with `undefined`; release; expect the settle's pick.
2. Change `auth.vue` as Architecture says; move the citation.
3. Run the gate. Pass also: the three cases green, and the existing cases green unchanged, among them `auth.test.ts:523`, `:653`, `:675` and `:699`.
4. Smoke e2e, Chrome: `auth-flows.test.ts`, `security-reset.test.ts`. Layers: lint, typecheck, component, smoke.

**Phase 2, arc 2 (#1282) ✓** (`SecretCountdownClose.vue`, `SecretCountdownClose.test.ts`).
1. Write two cases, mounted with `attachTo: document.body` and a parent that flips `autoCloseDisabled` on the emit, each wrapper unmounted after its test; run them on the base: both must fail.
   - "a keyboard press of Disable auto-close hands focus to Close": `pressOn(link, "Enter")`; expect `document.activeElement` to be Close and the link gone.
   - "the Enter that pressed the link, repeating on Close, closes nothing; a fresh Enter closes": the repeat goes to `document.activeElement` and returns `[false]` with no `close` emitted; a fresh Enter emits `close` once (success control).
2. Change the composite as Architecture says.
3. Run the gate. Pass also: the composite's twelve existing cases green.
4. Smoke e2e, Chrome and Firefox (the change moves focus): `security-backup.test.ts`, `keyboard-guards.test.ts`.

**UI impact**: none. Arc 1 changes which profile a lock screen ends on only in F2's ordering, to the one every other window shows. Arc 2 moves keyboard focus and refuses a repeat key; nothing drawn changes.

## Delivery

| Layer | Branch | Title (≤ 92) | Body |
|---|---|---|---|
| 1, arc 1 | `lock-followups-1-a1` off `worktree-lock-followups-1`; `gh stack init --base dev lock-followups-1-a1` | `fix(lock): a settle keeps the selection a newer pick in another window names` | `Closes #1281`; F2 fixed; F1 is the closed known limit #1315; the red-first runs; the gates |
| 2, arc 2 | `gh stack add lock-followups-1-a2` | `fix(settings): disable auto-close on the phrase screen hands focus to close` | `Closes #1282`; the accessibility call (D3) under the owner's 2026-10-19 delegation; the gates and both browsers' smoke |
| 3, close-out | `gh stack add lock-followups-1-close-out` | `docs(plans): close lock-followups-1 and archive it` | docs only |

`code_review: off` on every arc. Before each PR opens, `git fetch origin`, merge `origin/dev` into the stack, and run `bun run lint:actions` with the gate. The arcs are file-disjoint, but each is under an hour: no lanes. Open each PR ready, with no label.

## Post-implementation

The execution contract is this plan plus `implementations-plan/README.md` § Post-implementation standard at 210d02f1f. Specific to this plan: step 1 is absent (`code_review: off`); the review loop runs per arc at its boundary with `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`, hard stop at three rounds, and one Opus diff review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1; the cross-arc pass is one fresh Codex session over the net diff from 210d02f1f; trunk `dev`; slug `lock-followups-1`; nothing merges before the orchestrator's word. The close-out's Outcome names `Known limits: #1315`. Teardown after the close-out merges: `agent-worktree done lock-followups-1 --merged`.

## Audit verdicts

- **Round 1, Codex** (gpt-6.1-sol, high): `reject`. (1) Demonstrated in memory: the draft's object comparison in `followPick` read an activation's same-id write (`useProfileBootstrap.ts:248`) as a pick here; it kept A after an activation ended locked inside the lookup, and skipped `heldBack()` and its replay when the lookup returned during the hold. (2) Demonstrated in memory: the settle's give-way kept a deleted selection on a stale event naming it, and gave way to an event with no id when nothing was selected. Accepted: both. Also accepted: the bootstrap's `:290` is Import's untracked path, event order is an inference (I2), the read-age claim restated (I1), "no new untrusted data path", separate lists per test leg, the repeat on `document.activeElement`. Rejected: none.
- **Round 1, Opus Plan leg**: `conditional approve`. Accepted: the same two defects, the F2 test's list must hold `pB` with its mocks set before the mount, unmount attached wrappers, Fact 6's lines, the security sentence. Corrected: it said nothing calls `setAccessLevel`; the worker asks for it at `wallet/index.ts:54` (Chrome only). Its fix for (1), moving `heldBack()` first, leaves the first timing.
- **Round 2, Codex resume**: `conditional approve`. The pointer-write count closed both findings, but it is a cross-module coordination signal for one page, with a residual (a failed automatic write, then a re-lock inside one lookup). Condition: decide it explicitly against the known limit.
- **Round 3, Codex resume**: chose C for F1 ("the bounded consequence does not justify either new cross-module signal"); D2, its regression and controls confirmed; I1, I2 and the Security wording qualified as now written. `conditional approve (with conditions: choose C, file the known limit, narrow the plan)`, all met: #1315 filed and closed, this plan rewritten. **Opus leg on D1**: `agree C`; no local fix beats it (object identity, a pointer re-read and the chooser's open state each fail on a single fault with no event to repair it).

- **Final pass, fresh Codex session**: `approve`. No blocking finding; the regression is red and both controls green on the base, all three green after, by trace; existing cases `:523`, `:653`, `:675`, `:699` hold. Accepted, wording only: Fact 2 records a hold only when it reaches `heldBack()`; F3's "next Tab starts at the top" is unmeasured; F2's invariant scoped to the settle; `lint:actions` before each push.

- **Arc 1, round 1** (Codex over `2ed82cef2..0964d0488`): one finding, accepted: the `settleProfile` TSDoc said the heard pick is newer than the read; it may be. Opus diff review, same round: two findings, accepted. The same comment also hung off "as in the route guard"; rewritten. No test failed if `follows !== followsAtStart` was dropped; a held-replay case now does (mutation-checked). `heard` renamed `lastHeard`.
- **Arc 1, round 2** (Codex resume over `0964d0488..9de3bbcf6`): `clean`. Merged as #1320.
- **Arc 2, round 1** (Codex over `2914b9699..0381a3c77`): `clean`. Opus diff review, same round: `clean` (pointer, Space, Close's own activation and `seed.vue`'s handler traced).

## Seeds (retired)

`/goal` Arc <n> of implementations-plan/lock-followups-1/plan.md built, its red-first tests reported failing (or, for controls, passing) on the base and passing after, its gate passing in the transcript, its Codex loop converged (a resumed pass with no new material finding quoted), its PR open on the lane's stack with `Closes #<issue>`.
`/loop 15m` Drive the next arc of implementations-plan/lock-followups-1/plan.md per its phases and Post-implementation; stop at the open PR; never merge.
