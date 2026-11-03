# quality-sdk-1 arc 2: one helper for deadline and abort races

- Every converted site's suites ran at retry 0 on the base first (packages 61, 449, 283; the extension's site suites 4220) and after (344, 449, 442, 4223: the three added pins).
- Each new pin and each helper property was checked red under a mutation: site 8 returning `late` before observing its read, site 17 keeping its listener, and five helper mutations (a `.finally` close, no clear, no listener removal, abort checked before subscribing, an uncaught `onTimeout` throw).
- The first turn-count pin compared an `async` wrapper against a bare promise and read 2 against 1; both arms now go through the same wrapper.
- Moving `collectUnhandledRejections` into `@nulo/wallet-core/testing` broke `extension-messaging`'s typecheck (no Node types there): the helper now types the slice of `process` it uses and reads it at call time.
- The first `test:all` was red on `profile-chaos-model.test.ts`: the chaos model cites lines in `profile/service.ts` and `full-backup-restore.ts`, which moved up by 6 and 5. Re-cited by fragment; the second run was green.
- `audit:dup` is flat (1547 clones, 21267 duplicated lines; production 176 / 8759): jscpd's token threshold never counted these skeletons as clones. Production code is 60 lines shorter net (the sites lose 99, the helper and its export add 39); the added tests and test helpers outweigh it.

## Review

- Codex r1 (gpt-6.1-sol, high, read-only): approve, four documentation and comment findings, all accepted. It probed the timing on Node and Bun and found no ordering dependency at the sites whose turn moved.
- Opus (general-purpose): approve, its probes match the plan's turn table (bare race 2 → 2; site 6 V8 5 → 2, Bun 3 → 2; site 15 3 → 2; site 16b 1 → 1; site 17 1 → 2). Accepted: the site 8 pin's deadline margin (20 ms could expire before the service's own entry check on a loaded runner), the README rows, the two comment nits.
- Codex r2 (resumed): approve; one P3 (the README row restated the overbroad turn claim), fixed.
- Net-diff Codex (fresh session over both arcs, round 3): approve, no cross-arc defect; two P3s accepted (the plan's Parallelism line, an inexact TSDoc on `disagreements`), arc 1's module and type TSDocs kept. Loop stops here: no material finding open.
