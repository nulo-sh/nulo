# quality-sdk-1 arc 2: one helper for deadline and abort races

- Every converted site's suites ran at retry 0 on the base first (packages 61, 449, 283; the extension's site suites 4220) and after (344, 449, 442, 4223: the three added pins).
- Each new pin and each helper property was checked red under a mutation: site 8 returning `late` before observing its read, site 17 keeping its listener, and five helper mutations (a `.finally` close, no clear, no listener removal, abort checked before subscribing, an uncaught `onTimeout` throw).
- The first turn-count pin compared an `async` wrapper against a bare promise and read 2 against 1; both arms now go through the same wrapper.
- Moving `collectUnhandledRejections` into `@nulo/wallet-core/testing` broke `extension-messaging`'s typecheck (no Node types there): the helper now types the slice of `process` it uses and reads it at call time.
- The first `test:all` was red on `profile-chaos-model.test.ts`: the chaos model cites lines in `profile/service.ts` and `full-backup-restore.ts`, which moved up by 6 and 5. Re-cited by fragment; the second run was green.
- `audit:dup` is flat (1547 clones, 21267 duplicated lines; production 176 / 8759): jscpd's token threshold never counted these skeletons as clones. The tree is 120 lines shorter.
