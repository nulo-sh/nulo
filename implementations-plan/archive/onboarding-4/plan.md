---
plan: onboarding-4
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: worktree-onboarding-3 @ bcee404d (#743's head)
standard: implementations-plan/README.md § Post-implementation standard, read at bcee404d
---

## Outcome

- **Date:** 2026-10-19
- **Status:** completed. Branch `onboarding-4-a1` carries the arc and this close-out. Its PR is held while #743, its base, is open; the orchestrator opens it after #743 merges, and merging is the owner's call.
- **Shipped:** #769, P50-01 B. The profile service marks a profile created while another live profile exists (`nulo:ui:profileNotFirst@<id>`), before its session opens. Home shows a later password profile its phrase row alone (no Hide; the funded banner as before) and a later passkey profile no card. The first profile and imported profiles are unchanged. Tests: the service (order, lifecycle, begun deletion, refused write, import control), the view, Home, one smoke e2e on both browsers, one Firefox own-window assertion.
- **Changed from the brief:** the pictures are 360x600, the popup's width, not 400x600 (D6); no later-passkey e2e step on Chrome, since the service and Home tests prove that rule (D5).
- **Known limits:** #847.
- **Open items:** none.
- **Lessons:** none promoted; nothing here would bite another task that `lessons.md` or the e2e skill does not already say.
- **Seeds retired:** the `/goal` and `/loop` seeds below; they are not instructions.

# onboarding-4: a later profile's Get started card shows only what it lacks (#769)

One issue, one arc, one PR against `dev`, stacked on #743 (D-orch-1: no `gh stack`). Recon: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md). Over the 150-line `light` target by about ten lines: the Outcome and the review record.

| Arc | Issue | Branch | PR line |
|---|---|---|---|
| 1 | #769, P50-01 B | `onboarding-4-a1` off `origin/worktree-onboarding-3` | `Closes #769`; held while #743 is unmerged |

## Outcome & Quality Bar

- **For whom**: a person who already uses the wallet and makes a second profile from the lock screen's profile picker.
- **Excellent**: (1) a later password profile's Home shows "Save your recovery phrase" alone, with no Hide, from its first frame; once funded with the phrase unsaved it shows the urgent banner, as a first profile does. A later passkey profile's Home shows no card. (2) The install's first profile and an imported profile look exactly as on #743.
- **Good enough**: the rule follows how a profile was made; nothing is shared across profiles, and nothing is migrated (pre-production).

## Assumptions

**Facts** (verified at `bcee404d`):
- F1 Every card flag is per profile under `nulo:ui:<flag>@<id>`; the profile service writes `profileImported` after an import's row, under the facade lock and best effort (`service.ts:1460-1466`); `getStartedView` returns no card for it (`get-started.ts:113-129`).
- F2 `persistNewProfileHoldingLock` removes every `profileUiKeys(id)` before it writes the row (`service.ts:1443-1454`), so a flag must be written after it; the deletion coordinator removes the same keys (`profile-deletion/coordinator.ts:135`).
- F3 `createProfile` and `createPasskeyProfile` (`service.ts:613-655`, `:740-790`) are the only create paths; both the popup's New profile page and the onboarding tab reach them through `useProfileCreateFlow.ts:116-117`. A tombstoned profile is absent to every read (`getProfiles`, `:610`).
- F4 A password profile whose card holds the phrase row alone already renders today (after Hide: `canHide` false, no Hide link); option B's drawn card is that form.
- F5 `readGetStarted` reads every `KEYS` entry, `changedGetStarted` follows each, and a failed read starts from `NOTHING_DONE` and merges newer change events (`useGetStarted.ts:4,22-34`): a missing `notFirst` gives the first-profile rules, with whatever other flags the profile holds.
- F6 No e2e makes a later profile and then reads Home's card (recon); `createAndActivateProfile` (`fixtures/profiles.ts:11`) makes a later password profile from the lock screen.

**Inferences**: I1 Writing the flag before `openSessionVerified` lets Home's first read after the switch see it, as `profileImported` does today; the service test proves the order (row, flag, then the active-profile event). I2 The popup's passkey create, in the page or in its own window, reaches the same service write; the Firefox toolbar-panel test proves the own-window path.

**Asks**: none open. The picture size is resolved in D6.

**Claims that did not hold**:
- The decision page names "Settings › Profiles › New profile"; no such route exists. A later profile is made from the lock screen's profile picker (`SelectProfilePopup.vue:73`) or the register page's link (`register.vue:46`), both `/popup/profile/new`.
- The lane brief asks for pictures at 400x600; the popup is 360 px wide (`--base-width`, `packages/design/src/base.css:68`), and the e2e draws it at 360x600 (`fixtures/wallet-pages.ts:140`), as #743's pictures. The pictures are 360x600 (D6).

## Architecture & Implementation

**The flag.** `profile-ui-keys.ts` gains `PROFILE_NOT_FIRST_PREFIX = "nulo:ui:profileNotFirst@"` (in `PROFILE_UI_KEY_PREFIXES`) and `profileNotFirstKey(id)`, doc: "Set by the profile service when a create commits while another profile exists; never on an import." It records a fact about how the profile was made, not a view choice (D2).

**The write.** Both creates call one new private `persistCreatedProfileHoldingLock(profile)` in place of `persistNewProfileHoldingLock`: it reads `notFirst = (await this.repo.getAll()).some((p) => !this.deletionState.isReserved(p.id))` (the `getProfiles` filter: another decodable, non-reserved profile at the locked commit; the new id is not stored yet, since `createProfile` takes it from `nextUnreservedId` and `createPasskeyProfile` refuses a stored one), then persists, then `if (notFirst) await this.markProfileFlagHoldingLock(profileNotFirstKey(profile.id))`, all before `openSessionVerified`. `markImportedHoldingLock(id)` becomes `markProfileFlagHoldingLock(key)`, so one best-effort helper writes both flags; its four import callers pass `profileImportedKey(id)`, and its debug line stays a fixed category with no key or id. Its comment keeps the why (here, not in the page: a passkey window or a closed popup can end the page first; a lost write leaves the reminders up).

**The view.** `GetStartedFlag` gains `"notFirst"`; `KEYS` maps it; `MarkableGetStartedFlag` excludes it beside `imported`; `NOTHING_DONE` lists it. In `getStartedView`, after the `imported` return, the phrase row and banner keep their rules, and the other four rows come from one helper, `firstProfileItems(ready)`, which returns `[]` when `flags.notFirst`. `canHide` stays "any row other than the phrase", so a later profile never offers Hide.

**Flow.** Lock screen › New profile › `createProfile` (worker): duplicate check, id, row, `notFirst` predicate, persist (drops stale UI keys), flag write, session open → popup routes to Home → `useGetStarted` reads six keys → `getStartedView` → `["phrase"]` or `[]`.

**Alternatives not taken** (D1 to D3): derive "first" at read time from the profile list (deleting the first profile would turn the second into a first, and a second profile's create would shrink the first's card); the page writes the flag (D24's reason: the page can end first); a profile-row field (rides in backups and the row's MAC); a device-wide "card shown" record (option C, not picked).

## Arc 1 (#769)

### Phase 1: the flag, its write and the rule ✓ (2026-10-19, [lessons/phase-1.md](lessons/phase-1.md))
Files: `src/utils/profile-ui-keys.ts`, `src/utils/get-started{,.test}.ts`, `src/composables/useGetStarted{,.test}.ts`, `src/wallet/services/profile/service{.ts,.integration.test.ts}`, `src/popup/pages/general.test.ts`, the regenerated `src/types/auto-imports.d.ts`.
Tests:
- `service.integration.test.ts`, in "an import records its profile as imported; a create does not" (renamed to cover both flags):
  - a password and a passkey create after a first profile write `profileNotFirst`, in the order row, flag, then `onActiveProfileChanged` (`recordWrites` plus the event pushed into the same log);
  - the existing "%s leaves it unmarked (control)" asserts both keys absent on a first profile;
  - a phrase import after a first profile writes `imported` and no `notFirst`;
  - a profile whose deletion has begun (`getDeletionState().beginDeletion`) does not count: the next create writes no `notFirst`;
  - the lifecycle, on the fee-picks suite's `purgingDelegate(api)` (hoisted; `makeService`'s default delegate purges nothing): create A, then B (marked); delete A, and B keeps its flag; delete B, and its key is gone; create C, unmarked;
  - a refused `notFirst` write still completes the create and opens its session.
- `get-started.test.ts`: the pinned `getStartedKeys` list and `NONE` gain the key; a later password profile shows `["phrase"]` with `canHide` false; funded, it shows the banner and no items; a later passkey profile shows no card and no banner; the existing first-profile cases are the control.
- `useGetStarted.test.ts`: the three whole-object expectations gain `notFirst: false`, nothing else (`changedGetStarted` follows `KEYS`, pinned above).
- `general.test.ts`, "Home — a later profile": a password profile shows only `get-started-phrase` and no `get-started-hide`; a passkey profile shows no card and Home still settles; the existing "a new profile shows the card" is the control.

### Phase 2: the e2e and the pictures ✓ (2026-10-19, [lessons/phase-2.md](lessons/phase-2.md))
Files: `tests/e2e/security-backup.test.ts`, `tests/e2e/passkey-toolbar-panel.test.ts`.
- `security-backup`, one test on `registeredExtensionPerTest` (the file's `registeredExtension` is shared, and its other tests need the first profile active): Home shows `get-started-aztec` (control); `createAndActivateProfile` makes a later password profile; after `waitForHomeReminders`, Home shows `get-started-phrase` and none of `get-started-aztec`, `-feeJuice`, `-presto`, `-hide`. Failure mode: the worker's write reaching the popup's first read through real storage and the real New profile page; the unit and component layers fake both. Runtime: estimated +15 s per browser (a launch, a registration, a create); measured in the gate.
- `passkey-toolbar-panel` (Firefox), "create and unlock from the dying panel": one storage read, `profileNotFirst@<created>` is `true`. Failure mode: the own-window create, the path that put the write in the service. Runtime: about 0 s.
- No later-passkey e2e on Chrome: the service and Home tests prove that rule, and the page reaches the same write (both legs, D5).

### Arc 1 validation gate
- **Fast, after each step**: `bun run lint && bun run typecheck:all && bun run test`, then `cd apps/extension && bun --bun vitest run <the phase's test files>`. Pass: exit 0.
- **Red proof**: with the service write removed, the integration and e2e cases fail; with `firstProfileItems`' check removed, the view and Home cases fail. Restore. Record in `lessons/phase-1.md`.
- **Arc end**: `bun run test:all`, `bun run audit:vue`, `bun run check:plans` after staging. Pass: exit 0.
- **Smoke, Chrome then Firefox** (load1 under 150 first): the armed build (`tests/e2e/global-setup-smoke.ts:20`), then `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/{security-backup,onboarding-tab,passkey-paths,keyboard-guards,auth-flows}.test.ts --retry=0`, then the same plus `passkey-toolbar-panel` under `NULO_E2E_BROWSER=firefox` on the Firefox armed build. Pass: exit 0 at retry 0; one rerun of a named known flake. Record `security-backup`'s wall-clock on the base and the head per browser.
- **Pictures**: one uncommitted capture spec kept under `~/.cache/nulo-backlog/onboarding-4/`, copied into `apps/extension/tests/e2e/` for one run of the existing smoke config on the Chrome head build, then removed by its exact path (`git status` clean after): Home for the first profile, a later password profile and a later passkey profile, each after `waitForHomeReminders`, by `shotSend` (both themes). Six PNGs at 360x600 go to `implementations-plan/onboarding-4/screenshots/`. Pass: each later-profile picture matches the signed form; the first-profile picture matches #743's.
- **Layers**: lint, typecheck, unit, component, build, smoke e2e on both browsers.

## Security & Adversarial Considerations

- No trust boundary moves: the flag is a UI hint in `chrome.storage.local`, written only by the worker's profile service, cleared with the profile, never in a backup. A local writer that sets it hides the four optional rows, as one that sets `getStartedHidden@<id>` already can; it cannot touch the phrase row or the funded banner, and it unlocks nothing and changes no key, address or send.
- A hostile backup carries no `nulo:ui:` key, and a restore clears the adopted id's UI keys before its row. A dApp has no path to the flag.
- A lost or unread flag gives the first-profile rules (F5): more reminders, the safe side. No new log line beyond the shared helper's debug category; no profile id or name is logged.
- No dependency, permission or message change.

## UI impact

Signed, P50-01 = B (#769, 2026-10-18): "Only what the new profile lacks: a second password profile shows the phrase row alone; a second passkey profile shows nothing." Home's Get started card: the first profile unchanged; a later password profile the phrase row alone (no Hide; the funded banner unchanged); a later passkey profile no card. An imported profile unchanged (OA-16). No copy changes. The rule counts any profile, so on an install whose first profile was imported (no card), a created second profile shows the phrase row alone, as the signed text says; the PR body states this case. Pictures at 360x600, Chrome, light and dark, in the PR.

## Decision ledger

| Id | Decision | Rejected | Panel |
|---|---|---|---|
| D1 | A per-profile flag written at create time, by the service | deriving "first" from the profile list at read time (deleting the first profile would turn the second into a first; a second create would shrink the first's card); the page writes it (the page can end first); a row field (rides in backups and the row's MAC); a device-wide record (option C) | both agree |
| D2 | Named for the fact: `profileNotFirst` | the decision note's `getStartedBackupOnly` (stores a view choice) | both agree |
| D3 | The predicate is `getProfiles`' filter, read under the lock before the persist: another decodable, non-reserved profile | counting raw keys (an undecodable row would cut every later card for good; the repository has no `getKeys`) | Codex corrected the wording |
| D4 | One create helper (predicate, persist, mark) and one best-effort flag helper taking the key | the predicate and the mark repeated in both creates; a flag-name map in the service (Opus; a fixed debug category already leaks no id) | Opus |
| D5 | E2E: the later password profile on both browsers; one storage assertion in the Firefox own-window create; no later-passkey step on Chrome | a later passkey step in the new test (repeats the password step's failure mode) | both legs |
| D6 | Pictures at the popup's 360x600, from one uncommitted capture spec copied in for one run | the brief's 400x600 (wider than the popup draws); `shotSend` calls in the committed tests (no committed test reaches a later passkey Home on Chrome); a vitest config outside the app (cannot reuse discovery and setup) | both agree |
| D7 | Rare paths are one closed known-limit issue, filed at close-out: a create retried after the worker died post-commit leaves an unseen first profile, so the visible one is `notFirst`; a create racing a restore that later tears keeps `notFirst`; a create displaced by the lock's watchdog (#443's class) leaves an orphan key that the next adoption of that id removes | a recovery or repair step (state and obligations for optional rows) | Opus 8, Codex 5 |

## Audit verdicts

**Round 1.** Codex (gpt-6.1-sol, high, session `01a153c3`): `conditional approve (with conditions: prove activation ordering and deletion/reset semantics)`. Opus 5.5 Plan: `conditional approve` (the e2e on its own browser, the import-then-create case named, the later-passkey step dropped). C = Codex, O = Opus.
- C1 a flash of the full card if the flag landed after activation (plausible, unverified) → the service test logs row, flag, then the active-profile event. Accepted. Its composable stale-read case for `notFirst`: rejected with O5, since `changedGetStarted` follows `KEYS`, which the key pin covers.
- C2/O5 the signed lifecycle untested → one lifecycle case (A, B marked, A deleted and B kept, B deleted, C unmarked) and a begun-deletion case. Accepted. The deletion coordinator's seeded-key test: not extended; the lifecycle case proves the new key's removal through the real deletion.
- C3 D3 and F5 overstated → reworded. Accepted.
- C4/O2 the later-passkey e2e step repeats the password step → dropped; a storage assertion in the Firefox own-window create instead (O2). Accepted.
- C5 the lock's watchdog can displace a create (#443's class) → D7. Accepted as a known limit.
- O1 the shared `registeredExtension` → `registeredExtensionPerTest`, estimate redone. Accepted.
- O3 import, then create → named in UI impact and the PR body; no design change. Accepted.
- O4 one create helper; a flag-name helper → the create helper accepted; the flag-name map rejected (D4).
- O5 fold the first-create control into the existing one; drop the composable case → accepted.
- O6 the regenerated auto-imports file → in Phase 1's files. O7 compare with `getStartedHidden` in Security → accepted. O8 → D7.

**Round 2** (Codex, resumed): `conditional approve (with conditions: make the lifecycle test prove actual UI-key removal)`. Accepted: the lifecycle case runs on `purgingDelegate` and asserts B's key gone after B's deletion and kept after A's; the capture spec is copied into `tests/e2e/` for its one run and removed, since a config outside the app cannot reuse discovery and setup; Security's wording follows F5. Codex withdrew the composable case and found D7's single issue right (one hypothesis, consequence and reopening condition each, #443 referenced).

**Round 3** (Codex, resumed, verification): `approve`, no new material findings.

**Arc 1 post-implementation** (diff `ebf3c72b..onboarding-4-a1`). Codex (gpt-6.1-sol, high, session `01a153f9`) round 1: `findings: 1`, Low: `firstProfileItems`' doc claimed the person met the general rows on the first profile, false when that profile was imported → reworded to what the rule does. Opus 5.5 diff review beside it: `approve`, no bug; the same comment, plus the create helper's doc ("only for its own backup", wrong for a passkey profile) → reworded; it confirmed the lock contract, the flag before Home's first read, and that the e2e reads a fresh Home after the switch. Codex round 2 (resumed): `clean`. Then `audit:vue` found a typecheck error in the Firefox assertion (`created.profile` is optional) → the test lists the stored marks and expects exactly the created profile's. Codex round 3 (resumed): `findings: 1`, Low, demonstrated: the key list no longer checked the value is `true` → it compares `[key, value]` pairs. Round 3 is the hard stop; that fix is applied, typechecked and run on Firefox, with no fourth round.

## Delivery

- PR title: `feat(home): a later profile's get started card shows only its own backup` (75 characters). Body: `Closes #769`, P50-01 quoted by id and text, the six pictures, the smoke wall-clock before and after per browser.
- While #743 is open: push `onboarding-4-a1`, write the PR body to `~/.cache/nulo-backlog/_orch/reports/onboarding-4-arc1.pr.md`, open no PR. If #743 moves, merge `origin/worktree-onboarding-3` (never `origin/dev`); rerun `bun install --frozen-lockfile` if `bun.lock` changed.

## Post-implementation

The standard is `implementations-plan/README.md` § Post-implementation standard at `bcee404d`. Plan-specific values:
- Step 1 is absent (`code_review: off`).
- Step 2 once, after the gate, over `origin/worktree-onboarding-3..onboarding-4-a1`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh` until a round has no material finding; hard stop at three. One Opus 5.5 diff review (`Agent`, `model: "opus"`, `general-purpose`) beside round 1.
- Step 3: held as Delivery says; the orchestrator opens the PR after #743 merges, then `gh pr checks <n> --watch`.
- Step 4 on this branch before the push: the Outcome, the lessons pass, `STATUS.md` deleted, `git mv` into `archive/` in its own commit, the index line moved, `bun run check:plans` green. Merge `origin/dev` is the orchestrator's call once #743 lands.
- Step 5 after the merge: `agent-worktree done onboarding-4 --merged` once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/onboarding-4/plan.md` succeeds.

## Seeds

`/goal` (recommended): `Arc 1 of implementations-plan/onboarding-4/plan.md is done: phases 1 and 2 marked ✓, each backed by its gate reported passing in the transcript (red proof, smoke on Chrome and Firefox at retry 0, six pictures); LESSONS_FILE=implementations-plan/onboarding-4/lessons/phase-N.md printed per phase; the Codex loop converged, quoted; onboarding-4-a1 pushed with the close-out and the PR body written; bun run test and bun run lint exit 0.`

`/loop 15m Drive arc 1 of implementations-plan/onboarding-4 per its plan.md (read it and lessons/ first). Take the next unchecked step, run the fast gates after each edit, commit signed. Decide open questions with Codex (gpt-6.1-sol high) and log each consult. After the gate, run the Post-implementation loop, push, write the PR body, report and stop. Never merge; never open a PR while #743 is open.`
