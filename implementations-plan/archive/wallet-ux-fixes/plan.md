# Wallet UX fixes

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: `downloads` as a required permission in `apps/extension/manifest/manifest.config.ts`, `NetworkService.getPrimaryNetwork` used by `apps/extension/src/composables/useProfileBootstrap.ts`, the active network carried in full backups (`apps/extension/src/composables/full-backup-restore.ts`), and an active badge on the network list in `apps/extension/src/popup/pages/settings/networks/index.vue`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

One change set of four fixes. A fifth item, the account switch showing another account's activity, turned out to be a cross-account isolation problem and became its own work, [account-switch-isolation](../account-switch-isolation/plan.md).

- **Downloads permission**: move `downloads` from optional to required permissions in the single shared manifest source, so exporting a backup never prompts.
- **Import fallback**: an imported profile with no stored active network falls back to the primary network from the network service, not a hardcoded testnet.
- **Active network in backups**: a full backup records the active network, and restore re-selects it for the new profile, before restore finalizes, only when it names a built-in network the restore seeded; anything else leaves the primary network active. The change set keyed this on the network row id; the live code keys it on the chain id (`active-chain-id`), since row ids are per install and a backup carries no network rows.
- **Network list**: drop the fake radio icon; the active row shows a status dot and an "Active" badge, and every row stays a drill-in to the detail page.

## Why

The runtime permission request fired after the backup blob was built, stole focus and closed the MV3 popup, restarting the flow. A blob-backed anchor download needs no permission and is stricter on least privilege, but the install-time `downloads` line grants no host or network access and keeps the code simple.

The hardcoded testnet fallback had gone stale when the seeds' primary network changed, and any hardcoded kind would go stale again. The network service owns the policy, single-sourced from the seed marked primary, so fresh and imported profiles converge on the same network, and the primary-absent case falls back to the first network.

The backup field is hostile input: it is honoured only on strict numeric equality with a seeded chain, and the write goes through a setter that rejects a network that is not a row of the target profile, so a backup can choose among the built-in networks but cannot define one. Anything else falls back to the primary. A settings row that looks selectable but only drills in was misleading; the badge states the active network in text, not only color.

## What shipped

- The manifest change, with a test that forces `chrome.permissions.contains` to false and asserts no request is made.
- `getPrimaryNetwork`, its client and schema, and bootstrap tests for the primary and primary-absent cases.
- The export field, the pure resolver `resolveRestoredActiveNetworkIdByChain` in `apps/extension/src/utils/full-backup-helpers.ts`, and `setActiveForProfile` with an ownership check, tested for absent, non-numeric, non-integer and unseeded values.
- The network list built from the design system's badge and token colors, with rows as real links so they are keyboard-activatable and all test ids preserved.
