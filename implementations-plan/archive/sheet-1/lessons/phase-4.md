# sheet-1, phase 4: decision page 39, folded into the PR before the merge

- 2026-10-17 19:2xZ: the orchestrator relayed page 39 (signed 19:03Z): P39-01 B, P39-02 C, P39-03 B (the orchestrator's choice under the owner's delegation), P39-04 A. Dev merged first (#705, #708; no dependency file changed).
- Codex design consult (`gpt-6.1-sol`, high, fresh session `01a14b8b`), read-only, from source, no browser runs:
  - Detection: `mousedown.detail` and `click.detail`, high confidence in the mechanism, moderate across physical devices. `pointerdown.detail` is 0; `dblclick` fires after the second click; timestamps bring a threshold of their own. Touch and pen are not claimed.
  - Refuse `click` only; arm on a primary press only (a right press would arm it otherwise); reset synchronously in `activate()`, before its first await.
  - The scrim: the light `--scrim-popup` value, high confidence; the contrast parser reads `color-mix(… transparent)`, and the drift check compares only the unthemed and dark roots.
  - Firefox: Puppeteer's BiDi `down` and `up` are separate action chains, and Firefox's remote agent resets its click count per chain and on every pointer move. Confirmed in `remote/shared/webdriver/Actions.sys.mjs` (`ClickTracker`, `CLICK_INTERVAL = 640`, "We shouldn't be able to simulate a double click with multiple action chains").
- Puppeteer 25.8.0 types `clickCount` on `MouseOptions` as `@internal`; Chrome's `doubleClick` sends CDP `Input.dispatchMouseEvent` presses instead.
- Component tests: each of the two `Popup.test.ts` cases goes red with its part of the guard removed (the click listener; the reset in `activate()`; the primary-button check).
- Chrome reproducer, first runs at load1 about 144 (the host held load1 above 200 for about 40 minutes before):
  1. No delete icon could be aimed: a saved contact's snack sat over the list's bottom rows (diagnosed on the next run).
  2. Both clicks hit `snackbar`, which had moved over the point after the aim's hit test. Fix: wait until no snack shows before measuring.
  3. The first click's `delivered` read false: `RowAction`'s `@click.stop` keeps it from the window's bubble listener (the Opus review found the same from source). Fix: read only the second click's delivery.
  4. Green, 5.2 s.
- Captures: same-head "before" frames from a temporary, never-committed probe that drew the light line back inline on the card (`box-shadow`, light only) or set `--scrim-popup` back to the dark value on `<html>`; dark is unchanged by page 39, so each pair shows before · light, after · light, and dark. Pixel read on `sheet-confirm-delete` and `sheet-receive`: the ledge is `#c9c5bd`, six rows above the accent edge; the line showed only in the last 6 px at the right edge, now page wash (`screenshots/p39/sheet-line-detail.png`, 10×).
- Before the review fixes: `bun run lint`, `typecheck:all`, `test` (828 files, 13 559 tests) and `check:plans` exit 0. At eb228334 plus the probe lines (removed after): the arc's nine smoke files at retry 0, Chrome 9 files / 44 tests in 322 s at load1 139, Firefox 9 / 44 in 426 s at load1 148, run side by side; `network/session-tabClose` on Chrome at `NULO_E2E_RETRY=0`, 3 tests in 275 s.
- The reproducer's runtime, measured: Chrome 5.6 s, Firefox 8.6 s, each including up to seven `addContact` round trips the file's earlier cases leave to it. Estimated before running: about 5 s and 10 s.
- Red check: with `@click.capture="refuseCarriedClick"` removed from an armed build, the reproducer fails on both engines at the same assertion: the `detail`-2 click on `confirm-submit` arrives with `prevented: false`. Firefox's single action chain does count the second press as 2.
- Known limit #715 filed and closed (stacked sheets: a double-click that dismisses a top sheet can act on a taller sheet beneath, outside the signed rule).
- Codex round 1 (`approve with fixes`, three low) and the Opus review (`approve with fixes`) beside it; Codex round 2 `approve` (plan § Audit verdicts).
- Dev merged again (#712, #713; no file of this arc). At the merged head f739eaaf: `audit:vue`, `test:all`, `test:ci-gating`, `check:plans` exit 0. `test:all`'s first run timed out once in `import.test.ts` ("a failure recorded for the imported profile ends the wait at once", 5 s, at load1 about 160); the file passed 3 of 3 alone and `test:all` passed on its rerun.
