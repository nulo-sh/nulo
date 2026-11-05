# wrap-1: recon

Base `a4da1f36f` (`origin/dev`). One Explore agent (Sonnet) ran the reuse sweep. The planner checked each claim used below against the tree. The planner also measured the real layout in the armed smoke build, in Chrome, with an uncommitted capture spec.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Wrap one unbroken string inside its box | `overflow-wrap: anywhere` is the repo's per-component rule for data-length text: `NotificationManager.vue` `.card` (#1232), `StaleNetworkConfirm.vue:106,163`, `TokenCard.vue` and others: 18 extension files, plus 2 in `packages/design` (`ToastManagerBase.vue:260`, `Tooltip.vue`). There is no global rule (`base.css` and `utilities.css` have none) and no `Text` prop for it. | reuse the rule as it is, local to each box |
| Pin a module-CSS rule and tie it to its element | `apps/extension/scripts/type-roles/source-scan.ts`: `parseSource`, `declarationsOf` (`:198`), `elementByTestid` (`:210`) and `boundAttr` (`:263`). `TokenCard.test.ts:414-433` uses all four: the element under a testid binds the class, and the class carries `overflow-wrap: anywhere`. | reuse as is |
| Mount the four places | `ImportFullBackupForm.test.ts` (plain mount; stubs `Flex` and `Text`), `RestoreOutcomeBanner.test.ts` (mocked app store with `networks`; stubs `Banner` and `Text`), `restore-again.test.ts` (mocks `useRestoreAgain`, whose `networkNames`, `retryFailedAgain` and `retryResult` are refs; stubs `Text: true`). No case feeds a long name. | extend each |
| Real-layout checks on these screens | `tests/e2e/restore-outcome.test.ts` SE1 runs `expectFitsNarrow` (240 px, the width Firefox's sidebar opens at, `fixtures/type-roles.ts:715`) on the banner and on Restore again, with the names "Old Testnet" and "Local Network". SE2 drives the warning, the intro and Restore again's failed-Retry line. `import-errors-scroll.test.ts` drives the import warning and the failed-Retry line in the popup and onboarding. | the arc's smoke gate, unchanged |

The sweep said `Banner.vue` has `.title { overflow-wrap: anywhere }` and a `.body` rule. That does not hold. Its module has only `.wrapper`, `.icon`, `.text` and `.action_btn`, and none of them wraps.

## Where the names come from (the issue's premise)

- **A backup brings no network name.** `reseedNetworksStage` (`apps/extension/src/composables/full-backup-restore.ts:231-264`) says "the backup carries no network rows". It seeds the built-in networks and binds every other row to a seed by chain id. `NetworkRestoreClient` (`:133-138`) has no method that writes rows.
- **A fresh import names seeds only.** The onboarding and popup import name `ctx.networks`, the seeded rows (`useFullBackupImport.ts:724,770-773`). The seeds are "Testnet", "Local Network" and "Alpha V6" (`network/seeds.ts:44,53,61`).
- **A backup does name a held imported account in the warning.** An account on a chain no seed serves is held (`full-backup-restore.ts:355-357`). Its name, cleaned by `sentenceName` to 32 letters, digits, spaces and `-._` (`:644`; `utils/string.ts:47-51`), goes into the fresh-import warning through `restoreWarningText`'s held sentence (`restore-warning.ts:27-38`), in the same `.warning_block`. The audit legs found this; the planner verified it.
- **Restore again and Home name the profile's current networks.** These are `state.unrestored` (`useRestoreAgain.ts:332-343`) and `appStore.networks` (`RestoreOutcomeBanner.vue:19-27`). A person names such a network through the add and rename fields: `maxLength` 25, `sanitize` keeps letters, digits, space and `-._` (`popup/components/popups/EditNetworkPopup.vue:114-121`; `utils/string.ts:36-45`). The wire schemas cap nothing (`spec.ts:212-219`, `min(1)` only). Only same-extension contexts reach them: every service port is checked by `isTrustedInternalSender` (`packages/extension-messaging/src/background/service.ts:46`), which refuses content scripts and foreign extensions.

## Measured (Chrome, armed build, uncommitted capture spec)

The spec ran SE2's path: the local node refused, import, Continue, rename the local network through `appStore.renameNetwork`, the banner, Restore again, restore, Retry. Each value is how far the text's last line box ends past its box's content edge, in px; `≤0` fits. The two widths are the popup (360) and Firefox's sidebar (240). Names:
- `seed`: "Local Network".
- `real25`: "AztecSequencerTestnetEU01", a plausible 25-character name.
- `w25`: 25 `W`s, a wide Latin name the field accepts.
- `run60`: a 60-character run, which no supported path stores.

`w25` is a wide Latin fixture, not a bound: the sanitizer also admits wider letters (U+FDF2, U+FDFA).

| Place (box) | seed 360/240 | real25 | w25 | run60 |
|---|---|---|---|---|
| Home's reminder (`restore-outcome-banner`) | 0 / 0 | 0 / **26** | **45** / **165** | **96** / **216** |
| Restore again's intro (`.intro`) | fits / fits | fits / fits | fits / **111** | **42** / **162** |
| Restore again's warning (`.warning_block` of `ImportFullBackupForm`) | 0 / 0 | 0 / **66** | **85** / **205** | **136** / **256** |
| Restore again's failed-Retry line (bottom column) | fits / fits | fits / fits | fits / **111** | **42** / **162** |
| Popup import's warning (seed names only) | 0 / 0 | not reachable | not reachable | not reachable |
| Onboarding's failed-Retry line, at 1280/320 (seed names only) | fits / fits | not reachable | not reachable | not reachable |

- Where the text overflows, the document does not scroll sideways (`scrollWidth` equals the viewport), so the overflow is clipped. At 240 px with `w25`, the warning loses the name's end and the rest of each line: it reads "didn't answer in time, s".
- The trial fix (plan D1-D3, built and then reverted) brings every row to `≤0` at both widths for all four names. With `seed`, every place keeps its line count and height to the pixel (banner 104/166 px, intro 33/69, warning 59.2/131.1, retry line 14.4/28.8). The warning's "WARNING" tag stays whole (`flex-shrink: 0`). The wrapped forms read cleanly: the fixtures' 25-character names take at most three lines at 240 px.

## Open work and collisions

- `#1276` (this lane). Closed known limits searched with `gh issue list --state closed --label known-limit --search "network name overflow"`. The one hit is #1275 (the notice card does not scroll), which is not on these boxes. #1232 shipped the notice card's `overflow-wrap: anywhere` (decision page 89, P89-01 = A).
- Other places a typed network name shows inside a `Banner`: Settings → full backup's `addedNetworksText` (`popup/pages/settings/security/export/full.vue`) and the capabilities window's chain banner (`popup/windows/capabilities/index.vue:386-403`). These are plausible but not measured, and the lane brief puts them out of scope (plan D5).
- Collisions: none. No open PR touches these three files.
