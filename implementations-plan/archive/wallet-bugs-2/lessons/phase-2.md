# wallet-bugs-2: phase 2 (#648, the journal Method row)

- Before pictures: taken in the red run (label testid only, no style change), Chrome, 360 × 600, both themes. The base row: the value right-aligned in its own box but left-aligned text inside it, `gap: 0` to METHOD.
- Red, Chrome, label testid and check only: named record `{"lines":3,"overflow":0,"gap":0}`; nameless record `{"lines":1,"overflow":170.0,"gap":0}` (one unbreakable word runs 170 px past the box). Assertion failed on `gap >= 15.5`.
- First red attempt read the named record twice: the journal page loads its record when it mounts, and a hash change from one journal record to another reuses the mounted page, so the check now goes through Activity between the two records (no user path links one journal page to another, so the page is not changed for it).
- Green after D5, Chrome and Firefox: named `{"lines":3,"overflow":0,"gap":16}`, nameless `{"lines":2,"overflow":0,"gap":16}`.
- Gate: lint 0, typecheck:all 0, `detail-page.styles.test.ts` + journal unit tests 36 pass, `rows.test.ts` Chrome 9/9 (file 79 s, run 92 s), Firefox 9/9 (file 119 s, run 139 s).
