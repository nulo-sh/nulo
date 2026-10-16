---
plan: small-ui-fixes-1
tier: light (the lane brief's call; one Codex audit round-trip plus one Opus Plan lens)
status: planned, awaiting the orchestrator's approval (Codex approve; Opus conditional approve, conditions folded in)
issues: "#577, #565, #566, #567 (all arc 1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high + one Opus Plan lens
base: origin/dev at 7697c376; phase 4 starts only after harden-quality-fixes-1's PR is on dev
trunk: dev
post_implementation_hardening: not scheduled
---

# small-ui-fixes-1: four small fixes the owner already decided

One arc, one PR against `dev`, no stack, `Closes #577 #565 #566 #567`. Recon: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (OA-1, the off chip's height; the arc ships without it). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Outcome & Quality Bar

- **For whom:** a person who turned "Show network name" off; a person whose profile name has a space or a symbol and saves a backup; a person who locks the wallet while a JSON window is open; a person who cancels a duplicate warning and tries again.
- **Excellent:** each screen does what its control already says, with no new copy. Each fix has a test that is red on the base code and a success control beside it.
- **Good enough:** the header's `indicateFailures` read, the other 14 confirm sites (#543) and every other window stay as they are.

## Decisions (owner, quoted) and UI impact

- **#577, P25-09 = B** (page 25, 2026-10-16): "Make it work: off hides the network name in the header chip and keeps the status dot; on shows it, as today; the default stays on."
- **#577 chip height, OA-1 = P27-01 B** (page 27, 2026-10-16): "The chip keeps its height: the same bordered chip as with the name, at the same height, with only the dot centred inside, so the row of chips stays level."
- **#565, P25-11 = A** (page 25, 2026-10-16): "As the account export does: spaces and symbols become `_` (`My Main Wallet` becomes `My_Main_Wallet.json`); the three exports then agree."
- **#566, #567:** bugs with no owner choice; the fix restores what the screen already promises.
- **UI impact, header chip (#577):** off: the bordered chip holds only the status dot, centred, at the height the name gives it. On: unchanged. Sign-off: P25-09 B and P27-01 B, quoted in the PR body with the shots.
- **UI impact, saved file names (#565):** the full-backup and contacts files take the account export's rule. A name with combining marks (an accent typed as its own character, a Hindi vowel sign) gets `_` there too, as the account export does today; the PR body says so.
- **UI impact, Display (#577), JSON window (#566), duplicate warning (#567):** no visible change beyond the behaviour each screen promises; the Display toggle gains a testid only.

## Assumptions

**Facts** (verified at 7697c376):
1. `Header.vue:288` always renders the network name; its `showNode` ref (`:39,138,204`) has no reader. harden-quality-fixes-1 deletes that ref (`610fe048`).
2. `useConfigRead` re-reads on every reconnect and keeps a newer `onUpdate` (`composables/useConfigRead.ts:14-55`).
3. `full.vue:429` replaces the first space only; `useContactImportExport.ts:131` uses the raw name; `account.vue:177` holds the rule the owner chose. The rule maps a non-empty all-symbol name to `_`; only `""` becomes `profile`.
4. `subscribeActiveProfile` delivers the current state on subscribe and after each reconnect; an event between the first snapshot and the listener is lost, a documented edge (`profile/client.ts:61-96`).
5. `ConfirmPopup.vue:45` replaces `cacheStore.confirm` on close (pinned, `ConfirmPopup.test.ts:84`); `useProfileImportFlow.ts:100` writes into the object it captured at setup.
6. `NULO_E2E_SHOT_DIR` makes `shotSend` (`tests/e2e/fixtures/send-page.ts:224`) write a shot in both themes; it creates no directory.

**Issue claims checked:** #566 path (a) holds: the guard selects a profile for a route without `isAuthRequired` (`route-guard.ts:74-80`), so the boot settles (`lock-landing.ts:54`) and the window shows the operations; only a navigation the guard decided without its reads (`start-grace.ts`) can leave no profile, and the shell then routes to `/popup/auth` (`:53`). Path (b) holds the same way on a reconnect boot. A payload read that fails also never subscribes (`json/index.vue:29`). #567's `popup/pages/restore-again.vue` is no caller: it imports only `cappedBackupPick` and `useImportErrorState`; the callers are `onboarding/pages/import.vue:97` and `popup/pages/import.vue:136`.

**Inferences:**
- I1. With the toggle off, the name can show for one config read after Header mounts. At first boot that read most likely lands before the boot shows the chip. When the stale-network takeover clears, `<Header v-else />` (`app.vue:556`) remounts under a logged-in shell and the name shows for one read. Close-out files this as a closed `known-limit` issue.
- I2. Without a height rule the off chip is a small rectangle (6 px dot, 10 px side padding, 6 px top and bottom, 1 px border), shorter than the on chip by the label's line height minus 6 px. P27-01 B ships the rule; the phase 4 scenario asserts equal heights on both browsers.

**Asks:** OA-1 (the off chip's height), answered P27-01 B; D2's rule ships.

## Architecture & Implementation

- **D1 (#577).** Header calls `useConfigRead(configService, () => configService.getValue("showNode"), land)` in setup, before any request; `land` sets the ref unless `updatedSince("showNode")`. `void showNodeRead.read()` is the first line of `onMounted`, ahead of the raw `indicateFailures` read; `showNodeRead.dispose()` follows `configService.disconnect()`. `onSettingUpdate` gains the `showNode` case. The name span takes `v-if`. *Rejected:* an `app.vue` setting handler into `appStore` (a store field and its shape pin for one reader); `indicateFailures` on the same read (outside #577).
- **D2 (#577), OA-1 B.** `.network_chip` composes `type--tag` and takes `min-height: calc(1lh + 14px)`, pinned in `components/header-layout.test.ts`; equal to the on chip for the primary font, not a fallback glyph.
- **D3 (#577).** One smoke scenario in `tests/e2e/appearance.test.ts`. Failure mode: in the shipped bundle the Display write does not reach Header's own config port and template; the Header unit test mocks the client, and the theme e2e proves only `app.vue`'s client. It also drives the shots the UI rule requires, again for OA-1. Estimate 8 s per browser.
- **D4 (#565).** `profileFileNameSegment(name: string | undefined): string` in `utils/files.ts`, account.vue's rule verbatim: `(name ?? "").replace(/[^\p{L}\p{N}_-]+/gu, "_") || "profile"`. *Rejected:* `sanitizeString` (drops, keeps `.` and spaces); trimming edge `_` or adding `\p{M}` (both change the account export's names, which P25-11 A keeps).
- **D5 (#566).** Mount order: connect the profile client; `unsubscribe = await subscribeActiveProfile(onActiveProfileChanged)`; add `beforeunload`; read the payload with `.catch(() => undefined)` (a request the worker no longer holds leaves the window empty) and the interaction client closed in `finally`. Cleanup stays on `beforeunload`, as the logger's: the shell's navigation to `/popup/auth` can unmount the page while its profile read or a lock notification is pending, and an unmount cleanup that disconnects the client rejects that read (`emitSnapshot` catches it, `profile/client.ts:79-89`), so the window would stay open on an unlock page. One comment states this invariant, because the client's doc asks for `onBeforeUnmount`. The window's document owns the subscription; the browser closes the port with it.
- **D6 (#567).** `withDuplicateConfirm` assigns one whole typed object (`title`, `description`, `confirm_text`, `callback`) to `cacheStore.confirm` at each request, as `full.vue:449` does; `confirmSlot` goes. *Rejected:* #543's `requestConfirm` helper now (15 sites and a `CLAUDE.md` pattern change; no arc). The change leaves that helper a plain swap.

## Phases

### Phase 1: export file names (#565) ✓
1. Add `profileFileNameSegment` to `utils/files.ts`; call it in `account.vue:177`, `full.vue:429`, `useContactImportExport.ts:131` (keep `contacts.json` when the profile has no name).
2. In `useContactImportExport.test.ts:50` and `.pins.test.ts:39`, take the helper from `importOriginal`, never a stub.
3. `utils/files.test.ts`: one case per refused class (`: ? | " * < > \`; `/`; a `..` segment; `"?!*"` → `_`; `""` and `undefined` → `profile`); control: precomposed letters (`José`, `Ελένη`, `李`), digits, `_`, `-` unchanged, `My Main Wallet` → `My_Main_Wallet`. `full.test.ts`: a `Work: main` password profile reaches `downloadFile` as `NuloEncryptedBackup_Work_main_<ts>.txt`. `useContactImportExport.test.ts`: `Work_main_contacts.json`.

**Gate.** `bun run lint && bun run typecheck:all && bun run test`. Pass: exit 0; the two site cases fail on the base builders; `account.test.ts:124` passes unchanged. Layers: lint, typecheck, unit, component.

### Phase 2: the JSON window on lock (#566) ✓
1. Rewrite `popup/windows/json/index.vue`'s mount per D5.
2. `json/index.test.ts`: mock `subscribeActiveProfile` as `logger/index.test.ts:11` does, delivering a snapshot. Cases: a locked snapshot removes window 7; a rejected payload read with a locked snapshot removes it and leaves no unhandled rejection; a held snapshot that resolves locked after the page unmounts still removes it; control: an open snapshot renders `json-content` and keeps the window, then a live `undefined` removes it. Keep the three existing cases.

**Gate.** As phase 1. Pass: exit 0; the three lock cases fail on the base `index.vue`. Layers: lint, typecheck, unit, component.

### Phase 3: a second duplicate warning (#567) ✓
1. Replace the four field writes in `useProfileImportFlow.ts:130-146` per D6.
2. `useProfileImportFlow.test.ts`: `dismissDialog` also sets `useCacheStore().confirm = {}`, as `ConfirmPopup` does. New case: a duplicate naming `Main`, dismiss, import again with a duplicate naming `Savings`; the dialog carries the `Savings` description, `confirm_text` `Add anyway` and a callback; confirming retries with `allowDuplicate` `true`. The first-warning cases are the control.

**Gate.** As phase 1. Pass: exit 0; the new case fails on the base composable. Layers: lint, typecheck, unit.

### Phase 4: Show network name (#577), after harden-quality-fixes-1 merges
1. `git fetch origin dev && git merge origin/dev`; confirm `Header.vue` holds no `showNode`.
2. Header per D1; testids `network-name` (the label) and `network-status-dot`. `display.vue:230` maps `showNode` to `show-network-name-toggle`.
3. `Header.test.ts`: the config mock gains `onConnected`. Cases: stored `false` hides `network-name`, keeps the dot and the aria-label naming the network; control: stored `true` shows it; an `onUpdate` flips it. Red proof: the merged base Header plus only the two testids.
4. `appearance.test.ts` scenario: the on chip shows the name; switch off in Display; on Home the name is gone, the dot has a non-zero box, the aria-label still names the network; record both chip heights in `lessons/phase-4.md`; shot; switch on (the file shares one extension); the name is back; shot.
5. Shots, Chrome: `mkdir -p "$PWD/implementations-plan/small-ui-fixes-1/screenshots"` from the repo root, run the scenario with `NULO_E2E_SHOT_DIR` at that absolute path, names `577-chip-off-chrome` and `577-chip-on-chrome`, focus `network-button`. Commit the four PNGs.

**Gate.** As phase 1. Then per browser `b` in `chrome`, `firefox`, at load1 < 150: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<b>` (`build` for Chrome), then `cd apps/extension && env -u EXTENSION_PATH -u NULO_E2E_ARTIFACT_RUN NULO_E2E_BROWSER=<b> NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/appearance.test.ts --retry=0`. Pass: exit 0 on both; the scenario fails at the name check on the base Header plus testids; runtime recorded. Layers: lint, typecheck, unit, component, smoke e2e on both browsers.

### Pre-delivery gate
`bun run audit:vue && bun run test:all`, then the whole smoke suite on each browser (the phase 4 commands without the file argument), at load1 < 150. Pass: exit 0 everywhere; a red is a known flake (one rerun) or a fix.

## Security & Adversarial Considerations

- **Profile name → file name.** The name is user-typed and a restored backup carries it (`useFullBackupImport.ts:283` caps it at 32 characters but keeps spaces and dots). D4 maps every character outside letters, digits, `_` and `-` to `_`, so no name reaches a path separator, a `..` segment, a bidi or zero-width character, or a character the browser refuses. Each export keeps its fixed prefix and suffix, so no reserved Windows name forms.
- **Lock boundary.** D5 closes the JSON window on the lock state at mount and after every reconnect, also when the payload read fails. Over a wallet locked at mount, the payload can render for one read while the window closes. The client's documented lost-event window (Fact 4) stays as it is.
- **Confirm dialog.** D6 drops every field of an earlier dialog (`toggle`, `confirmation_text`, `single`, colours). The callback is the wallet's own code.
- **JSON content** stays text in the viewer; no HTML interpretation is added. **N/A:** cryptography, credentials, supply chain, logging (no new log line).

## Delivery

Single arc on `worktree-small-ui-fixes-1`. No PR until the pre-delivery gate passes and the Codex loop has converged. `gh pr create --base dev`, no labels, then add `e2e:extension-smoke` only if the path filter skips the smoke lane. Title (86): `fix(ui): network name toggle, export names, json window lock, second duplicate warning`. Body: per issue the change and why; the P25-09 B and P25-11 A quotes; OA-1 and what ships; the four shots; the validation runs with outcomes; the smoke job wall-clock per browser on the last `dev` run and on this PR; `Closes #577`, `Closes #565`, `Closes #566`, `Closes #567`; `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Then `gh pr checks <n> --watch`. No parallel lanes.

## Post-implementation

Execution contract: this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at 7697c376. Plan-specific values:

- Comments to the comment bar while coding; attempts in `lessons/phase-N.md`; `agent-worktree status small-ui-fixes-1 "phase N green: <next>"` at each gate. Three failures on one step: stop and reassess.
- Step 1 is absent (`code_review: off`).
- Step 2, once over the net diff from 7697c376 after the pre-delivery gate: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`; each later round `~/.claude/skills/codex/scripts/resume-codex.sh <session-id> <followup-file> <codex-dir> high`. Prompt: the diff, this plan, the adversarial ask and the standard's two rules verbatim. Hard stop at three rounds.
- Step 3, Delivery above. Step 4, close-out as the PR's final commits: file I1 as a closed `known-limit` issue (`Known limits: #N`); delete `STATUS.md`. Step 5, teardown: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/small-ui-fixes-1/plan.md`, then `agent-worktree done small-ui-fixes-1 --merged`.

## Audit verdicts

| Leg | Verdict | Record |
|---|---|---|
| Codex gpt-6.1-sol high, session `01a14563-8ea0-7561-b755-da911cb6a3a5` | conditional approve (C1-C8), then on resume **approve** | C1 path (a) holds via `route-guard.ts:74-80`: accepted, the claim corrected. C2 all-symbol → `_`: accepted. C3 read order, I1's flash: accepted (D1; I1 to a known limit). C4 the client's lost-event window: accepted as wording. C5 chip height is the owner's: accepted (OA-1). C6 `onBeforeUnmount` cleanup: argued against O7, **withdrawn** by Codex on resume. C7 pre-delivery gate: accepted. C8 shot paths: accepted. Resume R1 (the off chip is a rectangle; height falls by line height minus 6 px) and R2 (the D5 reason is navigation while a read is pending, not guard ordering): accepted; its deferred-snapshot test added to phase 2. |
| Opus 5.5 Plan lens | conditional approve (O1-O9) | O1 expectations and the password profile's file name: accepted; its combining-mark ask rejected (P25-11 A chose the account export's rule; the PR body states it). O2 payload catch: accepted. O3 UI impact lines, OA-1: accepted. O4 drop the scenario: rejected, the scenario stays for the Header-port path and the shots (Codex concurs). O5 red proof, O6 read order, O7 `beforeunload`, O8 smoke env, O9 `lh` rule for OA-1 B only: accepted. |

| Codex gpt-6.1-sol high, review round 1 over phases 1-3, session `01a14599-c2a6-79c1-851a-672a118e2627` | **approve**, two P3s, both fixed | Second-warning test asserts the dialog is open and two import calls before confirming; a narrating fake comment removed. [lessons/phase-3.md](lessons/phase-3.md) |
| Codex, review round 2 (resume, same session) over the fix diff bdaa8dd9 | **approve**, no new material finding | Round converged for phases 1-3. |
| Codex, review round 3 (resume) over phase 4's diff 12edeaad | changes needed: P2, P3 | P2 fixed in `useConfigRead` (a deviation, below); P3 fixed (the scenario waits for Home's hash). [lessons/phase-4.md](lessons/phase-4.md) |
| Opus 5.5 general-purpose review of phase 4's diff | request changes: one high, three lows, a nit | H fixed (no bottom nav on Display); fonts awaited before the first height; the `updatedSince` guard gets a Header case (mutation-checked); this plan carries P27-01 B; the CSS comment names the line-height condition. |
| Opus 5.5 general-purpose review of the same diff | approve, one medium, three lows | M fixed (the fake's disconnect now rejects the held snapshot; a mutation proves the case reds on an unmount disconnect); L1 fixed (doc: each run); L2 rejected (Security accepts the one-read render); L3 a deviation, below. |

Unresolved: none between the legs. Open for the owner: OA-1.

**Deviations from the plan (arc 1).** `useConfigRead` (round 3, Codex P2): a read rejected by a port that dropped between Ready and its deferred `onConnected` was never retried, so the first delivered open after the reconnect counted as the mount's and the default stayed; the composable now re-reads on that open when the newest read failed (one flag, its own test; the other six consumers change only on that path, by one read). Phase 4's scenario returns to Home with `navigateByHash`: Display renders no bottom nav. D5: the window keeps no `unsubscribe`; `onClose`'s `disconnect()` ends the subscription, and nothing reconnects after an explicit disconnect. Phase 2: the control (an open snapshot renders `json-content`, then a live `undefined` removes the window) is the first existing case with a `json-content` assertion added, not a fourth case.

## Seeds

```
/goal Phases 1-4 and the pre-delivery gate of implementations-plan/small-ui-fixes-1/plan.md marked ✓, each reported passing in the transcript; phase 4 started only after harden-quality-fixes-1's PR merged into dev; the Codex loop converged (a resumed pass with no new material finding, quoted); one PR against dev, opened after that, with the close-out commits on it; bun run test and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/small-ui-fixes-1 forward per its plan.md: read plan.md and lessons/ first; run the next pending phase and its gate; phase 4 waits until `git log origin/dev` holds harden-quality-fixes-1's squash; then the pre-delivery gate, the Codex loop, Delivery, the close-out; never merge; stop and report when the PR is green.
```
