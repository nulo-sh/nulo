# flake-1 phase 2: the stand-in

- Attempt 1 (stand-in wired, no other change): `toolbar-panel.test.ts` on Firefox, 5 of 6 green. The unasked cancel came in 331 ms. The contacts card's later `pickFileByTestId` timed out: `pickFile: the click opened the file picker: not within 10000 ms; last: "not held"`.
- Diagnosis (scratch debug log in the stand-in): the arm named `browserId` 34 and the first, unasked pick's `open` came from 34, but the second click's `open` never came. Firefox 158's Remote Agent grants `userActivation` for the evaluate alone (`shared/Realm.sys.mjs:220-233`), and the contacts import clicks its input 50 ms later, so no picker opened. The base's Send Keys had filled the input of a pick whose picker never opened.
- Fix (D8): the two contacts openers use `pointerClick`. Attempt 2: `toolbar-panel.test.ts` 6 of 6 green (cancel 250 ms, 145.3 s, load1 84).
