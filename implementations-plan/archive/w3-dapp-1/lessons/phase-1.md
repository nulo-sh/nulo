# w3-dapp-1 phase 1: the locked queue and the early close

## Red evidence

- `window-manager.test.ts` at the red commit (`1003743fb`, base source): 3 of 53 fail. They are the red test (the handle stays pending after a removal that beats `create`'s answer), and the "a person's close" and "detach" listener cases (the base subscribes after adoption, so a listener outlives both).
- `discovery-queue.test.ts` at the red commit: 17 of 20 fail. The tests call the new `enqueue(discovery, chainId)`, so on the base they fail on the API mismatch as well as on the behaviour (Codex arc r1). The behaviour proof is the old-API probe from phase 0. Codex re-ran it read-only on both copies. Base: r1 at t=0, r2 at t=70 s, caller rejects on `false`, drain at t=75 s; nothing processed, both rejected. Head: only r2 processed, r1 rejected.
- Mutation check: with the `unsubOnRemoved !== null` guard removed from `adopt`, the revised detach test fails (close buffered, then detach, then the answer). With the guard, all 90 window-manager tests pass.

## Gates

- 2026-11-02: lint, lint:actions, typecheck:all, test:all exit 0 on `e660abf83`. Touched service suites: 758 tests (extension), 815 (wallet-bridge), all pass.

## Review rounds

- Codex arc r1 (gpt-6.1-sol, high, fresh session): conditional approve. (1) A same-id resend repeats the `info` "queued" line (100 lines from 100 requests in a probe): moved to `debug`. (2) The detach test detached before the close, so the guard went untested: the close now comes first, as the mutation check shows. (3) The queue red tests fail on the base partly on the API: the old-API probe is the behaviour evidence (above). (4) The pre-existing constructor comment is long: not changed, since this arc does not touch it.
- Codex arc r2 (resumed): approve; no new finding. Opus arc review: conditional approve; its three findings (the detach test, the push line, the cap comment) applied in `0dcec23fc`.
