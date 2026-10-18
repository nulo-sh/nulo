# Phase 4 — #652 Manage accounts

- The marker is its own block `Text` above the address line, inside SettingItem's description slot. The description is a blockified flex item, so the two stack. The address line keeps `manage-accounts-address` with head and tail only, and the head gains `manage-accounts-address-head` for the e2e.
- `account-import-export.test.ts` now reaches the line, head and wrapper by testid (`setting-description` for the wrapper). It checks the badge sits above the line and the head shows at least the tail's width. It passed on Chrome and Firefox.
- The base fails both new checks by construction: the badge was inline in the line, and the page measured a 1 px head. No separate base run was made.
