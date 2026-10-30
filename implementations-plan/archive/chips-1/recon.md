# chips-1 recon

Base: `origin/dev` at `a4da1f36f`. Two Explore agents (sonnet) plus the planner's own reads. Every line below was checked against the tree.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| The default's name | `DEFAULT_SEEDS` (`apps/extension/src/wallet/services/network/seeds.ts:61`), `getChainName` (`apps/extension/src/components/ui/utils.ts:35`) | adapt: one string each |
| Find a stored row's seed | `seedForKind(kind)` (`seeds.ts`, end of file) | reuse as-is |
| A pass that already reads the profile's rows under the lock | `getOrInitNetworks` (`service.ts:274-295`), run on every popup profile activation (`src/composables/useProfileBootstrap.ts:159`) | not used: stored rows keep their name (plan D1, #1364) |
| Rewrite a row's name | `renameNetwork` (`service.ts:598-611`): exact-name uniqueness in the profile, `storage.set`, `emit("onNetworkUpdated")` | not used (D1) |
| An earlier build's seeds in a test | `asEarlierBuild` (`service.test.ts:1427-1435`) splices `DEFAULT_SEEDS` | not used (D1) |
| Proof on rows a real release wrote | `tests/e2e/update-replay.test.ts` (opt-in, `NULO_E2E_UPDATE_FROM`), recordings `fixtures/update/v1.1.0.storage.json` | not needed: no row is rewritten, and no code matches a seed by name |
| Icon-only button precedent | header level: `packages/design/src/ui/SubPageHeaderBase.vue:40-49` (back, `aria-label` only); row level: `<Tooltip>` (`FpcRow.vue:47-65`, `settings/accounts/index.vue:101-125`) | reuse the header-level form |
| Header layout pins | `src/components/header-layout.test.ts` (source scan), `Header.test.ts:193-200`, `tests/e2e/appearance.test.ts:195-216` | adapt the values |
| Captures | `shotSend` (`tests/e2e/fixtures/shots.ts:19`), a scratch spec as in the window-queued-1 plan | build new, local only (header clip) |
| Persisted shape guard | `stored-shapes.ts:218` (`networks: fromStore`), `name: z.string()`; `goldens.json`, `snapshot.json` hold no "Alpha" | no change: a value change |

No migration helper applies: sealed roots are never migratable (CLAUDE.md § Persisted-storage shape changes), and a name value is no shape change.

## Facts that bear on the rename of stored rows

The plan's final design rewrites no stored row (D1, #1364); these facts are why.


- Released seeds (`git show <tag>:…/seeds.ts`): `v1.0.0` "Mainnet"; `v1.1.0` (Latest, 2026-10-27) and `v1.1.0-nightly.26303` "Alpha V6". #1191 renamed the seed and rewrote no stored row, so a v1.0.0 install updated to v1.1.0 still reads "Mainnet".
- Nothing today rewrites a stored seeded row from its seed: `offerDefaultsLocked` only adds kinds never offered (`seed-offers.ts`); `rewriteForResetLocked` keeps the name (`service.ts:1148-1171`).
- A row records no "renamed by the person" flag (`Network` in `spec.ts`); only `name` and `kind` tell.
- Full backups carry no network rows; restore reseeds through `seedDefaultsForProfile` (`wallet/services/backup/README.md:20`, `composables/full-backup-restore.ts`), so no backup brings an old name back.
- `purgeForProfile` and `deleteNetwork` hold the network lock; a write under it cannot leave an orphan.
- No non-test code listens to `onNetworkUpdated` to set `appStore.network`; the popup takes `getOrInitNetworks`'s returned rows (`useProfileBootstrap.ts:159`).
- No code matches a seed by name: `seed.name` is read only to write a fresh row (`service.ts:396`) and in a log line (`:326`).
- `update-replay.test.ts` reset case: `others` comes from the recording's locked rows (`:584`), then `expect(await otherNetworks(page, expected)).toEqual(others)` after the unlock (`:616`). For the v1.1.0 recording the default's row is "Alpha V6", so a rename at the first open would red this line. It is the only comparison of non-Testnet rows by value (`:393` compares ids).

## Every "Alpha V6" in the tree (excluding `archive/`)

- `apps/extension/src`: `seeds.ts:61`, `components/ui/utils.ts:35`, `Header.vue:402` (comment), `components/ui/utils.test.ts:8`, `wallet/services/network/service.test.ts:1445,1447`, `popup/pages/settings/networks/index.test.ts:48,102,113,114,129,143,165` (a `kind: "mainnet"` fixture row). All change.
- e2e: `appearance.test.ts:210`, `contacts-import.test.ts:166`, `settings-crud.test.ts:67,81,96,100`, `network-arrival.test.ts:83,130`, `network/cap-chain-mismatch.test.ts:33,58`. All change.
- Prose, unchanged: `README.md:8`, `apps/extension/store/listing.md:187,189,241,242`, `legal/terms.md:13`. The Terms line says "shown in Nulo as Alpha V6", and `listing.md:241-242` says "the wallet shows Alpha V6 as unavailable": both name the wallet's label, see `OWNER-ASKS.md`.
- "Alpha V5" fixtures (`Header.test.ts`, import tests) are arbitrary names, not the seed: unchanged.

## Header

- `.network_chip`: `padding: 6px 3px`, `gap: 4px`, `max-width: 120px`, the comment at `Header.vue:402`.
- `.lock_chip`: `gap: 5px`, `padding: 0 9px 0 7px`, the 15 px icon and `<span class="lock_label">Lock</span>`; `(width < 359px)` sets `padding: 0 6px` and hides the label.
- `type-role-ban`: `type-role-ban.reviewed.json` is `{}` and `scripts/type-roles/exceptions.ts` has no Header entry, so deleting `.lock_label` changes no baseline.
- `tests/e2e/fixtures/type-roles.ts:595` `NARROW_ACCEPTED` exempts `header-lock` ("below 359 px the Lock chip keeps its icon"); unused entries are not flagged (`:744`).
- No e2e reads the lock's text or width; `appearance.test.ts:216` compares its height to the network chip's.
- Every other e2e use of `header-lock` clicks or focuses it.
- The takeovers draw their own Lock chip with the word LOCK (`components/composite/TakeoverLayout.vue:42-43`); the Header change does not reach it (found by the Opus leg).

## Open work

`gh issue list --search`: #1363 (this lane). #1119 (closed `known-limit`): a seeded row can share its name with a custom row, as seeding skips the name check. #651 (closed): the chip room history. No collision.
