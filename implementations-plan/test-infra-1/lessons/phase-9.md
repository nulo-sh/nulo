# test-infra-1: phase 9 (the backup-import harness, `makeDispatcher`, the last storage stubs)

## `useFullBackupImport.harness.ts`

- The harness holds the spies, `FENCE`, the builders (`buildBackup`, `makeOpts`) and `resetBackupImportHarness`; it calls no `vi.mock` and imports nothing a suite mocks. Each suite keeps its own one-line `vi.mock` calls with the literal harness path (O9).
- The six pass-through clients stay `export let`, replaced each test rather than reset in place, so late work from one test lands on that test's spies, never the next one's.
- The stages copy's drift was resolved toward the main suite: it had no restore-outcome mock (the real reminder ran and logged "the reminder could not be armed" on `navigator.locks`), no `FENCE` (every stage got an empty fence), no `assertRunFence`, and two account-client spies never reset. The one edit inside a test body: "stage-order law"'s own finalize stub returned the stale `{ id }` shape and now returns `{ profile, fence: FENCE }`, the real return type.
- Storage roots come from the real spec modules through `importOriginal`. A scratch config that renamed every root printed the renamed values and kept both suites green; renaming a constant now fails `typecheck:all`.
- Counts: 141 = 141 and 34 = 34, titles equal on two runs.

## `makeDispatcher(opts)`

- One options builder (`network`, `account`, `execution`, `interaction` merged over a shared `stubInteraction`, `sessionWriter`, `logger`, `tokenRegistryReader`) replaces the old two-argument builder and six thin ones; `new WalletSdkDispatcher(` went from 44 to 1. 275 = 275, titles equal.
- A site's collaborator became a default only when its code was identical, or when an instrumented copy showed the default stub is never called in that test (about 21 `requestCapabilities` placeholders). Every stub a test observes or that returns a non-default value stays an option, including `execute` stubs under loose `rejects.toThrow()`, so no guard got weaker.
- The provisioning builder that shadowed the top-level name is `makeProvisioningDispatcher`.

## The five storage stubs

`onboarding/pages/import`, `popup/pages/profile/new`, `settings/security/export/full`, `export/seed` and `settings/developer/index` discard writes through `installChromeStorage({}, { persist: false })` (D9). A file that stubbed the whole `chrome` global keeps `runtime` and `windows` and installs storage over it.
