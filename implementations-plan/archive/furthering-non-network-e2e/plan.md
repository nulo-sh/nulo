# Furthering non-network e2e

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Non-network smoke specs for the security branch, settings CRUD, auth and profile flows, appearance and privacy, and service-worker resilience, under `apps/extension/tests/e2e/` (for example `security.test.ts`, `settings-crud.test.ts`, `auth-flows.test.ts`, `profile-rename.test.ts`, `appearance.test.ts`, `sw-resilience.test.ts`) with shared helpers in `apps/extension/tests/e2e/fixtures/helpers.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Grow the non-network e2e suite, the fast signal run by `bun run test:e2e` that excludes `network/**`, from a small base, in seven independently mergeable steps. First shared helpers and a visible-only filter on `clickByTestId`; then specs for the security branch (change password, reset, backup as seed, key or full), settings CRUD (networks, fee payment contracts, token edit), auth beyond the happy path (wrong password, forgot password, profile selection) and profile rename, appearance and privacy settings, a lock-reload-unlock service-worker resilience test, and a few account extras.

## Why

Agents make refactors, package extractions and UI redesigns, and the quickest answer to "did I break a real user flow" is the smoke suite. At the start it covered about a third of the user-reachable paths, and the largest gaps were in the surfaces that had just changed most. Real chain operations stay in the network suite.

## What shipped

- The specs listed above, plus later suites that follow the same conventions.
- Selectors use `data-testid` only, named `<area>-<entity>-<verb>`; mutable list rows carry a stable `data-<entity>-id` for selection and a `data-<entity>-name` for readable failures.
- No per-page root testids: the route hash is the contract, asserted with a hash wait. Reveal flows expose one `reveal-content` container instead of separate toggle and copy hooks.
- Out of scope by design: motion and theme colour rendering (structural state only), power-user advanced account-state screens, OS-level download and clipboard interception, and any real Aztec operation.
- Risks the specs were written around: the reset-profile redirect race (a per-test fixture scope and a hash wait), hidden buttons clicked mid-transition (the visible-only filter), short-lived toasts (assert the next visible side effect, never the toast), and serial file execution making runtime grow with file count.
- A flaking test is root-caused before it is skipped; a skip needs a tracked follow-up beside it.
