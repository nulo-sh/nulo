# Phase 5 — E2E

## Deviations from plan.md (each with the reason)

- **Priced smoke specs hold a list from launch.** Without the compiled price map, a smoke launch prices nothing: it records Terms acceptance by writing storage, which emits no `onAcceptanceChanged`, and the worker booted before that write. `launchExtension({ tokenList: "held" })` (and the `listedExtension` / `listedExtensionPerTest` fixtures) store a signed envelope and restart the worker, which loads it at start. A source run signs `infra/token-list/list.source.json` with a per-process key and sets the seed reader to "seed nothing", so a source profile still shows no defaults. An artifact run stores the published `public/v1/list.json`, so it has a list only once one is published (O6). `rows`, `send-keyboard` (three tests) moved to it; `home-links`, `navigation` and `send-outcome-rows` assert no fiat and stay on the plain fixtures.
- **The restart is woken by the popup and runs last in settle.** Firefox ends its event page only while no extension page is open, and starts it again only on an add-on event: the setup page raises none, the popup's service clients do. Running after the Terms seed means the boot sees the stored deadline and does not fetch.
- **`activity-seeds.ts` reads its tokens from the held list** (`heldListEntries`), not from the unit-test fixture, so its tokens follow the published list across a reset.
- **The live launch is `launchExtension({ live: true })`** and sends both `lb.drpc.live` and `tokens.nulo.sh` direct. The egress plumbing takes `liveHosts` (a list) instead of one `liveHost`, and the routing unit tests cover two hosts.
- **The live leg and the list spec create their profile through onboarding** (`createProfileAcceptingTerms` in `helpers/legal-drivers.ts`): the acceptance is the event the worker fetches on.
- **The list spec drives later refreshes with the worker's own alarm**, created from an extension page (`requestListRefresh`), and judges each by the stored `failures` count, so a refresh that never ran cannot pass as a refused one.

## Facts found

- **Neither browser sends `Origin` on the list request.** Chrome's and Firefox's background fetch to `http://localhost` (no host permission) carried no `Origin`, no `Cookie` (a cookie for the host was set first) and no `Referer`. I3 is not confirmed on loopback, and the live host is HTTPS, so privacy § 5.11 discloses the `Origin` as possible rather than claiming its absence.
- A held launch costs one worker restart in settle.

## Gate (2026-10-13)

- `token-list.test.ts`: green on Chrome and on Firefox, alone and inside the full runs.
- Full smoke, source build: Chrome 52 files passed, 4 skipped, 220 tests, 1,660 s; Firefox (with privacy 1.2) 54 passed, 2 skipped, 218 tests, 2,372 s. Both exit 0. Local wall-clock on a host at load ~300 is not the budget figure; the PR body carries CI's before and after.
- `e2e:agent`: `default-token-seeding` and `fiat-send` green on Chrome and on Firefox; `price-fixture` and the proverless `incoming-arrival` (7 tests) green on Chrome.
- `bun run lint`, `bun run typecheck:all`, `bun run check:plans`: exit 0.
