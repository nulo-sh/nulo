# wrap-2: phase 1 (arc 1)

- The scan case was red on the base `index.vue` (`boundAttr` read no class) and green after the rule.
- `test:all` went red once: `profile-chaos-model.test.ts` checks that each line the chaos model cites (`tests/e2e/helpers/profile-chaos/model.ts`, `cite(ACCOUNT_PAGE, <line>, <fragment>)`) still holds its fragment, and the new comment's third line moved four of them down by one. The citations moved with them; the fragments did not change. The plan's change map had missed the file.
- Gate 2 (`cap-chain-mismatch`, retry 0): green on Chrome and Firefox.
- Gate 3 (the after capture): the worst banner part ends 0.2 px inside the banner in Chrome and 0.1 px inside in Firefox, for both long names, both states, at 400, 360 and 240 px. The seed rows keep each browser's base heights and line counts. The identity line still runs past its box (D5).

## Codex loop
