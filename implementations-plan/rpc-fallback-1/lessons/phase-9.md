# Phase 9 (arc 4): the endpoint list shows order, status and a drag to reorder

The owner's P117-11 A, decision page 117, signed 2026-11-06 18:13 UTC with no note: "A: Numbered rows with a drag handle and a status dot each, replacing today's checkbox; while a row is lifted every number shows the place a drop would give it; the edit sheet opens with the dot, the state word and, for a failing endpoint, a red error line ('No answer since 1 min ago. The connection failed.'). A tap still makes a row primary."

## As built

- **The router.** `lastFailure` is set after the batch dedupe (a counted failure only) and before the already-down return, so a down endpoint's later failures update it. A changed kind on a down endpoint emits a `failure` health change, which `changed` reports and the route log skips; the same kind again emits nothing.
- **The refresh chain.** The registry announces a runtime's route change, its build, its rebind and its drop, each guarded so a throwing listener never reaches routing. The background's `PxeServiceClient` hears offscreen events only once connected; `NetworkService.init` connects it after adding the listener (it used to connect on its first request).
- **The write.** The tap goes through `reorderEndpoints([tapped, ...the rest as shown])`, so the stored array's first is always the primary after any move from the page. An unchanged order (as `routeEndpoints` shows it) writes nothing.
- **The page.**
  - It shows the move's order at once (`pendingOrder`) and writes moves one at a time; a move queued behind another keeps showing until its own write settles. A failed write re-reads the row and says "Failed to update the endpoint order", or today's primary error when the first row changed.
  - A row whose stored primary is missing still lists every endpoint in stored order; `routeEndpoints` would throw on it.
  - The route read is mirrored into `cacheStore.endpointRoute` for the edit sheet, and cleared when the page unmounts.
  - The moved-first line's state is read from the dot before the move, since the rebuilt route starts every endpoint unasked; it is set once the write lands and cleared when the row is no longer first or its dot turns green.
- **The list.**
  - The handle is a native button inside the row's icon slot, above the stretched row target, with `@click.stop` so a press never reaches the row's tap. A one-row list and a held reset render no handle, so `rows.test.ts`'s Tab order (row target, then edit) is unchanged.
  - Rows move by transform while lifted, so the DOM order stays put during a keyboard lift; Vue moves the nodes only on the drop, which drops focus in jsdom and in browsers, so the moved handle is refocused after the re-render when focus fell to the page.
  - jsdom has `PointerEvent` but `trigger` cannot set its read-only `pointerId`, so the component test dispatches pointer events directly; the handle's own listener is the first on their path.
- **The sheet.** Its "ago" counts from the later of the read and the sheet's opening, so a sheet opened minutes after the page's read does not understate the outage; it never ticks.

## Runs

- 2026-11-07, Chrome, proverless, retry 0, `endpoint-order` alone: green on its first run. Test 99 s (86 s after the fixture), against an estimate of 90 s. Captures taken at 360×600 in both themes.
- 2026-11-07, Firefox, run 1: red before the test began. `setViewport` refuses a `deviceScaleFactor` on Firefox, so the spec now passes none there.
- 2026-11-07, Firefox, run 2: red at the first capture. Firefox's BiDi refuses `captureScreenshot` on an extension page ("browsing contexts in privileged scope"), so captures are Chrome's only, and the gate's Firefox command sets no shot directory.
- 2026-11-07, Firefox, run 3, no captures: green. Test 197 s (180 s after the fixture). The dots took longer to follow the router than on Chrome; each nudge's Home entry is slower there.

## The arc's diff review, round 1

- **Codex `01a1b43a`**: revise, 6 P2 and 3 P3, no P1.
  - **Overlapping reads.** A newer read invalidated an older one, so an older answer could be dropped for a newer read that then failed. The composable now runs one read at a time, and a signal during a read asks for one more after it.
    - The first rewrite cleared its in-flight marker in a `.finally()` on the run's promise. That ran one microtask after the loop's last check, so a signal landing in between was lost.
    - The page test caught it, through the order Vue's watcher and the loop's continuation run in. The marker is now cleared inside the run's own `try`/`finally`, and a composable test pins the gap.
  - **Another window's URL edit.** It kept the ids, so the page's list fence passed an answer for a list it did not show. The background now answers only for the list the page sends, in route order.
  - **The other P2s.**
    - Unequal row heights: each row is now measured at the lift.
    - Escape during a pointer drag: the handle is now focused at the lift.
    - A fallback-only move cleared the warning: only a first-row move clears it now.
    - The e2e read the router's log lines once, racing the logger's 2 s flush: the read is now polled, and the holder after the kill is attributed too.
- **Opus 5.5**, fresh: approve with changes.
  - **A tap after a drag.** A cancelled drag's closing click landed on the row and tapped it. A click a handle press began is no longer a tap; a keyboard click, `detail` 0, always is.
  - **Focus on a keyboard tap.** A keyboard tap moved the row's node and dropped focus to the page. Focus now returns to that row's target.
  - **Bulk drops.** `clear` and `disposeProfile` announced no route change; they do now.
  - **Mid-write rows.** Delete showed on the stored primary while a move was being written; it no longer does.
  - **The toast.** A failed re-read after a landed write reported the write failed; it no longer does.
  - **Untested wiring.** `init`'s relay and the handle click are now tested.
  - **Rejected: one snapshot schema.** The network spec ships in the popup bundle, so a value import from the PXE barrel would pull the offscreen runtime into it.
- Every new test was seen red against its fix reverted.

## Round 2

- 2026-11-07, Chrome, the round-1 fixes: `endpoint-order` and `rpc-edit-mid-proof` green at retry 0, 99 s and 64 s. The tap now reorders, and the edit test needed no change.
- 2026-11-07, Firefox, the round-1 fixes: `endpoint-order` green, 199 s.
- **Codex resumed: revise, 2 P2.** Round 1 was confirmed closed.
  - A landed order went back on screen when the re-read after it failed. The written row the service returns now stands in until the re-read lands.
  - A keyboard tap's recorded refocus outlived a later pointer tap and stole focus back. Any pointer press now ends it.
- **The captures caught one more.** Focusing the handle at a pointer lift, the round-1 fix for Escape, drew the keyboard focus ring for the whole drag.
  - A pointer drag now leaves focus where it was.
  - Its Escape is taken by a document capture listener that lives only as long as the drag.

## Round 3

- **Codex resumed: approve with changes, 1 P3.**
  - Both round-2 fixes passed their reproductions. The drag's document listener is removed on every path out of a drag.
  - The P3: a key pressed on a control focused before a pointer drag could open a sheet over the drag. The sheet's Escape then also cancelled the drag.
  - Fixed after the round: a popup opening (`popupStore.len` rising) ends a pointer drag where it started. The test was seen red without it.
  - The three-round cap ended the loop, so this fix has no Codex verdict.

## Final gates

- 2026-11-07, on `d52aad84e`: lint, typecheck:all, audit:vue and test:all green; Chrome `endpoint-order` 99 s (86 s after the fixture) and `rpc-edit-mid-proof` 62 s, green at retry 0.
- 2026-11-07, Firefox `endpoint-order`, retry 0: red at "the account engine's router took B down after the kill", after the page had shown B red and A green and the router's log showed A holding the role.
  - **Cause.** Below Debug the logger's ring keeps 1000 lines, and `routeEvents` only refuses a partial log at 2000 lines, so it never refuses one at the default level. Firefox's dots follow the router more slowly, the wait for them sent more nudges, and B's `down` line left the stored log before the single read after it.
  - **Fix.** The test reads the router's events at every nudge and keeps what it has seen, so a line is read within a poll of being stored. The fixture's guard is #1740: the other network tests that read the log once after a long run are still exposed.
- 2026-11-07, on `4183c9b36` (the fix): lint, typecheck:all, audit:vue (149 s) and test:all (150 s) green; Chrome `endpoint-order` 99 s and `rpc-edit-mid-proof` 63 s, Firefox `endpoint-order` 199 s (182 s after the fixture), all at retry 0. The frames in `screenshots/` are this run's.
