# teardown-log-1 recon

Done inline with runtime probes rather than Explore agents: the question was which code runs after a file ends, which only a run answers.

- **Probe.** A setup file appended to the extension's vitest config (kept outside the repo) wraps `setTimeout`/`setInterval` to record each live timer's delay and creating frame, writes what is still pending at the file's last `afterAll`, then holds the worker (1.2 s, or 12.5 s for the rerun) and records every console call made after the last test.
- **Base, whole extension suite (1047 files):** 126 files leave a timer pending; six log after they end (the plan's table). The pending-timer origins, by file count: `extension-messaging` request timeouts (10 s and about 60 s), the 30 s `ticker` interval, `estimate-reuse-shared` (120 s), `race.ts` (3 s), `verify-admission` (65 s), `ContractChip` (1 s, five files), and a tail of one-off short timers that fire without logging.
- **Rerun of the 34 files holding a 2 to 12 s timer, 12.5 s hold:** only `OperationCard.discovered.test.ts` logs, its `ContractChip` holds again.
- **`packages/design` (jsdom):** three files leave a 0 ms or animation-frame timer; none logs.
- **Vitest 4.1.12's worker** (`dist/chunks/init.*.js`, `execute`): after the run it awaits pending RPC promises (`rpcDone`), then rejects every call still pending with `EnvironmentTeardownError: Closing rpc while "<method>" was pending`. A console call made after the run, during environment teardown, is such a call.
- **Product cleanup already pinned:** `ContractChip.test.ts` ("unmounting a held chip leaves no timer"), `useSendReview.test.ts` ("disposing the scope clears the pending wait").
- **Prior art:** 21 extension test files call `enableAutoUnmount(afterEach)`; seven of them also unmount by hand in a test.
- **Dedupe:** `gh issue list --state all --search "EnvironmentTeardownError"` finds only #1858; no closed `known-limit` on teardown or unmount.
