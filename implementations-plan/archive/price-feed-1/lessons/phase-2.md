# Phase 2: the publisher

## Deviations from the plan

- The feed diff's tests sit in `test/publish.test.ts`, beside the token and flag diff tests they mirror; `test/summary.test.ts` holds only the `signingChanges` git-range cases.
- `price-check.ts` copies the 16 KiB capped reader rather than importing `@nulo/wallet-core`'s: the host package depends only on `@nulo/token-list`, and the plan adds no dependency.
- Its timeout is injectable (`timeoutMs`), so the stalled-reply case runs in 20 ms.

## Attempts

- `bun run test:release` red on 7 cases, all `zip-read` and `zip-reproducible`: this host has no `zip` binary (`Executable not found in $PATH: "zip"`). Unrelated to the arc. `apt-get download zip` extracted into the plan's scratch dir and put first on `PATH` for that one run: 359 pass, 0 fail.
