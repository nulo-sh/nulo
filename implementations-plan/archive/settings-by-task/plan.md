# Settings by task

## Outcome

- **Date**: 2026-10-08
- **Status**: completed.
- **Shipped**: in #56. The hub grouped by task with a profile card, row values and a Danger zone (`apps/extension/src/popup/pages/settings/index.vue`); Lock and Privacy pages, Display and Developer for Appearance and Advanced, a slimmer Your profile; one lock for the header chip and Lock now (`apps/extension/src/composables/useLockWallet.ts`); three redirects (`apps/extension/src/popup/legacy-routes.ts`); e2e on the new paths; renamed docs; a `BEFORE-LAUNCH.md` § 4 entry. Review round 2 added a live `#/popup/auth` wait to the Lock now smoke and trimmed five comments; round 3 approved.
- **Open items**: the store's "security" capture now framing the Lock page (#181); routed `.ts` helpers under `src/popup/pages/` (#177); Account State's `advanced` URL (#135); the config-toggle bug (#205) and the strict-mode e2e skip (#162); one more is tracked privately: GHSA-6wh5-mc2x-fc3w. The owner's deferred hub additions are not open work: the owner's answers in this plan decline them for now. `BEFORE-LAUNCH.md` § 4 owns the privacy policy's "Settings → Advanced" wording.
- **Seeds retired**: the `/goal` seed ("/goal All phases marked ✓ …") and the `/loop` seed ("/loop 15m Drive …") are retired. This record is evidence, never a task list.

## Decision

Regroup Settings by task, per the owner's board "Recommended Settings (approved with changes)", v2, with the hub showing each preference's current value. Lock now runs the header chip's lock through one composable. Old URLs redirect. Page internals moved as they were: the config-toggle bug is pinned, not fixed.

## Why

- **One tap per task**: lock, back up, theme, prices, logs, delete.
- **No guessed value**: a row shows a value only once read, and an older read never overwrites a newer change (Lessons: Hub reads).
- **Lock now is the chip, not a copy**: the same 3-second budget, confirm and session-change abandonment, on the long-lived `managers.profile`, since a page's own client rejects its pending read on unmount (Lessons: Lock dispose).
- **Nothing relied on breaks**: old URLs land behind the same guard, kept testids select the same controls, Tab visits the hub's rows in order. A passkey profile sees no Change password or strict mode.
- **Security**: the redirects have fixed targets resolved before the guard, so the target's `isAuthRequired` decides. Lock now sits outside the Lock page's config load gate, whose reads can hang after a worker restart. No dependency, workflow, crypto or log line changed.

## What shipped

### UI impact, as built

Captures (private Artifact, 2026-10-08): https://claude.ai/artifact/EFpBZ6KpWL2qYwddzUcTrF, 36 images over 18 surfaces, light and dark, checked against this table.

| Surface | Before | As built |
|---|---|---|
| Hub `/popup/settings` | 12 rows in Identity, Connections, Security, App; "About Nulo" footer link | Profile card: the name's two-letter initials ("MA" for the default "Main"), the name, "Password profile"/"Passkey profile". Your wallet: Accounts, Contacts, Tokens. Apps and networks: Connected Apps, Networks, Fee Payments, Proving. Safety: Lock ("Auto-lock, strict mode", or "Auto-lock" for passkey; value "30 min", "1 h 30 min", "24 h" or "Never"), Back up profile ("Keep a copy of this profile"), Change password (password profiles only, no description). Preferences: Privacy ("Prices, explorer"; "Prices on/off"), Display ("Theme, layout"; "System/Dark/Light"), Developer ("Mode, logs, account state"; "On/Off"). Help: Glossary, About Nulo ("Version, contact, legal"). Danger zone: red fence, normal-color label, Delete profile with a red icon. 16 rows, 15 for passkey |
| Your profile | "Profile"; Identity; Security (Backup, Change password greyed for passkey); Delete | "Your profile"; Name, ID, Type ("Password"/"Passkey") |
| Lock `/settings/lock` (was Security) | Strict mode for all; Auto-lock; Backup row | Lock now ("Locks Nulo until you unlock it again", no chevron) first, outside the load gate; strict mode for password profiles only; Auto-lock in minutes, unchanged |
| Display `/settings/display` (was Appearance) | "Dark Theme"; fiat toggle; "to to" typo | "Theme"; no fiat toggle; typo fixed; "Lists" label above Show incoming transfers and Hide dust |
| Privacy `/settings/privacy` | none | Show fiat values and Block Explorer, copy unchanged |
| Developer `/settings/developer` (was Advanced) | "Advanced Settings"; Block Explorer | "Developer"; no Block Explorer; Account State always shown |
| Backup, Change password, Delete profile, Account State | Cold-open back: Security, Profile, Profile, Advanced | Content unchanged; back: Settings, Settings, Settings, Developer |
| Header | Lock chip | Unchanged |

Icons: Lock and Lock now `lock`, Back up `download`, Change password `password`, Privacy `visibility`, Display `palette`, Developer `bolt`, About `info`, Delete `delete` (red).

### Owner sign-off and answers, verbatim

Sign-off on the board, 2026-10-08:

```
Settings by task: Approve with changes; notes: - Keep the word "Profile"? => Yeah, let's call it Your profile
- Let's just hide change password if it's a passkey profile please.
- For now, let's not add the switch profile stuff.
- Gate Account state: Don't gate it.
- Yes, add lock now.
- Don't fold anything yet (16 rows question)
- I think those on Dispaly / lists make sense
- Strict mode hidden for passkey: sounds good.
```

Answers to the draft's Asks 1 to 3, 2026-10-08:

```
1. I'd say it's "Never". (2) normal color. (3) yes, don't change the effective date... Or put it under BEFORE_RELEASE of things that need updating.
```

So: 0 shows "Never"; the Danger zone label keeps the normal color (red text is 3.56:1 on the light background); no legal edit, since `legal/README.md` requires a new version and date for any change, so `BEFORE-LAUNCH.md` § 4 carries it.

Verdict at the approval gate, 2026-10-08:

```
A: I'd like to change from minutes to hours, if it's not too complex or risky. I wonder if we already have that code in this repo. B: whateer you think it's best. C: Correct. D: Yes. Approve.
```

### Asks A to D

- **A. Auto-lock value above zero.** Hours: "30 min" under an hour, "1 h" or "24 h" (the field's 1440-minute maximum) on whole hours, "1 h 30 min" otherwise; a fractional minute, possible only in storage written outside the app, shows the Lock field's own text unrounded.
- **B. Profile card initials.** Delegated; the lead chose the shared two-letter rule: one rule for Header, contacts and card, and two letters tell profiles apart better.
- **C. Cold-open back arrows** of Change password and Delete profile: Settings.
- **D. Test ids on two hub rows**: Change password and Back up keep `change-password-link-btn` and `backup-link-btn`; the board's `setting-nav-change-password` and `setting-nav-backup` were not added.

### Routes and test ids

- Redirects, pushed after the generated routes: `/popup/settings/security` → `lock`, `appearance` → `display`, `advanced` → `developer`. Unchanged under `/popup/settings/`: `security/export/**`, `security/change-password`, `security/reset`, `profile`, `about`, `advanced/account-state/**`.
- Kept, with every id whose control stayed: `backup-link-btn`, `change-password-link-btn`, `delete-profile-link-btn`, `strict-security-toggle`, `auto-lock-input`, `theme-trigger`, `fiat-values-toggle`, `settings-toggle-*`, `header-lock`.
- New: `setting-nav-{lock,privacy,display,developer,about}`, `lock-now-btn`, `explorer-trigger`, `explorer-<id>-btn`, `explorer-none-btn`, `setting-nav-advanced-account-state`, `profile-card-avatar`, `identity-type-row`, `setting-value`. Gone: `setting-nav-security`, `-appearance`, `-advanced`.

### Reuse

Reused: the hub template, its `ConfigServiceClient`, `SectionLabel`, `PageContext`. Adapted: `SettingItem` (`#right` replaces the chevron, hence `value`), the header's lock, the `"/"` redirect precedent, the toggle binding (split verbatim). New: the label module, the `danger` fence (`iconFillColor` never reaches a material icon, so the red icon uses `#icon`). Inherited: only the worker's lock event routes to auth.

### Gates

- P1: passed; 67 cases in the targeted files (22 for the composable), each dispose rule's mutation went red, a second build left the auto-import files identical ([log](lessons/phase-1.md)).
- P2: passed; 18 route cases, red on a restored `security/index.vue` or a dropped `isAuthRequired`; the rename commit is four pure moves ([log](lessons/phase-2.md)).
- P3: passed; 10,372 unit tests, smoke on Chrome (190) and Firefox (191), five network files and the two lock files at retry 0 on both browsers, no retries ([log](lessons/phase-3.md)).
- P4: passed; `audit:vue` (10,372 tests), `check:plans` 0 findings, `test:ci-gating` 334 pass, nothing left behind ([log](lessons/phase-4.md)).
- Review: three Codex rounds, converged. After the rebase onto `origin/dev`: `audit:vue` (10,440 tests), `check:plans`, `test:ci-gating` and three smoke files passed ([log](lessons/phase-5.md)).

## Lessons

### Lock dispose

The lock's session listeners outlive `dispose()` until the last pending decision ends: `lock()` raises a counter as it starts a read, the decision's `finally` lowers it, and the `finally` reaching zero after `dispose()` removes them. Dropping them when the read settles leaves the microtask before the decision resumes unguarded, and an overlapping decision unguarded for up to 3 s (ledger 19 and 23 hold the full contract). A gap test that fires the session change synchronously inside the read's `clearTimeout` runs before the rest of the settle callback and passes the rejected variant; `queueMicrotask` lands it between settle and resume ([phase 1](lessons/phase-1.md); proofs and inherited limits in [phase 5](lessons/phase-5.md)).

### Hub reads

A `ServiceClient` fires `onConnected` on its first port and on every automatic reconnect; the page stays mounted and nothing replays updates sent while the port was down, so a page that snapshots config on mount goes stale after a worker restart. The hub rereads on each later `onConnected`; each read has a generation number and a fresh fence, an `onUpdate` fences its key, and an answer skips fenced keys and is dropped once a newer read started (mutations in [phase 2](lessons/phase-2.md)).

### Route moves

vite-plugin-pages 0.33.3 routes every `.vue`, `.ts` and `.js` file under a pages directory, so helpers live elsewhere (`settings-labels.ts` in `src/utils/`). A generated record listed before a same-path redirect record wins the match, so a moved page must be deleted. In e2e, a redirect replaces the hash `navigateByHash` waits for, so the redirect spec sets `location.hash` and waits on the new hash with `waitForHash`.

### Worktree guard

Observed 2026-10-08: worktree isolation refused `git` inside a `for` loop, a heredoc write and a `printf` with a computed format; plain single git commands from the worktree passed. Run git once per call; write files with the editor tool.

## Decision ledger

Step, Fact and Inference numbers below refer to the approved plan, which this file's git history keeps whole.

| # | Decision | Source | Alternatives considered | Audit outcome |
|---|---|---|---|---|
| 1 | Routes by `git mv` (`lock.vue`, `display.vue`, `developer/index.vue`); new `privacy.vue`; redirects as records from an exported list, pinned by a route-tree test that also checks meta and runs the real guard | lead | `<route>`-block redirects in stub pages; mounted `router.replace`; `lock/index.vue` | kept by both audits; C3 and C4 adopted (test widened, Security corrected) |
| 2 | Export, Change password, Delete profile back → `/popup/settings`; Account State back → `/popup/settings/developer`; `route-guard.ts:58` unchanged | lead, owner via Ask C | keep `/popup/settings/profile`; guard to the hub | Change password and Delete profile → Ask C, owner confirmed Settings; C9 rejected (Account State target is not a UI change) |
| 3 | One testid per element; Back up and Change password keep `backup-link-btn` and `change-password-link-btn` (owner, Ask D); new `setting-nav-{lock,privacy,display,developer,about}`, `lock-now-btn`, `explorer-*`, `setting-nav-advanced-account-state`, `profile-card-avatar`, `identity-type-row`, `setting-value` | lead, owner via Ask D | two testids per element (impossible); the lead decides without the owner (C8's first resolution); `setting-nav-change-password` and `setting-nav-backup` (Ask D's alternative) | C8 superseded by S7 (Ask D, owner kept the existing ids); `setting-value` added (F3) |
| 4 | One C1 lock composable, client passed in, one instance per component, explicit imports | lead | module singleton; Lock page calls the header via an event; a second copy | kept; F10 and F11 adopted; C1 corrected the completion text; see rows 18, 19 and 23 |
| 5 | `SettingItem` `value` prop; hub reads four keys through its existing client; nothing until read; read independent of the Proving row | lead | `#right` slot recipe per row; a Pinia config store | kept; F3, F15 adopted; see rows 20 and 22 |
| 6 | Profile card = `SettingItem size="large"` + `AccountAvatar` in `#icon`, fallthrough testid override; icon box relaxed only for `#icon` rows; `profile.name` passed unchanged, so the avatar shows the shared two-letter initials | lead, refined in draft; avatar rule chosen by the lead, delegated by the owner (Ask B) | new card component; wrapper element; relax the box for every row; one letter, the first code point of the shared rule (the board) | kept; F6 adopted (box rule); F5 → Ask B, answered: the shared two-letter rule |
| 7 | Your profile: Name, ID, Type only | lead | keep a Security group | kept, no finding |
| 8 | Lock page: Lock now first and outside the load gate; strict mode hidden for passkey; Backup row removed; `follow-ups.md:141` stays open | lead, refined in draft | Lock now inside the gate | kept; F1 and F2 adopted (client, dispose on unmount) |
| 9 | Toggle binding split verbatim into three pages, bug pinned once in `privacy.test.ts`, follow-up re-pointed | draft (lead left it open) | one shared composable without the fix (plan-alt) | kept by both audits; C6 restated the bug's reach; F16 adopted (loop split on Display) |
| 10 | Danger zone = `ItemsContainer title="Danger zone" danger`; red icon via `#icon`, boxed at 20x20; label in the normal group color | lead, refined in draft | `SectionLabel`; `iconFillColor` (does not reach material icons); red label (fails AA in light) | owner answered Ask 2 (normal color) |
| 11 | Hub stays an explicit template; About becomes a `SettingItem` row with `setting-nav-about` | lead | data-driven hub (plan-alt) | kept by both audits |
| 12 | E2E on new paths, no reliance on redirects; `openAccountState` helper; one redirect spec with `waitForHash`; one Lock now smoke through reopen and unlock; Tab lap with the kept ids; passkey variants in component tests | lead, refined in draft | keep `navigateToSettings` callers unchanged (impossible) | F3, F4, F12, C10, C11 adopted; S3 adopted (About by `setting-nav-about`, never by href) |
| 13 | Docs and comments updated, including `SECURITY.md`, `ARCHITECTURE.md`, `FIREFOX.md`, `PRF-NON-PORTABLE.md` and the e2e comments; privacy wording scheduled in `BEFORE-LAUNCH.md` | lead, widened in draft | leave stale docs; a 1.1.2 patch in this PR | owner answered Ask 3 (fallback: `BEFORE-LAUNCH.md`); F14 adopted; F9 moot |
| 14 | Throwaway screenshot spec; private Artifact linked from the PR | lead | Storybook page stories; committed captures | kept, no finding |
| 15 | UI impact table plus verbatim sign-off, answers and approval-gate verdict; items off the board are Asks, all answered | lead | none | F8 adopted (no-description rows); C7 → Ask A, answered (hours) |
| 16 | Labels in `src/utils/settings-labels.ts`, never under `src/popup/pages/` (`.ts` files there become routes); auto-lock in minutes under an hour, then hours and minutes; a fractional minute shows the Lock page field's own text | draft, owner via Ask A | colocated helper in the pages dir; minutes only, as the Lock page shows them (the draft's default); `Intl.DurationFormat` (its output depends on locale and style, so it is not the signed copy); rounding a fraction to whole minutes (a product decision the fallback avoids) | kept; C7 and F8 put the format to the owner as Ask A, answered: hours |
| 17 | Single PR into `dev`, title `feat(settings): group settings by task` | lead | two arcs (plan-alt) | kept by both audits; F17 rejected (the `.gitignore` lines ride as their own commit) |
| 18 | Both lock callers pass `managers.profile`; `lock.test.ts` asserts the argument | audit (F1) | the Lock page's own `profileService` (its disconnect on unmount rejects the pending read and abandons the lock) | adopted |
| 19 | `dispose()` contract: idempotent; removes both listeners once no lock decision is pending (row 23); closes only its own confirm; a pending decision finishes and locks, or abandons when a confirm would be needed; the read's timer clears on settle | audit (C2, F2, S5), lead | cancel the pending read (drops the requested lock); clear the timer in `dispose()` (a hung read never settles) | adopted; S5 moved listener removal from the read's settle to the decision's end |
| 20 | Hub reads fenced: a key updated after a read started keeps its update; both orderings tested | audit (C5, F7) | accept the overwrite (premise false) | adopted; the refresh after a reconnect, first rejected, is adopted as row 22 (S4) |
| 21 | Hub value in an element with `data-testid="setting-value"`; e2e reads it under the row's testid | audit (F3) | read row text (breaks the e2e selector rule); `:data-value` on the row | adopted |
| 22 | The hub rereads config on every `onConnected` after the first; each read has a generation number and its own fence, so an older read never overwrites a newer one; tests cover a reconnect after a rejected first read and after a worker restart that drops an unpersisted value | audit (S4) | reread only on mount (a reconnect keeps the hub mounted, so a missed update or an unpersisted value would stay) | adopted |
| 23 | Lock listeners live until every pending lock decision finishes: a counter rises when `lock()` starts a read and falls in that decision's `finally`; after `dispose()`, the `finally` that reaches zero removes them | audit (S5) | remove them in the read's `.finally()` (a gap before the decision resumes, and a second overlapping decision left unguarded); remove them at `dispose()` (a session change during the read goes unseen) | adopted |

Disagreements: codex's first conditions named C8, C9 and C12, and the lead rejected all three. The final fresh codex pass reviewed those rejections. It raised nothing on C9, and it overturned C12 (S1, adopted) and C8 (S7, put to the owner as Ask D, who kept the existing ids). Opus's F17 stays rejected; it was not one of its conditions. None remains open.

## Audit verdicts

- Codex (`gpt-6.1-sol`, high): **conditional approve** (with conditions: address C1–C3, C5 and C10–C12; correct C4 and C6; record owner decisions for C7–C9 and the existing Asks before dependent implementation).
- Fable leg (Opus 5.5, Plan agent): **conditional approve** (with conditions: F1 pin `managers.profile` for both lock callers and test it; F2 dispose closes the instance's own confirm and the Lock page calls dispose; F3 give the hub value a testid and fix the redirect and value spec mechanics; F4 add lock-cancels-dapp-send and profile-switch-sweeps-transfer to the P3 proverless gate; F5 restate Ask 4 accurately; owner answers Asks 1–5, with F8 and F9 folded in, before P2).
- Final fresh codex pass (`gpt-6.1-sol`, high) on the consolidated plan and this ledger: **conditional approve** (with conditions: address S1–S7 and record the owner's answers to A–C before dependent implementation). All seven findings are adopted (second table below). Ask D, added for S7, joined A–C at the approval gate. The owner's answers to A–D are recorded (UI impact and Asks, 2026-10-08), which meets this pass's last condition.

Both audits kept the plan's structure over plan-alt's (unused infrastructure arc, data-driven hub, toggle composable without the fix, stub-page redirects).

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| C1 | High | Lock completion overstated: routing depends on the worker's event, and the header discards the lock request's promise; a persisted session can survive | Adopted. Data & control flow corrected; Security "Lock completion"; Facts 18 and 19; Inference 8; P1 step 7 pins the rejection path. No retry UI (that would be a new Ask). |
| C2 | Medium | `dispose()` has no ownership contract | Adopted with one change: a pending read finishes instead of being invalidated, because cancelling drops the requested lock (F1). Contract in Key interfaces; tests in P1 step 7; ledger 19. |
| C3 | Medium | Route tests do not prove the guard or the meta | Adopted. `apps/extension/src/popup/legacy-routes.test.ts` asserts `isAuthRequired` and drives the real `createPopupGuard` (Algorithms; P2 step 12). |
| C4 | Low | "No query forwarding" is false | Adopted. Security "Redirects" corrected (vue-router 5.2.0 is installed, not 5.1.0; same behavior); the `?redirect=https://example.org` case is in the same test. |
| C5 | Medium | A stale snapshot can overwrite a newer event | Adopted: snapshot fence and both orderings (ledger 20; P2 steps 14 and 18). Its "refresh after reconnection" was first rejected; the final pass showed the hub stays mounted across a reconnect, so it is adopted as S4 (ledger 22). |
| C6 | Low | A remount does not repair a failed-write value | Adopted. Inference 6 restated. |
| C7 | Medium | Rounding of positive timeouts is a product decision | Adopted as Ask A. Answered at the approval gate: hours from 60 minutes; a fractional minute keeps the Lock page field's own text, so no rounding rule is added. |
| C8 | Medium | Dropping `setting-nav-change-password` needs owner approval | Superseded by S7: owner exception requested (Ask D); the owner kept `change-password-link-btn` and `backup-link-btn` at the approval gate. First rejected on the ground that testids are the lead's call; the final pass showed the board's testid table names both ids, and the owner's answers do not amend it. |
| C9 | Medium | Account State's back target is an unlisted Ask | Rejected. Not a UI change: the same page shows either way, and the old target would only redirect there. Lead decision, kept. |
| C10 | Medium | The Tab lap skips three kept ids | Adopted (Algorithms "Tab lap"; P3 step 4). |
| C11 | Medium | The Lock now smoke proves less than the header test; no confirm or Terms scenario | Adopted in part. The smoke continues through close, reopen and unlock (P3 steps 9 to 11). The running-send confirm through the new row is one shared code path: composable tests plus the Lock page wiring test cover it, and `network/lock-cancels-dapp-send.test.ts` keeps the header path. Terms: `legal-acceptance.test.ts:287` (S8) already proves the header lock after "Not now"; the Lock page's behavior is unchanged, so no new test (Security "Terms sheet"). |
| C12 | Low | Close-out deletes the phase logs | Superseded by S1: adopted. First rejected on repo practice (`implementations-plan/README.md:10`; 237 of the 238 archived directories hold only `plan.md`). The owner's standing rule that raw phase logs travel into the archive intact wins, and the plans gate allows them. Close-out step 5.1 keeps `lessons/`; its front-matter wording is fixed too. |
| F1 | High | The Lock page might pass its own client, so unmount abandons the lock | Adopted (Proposed architecture; ledger 18; P2 step 3; P2 step 22). |
| F2 | Medium | A Lock page confirm can outlive its listener | Adopted (dispose contract points 3 and 4; P2 step 3; P1 step 7). |
| F3 | Medium | The hub value has no testid; the redirect spec races; the Lock now smoke assumes a state | Adopted (`setting-value`; `waitForHash`; `ensureUnlocked`; P3 steps 5 to 11). |
| F4 | Medium | The P3 gate skips the e2e that drive the lock's confirm path | Adopted (P3 gate, at `NULO_E2E_RETRY=0`, both browsers). |
| F5 | Medium | Ask 4 gave a false reason | Adopted: restated as Ask B. Answered at the approval gate: the shared two-letter rule. |
| F6 | Low | Relaxing the icon box changes every row | Adopted: the box stays fixed except for `#icon` rows. While verifying, the Delete row's red icon turned out to use `#icon` too, so the hub boxes it at 20x20 (Inference 4; P2 step 16). |
| F7 | Low | Inferences 5 and 6 rest on wrong premises | Adopted: both restated. |
| F8 | Low | Ask 1 covers only 0; two rows need "no description" | Adopted: Ask A, answered at the approval gate (hours); the UI table says Change password and Delete profile have no description line. |
| F9 | Low | The legal steps miss the version-history row | Moot: Ask 3 resolved without a legal edit. The `BEFORE-LAUNCH.md` entry names the history row. |
| F10 | Low | An auto-imported composable could be stubbed in tests | Adopted: explicit imports in `Header.vue` and `lock.vue` (P1 step 4; P2 step 3). |
| F11 | Low | The composable test is below the 10-case floor | Adopted: 18 cases listed (P1 step 7). |
| F12 | Low | The Tab lap never sees three rows | Adopted with C10. |
| F13 | Low | P1 gate misses Storybook and the build; typecheck skips e2e | Adopted (P1 gate; P3 pass criteria; Fact 21). |
| F14 | Low | Stale comments and a test title | Adopted (change map). Verification also found `sw-resilience.test.ts:114,128,148`, added. |
| F15 | Low | A hanging config read could freeze the Proving row | Adopted (Hub values; P2 steps 14 and 18). |
| F16 | Low | "Lists" needs the toggle loop split | Adopted (P2 steps 5 and 6). |
| F17 | Low | An unrelated `.gitignore` edit in the worktree | Rejected. The `narration.mp3`/`narration.mp4` lines are required by the plans hygiene rule the lead follows; they ship as their own `chore(plans)` commit in this PR. |

Final fresh codex pass, findings S1–S7:

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| S1 | Medium | C12's rejection conflicts with the owner's rule that raw phase logs travel into the archive intact | Adopted. Close-out step 5.1 keeps `lessons/phase-N.md` intact in the archive and still condenses `plan.md`; C12 superseded. |
| S2 | Low | P1's "no change to `auto-imports.d.ts`" criterion is wrong: the new composable and label module change it | Adopted. P1 step 15 and gate: commit the regenerated declarations, then a second build changes nothing. Verification found `.eslintrc-auto-import.json` regenerates too, so it is in the criterion (Fact 27). |
| S3 | Low | The About row stays selected by its href, which the e2e selector rule forbids | Adopted. Both sites, `navigation.test.ts:24,71`, select `setting-nav-about` (Fact 26; change map; P3 step 4); recon corrected. |
| S4 | Medium | Rejecting a reread after a reconnect leaves hub values stale: the hub stays mounted, a restarted worker loads stored config, and missed updates are not replayed | Adopted. Reread on every `onConnected` after the first, with a fresh fence per read and a generation check (Hub values; Algorithms; P2 steps 14 and 19; Fact 24; Inference 6; ledger 22). The config-toggle write bug stays deferred. |
| S5 | Medium | Removing the lock listeners when the read settles opens a gap before the decision resumes, and leaves an overlapping decision unguarded | Adopted. Pending-decision counter, removal in the outer decision's `finally` (dispose contract points 2, 4 and 5; Inference 9; P1 step 7; ledger 19 and 23). Outcome & Quality Bar item 2 now says leaving the page abandons a decision that needs the confirm. Verified: port events arrive as tasks, so only an `onDisconnected` fired by a synchronous `disconnect()` call can land in the first gap; the overlap gap lasts up to 3 s. |
| S6 | Low | Inference 5 says the hub writes `prestoReached`; the hub calls only `start()` (`settings/index.vue:25,31`), and `check()` writes (`usePrestoCheck.ts:47`) | Adopted. Example removed; another popup or the side panel justifies the fence. |
| S7 | Medium | C8 cannot be rejected by calling the board's testid table non-binding: it lists `setting-nav-change-password` and keeps `change-password-link-btn` | Adopted. Ask D put it to the owner, with the same choice for Back up; the owner kept both existing ids. C8 superseded. |

### Implementation review

Codex (`gpt-6.1-sol`, high), read-only, on the net diff from `50540c8` with this plan and the two review rules ([phase 5](lessons/phase-5.md)).

- Round 1, fresh session: **approve**. "No new material findings in A–E." No fix.
- Round 2, resumed and adversarial: **conditional approve** (with conditions: address R1 before relying on the Lock now smoke; correct R2's restart-recovery claim). Both were addressed in one fix commit.
- Round 3, resumed on the fix diff: **approve**. "No new material findings." One caveat kept without change: the live redirect awaits `getProfiles()` under a 60-second transport timeout, so R1's 15-second wait has no proven upper bound; four runs took 3.8 to 4.3 s.

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| R1 | Medium | `waitForLockScreen` reloads when the hash is not on auth, so the Lock now smoke would pass if the live redirect never happened | Adopted: `wallet-lock.test.ts` waits for `#/popup/auth` on the live page right after the click, before the helper; three Chrome runs and one Firefox run passed |
| R2 | Low | Inference 6 said the attempted value does not outlive a worker restart; a rejected reconnect read keeps it | Adopted: it outlives the restart only until the first successful reread |
| R3 | Low | Five comments to delete or tighten | Adopted: two test-file summaries, the `readAnswers` helper line, the `IconSlotAndDanger` story line, the composable's TSDoc recap and the session-change comment |

The round's proofs of safety and the two limits inherited from the header chip are in [phase 5](lessons/phase-5.md).
