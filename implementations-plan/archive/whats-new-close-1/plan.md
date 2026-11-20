---
plan: whats-new-close-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev at f7b78cc5e
---

## Outcome

- **Date:** 2026-11-20.
- **Status:** completed; delivered in #1920, whose merge closes the plan.
- **Shipped:** #1920. A tap on Home's What's new row, by pointer or keyboard, hides it and stores the running minor through the storage facade, awaited, before `window.open` opens the changelog; Dismiss and Settings → About are unchanged. The component test holds the write pending and checks nothing opens before it lands; the smoke flip runs on Chrome and Firefox.
- **Dropped or rejected:** an unawaited write before a synchronous open (D2); a facade bypass or a worker RPC (D3); `chrome.tabs.create` in place of `window.open` (D8).
- **Known limits:** #1919.
- **Open items:** none.
- **Lessons:** none promoted to `lessons.md`, which is at its budget and already holds the toolbar-popup order; the e2e-testing skill now says both harnesses turn popup blocking off (§ Harness behaviours that look like product bugs).
- **Seeds retired:** no `/goal` or `/loop` seed of this plan is live.

# whats-new-close-1: tapping Home's What's new row also closes it

A tap on Home's What's new row (`whats-new-open`), by pointer or by keyboard, opens the version's changelog as today and also dismisses the row as Dismiss does: it hides, and the running minor is written to `nulo:ui:whatsNewSeen`.

**Sign-off (the owner, 2026-11-20, on 1.3.0 in Firefox):** "when I click on the notice of the new changelog (the arrow icon) it does open the changelog but it does not close the notice, which it'd be cool for it to do". This supersedes D2 of the archived `whats-new-1` plan ("A tap opens the page and leaves the row"), which was that lane's own call, never an owner pick.

## Outcome & Quality Bar

- **For whom:** a person who taps the row to read what changed.
- **Excellent:** after the tap the row is gone for good, on both browsers, from the real toolbar popup that the new tab closes; the tab opens exactly as before.
- **Good enough:** a second open window keeps its row until it reopens (unchanged, the archived plan's D6).

## Assumptions

**Facts** (traced at the base):
1. `storageLocalSet` does not reach `chrome.storage` at once: it awaits `migrationIdle()`, one `chrome.storage.local.get` of the schema marker, before it issues the `set` (`apps/extension/src/utils/storage.ts`). Calling it unawaited and then `window.open` leaves the `set` behind a round trip that the popup's close can cut off.
2. A toolbar popup dies when a tab it opens takes focus (`implementations-plan/lessons.md`, Extension runtime). The house precedent, Get started's How Aztec works row, awaits its facade write and then calls `window.open` (`apps/extension/src/popup/pages/general.vue`, `onGetStartedSelect`), shipped on both browsers since #743.
3. Measured on this host, 2026-11-20, with a scratch MV3 add-on and popup blocking on (`--disable-popup-blocking` dropped on Chrome, `dom.disable_open_during_load` set on Firefox): Firefox 158 applies its popup blocker to an extension page and keeps the click's transient activation across the facade's two awaited storage calls (sync open: opened; get + set awaited, then open: opened; open 7 s later: blocked). Chrome 155 opens all three from an extension page; on a web page it opens the first two and blocks the late one. Firefox's window, on a web page: an open 4.5 s after the click is allowed, 7 s after it is blocked. So an awaited write keeps the open inside the activation on both, unless Firefox's storage stalls for seconds (#1919, a known limit).
4. Both e2e harnesses disable popup blocking (Puppeteer's Chrome default `--disable-popup-blocking`; Firefox's Remote Agent recommended pref `dom.disable_open_during_load: false`), and `clickByTestId` is a synthetic `element.click()`, so no e2e can see a lost activation. Fact 3 is the evidence for it, not the suite.
5. The row's target is a native `<button>` (`RowTarget`, click mode) whose click bubbles to the row root's `@click`, so Enter and Space reach the same handler as a pointer; Dismiss is `RowAction`, whose `@click.stop` never reaches the row (`packages/design/src/ui/RowAction.vue`).
6. A migration runs only after an update has reloaded every extension page, or on the barrier's own retry, and while it runs `MigrationBarrier`'s overlay covers the popup for the pointer (not `inert`: a keyboard tap under it would wait, the #1919 case).
7. The row renders only when `isWhatsNewDue` holds: a stable build whose minor is above the stored one. So the running minor Dismiss writes is always above the marker it replaces; the tap inherits that.
8. The only readers of the tap's behaviour: the component test and `tests/e2e/security-backup.test.ts`; the update replay (`update-replay.test.ts`) reads the marker after an update and never taps; `helpers/profile-chaos/checkers.ts` describes the key's writers in a label.

**Asks:** none. The behaviour is the owner's words; nothing a person reads changes.

## Architecture & Implementation

`WhatsNewRow.vue`, the only code change: the tap handler becomes `await dismiss()` then `window.open(changelogUrl(version), "_blank", "noopener,noreferrer")`. `dismiss()` keeps its rules (hide first, write `minorOf(version)` through the facade, catch and `console.debug` a failure), so a failed write still opens the page. The header of `src/utils/whats-new.ts` and the chaos checker's label name the tap as a writer.

### Decision ledger

| Id | Decision | Why |
|---|---|---|
| D1 | Order: hide, await the facade write, then `window.open`, as Get started does | Fact 1: the `set` waits behind the barrier's read, so only awaiting it guarantees it is issued (and stored) before the tab can close the popup, on both browsers. Fact 3: the open stays inside the click's activation on both, short of a multi-second storage stall on Firefox (#1919) |
| D2 | Rejected: start the write unawaited, then open synchronously | keeps the activation trivially, but the `set` races the popup's close on both browsers (Fact 1) |
| D3 | Rejected: a facade variant that writes without the barrier, or a worker RPC | a new contract for one caller; the facade's barrier is the storage rule (CLAUDE.md § Persisted-storage shape changes) |
| D4 | The tap reuses `dismiss()` whole | one write rule for both controls, no copy |
| D5 | Smoke: the tap is an Enter on the focused row target; the marker is read once the tab exists, with no poll; the Dismiss step stays, after a re-seed and a reload | Enter is the only trusted input the spec sends (Fact 4), and covers the keyboard path; the read needs no poll because the write lands before the tab (D1), though in a tab-hosted popup that nothing closes it cannot fail an unawaited write, so the component test is the order's proof; Dismiss keeps its smoke path now that the tap removes the row |
| D6 | Component: the tap case flips (row gone and no open while the `set` is pending; the open, with URL and features, once it lands); one case proves a refused write still opens the page | the order and the open's independence from the write are the two ways this change can fail |
| D8 | `window.open` kept over `chrome.tabs.create` (Codex r1 #1) | the brief keeps today's open; `tabs.create` may place the tab differently, a product call; the stall it would cover is #1919, bounded by About's row |
| D7 | Accessibility (the owner's 2026-10-19 delegation): focus is not moved after the tap | the tab takes focus; the archived plan's D7 already leaves it after Dismiss |

### UI impact

- **Home** (popup): before, a tap opened the changelog and the row stayed; after, the row closes as the tab opens, and stays gone, as after Dismiss. Copy, layout, glyphs, Dismiss and Settings → About are unchanged. Signed by the owner's words above.

## Security & Adversarial Considerations

- **Trust boundary:** unchanged. The marker is written only from the bundled version; the URL is built only from it (`changelogUrl`), never from storage.
- **Privacy:** nulo.sh is still reached only on the tap (the smoke's egress count before and after it).
- **What can go wrong:** a write lost when the popup closes (D1); an open blocked by the await (Fact 3, #1919); Dismiss opening the page (Fact 5, the component's Dismiss case); a keyboard tap that does not dismiss (D5); the marker moving to a lower minor (Fact 7).
- **Storage:** same key, same value shape: no stamp; the snapshot test proves it.

## Phase 1: the tap dismisses ✓

- `WhatsNewRow.vue` per D1, with one comment stating the order and the activation bound; `WhatsNewRow.test.ts` per D6.
- `whats-new.ts` header and `checkers.ts` label.
- `security-backup.test.ts` per D5, plus `shotSend` of Home after the tap (the before frame exists).
- **Validation gate:** `bun run lint`, `bun run typecheck:all`, `cd apps/extension && bun --bun vitest run src/popup/components/modules/general/WhatsNewRow src/wallet/storage/stored-shapes`, `bun run test`, `bun run test:all`, `bun run check:plans`. Then per browser, the armed smoke build (`global-setup-smoke.ts`'s `ARMED_BUILD`) and `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 [NULO_E2E_BROWSER=firefox] NULO_E2E_SHOT_DIR=<scratch> bun run test:e2e -- tests/e2e/security-backup.test.ts --retry=0`. Pass: exit 0 each; the spec's duration recorded per browser.
- **Result** (2026-11-20; the component cases re-checked after the Codex pass): every command exit 0; the order case red on the base, on an unawaited write (D2) and on a `set` issued unawaited after the barrier; the refused-write case red on the base only; both green on D1. Smoke `security-backup.test.ts` at retry 0: Chrome 4 of 4 (the What's new test 5.5 s, the file 47 s), Firefox 4 of 4 (4.5 s, 61 s). On Firefox the frames are Chrome's: BiDi refuses `captureScreenshot` on an extension page, so the run with `NULO_E2E_SHOT_DIR` set fails at the first shot and the gate run leaves it unset.

## Delivery

- One PR into `dev` from `worktree-whats-new-close-1`, opened ready, no labels at creation (the smoke path filter covers `apps/extension/**`). Title: `feat(home): tapping the what's new row also closes it`. Body: the owner's words, the frames (pushed in one commit, removed in the next), "Orchestrator match (rule C): …", the accessibility call D7, validation with the spec's per-browser duration and CI's smoke wall-clock before and after. It closes no issue.
- The close-out is this PR's final commits (README § Post-implementation standard, step 4).

## Post-implementation

The execution contract is this plan plus `implementations-plan/README.md` § Post-implementation standard at `f7b78cc5e`. Specific to this plan:

- Bounded work: one Codex pass over this plan and the completed diff (`run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`), adversarial on the five failure paths above; then targeted verification of each material fix with `resume-codex.sh`.
- Teardown after the merge is the orchestrator's.

## Audit verdicts

- **Codex r1** (gpt-6.1-sol, high, over the plan and the diff at `4b0da4a94`): `findings`, three; agrees with D1 over D2. #1 (medium, plausible but unverified): a storage stall past Firefox's activation hides the row and blocks the tab; proposed `chrome.tabs.create` → not taken (D8), filed and closed as known limit #1919 after measuring the window (Fact 3); the comment's unbounded "one round trip" claim rewritten to the measured bound. #2 (low, demonstrated): the order case could not see a `set` left unawaited, since the mock stores at call time → the case now holds the `set` pending and checks no open before it lands. #3 (low, demonstrated): the plan overstated which cases fail on D2, and Fact 6 the overlay's reach → both corrected.
- **Codex r1, resumed** (targeted verification of `7ea89af14`): `clean` ("No new material findings or regressions.").

## Seeds

- `/goal` Phase 1 of implementations-plan/whats-new-close-1/plan.md marked ✓ with its gate reported passing in the transcript; the Codex pass done and each material fix verified on resume; the PR open into dev, ready, with the close-out commits on top; `bun run test` and `bun run lint` exit 0.
- `/loop 15m` Drive implementations-plan/whats-new-close-1 per its plan.md: reality check, next pending step, gates, the Codex pass, delivery, close-out; never merge.
