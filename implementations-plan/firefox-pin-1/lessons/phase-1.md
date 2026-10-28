# Phase 1: the three refusals, on the 153 pin

- `pickFile` on Firefox sets the pending input through classic Element Send Keys (`WebDriverSession.setFileInput`); `answerRequests` lands on both drivers; `interceptHealth` maps onto it and returns `AnsweredRequests`; settings-proving and presto-host-permission read `hits`, each with a positive count beside its zero.
- The onboarding self-test became the answerer's contract test: two pages armed at once with different bodies for one URL, the refused URL rejecting the fetch, and per-page counts `[1, 1]` and `[1, 0]`.
- The manifest compare drops `sandbox` only when it is `null` and the source names none. Biome's `noDelete` info steered it to a rest destructure, not a `delete`.
- Seam ban: `uploadFile` and `setRequestInterception` added. With the two names removed from `DRIVER_PAGE_CALLS`, the two new bite rows fail (2 failed, 52 passed); restored, 54 passed. `browser-seam.test.ts` is not part of `bun run test`; run it directly or through `test:ci-gating`.

## Gate (2026-10-28, armed builds from the base, no product change)

| Run | Result | Wall-clock |
|---|---|---|
| `bun run lint` | exit 0 (24 warnings, 4 infos, all pre-existing) | — |
| `bun run typecheck:all` | exit 0 | — |
| `bun run test` | 947 files passed, 3 skipped; 16166 tests passed | — |
| Chrome, the five-file list, retry 0 | 5 files, 21 passed | 145 s |
| Firefox 153.0.4, the five-file list, retry 0 | 5 files, 21 passed; 20 launches `[firefox] 153.0.4` | 228 s |
| Firefox 153.0.4, presto-host-permission + toolbar-panel, retry 0 | 2 files, 6 passed; 6 launches `[firefox] 153.0.4` | 113 s |
