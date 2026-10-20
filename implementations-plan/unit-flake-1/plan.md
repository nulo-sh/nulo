---
plan: unit-flake-1
tier: light
status: arc 1 green, Codex loop converged; PR next
issues: "#895 (arc 1 closes)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon in the lead session (it needed running code); one Codex audit (gpt-6.1-sol, high) and its resume; one Opus Plan leg
base: origin/dev at 4aa9d1ab
trunk: dev
post_implementation_hardening: not scheduled
---

# unit-flake-1: send unit-test events past Vue's attach-time guard

One arc, one PR against `dev`, test code and one CLAUDE.md line only. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Evidence and consults: [lessons/phase-0.md](lessons/phase-0.md).

## Root cause (#895)

**Path (demonstrated).** Initial conditions: `StaleNetworkConfirm` renders inside `Popup`, whose sheet root binds `@click.capture="refuseCarriedClick"` (`src/components/Popup/Popup.vue:134-135`). Vue 3.5.42's invoker lets the first Vue listener an event reaches stamp `e._vts = Date.now()`; each later Vue listener returns when `e._vts <= attached`, its own attach time. Actions, in order: the test reopens the sheet (`setProps` false then true, `flushPromises`), which mounts the sheet root and RESET's `@click` in one flush with one `attached`; then `click()` on RESET. Within that millisecond the sheet's capture listener stamps `_vts == attached`, and RESET's listener, second on the path, returns. Invariant broken: the test's premise that a press after a render reaches the pressed control. Consequence: a red `Unit tests / Vitest` and `quality-status` on unrelated PRs (run 39332994479). No product failure demonstrated: a person's press lands frames after the render, and the guard is what Vue intends. The CI run carries no listener-time trace: the mechanism is reproduced, its occurrence in that run inferred (I1).

**The issue's claims.** One live, enabled node and the latch false at the click: the issue's suspects (a stale node, a latch left set) did not hold. "Passes locally": held, and a CPU-load loop cannot show it, since load widens the gap (200/200 green before the fix; median gap 3 ms, 94/200 at 2 ms or less). A frozen `Date.now` reproduces it every run; removing the sheet's capture listener under the same frozen clock makes it pass.

**The class.** Any raw `click()` or `dispatchEvent` that must reach a Vue listener other than the first on its path, in that listener's attach millisecond. A quantized-clock sweep of the whole extension suite turned 24 tests in 14 files red by this guard alone (green again with the guard neutralised); `packages/design` has none. A path probe found 102 such events in 19 files; 17 files are test-sent, 2 are clicks `RowTarget.activate()` sends itself, not load-bearing (lessons/phase-0.md).

## Outcome & Quality Bar

For a maintainer reading a red `Unit tests / Vitest`: a component test is red because the component broke, never because a press shared a millisecond with a render.

- Every test-sent event in the inventory reaches the listener it tests, whatever the clock: the quantized-clock sweep leaves only the 10 Date-arithmetic reds it had before, and none of the 24.
- #895's test fails every run, not one CI run in many, if its reopened press goes back to a raw click.
- No assertion loosened, removed, retried or skipped; the test count stays the same.

## Architecture & Implementation

- **`apps/extension/tests/helpers/send-event.ts` (new):** `sendEvent(el: Element, type: string, init?: Record<string, unknown>): Event | undefined`. It dispatches through `new DOMWrapper(el).trigger(type, init)`, which stamps `_vts = Date.now() + 1` and dispatches before its promise, so a send stays synchronous. A capture listener on `el.getRootNode()` (its window when a document) keeps the first event it sees and is removed in `finally`. Contract, in the TSDoc: a plain event type, light DOM only; `init` names only properties the event's own interface defines (`key`, `keyCode`, `repeat`, `isComposing`, `button`), since `trigger` supplies `bubbles` and `cancelable` and rejects, sending nothing, on an inherited one (`detail`, `bubbles`); it builds a `MouseEvent`, not composed, where `click()` builds a composed `PointerEvent`. Returns `undefined` only when `el` carries its own `disabled` attribute (`trigger` sends nothing); throws when nothing was sent otherwise.
- **Shared helpers routed through it:** `tests/helpers/credential-pins.ts` (`expectMaskToggle`'s four clicks, `typeNow`'s input, `enterOn`, which throws if nothing was sent) and `tests/helpers/press-key.ts` (`pressOn`; a key event not sent counts as not gone through: `ev !== undefined && !ev.defaultPrevented`). `pasteInto` stays raw: its listener is first on its path.
- **Local raw sites:** Enter keydowns go through `enterOn`: `export/seed.test.ts:85`, `change-password.test.ts:94`, `popup/pages/import.test.ts` :203, :679, :689, :698, :704, :713, :724, :730 (never-happens ones included), and `onboarding/pages/create.test.ts:217` (`enterOn(field, { repeat: true }).defaultPrevented`). Clicks and other keys go through `sendEvent`: `StaleNetworkConfirm.test.ts` (:146, :148, :149, :162, :163, :168), `Popup.tooltip.test.ts:85`, `JsonViewer/LogsToolbar.test.ts` (:109, :115), `send/FeeMethodSelector.test.ts` (:241, :246), and `create.test.ts`'s local `press` (:100-104). `Popup.test.ts`: only the close-area click at :248, as a plain click; its other presses carry `detail` and meet Popup's own listener first or only native listeners, so they stay raw. `import.test.ts` :172, :239, :244 are CodeMirror's shadow-root search panel: they stay raw.
- **Never-happens sends prove they were sent:** `enterOn` throws when nothing was sent; a click a test expects refused asserts `expect(sendEvent(...)).toBeDefined()`, including RESET's second click, which must land before the re-render that disables RESET so that only the latch refuses it. No `await wrapper.trigger` in a never-happens test.
- **`SettingsSearch.test.ts`'s `key`** calls `sendEvent` instead of its own copy of the same idiom.
- **The pin:** `StaleNetworkConfirm.test.ts` holds `Date.now` still (`vi.spyOn(Date, "now").mockReturnValue(Date.now())` in `beforeEach`, that spy's `mockRestore()` in `afterEach`), as `SettingsSearch.test.ts:100-107` does. Tests 1-4 do not change; test 5 shares the cause and changes only how it presses.
- **`CLAUDE.md` § Vue component test conventions:** one bullet: send user events through `trigger` or `sendEvent`, since a raw event in a render's millisecond reaches only the first Vue listener on its path: a `Popup`'s or `Tooltip`'s capture listener, or the target's own when an ancestor also listens.
- **File map:** 1 new helper; 2 shared helpers; 10 test files; `CLAUDE.md`. No product file.

### Trade-offs and alternatives not taken

- **Register Popup's and Tooltip's capture listeners natively**, so the target's listener stays first: fixes 3 of the 24 and changes product code with no product consequence. Rejected.
- **Fake `Date` and advance 1 ms before each press**: correct, but a clock dance at every press in 14 files, and new tests stay exposed. Rejected for `trigger`, which already stamps "after every render".
- **Set `event._vts` in our own helper**: writes a private Vue field outside the library that owns the workaround. Rejected.
- **A still clock in `tests/vitest.setup.ts`**: reds the 10 Date-arithmetic tests. Rejected. **A ban test on raw dispatch in test files**: most raw dispatches are first-listener and safe; a baseline for one cause. Rejected.
- **Fix #895's file only**: leaves 23 tests with the same cause and never-happens tests that a dropped event passes vacuously. Rejected (the lane brief: fix what shares the cause).

## Phase 1: send the inventory's events through `sendEvent` (branch `unit-flake-1-a1`) ✓

1. Add `send-event.ts`; route the two shared helpers; run their 18 consumer files.
2. Convert the local sites above and SettingsSearch's `key`; add the still clock to `StaleNetworkConfirm.test.ts`.
3. Add the CLAUDE.md bullet.
4. Negative control, never committed, the decisive proof: in `StaleNetworkConfirm.test.ts`, send the reopened press as a raw `click()`. Five runs: each red with `expected [ [] ] to have a length of 2 but got 1`. Restore; `git diff` shows only the fix.

**Validation gate.** Warning: wait for `cut -d. -f1 /proc/loadavg` under 150 before `test:all` and each sweep.

- `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`: each exits 0; `bun run test` reports as many tests as on the base.
- `cd apps/extension`, then `StaleNetworkConfirm.test.ts` 200 times at `--retry=0`, 6 in parallel under host load: 200 passed. A smoke check only: before was 200/200 too (the flake needs a fast runner, not load).
- Recreate the setup files, probe and config from lessons/phase-0.md under `~/.cache/nulo-backlog/unit-flake-1/`. Run the extension suite on the quantized clock: red is exactly the 10 Date-arithmetic tests listed there, by name. Run the path probe: no unstamped test-sent event reaches a second Vue listener; only `RowTarget.test.ts:80` and `TransactionIncomingCard.test.ts`'s entry (no test call site) remain.
- Layers: lint, typecheck, unit. No e2e: no product, fixture or e2e file changes. `test:ci-gating` and `test:release`: not touched.

## Security & Adversarial Considerations

Test code and one convention line: no product, permission, storage, wire, CI or dependency change. The risk is the tests' honesty. The change removes a way a never-happens test passes vacuously (a dropped event proves nothing), and loosens, retries or skips nothing. `sendEvent` uses test-utils' public `trigger`, not a private Vue field.

## Assumptions

- **Facts.** F1 `createInvoker` and `getNow` as quoted (`@vue/runtime-dom` 3.5.42, `runtime-dom.cjs.js:673-690`; `:675` caches `getNow` per tick, `:716` sets `invoker.attached`). F2 test-utils 2.4.11 `trigger` sets `_vts = Date.now() + 1`, skips a disabled control and dispatches before `nextTick` (`vue-test-utils.cjs.js:7213-7226`). F3 `Popup.vue:134-135` and `Tooltip.vue:180-182` are the only Vue capture listeners (`grep '\.capture'`). F4 jsdom's `click()` sends `detail: 0` and nothing to a disabled control (`HTMLElement-impl.js:69-94`). F5 the CI log and the reproduction, frozen clock and control in lessons/phase-0.md. F6 the sweep and inventory counts there. F7 the shared-helper prototype: 323/323 on the real clock. F8 `trigger` with `detail` or `bubbles` in its options rejects with `TypeError: Attempted to assign to readonly property` and dispatches nothing; `key`, `keyCode`, `repeat`, `isComposing`, `button` pass (scratch test).
- **Inferences.** I1 a CI runner is fast enough to land a press in the render's millisecond: inferred from the 1 ms minimum gap here under load and the 126 ms file time in CI. I2 the 23 other tests have the same guard sensitivity; their real-clock flake rates are unknown (gaps here 2-203 ms; no other CI red on record).
- **Asks.** None.

## Decision ledger

- D1 Fix the tests' dispatch, not the product (alternatives above).
- D2 One shared `sendEvent` over `trigger`, used by the shared helpers, the local sites and SettingsSearch.
- D3 Scope is the inventory: every test-sent event that reaches a second Vue listener, never-happens tests included. The two `RowTarget` self-sends stay: product code, not load-bearing.
- D4 The still clock pins #895's file only; the sweep proves the rest once.
- D5 CLAUDE.md gets the rule in this PR; `lessons.md`'s Vue line points at it at close-out.
- D6 Presses on a disabled submit now send nothing, as a browser sends nothing to a control it cannot focus: `RevokeAuthwitsPopup.test.ts` :214, :233, :307, :333 and `tests/helpers/send-popup-keyboard.ts` :159, :167 (run by `RevokeAuthwitsPopup` and `ChangeAuthwitsRegistryPopup`). Each still asserts the send count, and five of them that the submit is disabled. Before, a raw keydown reached the disabled button's listeners, a path no browser takes.
- D7 `Popup.test.ts`'s close-area click becomes `detail: 0`, since `trigger` cannot set `detail`. Popup's refusal passes 0 and 1 alike, and the same test still proves a detail-1 click passes through `inside`.
- D8 (implementation) The gate's two literal criteria needed widening, intent unchanged: the probe also leaves `Popup.test.ts:238`, a detail-2 click Popup's own listener refuses first, kept raw by design; the quantized sweep's 10th Date-arithmetic test passed one run, as it depends on where the 1 s quantum falls. Results: [lessons/phase-1.md](lessons/phase-1.md).

## UI impact

None. No surface a person sees changes.

## Delivery

Branch `unit-flake-1-a1` off this plan's commit (on `origin/dev` 4aa9d1ab). One PR against `dev` with `gh pr create`, after the gate and the Codex loop, and after merging `origin/dev`. Title: `test(extension): send unit-test events past vue's attach-time guard` (66 characters). Body: the path and its evidence, the sweep before and after, the 200-run counts, the negative control, `UI impact: none`, `Closes #895`. No label at creation. No lanes.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at `4aa9d1ab`, single arc, over the diff from the plan commit. `code_review: off`. Codex loop: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; stop at three rounds; log each in `lessons/phase-1.md`. One Opus diff review beside round 1. A fix that grows the design stops for the orchestrator. Close-out as the PR's final commits: the Outcome, `lessons.md`'s Vue line rewritten to name `sendEvent`, the archive move. Teardown after merge: `agent-worktree done unit-flake-1 --merged`.

## Audit verdicts

**Round 1, Codex** (gpt-6.1-sol, high, session 01a1568b): conditional approve, 5 findings, all accepted. #1 `trigger` is no drop-in constructor (F8; shadow-root sends stay raw). #2 "undefined means disabled" too strong: contract narrowed, `sendEvent` throws otherwise. #3 keep the first captured event: already so. #4 historical attribution and I2 reworded. #5 probe and config inlined; the negative control is the decisive proof.

**Round 1, Opus Plan:** conditional approve, 7 findings, all accepted. #1 `pressOn`'s unsent event, D6. #2 never-happens sends prove they were sent. #3 probe inlined. #4 `import.test.ts`'s exact lines; :239 and :244 stay raw. #5 the reshaped event in the TSDoc. #6 the CLAUDE.md wording. #7 F1's cites.

**Round 2, Codex** (resume): conditional approve, 1 finding, accepted: the inlined path probe needed a DOM guard for `@vitest-environment node` files.

**Round 3, Codex** (resume): **approve**, high confidence, no new findings or regressions. Light tier: this resumed verdict is the final pass (no separate fresh session).

**Implementation rounds 1-2** (diff 7062080a..e5e9169e). Round 1, Codex (gpt-6.1-sol, high, session 01a156ad): approve, 1 comment nit (two TSDocs restated their call), fixed. Opus diff review: approve, 3 low findings, all fixed: the TSDoc missed that `trigger` copies `keyCode`'s digits into `code` (`enterOn` now sends `code: "Enter"`) and overstated the click shape; the CLAUDE.md bullet now scopes the Popup and Tooltip example to clicks and asks a refused press to check it was sent; `typeNow` throws on a disabled field as `enterOn` does. Round 2 (resume): approve, no findings; the loop converged. Log: [lessons/phase-1.md](lessons/phase-1.md).

## Seeds

`/goal` (recommended): `/goal Phase 1 of implementations-plan/unit-flake-1/plan.md is ✓, backed by its validation gate in the transcript (lint, typecheck:all, test, test:all exit 0 with the base test count; StaleNetworkConfirm.test.ts 200/200 at retry 0; the negative control red 5/5; the quantized-clock sweep red only on the 10 Date-arithmetic tests; the path probe left only the RowTarget sends), LESSONS_FILE=implementations-plan/unit-flake-1/lessons/phase-1.md printed; /code-review not run; the Codex loop converged (a resumed pass with no new material finding, quoted); the PR exists, opened after the loop (gh pr view output).`

`/loop` (fallback): `/loop 15m Drive implementations-plan/unit-flake-1 forward; never idle. Read plan.md and lessons/. If the plan directory is gone, git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/unit-flake-1/plan.md: success means merged, so run agent-worktree done unit-flake-1 --merged and stop; failure means delivered, so watch the PR's checks. Otherwise run phase 1's gate, then the Post-implementation section. Never merge. The same step failing 5 times: reassess with Codex.`
