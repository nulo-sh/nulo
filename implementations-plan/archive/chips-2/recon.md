# chips-2 recon

Read at `origin/dev` `9ce6bb0bd`, by one Explore agent (sonnet) and the planner. Paths are repo-relative.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| A Terms patch version | `packages/legal/README.md` § Shipping a new version; `legal/README.md` § Changing these documents; `packages/legal/src/manifest.test.ts` (head = version line, history = manifest, every superseded version archived with an agreeing header) | reuse-as-is |
| Versioned permalinks | `apps/landing/scripts/build-legal.ts`, `legal-pages.ts` read `LEGAL_MANIFEST` and `legal/archive/`; no landing test pins "1.2" | reuse-as-is |
| A patch never asks again | `pendingTermsVersions` (`packages/legal/src/status.ts:137`) keeps only material entries; `changes` of a patch is rendered nowhere in the wallet (`LegalAcceptanceSheet.vue:43` is the only reader) | reuse-as-is |
| The release-time legal checklist | `BEFORE-LAUNCH.md` § 4, one "Due at the release that publishes …" block per version (privacy 1.2.2 to 1.2.6, Terms 1.2) | adapt: one block for Terms 1.2.1 |
| An icon-only Lock chip | `Header.vue:241-251` (`Icon name="lock" :size="15"`, `aria-label="Lock wallet"`, no Tooltip) and `.lock_chip` (`padding: 0 6px; min-height: calc(1lh + 14px)`, so it takes the network chip's height); `header-layout.test.ts` pins that; `Header.test.ts:194-200` checks icon, empty text, name, type | adapt for the takeover's `.chip` (7 px block padding, 10 px sides) |
| Takeover captures | `NETWORK_ARRIVAL_CAPTURES=1` in `tests/e2e/network-arrival.test.ts:143-154` ("the arrival over Home, dark and light"); `STALE_NETWORK_CAPTURES=1` in `stale-network-captures.test.ts:71-72` ("every takeover state, dark and light"); both write `tests/e2e/.captures/<name>.<theme>.png` at 360×600, 2×, Chrome only (`helpers/stale-network-capture.ts`) | reuse-as-is |
| A 240 px header capture with Testnet active | `switchToNetwork(page, "Testnet")` (`fixtures/networks.ts:50`) at 360 px, then `setViewport(page, { width: 240, height: 600 })`; the dot measure in `appearance.test.ts:195-216`; chips-1's scratch spec (copied in, run, deleted) | adapt: a scratch spec under `~/.cache/nulo-backlog/chips-2/`, never committed |
| Armed smoke build | `global-setup-smoke.ts:21` `ARMED_BUILD` (`VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<browser>`) | reuse-as-is |

No new code is built: every capability above exists.

## "Alpha V6" in the tree (outside `archive/`)

| Where | Names | This lane |
|---|---|---|
| `legal/terms.md:13` | the wallet's label | becomes "Alpha" (#1370) |
| `apps/extension/store/listing.md:240-241` "opens on Aztec Alpha V6", `:242` "shows Alpha V6 as unavailable" | the wallet's label | become "Alpha" (#1370) |
| `listing.md:241` "The Alpha V6 upgrade is executable on L1 from 2026-10-26" | the protocol upgrade, the owner's claim | stays |
| `listing.md:187`, `:189` (release notes) | the protocol generation, store prose | stays (#1363's decision) |
| `README.md:8` | the protocol generation | stays (#1363's decision) |
| `CHANGELOG.md:28` | a released entry | stays (history) |

Code, tests and fixtures: none (searched `alpha[ -]?v6`, case-insensitive, also `AlphaV6`).

## What depends on the takeover's "LOCK"

- Text dumps that list "LOCK" in screen order: `NetworkArrival.test.ts:71`; `StaleNetworkTakeover.test.ts:98` (`TOP`), `:134`, `:194`, `:320`, `:344`; the test name at `:404`.
- Testids only, unaffected: `network-arrival-lock`, `stale-network-lock` (`NetworkArrival.test.ts:120`, `StaleNetworkTakeover.test.ts:364,408`, `TakeoverLayout.test.ts:128-129`, e2e `stale-network.test.ts:200`, `stale-network-captures.test.ts:54-55`).
- The comment "carries its own LOCK" at `stale-network-captures.test.ts:52`.
- `type-role-ban.reviewed.json` is `{}`; no entry names the takeover.
- Consumers: `NetworkArrival.vue:71-75` (`network-arrival`), `StaleNetworkTakeover.vue:228-235` (`stale-network`).

## Issue claims

All three held against the tree: `terms.md:13` and `listing.md:241-242` (#1370; the label also opens at `:240-241`, which the issue did not cite); `TakeoverLayout.vue:42-43` against `Header.vue:241-251` (#1371); the `(width < 359px)` rule at `Header.vue:455-465` with 3 px sides and a 4 px gap, and the 240 px dot check in `appearance.test.ts` (#1372). #1370's option B placed the reviewer note "in the store-images lane"; the lane brief moves it here, and the images stay with #1377.

## Open work

`gh issue list --state all --search` for "Alpha unavailable upgrade", "reviewer note listing" and closed `known-limit` "lock chip takeover": only #1370. #1377 (store images) is open and out of scope.
