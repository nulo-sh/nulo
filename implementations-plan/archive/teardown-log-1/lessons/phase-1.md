# Phase 1 log

- 2026-11-19, the fix: `enableAutoUnmount(afterEach)` in the six files; gates 1 to 4 green (lint, typecheck:all, the six files 131/131, the probe sweep 0 late-logging files, the wire file 50 of 50).
- 2026-11-19, reproduction of the error itself: a tail delay alone (960 to 1020 ms after the last test) never hit the window at base, since `rpcDone()`'s await is a few milliseconds on an idle host. Leaving twelve fresh-query imports of a 4 MB artifact in flight at the end widens it as a loaded main process would: base exits 1 on `Closing rpc while "onUserConsoleLog" was pending` in all six files, the fix exits 0.
- 2026-11-19, Codex pass (gpt-6.1-sol, high, read-only): approve, no material finding; two plan corrections accepted and verified (longer timers not excluded; no duplicate-unmount warning on Vue 3.5.42).
