---
plan: popup-followups-1
tier: light (the spawn prompt names it; one Codex audit at high on gpt-6.1-sol, resumed until approve, plus one Opus Plan lens)
status: approved by Codex R3; arc 1 in progress
issues: "#1473 (Closes); #1453 (context only, closed)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high + one Opus Plan lens
base: origin/dev at 67c1ac545
trunk: dev
post_implementation_hardening: not scheduled
---

# popup-followups-1: two config reads on `useConfigRead`, and Create profile on the shared password pair

Two owner picks left open by two archived lanes, both signed on 2026-11-03 at head `0b14e59c4`. **P104-01 = A** (page 104, 14:41 UTC): Home's balance hero and Holdings read their settings through `useConfigRead` ([OA-1](../archive/quality-popup-2/OWNER-ASKS.md), [design](../archive/quality-popup-2/plan.md), § Phase 5). The owner's note: "If it's not too complex, A sounds good. But I wouldn't add tons of complexity into our code just because of this." **P103-01 = B** (page 103, 14:02 UTC): "Use the shared pair. The first field gains the eye button and the lock-icon hint under it, as on New profile; the two headings stay." ([OA-1](../archive/quality-popup-1/OWNER-ASKS.md)). Recon and claim checks: [recon.md](recon.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Outcome & Quality Bar

- **For whom:** a person who changes "Show fiat values" or the dust threshold in another window while Home or Holdings is open, around a worker restart; a person creating a first password in onboarding.
- **Excellent:** (1) after a worker restart, the hero and Holdings show the stored setting, and an older read never puts back a value a newer change replaced, proven by component pins that are red on the base and green after. (2) Create shows the eye button and the lock-icon hint as New profile does, with both headings, the placeholders, the hint's words and every testid unchanged, proven by a component test and before/after captures.
- **Good enough:** `PopupManager` keeps its seed read (declined in the archived plan, D14); no other page changes.

## Assumptions

**Facts** (details in recon.md):
1. `BalanceView.vue:88-96` reads `showFiatValues` once at setup, with no `onConnected` re-read and no `catch`; `onConfigUpdate` sets the flag on each update.
2. `holdings.vue:79-104` reads both keys at setup and again on every `onConnected`, the first included (four reads at mount); each `then` lands its value even when an update came after the read began.
3. `useConfigRead` (`composables/useConfigRead.ts`) takes `(config, fetch, land)`; `land` receives `updatedSince(key)`; a failed fetch lands nothing; `createReconnectRead` counts the first `onConnected` as the mount's own. Nine views use it; `Header.vue:43-49` is the one-key pattern.
4. The background client reconnects by itself after a port drop and fires `onConnected` one task after Ready (`packages/extension-messaging/src/background/client.ts`, `onDisconnect`, `onReady`), so the re-read runs with no other request.
5. `create.vue:231-258`: two `Input`s under the headings "Password" and "Confirm password" (`Text variant="label-section" color="secondary"`, gap 8), placeholders "Strong password" and "Repeat password", and the hint as plain text under the second field, hidden while `isCreating`. `create.test.ts:370-377` pins "no length hint under the empty fields" while the create runs.
6. `NewPasswordPair.vue` puts its hint under the first field and always renders it; its `testids` has no key for the confirm field's native input, and its only repeat heading is `labelRepeat` ("Repeat password"). `keyboard-guards.test.ts:152-167` selects `onboarding-password-confirm-input`. `registration.test.ts` drives New profile's pair, an existing caller.
7. `.export_section_label`, the class on the pair's repeat heading, gets its secondary colour only from `CollapsingHeroLayout.vue`'s global style.
8. `tests/e2e/helpers/profile-chaos/model.ts:374-376` cites `create.vue` lines 151, 175 and 195.

**Inferences:**
- I1. A heading placed as a sibling in the pair's column would sit 12 px above "Confirm password"'s field, not today's 8 px, a layout change no pick names (Codex R1-1, Opus F2). D5's group keeps 8 px, so no owner question arises; the captures prove it.

**Asks:** OA-1 (OWNER-ASKS.md), found while building: what moves while "Creating..." shows. It blocks nothing; the as-built behaviour ships.

## Architecture & Implementation

Paths under `apps/extension/src/`. One arc, branch `worktree-popup-followups-1`, one PR to `dev`.

- **Phase 1, #1473 (P104-01).** Pins first, each parked read answering the value stored when it was called. Red on the base: (a) `BalanceView.test.ts`: a second `onConnected` with the stored flag flipped hides the fiat slot; an update during the mount's parked read wins over its older answer. (b) `holdings.test.ts`, once per key: an update to that key during the parked reads wins, while the other key's read lands its newly stored value (so a land that checks the wrong key fails). Success controls, green on both: in BalanceView, an update to an unrelated key during the read does not stop the land; in Holdings, the fiat read lands while the dust read hangs, then rejects, and the dust default stands (D2's guard). Then the move:
  - `BalanceView.vue`: `fiatRead = useConfigRead(configService, () => configService.getValue("showFiatValues"), land)` after the `onUpdate` listener, `land` skipping a key `updatedSince` names; `void fiatRead.read()` where the read starts today; `fiatRead.dispose()` after `configService.disconnect()`.
  - `holdings.vue`: one reader per key, both created before either reads; `readConfig` and its `onConnected` listener go; each `dispose()` after `configService.disconnect()`.
  - Test seams, each named in the commit: both config mocks hold per-client `EventHandler`s for `onUpdate` and `onConnected` and announce the first connect once per client on its first `getValue` (`useConfigRead.test.ts`'s harness); the hook counts that one as the mount's own. `BalanceView.test.ts`'s `configHandler` dispatches through the client's `onUpdate`, since the hook adds a second listener, and its config `onConnected` gets its own handle, apart from the balance client's `connectedHandler`. Holdings' tests read the newest client's events, so pages earlier cases left mounted hear nothing.
  - `useConfigRead`, `createReconnectRead` and the config client do not change (the owner's note; D3).
- **Phase 2, Create profile (P103-01).** `NewPasswordPair.vue` gains three optional inputs; no current caller changes what it renders:
  - `testids.confirmInput`, passed as the confirm field's `inputTestid` (absent: no attribute).
  - A scoped slot `repeatLabel` (`{ id }`). The confirm field moves into a column with `gap="8"` that holds this slot first; the `labelRepeat` span stays where it is, a sibling at the pair's 12 px. The confirm field is labelled by `id` when either is present. Without the slot the column holds the field alone, so every caller lays out as today (D5).
  - `hideHint` (Boolean), which drops the hint row.
  - `onboarding/pages/create.vue` imports the pair explicitly, as its six callers do (the test mounts register no resolver). The password block becomes a `gap="8"` column: the "Password" heading, then `<NewPasswordPair>` with `placeholder="Strong password"`, `autofocus`, `:hideHint="isCreating"`, the "Confirm password" `Text` in `#repeatLabel`, and testids `onboarding-password-input`, `onboarding-password-confirm`, `onboarding-password-confirm-input` and a new `onboarding-password-input-visibility-toggle`. The plain hint, the `MAX_PASSWORD_LENGTH` import and `strengthHint` go.
  - `useProfileCreateFlow` drops `strengthHint`, which nothing reads any more, and the header's "the strength hint"; its test drops the `strengthHint` case and keeps the `test.each`'s `isAllowedToContinue` half (the hint's words stay pinned in `utils/password-hint.test.ts`).
  - Re-cite the chaos model's three `create.vue` lines by a line diff from base (lessons.md).
  - Tests: `NewPasswordPair.test.ts`: the confirm input's testid; the slot's heading labels the confirm field and sits in the field's 8 px column; `hideHint` drops the row, beside a success control. `create.test.ts`: one test that the eye (tabindex -1) unmasks both fields, the hint reads "At least 8 characters" under the first field at rest (the success control for the pin at `:370-377`, which stays as written), and the order is heading, field, hint, "Confirm password", field.
  - Captures, both themes from `shotSend` (`tests/e2e/fixtures/shots.ts`): on the base, Create empty and with a typed pair (masked); on the head, the same two plus the typed pair revealed. Each revision runs on its own armed Chrome build (the arc-end build command, with `build:chrome`) under the smoke run flags. A scratch spec in the lane's scratch dir is copied into `tests/e2e/` for the run only (the smoke config reads only that folder) and is never committed. The PNGs go to `implementations-plan/popup-followups-1/screenshots/`.

**File-level change map:** `popup/components/modules/general/BalanceView.vue` and its test, `popup/pages/holdings.vue` and its test, `components/composite/NewPasswordPair.vue` and its test, `onboarding/pages/create.vue` and its test, `composables/useProfileCreateFlow.ts` and its test, `tests/e2e/helpers/profile-chaos/model.ts`, the plan's screenshots.

**UI impact:**
- Onboarding, Create profile, password method: the first field gains the eye button and the lock-icon hint under it, as on New profile; the plain grey hint under the second field goes. Both headings, their 8 px spacing, both placeholders and the hint's words stay; the hint still hides while the create runs. Sign-off: decision page 103, P103-01, option B, 2026-11-03: "Use the shared pair. The first field gains the eye button and the lock-icon hint under it, as on New profile; the two headings stay."
- Home's balance hero and Holdings: nothing visible changes; after a worker restart they follow the stored settings. Sign-off: page 104, P104-01, option A, 2026-11-03.

## Security & Adversarial Considerations

- **Threat model.** No new input crosses a trust boundary: the config values come from the wallet's own worker, parsed as today (`v !== false`, `Number(v) || 0`). The attacker-relevant risk is privacy on screen: a stale read can show dollar values a person turned off. Option A closes that window; the fence (`createRunFence`) drops every read but the newest.
- **Secrets.** The eye button reveals the person's own typed password, as on six other forms. The pair holds no copy (the models are Create's refs, cleared before bootstrap and on unmount, unchanged), the reveal state is not stored, `autocomplete="new-password"` stays, and nothing logs.
- **Changed on purpose:** Holdings sends two reads at mount, not four; `BalanceView`'s failed read no longer raises an unhandled rejection. **Crypto, supply chain, least privilege:** no new dependency, crypto, permission or log line.

## Phases and gates

Every gate runs from the worktree root. A test command is `cd apps/extension && bun --bun vitest run <paths> --retry=0`. Pass: exit 0, and no test skipped that ran on the base.

- [x] **Phase 1.** Pins red on base, green after: `src/popup/components/modules/general/BalanceView.test.ts src/popup/pages/holdings.test.ts src/composables/useConfigRead.test.ts`; `bun run lint`; `bun run typecheck:all`.
- [x] **Phase 2.** `src/components/composite src/onboarding src/composables/useProfileCreateFlow.test.ts src/popup/pages/profile src/popup/pages/settings/security src/popup/components/modules/settings src/utils scripts/e2e/profile-chaos-model.test.ts` (the pair's callers included); lint; typecheck; the captures.
- [ ] **Arc end.** `bun run audit:vue`; `bun run test:all`. Smoke, per browser (`chrome`, then `firefox`): build the armed copy, `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<browser>`, then `cd apps/extension && NULO_E2E_BROWSER=<browser> NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/onboarding-tab.test.ts tests/e2e/keyboard-guards.test.ts tests/e2e/legal-acceptance.test.ts tests/e2e/registration.test.ts tests/e2e/fiat-display.test.ts tests/e2e/holdings-add-token.test.ts tests/e2e/type-roles.test.ts --retry=0`. No network file (no service path moves). `bun run check:plans` after staging. No e2e scenario is added; each browser's wall-clock is reported as measured.

## Decision ledger

- D1. One arc, one PR (the lane brief): both changes are small and share no file.
- D2. One reader per Holdings key, as the archived design and its Codex audit (C1) settled: each key settles alone, as today. One `getProps()` read for both was rejected: one failure would hold both keys, and it reads every prop for two.
- D3. No change to `useConfigRead` or `createReconnectRead`: both views fit its signature as `Header.vue` does, so the owner's note does not bite.
- D4. Each read starts where it starts today, at setup; each reader exists before any request on its client, which is the hook's one ordering rule.
- D5. Create uses the shared pair, extended by three optional inputs rather than a copy of its parts (the copy #1453 removed). A `repeatLabel` string prop was rejected: the default span takes its colour from a class only the export layout styles, so on onboarding it would not match; the slot keeps Create's heading markup as it is. The slot sits with its field in an 8 px column (Codex R1-1), so Create keeps today's spacing; a flat sibling at 12 px (the first draft) was a layout change no pick names, and a gap prop (rejected by Opus F2) is not needed. `labelRepeat` keeps its 12 px, so the export page does not move. Dropping `hideHint` and letting "At least 8 characters" show under the emptied fields while the create runs was rejected: it undoes a pinned rule the pick did not name, and New profile never clears its fields before it routes, so only Create needs it.
- D6. Accessibility call under the owner's 2026-10-19 delegation: the slot labels the confirm field as `labelRepeat` does, so its accessible name becomes "Confirm password", the visible heading; the eye stays `tabindex="-1"`; the Tab order (name, tabs, password, confirm, Create) does not change.
- D7. Create binds no `v-model:hidden`, as New profile: a method switch remounts the pair masked.
- D9. Deviation found at phase 2: `NewPasswordPair.vue`'s script becomes `lang="ts"`. vue-tsc skips a JS SFC, so TS `create.vue` saw no `#repeatLabel` slot (TS2339); typing the pair is the cause-level fix, and `create.vue` is its only TS caller, so no other caller gains a check.
- D8. No test for a forgotten `dispose()` in either view (Opus F4 rejected): `disconnect()` closes the port and schedules no reopen (`background/client.ts`), so a disconnected client never announces again and a leaked listener has no production path; `useConfigRead.test.ts` pins `dispose()` itself.

## Audit verdicts

| Round | Verdict | Accepted | Rejected |
|---|---|---|---|
| Codex R1 (`gpt-6.1-sol`, high) | changes | 1: the 12 px heading gap is a layout change no pick names; the 8 px group (D5, I1); 2: the armed smoke build per browser and its run flags; 3: per-client config events in the Holdings mock; 4: no revealed capture on the base | 3 in part: the mocks keep announcing on the first `getValue` (Codex: allowed, "need not") |
| Codex R2 (resumed) | conditional approve | 1: the captures name their armed Chrome build per revision; 2: the PR body's stale "12 px" line | none |
| Codex R3 (resumed) | approve | none; both R2 fixes verified, no regression | none |
| Opus Plan lens | conditional approve | Fact 6 (`registration.test.ts` drives New profile); F1: one key per Holdings pin with the other landing, an unrelated-key control in BalanceView, values captured at call; F2 (as Codex 1); F3: the explicit import; F5: the hint's success control; F6: the `test.each` half kept, the header line; F7: the config `onConnected` handle; the callers' tests in the Phase 2 gate; dark captures (free from `shotSend`) | F4 (D8); F2's gap prop or owner question (the group needs neither) |
| Arc Codex R1 (diff from `67c1ac545`) | approve | the pair's slot comment cut to its contract; `parkReads`'s narrating comment dropped | none |
| Arc Opus review (beside R1) | approve | the hint counted once on Create; `create.vue`'s hint comment reworded; the pair's comment names no caller; the creating state captured and filed as OA-1 | none |

## Delivery

- One branch, `worktree-popup-followups-1`, `gh pr create` to `dev`, ready, no labels at creation. Title: ``feat(ui): the shared password pair on "Create profile", two config reads on `useConfigRead` `` (91 characters; commitlint passes it). Body: what changed and why; the gates with outcomes and each browser's smoke wall-clock; the before/after captures; the P103-01 quote (page 103, 2026-11-03, option B), and that both headings keep their 8 px spacing; D6 as an accessibility call under the 2026-10-19 delegation; `Closes #1473`; #1453 named as context. The close-out is the PR's final commits.

## Post-implementation

Execution contract: `implementations-plan/README.md` § Post-implementation standard at `67c1ac545`, with these values:

- Step 1 is absent (`code_review: off`). Step 2 once over the arc's diff from `67c1ac545`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; both verbatim rules and the adversarial ask in every prompt; one Opus `general-purpose` review beside round 1; hard stop at three rounds.
- Steps 3 and 4 as written. Close-out: the Outcome block; lessons promoted with a pruning pass; `STATUS.md` deleted; `git mv` to `archive/popup-followups-1/` in its own commit; the index line moved.
- Step 5: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/popup-followups-1/plan.md`, then `agent-worktree done popup-followups-1 --merged`; the orchestrator's session notices the merge.
- Three failures on one step end the arc as `ARC_FAILED`.

## Seeds (not run; orchestrator-owned)

- `/goal` Phases 1-2 ✓ in implementations-plan/popup-followups-1/plan.md, each gate passing in the transcript; the Codex loop converged on the diff from 67c1ac545; a ready PR to dev closing #1473; `bun run test` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/popup-followups-1 from plan.md and lessons/: the next unchecked phase, its gate, the Codex loop, delivery, the close-out; never merge.
