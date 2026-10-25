# Phase 2: both fetches use `no-store`, pinned (tests first)

2026-10-20.

- Tests first, on the base fetch code: `service.composition.test.ts` and `price/service.test.ts` failed at the two new pins only (2 failed, 48 passed).
- The price pin uses `toHaveBeenCalledWith(expect.any(String), expect.objectContaining({...}))`; the harness mock's one-parameter type needed no change.
- After the code edits: the service subset passed (91, 2 skipped), `typecheck:all` and `lint` exited 0, `test:all` exited 0 (extension 14645 passed).
