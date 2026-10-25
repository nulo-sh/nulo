# sheet-1, arc 1, phase 2: retire the setting

- First `bun run test` red: `src/popup/pages/settings/index.test.ts` typed "full" into the hub's search and expected one result. jsdom has no `chrome.sidePanel`, so the retired row was that query's only hit. Re-pointed to "motion" (Disable animations, by a synonym). The recon's retirement map had missed the file.
- New search expectations were computed with `searchSettings` over the registry (a throwaway probe test, deleted): "ation" finds Disable animations by title, then Theme by description; "full", "panel", "side", "dock", "screen" and "popup" find only Open as Side Panel on Chrome and nothing on Firefox; "nimat" finds Disable animations by a term inside a word.
- The auto-import files regenerated with `bun run --cwd apps/extension build`: one line out of `.eslintrc-auto-import.json`, two out of `auto-imports.d.ts`.
- Gate (second run): unit layers green, the grep empty, `settings-routes` 6/6 at retry 0 on Chrome and Firefox.
