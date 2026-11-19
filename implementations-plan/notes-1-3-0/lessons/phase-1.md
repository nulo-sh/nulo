# notes-1-3-0, phase 1: the notes, the page, the cards

- First draft: 3,428 code points, over AMO's 3,000. Cut by tightening each bullet and dropping the Receive QR line; final 2,884.
- `release-notes-run.ts check` reads only the version in the root `package.json` (1.2.0 here), so it passes without reading `1.3.0.md`. The file-wide rule is `release-notes.test.ts`; the gate runs that instead (plan D9).
- `og:cards` rendered `1.3.0.og.png` and re-rendered `index.og.png` in one pass (load1 about 34); the fifth change title wraps to three lines inside its budget.
