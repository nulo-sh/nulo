# Phase 2: the picker triage (#1222)

Firefox 153.0.4 headless, the armed smoke build at `5ef0c119d`, retry 0, the host loaded by other lanes (load 20-210 on 188 CPUs). The probe was a scratch copy of `toolbar-panel.test.ts`'s contacts case that stops after the picker. It recorded, in the card window's realm, the click's time, `navigator.userActivation.isActive`, `document.hasFocus()`, `visibilityState`, and the input's `cancel` or `change`, then polled up to 60 s. It was never committed.

## 2026-10-28 · Stage 1, page-side

| Batch | Runs | Miss | Focused at the click | Click to `cancel` (ms), min / median / max | Wall per run (s) |
|---|---|---|---|---|---|
| Natural load | 20 | 1 (run 16) | 1 (run 16) | 6 / 9 / 14 | 20-28, run 16 81 |
| `taskset -c 184-187` | 10 | 0 | 0 | 4 / 5 / 6 | 18-20 |

- Every run had activation (`active: true`) and a visible document. The one miss is the one run whose document had focus at the click: no `cancel` within 60 s.
- CI: `gh run view --log` over the last 100 runs of `pr-extension-smoke-e2e-firefox.yml` (88 green, 12 cancelled): one first-attempt miss, run 40662873988 on 2026-10-28 (`PollTimeoutError: the picker's input clicked and cancelled … last: {"type":"file","connected":true,"active":true}`), absorbed by a retry.

## 2026-10-28 · Stage 2, the privileged wrapper

- The wrapper replaces the `@mozilla.org/filepicker;1` factory before the case opens a window. It delegates to the native class through `Components.manager.getClassObject(cid, Ci.nsIFactory)` and records `init`, `open` and `done` (with `Services.focus.activeWindow`). It is read once, after the poll.
  - A `Proxy` as the XPCOM object, and `Components.classesByID[cid]`, both made `createInstance` fail (`NS_ERROR_XPC_CI_RETURNED_FAILURE`). The arm now self-tests by creating one instance directly and one through the contract.
  - So the first 10 instrumented runs (7 / 7 / 9 ms, no miss, no focus) prove only that arming changes nothing page-side; their empty records prove nothing about the parent.
- With the working wrapper:
  - Unfocused click (2 runs): `init` and `open` within 1 ms of each other, ~130 ms after the press. The native `done(1)` (returnCancel) comes in the same millisecond, and `cancel` 9 ms after the click.
  - Focused click (3 runs, two focused by the probe with `bringToFront` and one focused on its own): `init` and `open` on time, `done` never within 60 s. No `cancel`.
- Base under the reproducing condition (the window focused before the click, no wrapper): 5/5 misses. Focus came on its own in 2 of the 48 runs that did not force it.
- D6 branch (a): `open` on time, `done` never. The native headless picker is the cause: it cancels at once for a document without focus and never answers one with focus.

## 2026-10-28 · Branch (a)'s change, measured and not shipped

- `remote.bidi.dismiss_file_pickers.enabled` on every launch (`capabilities()`, its own const, pinned by `firefox-driver.test.ts`, 65 passed): 20/20 focused runs with no miss, click to `cancel` 7 / 9.5 / 14 ms.
- It breaks Firefox's `pickFile`. The driver clicks with a real gesture, then fills the wallet's pending `body > input[type=file]`. The input stays only because a focused window's native picker never answers. Under the dismissal, `cancel` removes it first, and `toolbar-panel.test.ts`'s "a passkey profile's backup … restores in its own window" fails in `expectPickerLists` (2/2; the file at base 5/5 green, 107 s).
- The same mechanism means a Firefox `pickFile` whose window lacks focus at the click loses its input within ~10 ms (an inference from the unfocused runs; not seen in CI).
- So the dismissal and the file pick are one change on `BrowserDriver`: the pick must answer the picker rather than race it. That is #1111's ground (the pick moves off the pending input; on Firefox 158 the dismissal comes from `unhandledPromptBehavior.file`). Arc 2 stops at these numbers and ships no code (D10). #1222 stays open with them.
