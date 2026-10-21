# Phase 3: the hand-off e2e, smoke, pictures, and the fix loop

## The e2e step

- The contacts step passed at retry 0 on its first run (29.5 s locally at load average ~370; CI's dev baseline for the test was about 19 s).
- Mutation check: a build whose background never calls `openPopup` fails the step at the return wait (30 s), so the step proves the reopen.
- `toolbar-panel`, `own-window` and `contacts-import` at retry 0 on Firefox: 16/16.
- A full Firefox smoke run was stopped at about 17 of its files, none failed, once the fix loop changed the boot path; the gate reruns on the fixed tree.

## Fix loop, round 1

- Codex (`gpt-6.1-sol`, high, read-only, session `01a15fc7-f0d6`): `reject (with blocking findings: F1, F2, F3)`.
  - F1, an already-open panel misses the result: not changed. The Outcome bar's fallback covers it (the next panel lands once); following a hand-back in an open panel is an owner decision. Recorded as a known limit.
  - F2, a marked URL in a tab became a card with a dead Cancel: fixed; card mode needs a popup-type window, read before the router.
  - F3, a valid Restore again label over 200 characters dropped its snack: fixed; the cap is 2048, above 64 networks of 25 characters.
  - F4, a selector in the e2e: fixed; the probe holds the clicked input.
- Opus 5.5 diff review (general-purpose agent): `conditional approve (with conditions: make returnToPanel single-shot with a concurrency test; give an empty account file a visible refusal)`.
  - Both conditions applied. The empty file shows the page with its file name, as outside the window, rather than a new error line: new copy would be a UI change.
  - Nits taken: write and send independent; the header check after the session is open; `settleLanding` moved to `src/composables/panelLanding.ts`; comment placement and SFC order.
  - Nit 8 declined: the account import's `ownWindowRoute()` branch is live again for a marked URL in a tab.

## Fix loop, round 2

- Codex (resumed, high): `approve`. No material finding. It found that F1's disposition holds as an explicit product tradeoff. It checked in memory the window-type gate, the single-shot hand-back, the reopen after a failed write, the longest restore label (1,739 characters), and the lock and profile races in the moved watcher.
- The loop converged in two rounds; `audit:vue` exit 0 on the fixed tree (900 files).
