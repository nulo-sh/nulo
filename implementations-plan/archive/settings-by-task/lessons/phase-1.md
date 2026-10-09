# P1 — Shared pieces: lessons log

## Lock composable extraction

- Moved Header's lock code into `apps/extension/src/composables/useLockWallet.ts` and added the dispose contract (pending-decision counter, own-confirm check, abandon-instead-of-ask once disposed). The four targeted test files passed on the first run (67 cases, 22 in `useLockWallet.test.ts`).
- `cacheStore.confirm` is replaced by `ConfirmPopup` on close (`cacheStore.confirm = {}`), so the composable reads it afresh on every access instead of holding the object; the narrowing cast follows `useProfileImportFlow.ts`.

## Proving the tests can fail (mutations, reverted)

| Mutation | Tests that went red |
|---|---|
| `dispose()` removes the listeners even with a decision pending | dispose-then-session-change, gap test (disposed), overlapping decisions |
| A decision asks even after `dispose()` | dispose with sends running, overlapping decisions |
| `dispose()` cancels a pending decision | dispose with nothing running, no-timer-left (disposed) |
| `dispose()` does not close its own confirm | dispose closes own confirm, second dispose |
| Confirm closed without the ownership check | someone else's confirm, two instances |
| Listeners dropped when the read settles (the rejected alternative) | first only the overlap test |

- Failure: the gap test (a session change between the read's settle and the decision's resume) first fired the change synchronously inside the read's `clearTimeout` call. That runs before anything else in the settle callback, so the rejected "drop the listeners when the read settles" variant passed it.
- Fix: the hook queues the change with `queueMicrotask` from that `clearTimeout`. The microtask runs after the settle callback returns and before the awaiting decision resumes (the resume is queued only once the settled promise resolves), so it is engine-independent per the spec. After the fix the variant reds both the gap test (disposed) and the overlap test.

## Gates

- `bun run lint` failed once: Biome's formatter wanted the long `test.each(...)(title, async ({ ... }) => …)` calls wrapped differently. `biome check --write` on the changed files fixed it; no rule findings in the changed files.
- `bun run build:chrome` regenerated `apps/extension/src/types/auto-imports.d.ts` and `apps/extension/src/types/.eslintrc-auto-import.json` with `useLockWallet`, `LockProfileClient`, `hubValues`, `profileTypeLabel`, `HubConfig` and `HubValues`. The second build left both byte-identical (sha256 compared), and lint and typecheck pass over the regenerated files.
