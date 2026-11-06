# network-rename-1: recon

At 4291a8c98. One Sonnet explorer (display readers, name-observing tests, reuse candidates, line citations), plus the planner's own reading of the orchestrator's research, re-verified against the tree. Paths are under `apps/extension/`.

## Reuse map

- `src/wallet/services/network/seeds.ts`: `DEFAULT_SEEDS` (the mainnet seed is named "Alpha"), `RETIRED_DEFAULT_ENDPOINTS` (`:81`), `seedForKind` (`:93`). The new list and rule sit here.
- `src/wallet/services/network/retired-endpoints.ts`: `retireEndpoints`, the endpoint twin of the new rule (pure, returns a copy or `undefined`, idempotent). No helper yet renames a row from an old seed value; nearest pieces are `isSeedEndpointUrl` and `primaryMoved` (`service.ts:145-157`) and the kind match in `seed-offers.ts:62-74`.
- `src/wallet/services/network/service.ts`: the `onRowKeysReady` hook (`:266-281`) and `retireDefaultEndpoints` (`:291-312`), the one loop to extend; the uniqueness rule in `addNetwork` (`:618`) and `renameNetwork` (`:637-638`).
- `src/wallet/services/seal-on-unlock.ts`: `runSealing` (warn and let the next worker retry), `sealOnRowKeysReady`.
- `tests/e2e/fixtures/shots.ts`: `shotSend(page, name, focus)`, opt-in both-theme capture under `NULO_E2E_SHOT_DIR`.

## Who displays a row's name

Header chip (`src/components/Header.vue:232-240`, testids `network-button`, `network-name`), Settings → Networks list and detail, the network popups, Receive, token picker, contacts import, switch toast, arrival, dApp windows (capabilities, discover, network-unavailable, chain and scope mismatch). All read `appStore.network(s)`, set at bootstrap (`src/composables/useProfileBootstrap.ts:149-160`, `src/popup/app.vue:204-209`) or after an explicit refresh; nothing listens to `onNetworkUpdated`. `getChainName` (`src/components/ui/utils.ts:30-41`) names the chain "Alpha" from its id and reads no row.

## Tests that observe the name

- `tests/e2e/update-replay.test.ts`: `expectIdentity` compares network ids only (`:357-394`); `throughTheReset` compares whole rows of every network but Testnet, names included, against the release's reads taken before the unlock (`:578`, `:610`).
- `tests/e2e/network/update-in-place.test.ts`, `tests/e2e/default-network-arrival-update.test.ts`: no name of a mainnet row an earlier build seeded (the arrival's release holds no Mainnet; its expectation follows `seedForKind`).
- `src/wallet/services/network/service.test.ts:1434-1489`: fresh seeds read "Alpha"; a renamed "My Mainnet" survives (not in the list). `:1262` adds a `custom` "Mainnet". `:2872-2929`: the retired-default harness the wiring test extends.
- Smoke `settings-crud`, `network-arrival`, `appearance` read "Alpha" on fresh profiles.
- No test or chaos model cites `network/service.ts` by line.

## Facts gathered for the plan

- Mainnet seed names by tag: v0.31.0 none, v1.0.0 "Mainnet", v1.1.0 "Alpha V6", v1.2.0 "Alpha" (`git show <tag>:apps/extension/src/wallet/services/network/seeds.ts`; `git log -p` over the file lists no other).
- `chain-ids.ts` Testnet and Mainnet identities are equal at v1.0.0, v1.1.0 and `dev`.
- Release traits: v1.0.0 and v1.1.0 seal their rows (`tests/e2e/fixtures/update/release.ts:61-62`). Recordings: v1.0.0 (2026-10-26, its dApp session now past the 7-day check), v1.1.0 (refreshed 2026-11-03), v1.2.0 (2026-11-05).
- The candidate check excludes `apps/extension/tests` and `implementations-plan` (`tests/e2e/fixtures/update/source.ts:7`), so an uncommitted test edit does not refuse a candidate.
