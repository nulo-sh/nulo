# Phase 3 — `TokenListService`

## Deviations from plan.md (each with the reason)

- **The path filters were already in place.** P2 added `packages/token-list` to every extension filter (see `phase-2.md`), so step 2 had nothing left to do.
- **"`onListChanged` reaching the seeder" is asserted in P4.** The seeder subscribes in P4; P3's composition test asserts the event fires once per accepted list.
- **The seam rides the token-seed opt-in.** `E2E_TOKEN_LIST = E2E_TOKEN_SEEDS`: both replace a production list, so one double opt-in arms both, with a separate stamp (`NULO_E2E_TOKEN_LIST_BUILD_STAMP`) and storage key (`nulo:e2e:token-list`), each in the release-bundle grep. The smoke setup requires both stamps.
- **The seam accepts `http://localhost:<port>` only.** `127.0.0.1` is a granted host permission, so a list served there would not prove that the fetch needs none (D15).
- **The service is a plain `IService`.** It has no RPC surface: consumers read `getSnapshot()` in the worker, and the popup gets the price mapping through `PriceService` (D13).

## Facts found

- A new worker service needs a row in the log viewer's `LOG_SOURCES` (`components/JsonViewer/useLogFilters.ts`); `useLogFilters.scan.test.ts` fails until it has one.
- A deadline read from storage is capped at the longest one the service writes (a day plus two hours). A planted far-future value would otherwise stop refreshes for good.
- `Response` streams need the node test environment; the composition test says so in its header.

## Gate (2026-10-13)

- `bun run audit:vue`: exit 0 (typecheck, unit and component tests, lint, build).
- `bun run test:ci-gating`: 535 pass, 0 fail.
