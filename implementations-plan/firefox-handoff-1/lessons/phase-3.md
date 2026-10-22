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

## Pictures

- The cards and the account page after a pick are page screenshots of a real popup-type window opened from the control page, at 380×660 and 2x, with the theme set on the document.
- The reopened panel is Firefox's own snapshot of the open panel's browser (`drawSnapshot` on its window global, from the privileged scope). The canvas comes from the browser element's `ownerDocument`. `ownerGlobal` reads `undefined` there, and the throw inside the promise callback left the script hanging until its timeout.
- The Cancel picture first failed with no reopen, which was correct. The scratch harness named the control tab's window as the opener, but focus went back to another normal window, so the handler opened nothing. Naming the last-focused normal window as the opener, as the panel does, reopened it on Contacts with no snack.

## Smoke and the merge

- `origin/dev` moved two commits and conflicted on `index.md` only, so it was merged before the gate (`chore: merge origin/dev`) and both dists were rebuilt with the smoke flags. #889 is still open.
- Firefox, full smoke at retry 0 on the merged tree: 267 passed, 1 failed, 17 skipped; 3711 s wall-clock at load average ~250. The failure was `auth-flows.test.ts`'s "wrong password surfaces error-text and lets the user retry" at its own 30 s budget, which includes the first launch. Its sibling took 29.7 s in the same run. The file alone at retry 0 passed 5/5, with that test in 20.0 s, so it was a host-load flake. `toolbar-panel.test.ts`: 6/6 in 151.7 s, with the changed test at 29.7 s.
- Chrome, full smoke at retry 0: 268 passed, 0 failed, 17 skipped; 2141 s.
- `bun run test:all` exit 0 (extension 902 files, 14944 tests); `lint` and `typecheck:all` exit 0.

## The second merge: #889 and #924

- #889 (the Firefox sidebar) and #924 (contacts sealed at rest) landed before the PR opened, so `origin/dev` was merged again (`c4ad61c76`). Conflicts were in imports only: `wallet/index.ts` and `toolbar-popup.ts`.
- The sidebar is not a `popup` view, so `closesOnFocusLoss()` is false there. A pick started in the sidebar runs in place, and the sidebar never reads the record.
- `openToolbarPopup` now points the button back at the popup before `openPopup`, so the hand-back's reopen still opens the panel with the sidebar setting on. The known limit is restated in the plan.
- On the merged tree: `lint`, `typecheck:all` and `test:all` exit 0 (extension 907 files, 15009 tests). Firefox at retry 0: `toolbar-panel`, `own-window`, `contacts-import` and `firefox-sidebar` 20/20 in 303 s; the changed test took 25.3 s.
- Full smoke at retry 0 on the merged tree: Firefox 273 passed, 0 failed, 17 skipped, 3433 s; Chrome 269 passed, 0 failed, 21 skipped, 2254 s. `toolbar-panel.test.ts` took 161.3 s in the Firefox run, with the changed test at 30.3 s.
- Four more dev commits landed before the push, among them #986 (every page fits down to 240 px). They merged clean (`6c01882e3`). On that tree: `lint`, `typecheck:all` and `test:all` exit 0; the targeted Firefox files passed 20/20 in 409 s; a re-shoot left the card pictures byte-identical and the panel pictures different only in the new wallet's address. The full smoke on that tree is the PR's CI.

## After the owner's sign-off (page 81)

- P81-01 C dropped the line of why. The card now shows its title, Choose file and Cancel; its test pins those as its only words. All four card pictures were re-shot, light and dark.
- The owner asked how a very long contacts import behaves across the hand-off. The file is read, reviewed and written in the hand-off window. The window's progress line counts there ("Importing contacts · k of 500") while both card buttons are off. Nothing is handed back and no panel opens until the import ends; then the window closes and the panel reopens on Contacts with the final line.
  - No Firefox e2e covered the long path, so the toolbar-panel contacts step now imports the 500-row file. It asserts the count in the window, both buttons off, no record and no panel, and all 500 stored after the return.
  - The step took 25 to 30 s before and 52 to 55 s after (local, load average ~150); CI is in the PR. The shared file builder moved to `helpers/contacts.ts`.
  - The run showed no defect. While the import runs, the card keeps its title "Pick the contacts file" with greyed buttons; changing that wording would be a new owner ask (picture `card-contacts-importing-*`).
- #1022's hand-off half: the card now passes `expectFitsNarrow` at 240 px in the same step, the longest title of the three, since a person can drag the window that narrow. The pages after a pick already had 240 px checks: the account import in the type-roles sweep, Restore again in `restore-outcome.test.ts`, and the lock screen's full-backup window from #1025.
