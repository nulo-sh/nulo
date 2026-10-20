# privacy-cache-line-1: phase 1 (privacy 1.2.2)

## Gate (2026-10-20)

- `cmp` of `legal/archive/privacy-1.2.1.md` against `f55b7b4e6:legal/privacy.md`: identical.
- Word diff of `legal/privacy.md`: the version line, the two sentences, the history row; nothing else.
- The § 13 quote moved from `legal/privacy.md:391-392` to `:393-394`; `apps/extension/store/remote-code.md:110` re-pointed.
- `packages/legal` 59 passed, 1 skipped (the env-gated launch test; with `NULO_LAUNCH_GATE=1`, 60 passed: 0.31.0 is not a launch). `apps/landing` 79 passed; the build renders `/privacy` as draft and `/privacy/v1.2.1/` as superseded, the D2 state until the promote dates 1.2.2.
- `lint`, `typecheck:all`, `test` (886 files): exit 0.
- `test:all`, first run: one timeout, `service.fence-entry.test.ts` "every facade call passes a fence" (a whole-`src` source scan, 6.6 s against a 5 s limit), with load1 at 180-217 on 188 cores. It is unrelated to this diff, and the same file passed in `bun run test` minutes before. Per the host-load rule, the run was retried once after load1 fell below 180: exit 0.
- Smoke `legal-acceptance.test.ts`, Chrome, armed build, retry 0: 14/14 in 172 s (S9 reads the About row from the manifest, so it ran against 1.2.2).
