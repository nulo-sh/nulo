# Phase 2: docs, browsers, CI-like runner

- The mining-hold file (`network/same-token-concurrent-sends.test.ts`, proverless, `NULO_E2E_RETRY=0`), wall-clock of `bun run e2e:agent` with the build:
  - Chrome: 686 s before; 684 s after the key landed; 658 s on the reviewed head `ce037042e`. 17/17 each.
  - Firefox: 765 s before; 775 s on `ce037042e`. 17/17 each.
  - Each run after the change logged `admin RPC: a keyless call is refused, the run's key is accepted`.
- Docker CI-like runner on commit `8e62b460d` (exported with `git archive`, lane-named volumes, `NULO_E2E_RETRY=0`): Ubuntu 24.04, Bun 1.4.2, Node 24.16.0, Aztec 6.0.0, Chrome; 17/17, 827 s, the same log line. The review fixes after it touched only the check's error text. Torn down: the root-owned copy removed through a container, both volumes removed.
