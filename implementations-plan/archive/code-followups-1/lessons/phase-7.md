# Phase 7 — dead fields, a dead popup, a duplicated key

## Changes

- *103.* `TokensView.vue`'s `withTaskFlags` drops `isMinting`; `TokenCard.test.ts`'s fixture drops it.
  `tasks` stays (`isUpdating` reads it).
- *163, part.* `SelectNetworksPopup.vue` deleted with its import and mount in `PopupManager.vue`;
  `cache.store.ts` drops `proposedNetworks` and `selectedNetwork`; `PopupCard.vue` drops the
  `--displace` custom property (the `.displace` class stays).
- *165, part.* `EditNetworkPopup.vue` drops the `url` form field, `urlTerm`, the `url` key in
  `rebase` and the `findPrimaryEndpoint` import. `EditNetworkPopup.test.ts` is retitled to what it
  proves (the form fills with the network's name and nothing throws); its network fixture loses the
  dangling `primaryEndpointId` and endpoint the popup no longer reads. `network/spec.ts` drops
  `NetworkInfoSchema` (no importer in `apps/` or `packages/`).
- `full-backup-restore.ts` builds its four allow-set keys with `accountScopeKey`. Every operand is
  already narrowed (`typeof … === "number"` / `"string"`, `tokenChain !== undefined`), so the
  typecheck accepted all four sites; no coercion was needed.
- *156, part.* `operation-result.ts`'s `code` doc states the rule (a class rides the code channel when
  its dApp discrimination is ratified and its message-only reconstruction is lossless) without
  naming a class; no code change.

Deviations:

- `useFullBackupImport.test.ts` and `useFullBackupImport.stages.test.ts` mock
  `@/wallet/services/account/spec` with a hand-listed export set (the file's stated reason:
  side-effecting validators on the real modules). Without `accountScopeKey` in that set, 39 cases
  failed on the first full run (the restore stopped at the missing export, so, for one, no balance
  restore call was made). Both mocks gain `accountScopeKey`, the same shape as their existing `accountRowId`.
  The keys only meet each other (one `add`, three `has`), so the mock's format proves nothing about
  the real helper's and needs none.
- The restore's doc comment called the set a `` `${chainId}:${address}` `` allow-set; it now names
  `accountScopeKey`, so the gate's `git grep -F '}:${'` prints nothing at all (the plan expected only
  that doc line).
- `EditNetworkPopup.test.ts`'s file header restated its one test's title; it is removed rather than
  retitled.

## Gate runs (2026-10-09)

- `bun run lint`, `bun run typecheck:all`: pass. `bun run test`: 700 files passed (3 skipped), 10,426
  passed, 4 skipped, 7 todo (after the two mocks gained `accountScopeKey`; 39 failed before).
- Greps: `SelectNetworksPopup|select_network|proposedNetworks|selectedNetwork|isMinting|--displace|NetworkInfoSchema`
  in `apps/extension/src`, and `urlTerm|findPrimaryEndpoint` in `EditNetworkPopup.vue`: nothing.
  `}:${` in `full-backup-restore.ts`: nothing.
- `bun run --cwd apps/extension build`: exit 0; `src/types/*.d.ts` unchanged (`git status` clean
  there), so the stop rule for `auto-imports.d.ts` did not fire.
- Full Chrome smoke, armed build, retry 0: 44 files passed, 3 skipped; 186 tests passed, 11 skipped.
- `store-captures.test.ts` on Chrome: skipped without `STORE_CAPTURES=1` (it is opt-in), so it ran
  with it. Both of its renames went through `edit-network-submit` and waited for "Network is
  updated" (each a hard 10 s toast wait), and all five captures were written; the file still ended
  red on one soft check, `clearAmountLine`: "the amount line needs 35px of scroll, and Send has
  18px". Not this arc: #40 (on `dev` since 2026-10-07, after the committed captures) put the "Select
  Asset" label back on Send, which its own PR body says moves the page down about one label row; no
  file of this arc renders on Send. The same file at the base (`833170d`, detached, same command)
  went red earlier and harder: `fillPrivateSend`'s strip read `you: "unknown"` where it expects
  `"hidden"` (a hard `expect`), after the same two renames passed. So the file is red on `dev`
  either way; the Edit network submit it was chosen for passed on both. Recorded as a found
  follow-up; the regenerated PNGs were restored, not committed.
