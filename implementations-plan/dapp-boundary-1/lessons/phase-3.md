# dapp-boundary-1: phase 3 (network proof, docs, review loop)

## Docs (2026-10-17)

- `execution/README.md`: the file map names `app-facing-results.ts` and the refusal; one invariant line. `UPDATE.md` § Types coupled to Aztec shapes: the constructors the reduction is typed against, and what an upstream field change does to it.

## Review loop (2026-10-17)

- Codex round 1 (gpt-6.1-sol, high), session 01a14ac1-6932-74d1-89cd-dce9ec0294f4: `approve`, no finding.
- Opus diff review (`general-purpose`, opus): `conditional approve`. (1) Restate committed plan wording as the change and its invariants. (2) Omit `stats`: the PXE starts recording node calls before it syncs (`pxe/dest/operation_queue.js:81-115`), so the stats time and count the wallet's own sync as well as the dApp's call. (3) Seed a private call request in the fixture. Verified (2) in the installed source before acting.
- Codex, same session, on those points: `conditional approve`; (b) of keep / drop / keep-timings for `stats`, recorded as a D3 amendment; restate the wording, folding each fix into the commit that introduced it, which is proper on a branch never pushed; seed the request. Applied: the plan-commit fixes landed through an autosquash rebase onto `13d5f8d0` (same tree after, every commit re-signed), `stats` is `undefined` in the answer (`9bb5126b`), and a mutation that copies `privateCallRequests` or `stats` through reddens the tests.
- Codex resumed to verify: `approve`.
- Codex round 3, resumed with the review standard's two rules verbatim (the earlier prompts in the session had left them out, a miss in this run's prompts): `conditional approve` on six low-severity comment and wording trims; all applied (`d9bb5827`). No material finding remained.

## Network e2e (retry 0, Chrome; `bun run e2e:agent`, load1 < 150 at start)

| File | 713dbf0f (before the review fixes) | 9bb5126b (final behaviour) |
|---|---|---|
| `selfpay-phase` | 310.4 s ✓ | 301.3 s ✓ |
| `sim-from-selfpay` | 40.9 s ✓ | 46.7 s ✓ |
| `delete-after-prove` | 52.7 s ✓ | 62.5 s ✓ |
| `sim-methods` (3 tests) | 69.9 s ✓ | 61.3 s ✓ |
| `err-scope-and-cap` (2 tests) | 20.6 s ✓ | 19.1 s ✓ |
| vitest duration | 707.9 s | 672.3 s |

`selfpay-phase` and `sim-from-selfpay` read the reduced answer through the playground's summary after the SDK's own parse: the network control that the app-facing shape still serves a stock dApp.

## Network e2e (retry 0, Firefox, `NULO_E2E_BROWSER=firefox`, d9bb5827)

- `delete-after-prove` 111.9 s ✓, `sim-methods` (3 tests) 91.6 s ✓; vitest duration 367.6 s. The load check passed at 149.97 and read 155.9 by the time the run recorded its start. The aztec CLI's anvil bind error at boot is the expected one the setup log names.
