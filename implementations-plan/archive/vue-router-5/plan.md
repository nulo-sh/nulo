# Vue Router 5 migration

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: `apps/extension/package.json` depends on `vue-router` 5 and no longer on the archived `unplugin-vue-router`, whose generated typed-route declarations are gone. File-based routing stays on `vite-plugin-pages` (`apps/extension/vite.config.ts`).
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Two scopes, planned as two changes in order. The first drops the archived `unplugin-vue-router` dependency and moves `vue-router` from 4 to 5. The second was to set up a conservative dependency-update bot configuration: a seven-day age gate mirroring the install-time one, a weekly schedule, no auto-merge, the Aztec packages excluded and grouped routine bumps. That configuration is not part of the tree this record describes, so nothing here claims it as shipped.

## Why

`unplugin-vue-router` was archived upstream with no more patches, so a future vulnerability would have no maintainer. It was never wired into the Vite plugin chain, which made the migration smaller than its headline: only `vite-plugin-pages` generates routes. The plugin's whole footprint was one generated declaration file nothing imported and two dead ambient lines. Every navigation call site uses path strings rather than typed routes, and the deleted route-name map covered only five static routes. Version 5 absorbed the typed-routing features and was described upstream as a release without breaking changes. It does not absorb the virtual pages module, so `vite-plugin-pages` stays.

## What shipped

- **Dependency removal.** The archived package and its generated typed-router declaration were removed. The ambient auto-import declarations were regenerated from scratch: the generator's declaration writer is additive, so a stale file keeps dead entries unless it is deleted first. The clean regeneration dropped a larger cluster of stale entries, none of which any source file used.
- **Version bump.** `vue-router` moved to a release old enough to clear the install-time age gate. The type check stayed green across every workspace with no narrowing needed, since the central auth guard uses the generic route type.
- **Validation plan.** The full audit gate plus the smoke e2e, whose auth-guard flow is the canary for router behaviour, and a short manual click-through of auth, home, send and a connected-app page. Network e2e was to be skipped because routing never touches the Aztec wire boundary.
- **Corrections along the way.** An early worry that deleting the typed-route file would widen route-name types proved unfounded: the deleted map covered only five static routes, none of them accessed by name.
