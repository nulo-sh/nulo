# P2 — Pages, routes, hub: lessons log

Step 1 (the three `git mv` renames) landed alone in its own commit; this log starts at step 2.

## Pages

- The Lock page reached its stores through auto-imports, which vitest does not provide, so a unit test of it cannot mount. Explicit imports of the three stores (and of `useLockWallet` and `managers`) fixed that with no runtime change.
- `privacy.vue` carries the Azguard modification notice: its binding is copied from `appearance.vue` and `advanced/index.vue`, both of which carry it.
- Your profile's Type row reuses the ID row's layout. Both rows now compose the shared `divider` hairline (hidden on the last row), so ID and Type are separated the way Name and ID already were by `SettingField`.

## Routes

- A route dump through `PageContext` + the vue resolver's `getComputedRoutes` showed every settings record flat (no nested children), names as `popup-settings-<segments>`, and the `<route>` meta on each record. `apps/extension/src/popup/legacy-routes.test.ts` passed on its first run (18 cases).

## Hub

- `usePrestoCheck` was auto-imported in the hub; it is now imported explicitly so the hub test can mock it.
- The hub test's fake config client opens its port on its first request and fires `onConnected` then, as the real client does in `openPort`; `restart()` rejects every pending read and fires `onConnected` again, as `onDisconnect` → `disconnect()` → `connect()` does.

## Proving the tests can fail (mutations, reverted)

| Mutation | Tests that went red |
|---|---|
| Hub: drop the per-read fence | update before the read answers |
| Hub: drop the generation check | overlapping reads, older answers last |
| Hub: read on every `onConnected`, the first included | first open reads nothing extra; unpersisted write; overlap |
| Hub: no reread on reconnect | the same three |
| Hub: `await` the config read before `getLastProveOutcome` | read that never answers: Proving still renders |
| Hub: one fence shared across reads | unpersisted write gives way to the restarted worker |
| Lock: page's own `ProfileServiceClient` passed to `useLockWallet` | long-lived client test |
| Lock: `dispose()` before the two disconnects | unmount order test |
| Lock: strict mode shown to passkey | passkey case |
| Lock: no `@click` on Lock now | long-lived client test |
| Lock: Lock now inside the load gate | renders while the config reads hang |

## Gates

- `bun run lint` failed once: Biome's `noShadowRestrictedNames` on a test helper named `valueOf`, plus formatting in two new tests. Renamed the helper and ran `biome check --write` on those two files.
- `bun run build:chrome` left `src/types/auto-imports.d.ts`, `.eslintrc-auto-import.json` and `components.d.ts` unchanged: P2 adds no export under a scanned directory and no component (`legacy-routes.ts` sits in `src/popup/`, outside the auto-import dirs). The built popup carries the three redirect records and the lock and privacy routes.
- Negative checks: a restored `security/index.vue` reds three cases of `apps/extension/src/popup/legacy-routes.test.ts` (no page of its own; the security landing; the query case), because a generated record listed before the redirect wins the match. Removing `isAuthRequired` from `privacy.vue` reds its meta case. Both reverted; the tree matched before each check.

