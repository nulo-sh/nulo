# locked-discovery-1: phase 0 (planning) consults

## Round 1, Codex (gpt-6.1-sol, high, read-only), 2026-11-18

Verdict: `reject (with blocking findings: late-open race, cap self-counting, restart cleanup and Firefox test gaps)`. Each finding verified against the tree:

1. High, demonstrated: the locked branch's `getProfiles()` await lets an unlock drain the queue and open the connect window; the SDK row stays pending behind that window, so a deadline read from the SDK rows opens a second, unlock window afterwards. The plan's "no pending row" sentence was wrong. Accepted: a window opens only while the queue still holds a request of the origin (synchronous, no await before the open).
2. Medium, demonstrated: counting the origin's own unlock window in `checkDiscoveryPopupCaps` refuses the discovery that would replace it. Accepted: the count credits the window the interaction adopts.
3. Medium, verified by reading `closeRestartEndedTabs` (`documentUrl` of each tab context): once the page routes to `/popup/auth`, the restart cleanup no longer recognises it and an orphan lock screen survives with a stuck spinner after an unlock. Accepted with a different fix: the window keeps its `windows/unlock` URL while locked (the lock screen body moves into an L4 module both the page and the window render), so the URL rule holds; no URL marker on `/popup/auth`.
4. Medium, demonstrated: Firefox's driver cannot stop the background under an open extension page (`stopsBackgroundUnderOpenPage: false`). Accepted: the restart spec branches on that capability; the gates gain `NULO_E2E_RETRY=0`, the smoke build prerequisites and concrete directories.
5. Medium: "the dApp cancels" is observable only as a tab close (navigation is unsignalled without `tabs`, `tab-lifecycle.ts` header). Accepted: stated precisely; a known limit at close-out.
6. Low: the queue's expiry is lazy (no timer); no framework-level lock gate does not mean no method checks. Accepted: recon F1 and F3 corrected.
7. Low: "a page learns only the discovery's outcome" contradicts the focus signal the plan names. Accepted: the invariant is reworded.

## Round 1, Opus Plan agent, 2026-11-18

Verdict: `conditional approve (with conditions: #1 fixed and the restart e2e redesigned for both browsers (#7); #2 and #3 fixed; #5 and #6 sent to the owner or filed as known limits)`. Verified:

1. Medium, demonstrated: the restart orphan (same as Codex #3; `utils/window-document.ts:2-4` says a locked window moves to `/popup/auth`). Fixed by keeping the window's URL (D5).
2. Low, demonstrated: the late open (Codex #1). Fixed (D3).
3. Medium, demonstrated: two sites waiting, the person unlocks in B; the drain serves A first and navigates A's window, which lies under B without focus. Fixed: the hand-over focuses the window (D2), as `showVerifyInConnectWindow` did at `e8fe932d4^`.
4. Low, demonstrated: cap self-count (Codex #2). Fixed (D4).
5. Low to medium, demonstrated: the lock screen's other exits (New profile, Import, Forgot password) stay live in the window; the cut-off or the hand-over can cut such a flow. Known limit KL-2 (D15).
6. Asks: subdomain hopping (32 windows), reopen after close, browser start. Answered by the owner's quoted words; the numbers are now in the Security section. Not a new ask.
7. Medium, plausible: Firefox's stop under an open page; `waitForPopup` on a URL that turns into `#/popup/auth`. The first is Codex #4; the second disappears with D5 (the URL stays `#/windows/unlock`).
8. Low: I1's precedent logged either path and pinned neither. I1 reworded; the e2e accepts both.
9. Low: recon missed `utils/window-document.ts`. Reused.
10. Low: the manager's timeout line is `warn`; a page could make it recur. Fixed (D14).
11. Low: "listed as passed" needs `--reporter=verbose`. Fixed in the gates.

## Final fresh pass, Codex, 2026-11-18

Verdict: `conditional approve (with conditions: preserve the unlock route through shell lock/recovery routing and test those paths)`. Verified:

1. Medium, demonstrated: `createLockedState.land` (`locked-state.ts:54`) and `settleUndecidedBoot` (`app.vue:450`) push `/popup/auth` over any page, so a re-lock while the window waits, or an unreachable boot, still erases `#/windows/unlock` and the restart cleanup loses the window. Accepted: `ownsLockScreen` (the current route `windows-unlock`, the boot record only before the router resolves) leaves the page in place at all three writers; seal and reselection still run; tests in `lock-landing.test.ts` and `locked-state.test.ts` with controls (D5).
2. Low, demonstrated: the move breaks `auth.vue`'s relative `composes` path (`:567`); vitest skips CSS modules. Accepted: Phase 2 step 1 repoints it; `build:chrome` joins Phase 2's gate.
- Re-check, same session: `approve`; the zero-profile control joined `locked-state.test.ts`.
