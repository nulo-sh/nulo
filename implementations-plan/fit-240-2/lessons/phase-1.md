# fit-240-2: phase 1 (the six 240 px checks)

## Gates, 2026-10-21 (base `b88c20a39`, armed builds, retry 0, load1 150 to 180)

- `bun run lint`, `bun run typecheck:all`, `bun run test` (903 files, 14960 tests): exit 0.
- The three files, base then after (file time, s):

| File | Chrome base → after | Firefox base → after |
|---|---|---|
| `security-backup` | 32.6 → 36.0 | 48.9 → 55.8 |
| `passkey-backup` | 39.2 → 42.2 | 56.8 → 72.5 |
| `backup-imported-account` | 47.4 → 52.8 | 59.5 → 64.6 |
| all three (vitest duration) | 135.2 → 150.5 | 173.8 → 208.2 |

  The tests that gained checks: Chrome 21.9 → 26.0, 8.3 → 11.1, 46.6 → 52.3; Firefox 26.9 → 36.4,
  9.8 → 12.7, 57.5 → 61.6. Firefox tests with no change also grew by 2.5 to 3.6 s in the same run,
  so part of its delta is host load. Each check after a download waits out the 2 s success toast.

## Controls (Chrome, scratch, never committed)

- First attempt: a `<style>` element injected with the hiding rule. The page's CSP refused it, so
  every control stayed green and the launch's CSP check failed three files. A control in an extension
  page must go through CSSOM: a constructable stylesheet in `document.adoptedStyleSheets`.
- Second attempt: `@media (width < 300px) { [data-testid=<target>] { display: none } }` before each
  of the six checks, removed after: all six red with fate `gone`. `nowrap`, `overflow: hidden` and
  an ellipsis on the card's title: red with fate `cut`. Each real check then passed; no CSP entry.

## Pictures and the scroller reading (both browsers)

- `atWidth(page, NARROW_WIDTH, () => shotSend(...))` at each check, `NULO_E2E_SHOT_DIR` set:
  24 PNGs (six states, light and dark, Chrome and Firefox) in `../screenshots/`.
- The held working card sits wholly under the passkey dialog, so its picture hides the dialog with a
  scratch stylesheet. The dialog is a fixed overlay and the card's layout does not depend on it;
  a person sees this frame once the passkey answers, while the export runs.
- At every check on both browsers the hero `.wrapper` read `scrollWidth` 240, `clientWidth` 240,
  and the document 240: no sideways scroll (#1023's blind spot does not hide anything here today).
