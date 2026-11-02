---
plan: fu2-security-1
tier: light
status: arc 1 in review (Codex loop converged); arc 2 next
issues: "#1528 #1529 #1530 (arc 2), #1531 #1532 #1533 #1534 (arc 1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high audit round trip + Opus Plan leg; final fresh Codex pass
base: origin/dev at 1e6c5bc1f
trunk: dev
post_implementation_hardening: not scheduled
---

# fu2-security-1: the lock screen's recovery link, Delete profile's checks, the password toast, and the backup screens

Seven signed picks from decision page 93 (First users lab 1, signed 2026-11-02). Arc 1 ships the four backup picks; arc 2 the three security picks. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are under `apps/extension/` unless they name a package.

## The issues, checked

- **#1528 (P93-22), demonstrated** by three lab users, and in the code: `auth.vue:447-461` puts "Delete profile" first under Continue's form. The hint is a `Tooltip`, which opens on `focusin` (`packages/design/src/ui/Tooltip.vue:178`). Which path focuses the button after a restart is unverified; B removes the tooltip, so no path can open the hint.
- **#1529 (P93-40), demonstrated:** `reset.vue:322-323` holds the third box; nothing explains a disabled button after a mistyped name.
- **#1530 (P93-72): did not hold as reported.** `change-password.vue:75` already toasts "Profile password changed" before `router.back()`. A success toast closes after 2 s (`SUCCESS_TOAST_MS`), so the lab's later screenshot missed it. What remains is the wording.
- **#1531 (P93-27), demonstrated:** both profile types end in Protect then Download (`full.vue:324-377`); a passkey profile shows "Backup is ready" before any password.
- **#1532, #1533, #1534 (P93-37, 38, 59), demonstrated** at `export/index.vue:19-37`, `full.vue:185-197` and `useFullBackupExport.ts:434`.

## Outcome & Quality Bar

- **For whom:** a first-time user locked out, deleting, changing a password or making a backup, often unsure what each control does.
- **Excellent:** every copy string ships word for word as signed, with no em dash joining clauses; the delete path and the backup file keep every check they have today (the same card, boxes and name gate; only the sealed file leaves the page); each surface's before and after capture is in the PR.
- **Good enough:** no layout change beyond what the picks and their renders show.

## Assumptions

**Facts** (verified at `1e6c5bc1f`)
1. The seven picks are quoted from the page record (UI impact below). The owner signed after seeing their renders, which keep `.reset_link`'s style on the link, drop the passkey profile's "Backup is ready" banner and the empty "Backup" label, show "Repeat password" above the second field, and wrap the three mode lines.
2. Password profile: Agree, Unlock + Create Backup, Protect (sealed under the profile password), Download. Passkey profile: Agree runs the passkey and the build, then File password, Protect, Download (`full.vue:96-99`, `:324-377`).
3. `runDownload` reads only the sealed file and refuses unless the status is `encrypted` (`useFullBackupExport.ts:425-433`). For a password profile, `runEncrypt` and `runDownload` re-check the session the backup was made in; for a passkey profile that check returns true at once (`:368-376`), and the page's synchronous reset on a profile or unlock change protects it (`full.vue:142-151`). A file already handed to `downloadFile` still lands after a later change (`useFullBackupExport.test.ts:483`, `:505`).
4. `downloadFile` uses `chrome.downloads.download` with no `conflictAction` (`src/utils/files.ts:36-90`); the API's default makes a repeated name unique and needs no user activation (platform documentation: the e2e stubs this call, `tests/e2e/helpers/download-capture.ts:23`, so it proves only the bytes and the requested name).
5. A `SettingItem` description is one ellipsized line at 359 px and wider (`SettingItem.vue:312-321`); `FilePasswordSection` also serves Account export (`export/account.vue:426`).
6. `auth.vue:430`'s unfinished-import line says "Delete it below"; a retired profile's Delete page says "This profile has no recovery phrase" (`reset.vue:342`).

**Inferences:** I1. Every network export goes through `helpers/backup-export.ts`, so one network file proves the password branch of the helper; the passkey branch is proven by the smoke files.

**Asks:** OA-1, OA-2, OA-4 and OA-5 (arc 2), OA-3 (no arc). Each arc builds the "ships now" form.

## Decisions

- **D1. Arcs.** Arc 1 = #1531-#1534 (no owner ask on its surfaces). Arc 2 = #1528-#1530 (OA-1, OA-2, OA-4 and OA-5 in their "ships now" form). Arc 1's open details are readings of the signed render (R1-R4 under UI impact), not asks.
- **D2. One action, no new state.** `useFullBackupExport` returns `protectAndDownload()` in place of `handleEncrypt` and `downloadBackup`: it takes `ctx.runs.snapshot()`, runs `runEncrypt` when the status is `finished`, and runs `runDownload` only if that snapshot is still current and the status is `encrypted`. The snapshot is the existing fence: a press started before a reset can never start a later run's download. A failed download keeps `encrypted`, so the same press retries the download only. `showRecommendation` and the `backup-ready-banner` go.
- **D3. The password profile (closest reading).** The item is titled "The full backup's last steps"; C merges those two, Protect and Download. Unlock and Create Backup stay, so the build's warnings still show before the file exists. The single button replaces Protect and Download; "Protect your backup" goes with the passkey banner, since it describes a step that no longer exists. The file is sealed under the profile password as today.
- **D4. The button.** `download-backup-btn`, `cta`, reads "Creating Backup…" during the build, "Encrypting…" while sealing (today's words), else "Download protected backup". Disabled while busy, while downloading, and for a passkey file password that fails `canEncrypt`. Enter on `finished` or `encrypted` calls `protectAndDownload`. `protect-password-btn` goes.
- **D5. Labels.** The "Backup" label shows only while its section holds a banner (the four warnings and the done banner are unchanged and still show before and after the press). The section's wrapper stays: its divider above "File password" is in the signed render. `FilePasswordSection` takes a boolean `labelRepeat`; with it, "Repeat password" sits above the second field (OA-3 may retire the flag).
- **D6. Mode lines.** `SettingItem` takes a boolean `wrapDescription`, which applies only the description's wrap declarations (`white-space: normal; overflow-wrap: break-word`) at every width. Rejected: a page `:deep` rule (couples to the child's internals); wrapping every description (changes other screens).
- **D7. File name.** `fullBackupFileName(now)` in `src/utils/full-backup-helpers.ts` returns `nulo-backup-YYYY-MM-DD.txt` from the local date; gzip makes it `.gz`. The render lane read `<date>` the same way.
- **D8. Lock screen.** The `Tooltip` goes; `auth-reset` stays a `<button>` with `.reset_link`, reads "Forgot your password?" or "Lost your passkey?", opens the same card, and is hidden in place (`.unknown`) until the profile is known, as the heading and form are, so it never shows the wrong question. A profile that never becomes known also hides the card's mail link: OA-4. The card is unchanged (P93-39 was signed A).
- **D9. Delete page.** The third box's words change. "Doesn't match {name}" shows while the typed text is non-empty and not a prefix of `target.name`, the captured name the gate compares (`reset.vue:44`, `:102`): a lookalike or a typo shows it at once, a name still being typed does not (OA-5's "ships now" form). It follows ProfileNameField's `txt-danger` line with `role="alert"` (the pattern, not the component); the input gets `ariaInvalid`; the line's testid is `reset-confirm-mismatch`. The box and name gate are unchanged.
- **D10. Toast.** The label becomes "Password changed"; nothing else changes.
- **D11. Tests.** Component tests carry the copy and the rules: T1 `full.test.ts` (P93-38's words and "Continue", single button per profile type, the four warnings still shown before the press, retry after a failed download without a second seal, a failed seal, the label rule), T2 `useFullBackupExport.test.ts` (the downloaded data is the sealed text; a stale press after a reset and a successor's failed download starts no download; a password change before, during and after the seal refuses as today; one superseded-run row per new `await`, with the guard's count raised to match, `:628-631`), the ported uses of `handleEncrypt` and `downloadBackup`, `full-passkey.pins.test.ts` retargeted through the one button with every password-change pin kept (`:585`, `:595`, `:605`, `:623`), deferred mocks holding open the windows that two presses used to give and an invalid file password refused, T3 `full-backup-helpers.test.ts` (`fullBackupFileName` under a non-UTC `TZ`, at a local time whose UTC date differs), T4 `FilePasswordSection.test.ts` (label with and without the flag, bringing it to the 10 cases an L3 composite needs), T5 an `export/index.test.ts` (three lines, FAQ line, wrap flag), T6 `auth.test.ts` (link text per type, hidden while unknown, no tooltip; the focus check at `:1202-1209` moves to a known profile), T7 `reset.test.ts` (the third box's words; the mismatch line absent when empty, equal or a prefix, present for a lookalike), T8 `change-password.test.ts` (hoisted spy, label). Each new assertion fails on the base copy.
- **D12. E2E: no new scenario.** Helpers and specs follow the new controls and words. `tooltips-glossary.test.ts`'s lock-screen test keeps its Space press, first Escape and focus return on the real lock screen, retitled, and drops only its tooltip checks.
- **D13. Arc 1's deviations from the file map.** `tests/e2e/helpers/download-capture.ts` takes a `withinMs` window, which the full-backup helpers set to 90 s (the old seal wait plus the capture), since one press now seals before it saves; `tests/e2e/helpers/profile-chaos/model.ts` cites three composable lines, which moved; `scripts/e2e/file-accept.test.ts`'s example name is the new one; the composable's `canDownload` went with the second button. Two extra after pictures: the retry state and the FAQ line below the fold.

## Architecture & Implementation

| Arc | Files | Change |
|---|---|---|
| 1 | `src/composables/useFullBackupExport.ts`, `src/popup/pages/settings/security/export/full.vue` (+ `full.test.ts`, `full-passkey.pins.test.ts`, `useFullBackupExport.test.ts`) | D2-D5, D7's call, P93-38's copy and "Continue" |
| 1 | `src/components/composite/FilePasswordSection.vue`, `src/components/ui/Settings/SettingItem.vue`, `export/index.vue`, `src/utils/full-backup-helpers.ts` (+ tests) | D5, D6, D7 |
| 1 | `tests/e2e/helpers/backup-export.ts`, `helpers/profile-chaos/backups.ts`, `security-backup`, `backup-roundtrip`, `passkey-backup` specs | one press per download; retired testids and banner out |
| 2 | `src/popup/pages/auth.vue`, `settings/security/reset.vue`, `change-password.vue` (+ tests) | D8-D10 |
| 2 | `tests/e2e/tooltips-glossary.test.ts`, `security.test.ts`, `imported-account-lifecycle.test.ts`, `helpers/profile-chaos/drivers.ts` | D12, the toast's words |

Simpler alternative considered: one combined method inside the page. Rejected: the run fences live in the composable.

## UI impact

Sign-off, decision page 93, signed 2026-11-02, quoted:
- **Arc 1.** P93-27 C: "One step: “File password” and “Repeat password”, then a single “Download protected backup” button." P93-37 B: "One line under each (Full Backup “Everything in this profile, in one password-protected file.”, Recovery Phrase “The 24 words that restore your accounts.”, Account “One account in a file you can import elsewhere.”) and the FAQ line becomes “Questions about backups”." P93-38 C: "B without the “agree to all risks” sentence." (B: "“This file restores everything in this profile, spending included. You protect it with a password next. Anyone with the file and its password can spend your funds.” over “Continue”.") P93-59 B: "“nulo-backup-<date>.gz”, without the profile name."
- **Arc 2.** P93-22 B: "“Delete profile” becomes a quiet “Forgot your password?” (or “Lost your passkey?”) link further down that opens the recovery card, and the hint opens only from it." P93-40 C: "Only the reworded box and the mismatch line." (from B: "the third box reads “I have my recovery phrase or a full backup”, and a mismatched name shows “Doesn't match Main”"). P93-72 B: "A success toast, “Password changed”."
- **Readings of open details, each shown in the PR's pictures.** Arc 1: R1 the password profile's flow and its finished state, which the render did not draw (D3, D5); R2 the FAQ line is the container's description under the row, whose title stays (render); R3 "Before you continue" stays over the new words (render); R4 `<date>` is the local `YYYY-MM-DD` (D7). A failed download leaves the done banner's "Backup is successfully encrypted" with the button to retry, and a successful one passes through that state for a moment, as today's encrypted state. Arc 2: D8's hide-until-known (OA-4) and D9's trigger (OA-5). Surfaces: Back up profile, Full backup (both profile types, every state), the downloaded file's name; the lock screen, Delete profile, the toast after Change password. OA-1 to OA-5 hold the rest.

## Security & Adversarial Considerations

- **Threat model:** a person, or someone at their unlocked screen, holding the backup file or the Downloads listing. The file holds the master key and every key, so the invariant is that only its sealed form leaves the page. D2 calls the two fenced runs in order and adds no path: `runDownload` still refuses without a seal; a password profile's session is still re-checked after the seal and before the download, and a passkey profile is still reset by the page on any profile or unlock change. A file already handed to the browser still lands after a later change, as today. T1, T2 and the pins test hold it.
- **Privacy:** the file name drops the profile name; the date replaces a timestamp that already dated it.
- **Deletion stays gated** by the card, three boxes and the exact name; the mismatch line echoes a name the page already shows, through Vue text interpolation.
- No permission, storage shape, message, log line, dependency or CSP change. Known limits: none.

## Phase 1 (arc 1): the backup screens ✓

1. Before any edit, write a scratch capture spec under `~/.cache/nulo-backlog/fu2-security-1/capture/` on the smoke harness (`registeredExtension`, the default 360 px popup, light theme, `shotSend`'s settle and screenshot steps), copy it into `tests/e2e/`, and run it on an armed Chrome build made from this base: Back up profile, the warning, both profile types' finished and done states, and the requested file name. Never commit it. Time Phase 2's touched smoke files at the base on both browsers. Both runs reproduce the lab's screens.
2. Add T1-T5 and the pins test's ports; run them on the base code; require each new assertion red. Commit.
3. Make D2-D7 and P93-38's copy. Require T1-T5 green. Commit.

**Gate:** `bun run audit:vue` (typecheck, tests and lint, then build); `(cd apps/extension && bun --bun vitest run src/popup/pages/settings/security/export src/composables/useFullBackupExport.test.ts src/components/composite/FilePasswordSection.test.ts src/components/ui/Settings src/utils/full-backup-helpers.test.ts src/utils/copy-dash-ban.test.ts src/utils/red-text-ban.test.ts src/utils/type-role-ban.test.ts src/utils/toast-call-sites.test.ts --retry=0)`; `bun run test:all`. Pass: every command exits 0; T1-T5 red before, green after.

## Phase 2 (arc 1): e2e and evidence ✓

1. Update the e2e helpers and specs (table). Warning: `e2e:agent` writes its build into `dist/<browser>`, so run the network file before the armed smoke build. Run `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/backup-restore-integrity.test.ts --retry=0`, then with `NULO_E2E_BROWSER=firefox`.
2. Build armed: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`, then `build:firefox` the same way.
3. Fast feedback, then the gate, all from `apps/extension` with `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1`, on Chrome then with `NULO_E2E_BROWSER=firefox`, at retry 0:
   - the touched files: `bun run test:e2e -- tests/e2e/security-backup.test.ts tests/e2e/backup-roundtrip.test.ts tests/e2e/passkey-backup.test.ts tests/e2e/backup-imported-account.test.ts tests/e2e/legal-acceptance.test.ts tests/e2e/toolbar-panel.test.ts tests/e2e/own-window.test.ts tests/e2e/passkey-retry.test.ts --retry=0`; record each browser's wall-clock against step 1's base timing;
   - the profile chaos, which no CI lane arms: `NULO_E2E_CHAOS=1 NULO_E2E_CHAOS_SEED=1 NULO_E2E_CHAOS_RUNS=5 bun run test:e2e -- tests/e2e/profile-chaos.test.ts --retry=0`. Read the records under `.e2e-state/profile-chaos/` and require a completed `exportBackup` step and one with `variant: "short"`; if one is missing, run the next seeds until it appears, and record the seeds. A red seed is rerun at the base; one that reproduces there is pre-existing, is filed, and does not block;
   - the full smoke suite, as CLAUDE.md requires before a user-visible PR: `bun run test:e2e -- --retry=0`; record its wall-clock.
   `update-replay.test.ts` runs only with a recorded release, so it is not run; the PR says so.
4. Rebuild armed from the head and run the capture spec; delete it; require `git status` to list nothing untracked under `apps/extension/tests/`. Copy the light Chrome pictures to `implementations-plan/fu2-security-1/screenshots/` as `<surface>-before.png` and `-after.png`.

**Gate:** Phase 1's gate; steps 1 and 3 green at retry 0 on both browsers (a pre-existing chaos red excepted as step 3 says); `bun run check:plans` after staging. Pass: all green, the chaos records show the required steps, and every arc 1 surface has a before and after picture.

## Phase 3 (arc 2): the lock screen, Delete profile, the toast

Steps 1-3 as Phase 1, for arc 2's surfaces: before pictures (lock screen of both profile types, Delete profile with a mismatched name, the toast captured inside its 2 s), T6-T8 red then green, D8-D10. **Gate:** Phase 1's commands with `src/popup/pages/auth.test.ts src/popup/pages/settings/security src/popup/components/popups/ForgotPasswordPopup.test.ts src/components/Popup/Popup.tooltip.test.ts` in the vitest list instead of the export paths.

## Phase 4 (arc 2): e2e and evidence

Phase 2's steps 2-4 with the touched files `tests/e2e/auth-flows.test.ts tests/e2e/tooltips-glossary.test.ts tests/e2e/security.test.ts tests/e2e/imported-account-lifecycle.test.ts tests/e2e/security-reset.test.ts`, the profile chaos requiring completed `changePassword` and `deleteProfile` (`via: "forgot"`) steps, and the full smoke suite, on both browsers (the lock-screen link is focus and keyboard work), before and after timings, and arc 2's pictures. No network file: the network helpers press `auth-reset` by its kept testid. **Gate:** as Phase 2's.

## Delivery

- Arc 1: branch `fu2-security-1-a1` off this plan's commit; PR `fix(backup): one-step full backup, described modes, a named risk, a profile-free file name` (90), `Closes #1531 #1532 #1533 #1534`. Arc 2: `fu2-security-1-a2` stacked on it (off `dev` if arc 1 has merged, the add/add case), `fix(security): a recovery link on the lock screen, reworded delete checks, a password toast` (91), `Closes #1528 #1529 #1530`. Close-out: docs-only top layer `fu2-security-1-close-out`. `gh stack`; PRs ready, base `dev`, no label at creation.
- Body: what changed and why; the issue claims that did not hold (#1530); each pick quoted as in UI impact with its before and after pictures (`?raw=true` at the head SHA); the readings R1-R4 and OA-1 to OA-5 in their "ships now" form; the accessibility calls under the owner's 2026-10-19 delegation (D8's `<button>` and hide-until-known, D9's alert and `ariaInvalid`); runs and outcomes; each touched e2e suite's per-browser wall-clock before and after; ending `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Commits: conventional, lower case, signed, ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Parallelism: the arcs touch disjoint source files, but both run `profile-chaos` and the stack is serial, so no lanes.

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `1e6c5bc1f`. Specific here:
- Step 1 is absent (`code_review: off`). Step 2 runs per arc at its boundary over `git diff <arc base>...HEAD`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; one Opus 5.5 diff review (`general-purpose`) beside round 1. After arc 2, one fresh Codex session over the net diff for cross-arc issues. Prompts under `~/.cache/nulo-backlog/fu2-security-1/`. Hard stop at three rounds; each round in `lessons/phase-N.md` and the table below.
- Approval boundary (a plan change; stop): any copy beyond the quoted picks and the "ships now" forms, a change to the recovery card, a new step or state in the backup run (D2's reuse of the existing fence is in scope), a width rule in `SettingItem` beyond D6, a new e2e scenario.
- Close-out: the Outcome; OA-1 to OA-5, if still open, filed as one `owner-decision` issue; a comment on #1529 about P93-13's superseded words; lessons promoted within the 8 KiB budget; `STATUS.md` deleted; `git mv` into `archive/`, index line moved. Teardown after the merge: `agent-worktree done fu2-security-1 --merged`, trunk `dev`; the archived plan is `implementations-plan/archive/fu2-security-1/plan.md`.

## Audit verdicts

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| plan 1 | Codex, gpt-6.1-sol (session 01a19d43) | conditional approve | D2's stale-press fence on the existing `ctx.runs`; Facts 3 and 4 corrected (passkey session check, stubbed downloads); I1's timing dropped, I2 narrowed; T3 under a non-UTC `TZ`; D9 compares `target.name`; the pins test named and ported; D12 retargets instead of deleting; `own-window`, `passkey-retry` and the network file on Firefox added; the capture spec written, built from base and head; OA-4 | removing the empty section's wrapper: the signed render shows its divider above "File password"; full smoke suites run locally on both browsers (reversed in final 1) |
| plan 1 | Opus 5.5 (Plan) | conditional approve | the await-count guard's rows; the composable returns only `protectAndDownload`; Fact 3; T4 to 10 cases; T6's focus check; T1 and T7 assert the new words; the mismatch testid; `audit:vue` in the gates; D9's trigger as OA-5, shipping the prefix-quiet form; D3, the FAQ line and "Before you continue" recorded as readings R1-R3 | D3 and the FAQ line as owner asks on arc 1: the lane's rule takes the closest reading of an option's open detail and says so, both follow the pick's title or the signed render, and the PR shows their pictures |
| final 1 | Codex, gpt-6.1-sol, fresh (session 01a19d50) | conditional approve | `profile-chaos` runs only with `NULO_E2E_CHAOS=1`: armed with a recorded seed, and its records must show the touched actions; the full smoke suite runs locally on both browsers before each PR (CLAUDE.md § Quality gates), reversing round 1's rejection on that evidence. D2, the readings, OA-3's scope and the kept wrapper verified | none |
| final 2 | Codex, resumed | **approve** | both conditions verified; no new finding or regression | none |
| arc 1, round 1 | Codex, gpt-6.1-sol (session 01a19d82) | **approve** | three comment fixes: a stale "Protect with Password", a stale plaintext-download line in `runEncrypt`, two narrating comments | none |
| arc 1, round 1 | Opus 5.5 (general-purpose) | conditional approve | a per-warning case for the "Backup" label rule (mutation-checked); the same-tick press comment corrected; the file-accept example name | an owner ask for the password profile's ready state: reading R1, shown and named in the PR; collapsing the one-child `Flex`: no visible effect, churn on a signed surface; a retry-state narrow-fit e2e: its parts are narrow-checked and the PR pictures the state |
| arc 1, round 2 | Codex, resumed | **approve** | `f14dc9f29` verified, the three rejections hold | none |

## Seeds (not run; orchestrator-owned)

```
/goal Phases 1 and 2 of implementations-plan/fu2-security-1/plan.md marked ✓ with their gates passing in the transcript; the arc 1 Codex loop (gpt-6.1-sol, high) converged; one ready PR against dev closing #1531 #1532 #1533 #1534 with before and after pictures; bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/fu2-security-1 per its plan.md and the README § Post-implementation standard at 1e6c5bc1f: run the gates, decide open questions with Codex (gpt-6.1-sol, high), open the arc's PR, never merge, never change copy beyond the quoted picks; stop once its checks are green and report.
```
