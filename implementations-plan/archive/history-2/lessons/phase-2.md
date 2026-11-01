# Phase 2: the map's failure state and the popups' retry

- As built, the hook and popup tests read the real toast singleton (the popups' mock passes every open through to it and records it) instead of a hand-made double: what they assert is the snack on screen, ids included. `afterEach` closes it, since the singleton outlives a test.
- Base proof (sources from `f738cba62`, tests from the head): both popup cases red at the `estimateFailed` read (`expected 'false' to be 'true'`; Revoke `['false','false']` vs `['false','true']`); restored from `cd697347d`.
- A first base-proof attempt passed the file list as one zsh word (`$FILES`) and changed nothing; the second used an array after a signed commit, so the restore had a SHA to come back to.
- Gate: lint 0, typecheck:all 0, 26 files / 468 tests at retry 0.
