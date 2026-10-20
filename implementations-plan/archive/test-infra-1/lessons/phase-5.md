# test-infra-1: phase 5 (storage stubs and the balance builder)

## Storage stubs

`installChromeStorage(initial, { persist: false })`: `set` and `remove` are recorded and change nothing. 19 hand stubs moved; each test sees the same `chrome` members as before:

- 10 replaced the setup chrome's `storage.local` and `onChanged` in place: they now call the helper on the same chrome (`settings/security/{reset,change-password}`, `export/{account,full-passkey.pins}`, `settings/{lock,index}`, `settings/contacts/index`, `settings/accounts/import`, `popup/pages/import`, `composables/useFullBackupExport`).
- 9 stubbed a whole chrome (`auth`, `connected-apps/{index,[id]}`, `journal/[id]`, `networks/{index,[id]}`, `composables/useProfileBootstrap`, and `settings/tokens/index` and `developer/account-state/senders/index` with no `runtime`): each keeps its own `vi.stubGlobal` with `storage: {}` and its own `runtime` (or none), then calls the helper. Five of them answered a callback-style `get`; no production read passes a callback (`grep` over `src`), so that branch never ran.

Per-file titles and statuses, before and after, equal for all 19 (264 tests; vitest JSON reports diffed).

Left for arc 3, because a running lane edits the file at the arc's start: `onboarding/pages/import`, `popup/pages/profile/new`, `export/{full,seed}` (onboarding-3) and `settings/developer/index` (ui-dedupe-1). The plan's fifth, `settings/index`, is free now (sheet-1 merged); `developer/index` took its place.

## The balance builder

`world(opts)` builds every `TokenBalanceService` collection in `token-balance/service.test.ts`: the restore suite, REBUILD-FENCE, FAN-OUT, CREATE-BALANCE, both boot sweeps, key/id mismatch, both creator races, the parked write, the init fence, the never-projected row, the legacy sweep, `startWorld`'s four users and `boot()`. It seeds `rows` and `raw`, builds, and returns `start` unstarted, so the boot-sweep spy, the init fence and the legacy timing act before `init` as they did. Options carry the profile (`null` for none), accounts, `getAccounts`, tokens (an answer or the read), `getTokenRaw`, the task stub (`{}` where the original had none) and the deletion state; every peer event is an awaited bus. The row-to-token suite's own `world()` (no collection) is renamed `primed()`. Titles equal; 48 tests pass; the phase 4 mutations M1-M4 still fail every targeted test.

## Gate (2026-10-18)

`bun run lint` 0; `bun run typecheck:all` 0 (the first run failed on `chrome.storage.local.get(null)` in the new helper test, which chrome-types refuses; `get()`); `bun run test` 0: 835 files, 13671 tests; `bun run test:all` 0.
