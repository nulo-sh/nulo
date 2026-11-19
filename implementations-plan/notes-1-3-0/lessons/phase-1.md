# notes-1-3-0, phase 1: the notes, the page, the cards

- First draft: 3,428 code points, over AMO's 3,000. Cut by tightening each bullet and dropping the Receive QR line; final 2,884.
- `release-notes-run.ts check` reads only the version in the root `package.json` (1.2.0 here), so it passes without reading `1.3.0.md`. The file-wide rule is `release-notes.test.ts`; the gate runs that instead (plan D9).
- `og:cards` rendered `1.3.0.og.png` and re-rendered `index.og.png` in one pass (load1 about 34); the fifth change title wraps to three lines inside its budget.
- Codex pass (gpt-6.1-sol, high): round 1 `changes needed` (seven findings, all held: plan § Review verdicts), round 2 one more (the relay keeps a carried send's receipt checks), round 3 `approve`. Every finding was a condition the text left out (a price shown, a seal's meaning, a version revealed, a send pinned to its endpoint): read each "only", "every" and "once" against the code before handing notes over.
- Applying the findings pushed the text to 3,132 code points; cuts brought it to 2,952. Margin is thin: dropping a conditional bullet frees 80 to 130.
