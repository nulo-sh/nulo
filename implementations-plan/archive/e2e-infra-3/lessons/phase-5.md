# Phase 5: the seam, its callers and the ban

## 2026-10-28 · Build

- Items 1-3 are `37b8bb78b`, `a2920c09d` and `332298970`. The 66 call sites were moved by a script that rewrote `x.bringToFront()`, `x.setViewport(…)` and `x.viewport()` and added the imports; no receiver was anything but a `Page`, and no `.catch` chain changed meaning. `onboarding-tab` now restores unconditionally, `null` included.
- `browser-seam.test.ts` was red on the scratch spike, which still called Puppeteer directly (9 lines), and on a planted `fixtures/_planted.ts` (`page.setViewport(null)`), then green with both gone.
- `e2e:agent` builds into `dist/<browser>`, and smoke's setup kills any browser that loads its extension path. So a smoke run beside a network run of the same browser loads a copy of the armed build (`EXTENSION_PATH=.e2e-state/smoke-dist/<browser>`).

## 2026-10-28 · Gate (retry 0)

- `lint`, `typecheck:all`, `test:all` (extension 16012 passed): exit 0, at `332298970`.
- Full smoke in six shards. Chrome: 273 passed, 27 skipped, 0 failed, 26 min. Firefox 153.0.4: 276 passed, 24 skipped, 0 failed, 42 min, at `441d62d70`, after the review fixes. The counts match arc 1's.
- Chrome network, proverless, one `e2e:agent` run without the five prover-ON canary files, which CI's canary job runs. 129 files: 233 passed, 8 skipped, 0 failed, 91 min. `send-chaos` skips without `NULO_E2E_CHAOS`.
- Two more full Chrome smoke runs, beside the network run. Run 2: 273 passed, 0 failed. Run 3: one `security.test.ts` failure, "the unlock method changes to a passkey and back to a password", with `pageErrors` holding `Error: Profile locked` at its last line. That is #1216, open, at 2-5 % on `dev`, and on Chrome the seam passes Puppeteer's own calls through. Run 3 was otherwise 272 passed; the file's one known-flake rerun passed 6/6.
