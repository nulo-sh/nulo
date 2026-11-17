---
plan: connected-app-build-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev at 0dc22a9c5
status: completed
---

## Outcome

- **Date:** 2026-11-17.
- **Status:** completed. Ships in the PR titled `fix(connected-apps): the connection check section goes; two "Details" glyphs stop misreading`, which carries this close-out; it lands on the owner's decision page with its captures.
- **Shipped:** the connected app page no longer draws the Connection check section, and nothing replaces it (P163-02 with its note); `DappSessionVerification.vue` is deleted. The capabilities window's Transact column and transaction row draw `send`, its Details column and contract-details row `search`; the yes-mark stays `check` (P163-03 = E3). The page root carries the unseen `connected-app-page` testid, which the mismatch spec now anchors on.
- **Gates (retry 0, Chrome):** at `0a6e270d1`, lint, typecheck:all, test (1045 files), test:components (104 files) and check:plans green; `e2e:agent` connect-verify-mismatch 2/2, connect-check-window 2/2, type-roles-windows 6/6. The review fix (`0904820c2`, a comment) reran biome and the e2e typecheck. No Firefox run (no fixture, helper, focus, window or WebAuthn change); no e2e scenario added.
- **Deviations:** the e2e gate and the captures ran through `agent.sh`, not the smoke harness (both need a connected playground); the lane brief's test and stories for `DappSessionVerification` did not exist; `type-roles-windows` joined the gate (it sweeps both surfaces); the built page is 260 px shorter, not K3's 245, since the note dropped K3's header line.
- **Lessons:** none promoted.
- **Known limits:** none.
- **Open items:** none.
- **Seeds retired:** the `/goal` and `/loop` seeds under Seeds.

# connected-app-build-1: the Connection check section removed, two Details glyphs swapped

Decision page 163, signed 2026-11-17 at 15:37 UTC (dev `0dc22a9c5`). The render lane connected-app-1 drew the options; this lane builds two of the owner's picks. P163-01 (the permissions table) is not in this plan, and nothing here touches the permissions section.

- **P163-02 = read**, note (2026-11-17 15:33 UTC): "Remove it completely. So "K3" but without "Connected after the emoji check"". K3 as the page put it: "Removed: the section is gone and the header gets one line under the expiry, "Connected after the emoji check" … 245 px shorter." The note removes the header line too: the section goes and nothing replaces it.
- **P163-03 = E3**, no note (2026-11-17 15:35 UTC): "Two glyphs swapped where they misread: Transact gets the send arrow instead of the yes-mark's check, Details gets the magnifier instead of the info circle, in the head and in the rows above (the transaction and contract-details rows), so rows and columns keep sharing one glyph. 0 px."

One arc, one PR against `dev`. It changes what users see, so it does not land on its own: the orchestrator lands it on the owner's approve of its captures. No issue owns the work (searched "connection check connected app emoji", "details table glyph transact"; the closed `known-limit` issues on the connection check concern the connect and verify windows), so the PR carries no `Closes` and no `Part of`. Recon: [`recon.md`](recon.md). Owner asks: none ([`OWNER-ASKS.md`](OWNER-ASKS.md)).

Proportion (lane brief): a removal and two glyph swaps. No plan audit round; one Codex pass over the plan and the net diff after the build; no Opus review.

## Decision ledger

| ID | Decision | Why, and the alternatives |
|---|---|---|
| D1 | `[id].vue` loses the `DappSessionVerification` mount, its import, the `hashToEmoji` import and `verificationEmojis`; `DappSessionVerification.vue` is deleted. Nothing is added to the header. | P163-02 and its note. K3's prototype (`c0aecbb19`) only added the header line, which the note drops, so nothing of it is taken. The lane brief's "its test and stories" do not exist (recon). |
| D2 | No service, stored shape, glossary entry, verify-window code or not-connected line changes. | The hash is still written at establishment and still decides the not-connected line; the comparison that protects the person is the verify window's, untouched. |
| D3 | `DetailsTable.vue` `COLUMNS`: `transact` `check` → `send`, `details` `info` → `search`; `permission-rows.ts`: `transaction` `check` → `send`, `contract-details` `info` → `search`. The cell yes-mark stays `check`. The prototype's look switch (`c09ff1da9`) is not taken, only E3's four values. | P163-03. The comment "A column's glyph is the icon of the permission row it stands for" stays true. |
| D4 | `connect-verify-mismatch.test.ts`, reconnect case: the page visit is kept and re-anchored. `[id].vue`'s `SettingsPageShell` gains `data-testid="connected-app-page"`; the spec waits for it, asserts `connected-app-not-connected` absent, and captures with that focus. The comment says what the step now proves. | The bare connect grants nothing and shares no account, so no testid on the page is specific to a connected app (recon). The shell renders in the same tick as the not-connected line, so its presence makes the absence check sound. A page-root testid has precedent (`contacts-page`, …) and changes nothing a person sees. Rejected: dropping the visit (the lane brief asks to re-anchor; the step still proves the first connection's page reads as connected before the reconnect); `connected-app-account-row` (absent on a bare connect). |
| D5 | Tests in the unit and component layers; no new e2e scenario. | Every changed fact (a section absent, four glyph names) is visible to a mount. No e2e spec reads a glyph name. |
| D6 | `PermissionRow.test.ts`'s "Every transaction" fixture moves from `check` to `send`, and `permission-rows.test.ts`'s icon-case title stops naming `info`. | A fixture or title naming the old glyph for the transaction row would misdescribe the product; neither changes what the case proves. |
| D7 | Captures from a scratch copy of the render lane's kit through `agent.sh`: an uncommitted spec `tests/e2e/network/cab1-render.test.ts` and an uncommitted playground bundle `cab1`, `ca1-table` with the contracts grant reduced to `canGetMetadata`, so one request draws both swapped rows and both swapped columns. A before run at the plan commit, an after run at the built head; neither is committed. The gate run is its own invocation, without the kit and without `NULO_E2E_SHOT_DIR`. | A connected playground with grants is a network fixture, so the smoke harness cannot draw these frames (the lane brief's "through the smoke harness" does not hold). The gate of record runs the tree that ships. |
| D8 | No accessibility call. | The removed section holds no focusable element (`EmojiGrid` is text); the swapped glyphs are `aria-hidden`, and the rows' spoken names carry the column words, unchanged. |

## UI impact

- **Settings → Connected apps → an app's page** (`[id].vue`): before, a "Connection check" section at the bottom: its label, the nine-emoji grid, and "Emojis from the most recent connection. They should have matched what the app showed then."; after, the section is gone and nothing replaces it. The header (name, URL, "Expires …") and the not-connected line are unchanged. Sign-off, **P163-02 = read**, note: "Remove it completely. So "K3" but without "Connected after the emoji check"".
- **The capabilities window** (`DetailsTable.vue`, `permission-rows.ts`): the Details head's Transact glyph becomes the send arrow and its Details glyph the magnifier; the "Every transaction, on …" row draws the send arrow and the "See details of … in your wallet" row the magnifier. The cells' yes-mark, every other glyph, chip and word are unchanged. Sign-off, **P163-03 = E3**: "Two glyphs swapped where they misread: Transact gets the send arrow instead of the yes-mark's check, Details gets the magnifier instead of the info circle, in the head and in the rows above (the transaction and contract-details rows), so rows and columns keep sharing one glyph. 0 px."
- The discover window's rows and the app page's authorizations row draw neither glyph and do not change. Testids: `connected-app-verification` leaves with its section; `connected-app-page` is added on the page root, unseen.

## Security & Adversarial Considerations

- **The check that protects.** A person compares emojis in the verify window at connect time, and "They don't match" ends the session; that path, the stored hash and the refusal are untouched. The removed grid was drawn after the fact from the last connection's hash, with nothing left to compare it to (an app stops showing its emojis once connected), and a failed check never reached this page.
- **Deception.** No dApp-controlled value gains or loses a place on screen. The glyphs are wallet constants; the transaction row's send arrow no longer shares a shape with the yes-mark, so a column head can no longer read as "allowed".
- **Disclosure.** No log line, storage key, permission, message or dependency changes.

## Assumptions

**Facts** (checked at `0dc22a9c5`): the recon's list; in particular `DappSessionVerification.vue` has no test or stories, no e2e spec reads a glyph name, and the playground's bare connect leaves the session with no account and no grant.

**Asks.** None.

## Phase 1: the build and its tests ✓

1. `apps/extension/src/popup/pages/settings/connected-apps/[id].vue`: D1; `data-testid="connected-app-page"` on `SettingsPageShell` (D4).
2. Delete `apps/extension/src/popup/components/modules/settings/connected-apps/DappSessionVerification.vue`.
3. `apps/extension/src/components/composite/capabilities/DetailsTable.vue` and `apps/extension/src/popup/windows/capabilities/permission-rows.ts`: D3.
4. `apps/extension/tests/e2e/network/connect-verify-mismatch.test.ts`: D4.
5. Tests:
   - T1 (`[id].test.ts`): the `hashToEmoji` mock goes (the page no longer imports it). New case: a connected session (a wire-shaped `verificationHash` and an expiry) draws no "Connection check", no "emoji" and no "Connected after"; its controls: the page root and "Expires …" render. T1 fails against the base `[id].vue` (proved with the base copy from `0dc22a9c5`, the mock removed) and passes on the head. The not-connected cases stay unedited.
   - T2 (`DetailsTable.test.ts`): the head pin becomes `["play","add","send","search","mail-lock","code"]`; the yes-mark case (`check`) stays as the control.
   - T3 (`permission-rows.test.ts`): `contract-details` → `search`, `transaction` → `send`; D6's title. `PermissionRow.test.ts`: D6's fixture.

**Validation gate** (retry 0, one command at a time, from the worktree root): `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run --cwd apps/extension test:components`; `bun run check:plans` after staging. Then Chrome only, one invocation: `NULO_E2E_BROWSER=chrome NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/connect-verify-mismatch.test.ts tests/e2e/network/connect-check-window.test.ts tests/e2e/network/type-roles-windows.test.ts` (`agent.sh` claims ports from `~/.agents/ports.md`; the 10-minute stall watchdog stays). `type-roles-windows` joins because it sweeps both changed surfaces. No Firefox run (no fixture, helper, focus, window or WebAuthn change); no storybook build (no story changes); CI's five lanes are the gate of record. Pass: every command exits 0; `type-role-ban`, `copy-dash-ban` and `red-text-ban` green inside `test`; every other assertion passes unedited, or the edit is recorded here with its reason.

## Phase 2: captures and the PR ✓

1. Before run (at the plan commit, before step 1 of Phase 1): copy the kit in (D7), one `agent.sh` run with `NULO_E2E_SHOT_DIR` set and `CAB1_PHASE=before`, 400 px wide, height fitted, each `-light` and `-dark`: `cab1-page-before` (the app page, full height, the section at the bottom), `cab1-table-before` (the window, Details open). Restore the tree.
2. After run (at the built head, after the Phase 1 gate): the same with `CAB1_PHASE=after`: `cab1-page-after`, `cab1-table-after`, `cab1-rows-after` (the window, Details closed, both swapped rows beside their titles). Restore the tree.
3. Frames into the lane's scratch `shots/` with `captions.json` (keys `<id>-light` and `<id>-dark`, one sentence each, the point first).
4. Commit `cab1-page-after` and `cab1-table-after` (light and dark) under `pr-captures/connected-app-build-1/` in one commit; delete them in the next.
5. Post-implementation, then the PR.

**Outcome.** Both runs green, retry 0, Chrome: before at `4ebcbbfdb` plus the kit, after at `0904820c2` plus the kit. The page measures 1099 px before and 839 px after (260 px shorter; the before run found the section, the after run did not); the window measures 1264 px with Details open in both, 965 px closed. Both runs listed the `transaction` and `contract-details` rows.

**Validation gate.** `git status` clean after each restore; `git grep -n cab1 -- apps` empty; all ten frames exist; `bun run check:plans` exits 0 after staging.

## Delivery

One PR from `connected-app-build-1-a1` (off `origin/dev`, carrying the plan commit) to `dev`, opened ready, no label. Title (92 characters): `fix(connected-apps): the connection check section goes; two "Details" glyphs stop misreading`. The body quotes both picks verbatim under `## Sign-off (decision page 163)`, embeds the two after pairs from `pr-captures/connected-app-build-1/` at the commit that adds them, lists the gates with outcomes, and says no e2e scenario was added. No `Closes`, no `Part of`. Merging is the orchestrator's, on the owner's approve.

## Post-implementation

Execution contract: this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `0dc22a9c5`. Plan-specific values:
- Step 1: `code_review: off`, so absent.
- Step 2, thinned by the lane brief: after Phase 1 is green, ONE `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol` over the plan and `origin/dev...HEAD`, the prompt in the lane's scratch dir, asking also whether the removal leaves dead state or copy, whether the verify flow still proves what it did, and whether the two glyphs misread anywhere else they appear. Rerun only the gates a fix touches. A second round only if the first says anything but approve (`resume-codex.sh`; hard stop at three). No Opus review.
- Step 3: `gh pr create` as Delivery says; `gh pr checks <n> --watch` once.
- Step 4, close-out in the same PR's final commits: Outcome, lessons (none expected), `STATUS.md` deleted, `git mv` into `archive/` in its own commit, the index line to `archive/index.md`, after merging `origin/dev` in.
- Step 5: teardown is the orchestrator's.

## Seeds (not run; the orchestrator owns the ELI5)

- `/goal`: Build connected-app-build-1 per `implementations-plan/connected-app-build-1/plan.md`: Phase 1 green, captures, one Codex pass, PR open with captures; stop before merge.
- `/loop`: Each firing, read `STATUS.md`, run the next unfinished step of `plan.md`, record its gate, stop at the open PR.

## Audit verdicts

No plan audit round (lane brief, Proportion).

**Codex pass over the plan and the net diff** (gpt-6.1-sol, high, read-only, `0dc22a9c5...0a6e270d1`), 2026-11-17: approve with fixes, high confidence, no behavioural or security regression.
- R1-1, accepted: the reconnect case's comment narrated the assertion and the case's history; it now states only the constraint ("Chrome doesn't paint hidden tabs; front the wallet for its capture, then return to the app."), `0904820c2`.
- Its answers to the lane's questions: no dead import, state, prop, copy, selector, style, generated type, manifest entry or mock remains (docs, READMEs, the e2e README and `.claude/skills/` searched); the verify window, its confirm and its refusal are unchanged, and the glossary entry and the not-connected line's "Its next connection starts with the emoji check." stay accurate; the two glyphs meet no competing meaning in the capabilities window, its Already allowed fold included, and the discover window and the authorizations row draw neither; D4 is sound, since the root and the not-connected line render from the same `session` in one pass and no existing testid anchors a bare-connect page.

**Round 2** (resumed, `0904820c2`): approve. The fix is comment-only, so no gate reran beyond biome and the e2e typecheck.
