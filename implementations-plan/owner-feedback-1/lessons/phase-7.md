# Phase 7: #763 and #766, the incoming chip and the app-set fee sentence (arc 3)

- 2026-10-18: addendum appended to `plan.md`; Codex (gpt-6.1-sol, high) `approve with fixes`, all three adopted (verdict in the addendum).
- The separator is 2.78 px wide at 14 px Space Grotesk 700 (its -0.02em tracking included), measured in Chrome from the bundled font: the title row's `--sep-room` is 8.78 px. Wrapped, the chip sits 0.016 px from the clip edge and the separator's right edge 5.98 px past it, on Home, the token page and History, both themes.
- The popup's body is `--base-width` wide whatever the viewport (`popup/index.scss`), so a wider viewport leaves the rows at 360 px: the fit check sets `--base-width` on the root instead.
- The armed smoke build (`VITE_NULO_E2E_*` stamps) is required by the smoke global setup; a plain `build:chrome` fails it before any test runs. `e2e:agent` rebuilds `dist/<browser>` itself, so a smoke run and a network run on one browser never overlap.
