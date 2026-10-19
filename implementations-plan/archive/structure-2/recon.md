# structure-2 recon

Three read-only Sonnet explorers at `dev` @ `18d29f23` (2026-10-18): a reuse sweep for #735, a re-verification of #750's map, and traces for #680 and #730. Paths are under `apps/extension/src/` unless they start with a top-level directory. The parent verified every claim the plan rests on.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Settings control row (title, caption, control) | None. `components/ui/Settings/SettingItem.vue` is a navigation row (padding 16/20, divider, `RowTarget`, label gap 4, title 14px); `SettingField.vue` is a label and value; `ConfirmPopup.vue:70-92` has gaps 12 and 2. Searched `SettingsRow\|ToggleRow\|SettingToggle\|LabeledControl\|SettingRow`, every `<Toggle`, every `variant="row-title"` in `apps/` and `packages/`, and `packages/design/src/{ui,core}`. | build new (`components/ui/Settings/`) |
| Row title size | `.title_size { font-size: 13px }` in `privacy.vue:176`, `display.vue:320`, `lock.vue:252`, `developer/index.vue:233`, `about.vue:159` (a page title, not a row). `developer/account-state/contracts/index.vue:101` is 14px. `row-title` is a site-sized role (`packages/design/src/token-contract.ts:135`, size `null`), so the size is the site's; `type-role-ban.reviewed.json` is `{}`. | moves into the row component |
| Row write | `composables/useSettingUpdate.ts` (#737) | reuse; widen |
| Row read | `composables/useConfigRead.ts:46-90` (fence, re-read on reconnect, `land(value, updatedSince)`) | reuse as-is |
| Land and update plumbing | Privacy `onSettingUpdate` 64-70 and `landPrivacyConfig` 73-81 are byte-identical to developer's 105-111 and 114-122; display's (100-110, 113-126) add one dust branch; lock's differ (no row map, its own payload). | adapt: widen `useSettingUpdate` |
| "Failed to update setting" | `useSettingUpdate.ts:26`, `display.vue:74`, `lock.vue:77,109,122`. `utils/toast-call-sites.test.ts` requires each `openToast` argument to be one object literal with a literal `kind`. | one exported label constant; the literal call stays per site |
| Settings row highlight | `composables/useSettingsRowHighlight.ts`: `v-settings-row` directive, `mounted` hook only | reuse; a directive on a single-root component applies to its root |
| Profile-flow failure notice | Byte-identical pairs: `onboarding/pages/create.vue:62-75` and `popup/pages/profile/new.vue:74-87`; `onboarding/pages/import.vue:112-124` and `popup/pages/import.vue:138-150`. No test pins the copy. | build new pure builders |
| Explorer display name | `BLOCK_EXPLORERS.find((e) => e.id === appStore.defaultExplorer)?.name ?? "explorer"` at `tx/[id].vue:125`, `received/[id].vue:148`, `journal/[id].vue:131`, `IncomingTrustPopup.vue:57`. `privacy.vue:43-47` differs ("None", a dropdown label). `wallet/constants/explorers.ts` has URL builders only. | build new helper in `explorers.ts` |
| Detail hero meta line | `tx/[id].vue:170-192`, `received/[id].vue:244-266`, `journal/[id].vue:241-256`; classes already shared through `popup/pages/detail-page.module.css`. `popup/components/modules/tx/TxHashRow.vue` is the same link-or-copy idea for the Details row. | build new, shaped like `TxHashRow` |
| Fee valuation "mirror" | Both pages already call `utils/fee-estimation.ts:118` `feeDisplay(raw, prices.feeJuiceQuote.value?.usd)` (tx through `TxFeeRow`). | nothing to share |
| Hero visibility | `activity.vue:141-170,195` and `settings/index.vue:87-106`, character-identical observer bodies. `components/composite/CollapsingHeroLayout.vue` uses a scroll offset, not an intersection. Searched `IntersectionObserver\|heroVisible\|useIntersection\|useElementVisibility`. | build new C0 composable |

## #735: row inventory (the markup the component must reproduce)

- Privacy P1-P3 (`:98-164`): outer `justify=between align=center`; inner `column gap=6`; tight text; title testids `explorer-title`, `privacy-mode-title`; caption testids `fiat-values-description`, `explorer-description`.
- Display D1-D3 (`:143-215`): outer `justify=between` only; spaced text (`> {{ x }} <`). D4 dust (`:218-237`): `justify=between align=center gap=12`, tight caption.
- Lock L1 strict (`:190-201`): `justify=between align=center`, tight. L2 auto-lock (`:204-229`) wraps its title in `Flex align=end gap=6` with a `Tooltip`: not the shape.
- Developer V1 (`:139-152`): inner column adds `justify=center`. V2 logs and V3 account state are link rows: not the shape.
- `tests/helpers/settings-rows.ts:23-52` (`expectOwnedRows`) pins outer testid, `data-settings-row`, text and order, not flex props.

## #735: test inventory (describe / test counts)

`privacy.test.ts` 2/8, `display.test.ts` 1/4, `lock.test.ts` 2/12, `developer/index.test.ts` 0/5, `settings/index.test.ts` 6/19 (fake observer at 74-100), `useSettingUpdate.test.ts` 1/9, `tx/[id].test.ts` 4/12, `received/[id].test.ts` 3/14, `journal/[id].test.ts` 5/12, `IncomingTrustPopup.test.ts` 6/20, `activity.test.ts` 7/21, `explorers.test.ts` 4/9, `detail-page.styles.test.ts` 1/5, `Settings.test.ts` 3/30, `useProfileCreateFlow.test.ts` 2/19, `useProfileImportFlow.test.ts` 2/20. Smoke e2e reading these surfaces: `navigation`, `appearance`, `settings-routes`, `sw-resilience`, `security`, `fiat-display`, `received-fee-privacy`, `send-outcome-rows`, `rows`, `home-links`, `type-roles`.

## #750: the map at HEAD

`incoming-transfer/service.ts` is byte-identical to the issue's measurement commit `00f31d32` (on the arc-3 lineage, squashed into `dev` as `244badd3`), so all fifteen ranges hold (2,749 lines; class 186-2649). Seam claims verified: `receiptFence` 356-360 with direct `deletersRunning` reads at 746, 749, 1691-1692; both commits run tokens → existing record → own-send dedupe → trust → outbox → insert → emit (note 1717-1809, public 2459-2543); `resolveReceiptTrust` (1756) sits in the note arm and the public arm calls it (2484); `isOwnSend` and `emitUpdatedIfShown` sit in the public arm's tail and the note arm calls them. Corrections:

- The "sole cursor writer" comment at 1916 is false: `onAccountAdded` writes `repo.setCursor` directly (484), `onTokenDeleted` deletes (1338), `clearScope` deletes by prefix (`repository.ts:247`).
- Public-arm seam for an extraction: one entry (`scanPublicContract` ← `scanAndRecord` 1184), `freshCursor` and `classGateCache` reached from 484-485 and 1339, plus the spine (lock, deleter lock, fence, epoch), `resolveReceiptTrust`, `isVisibilityEnabled`, the region-14 builders and `emit`.
- `service.scenarios.test.ts` (7,361 lines, 265 tests) reaches about five public-arm members by cast (`classGateCache`, `persistCursorLocked`, `commitPublicEvent`, `scanPublicContract`); test-infra-1 arc 4 (`Closes #540`) will rewrite that suite onto the real repository.
- Churn since `e1c75331`: note arm 256 surviving lines, public arm 222 (#420 134, #248 72), every other region 64 or fewer. No open plan or remote branch schedules an arm change.
- Already extracted: `balance-outbox.ts` 179, `public-event-indexer.ts` 154, `scan-episodes.ts` 178, `scan-health.ts` 43, `note-reconcile.ts` 75, `arrival-state.ts` 87, `repository.ts` 263.

## #680: the trace at HEAD

The issue names `background.ts`; the code is `wallet-sdk/discovery-flow.ts:492-562` (`persistAndApprove`). The claim holds:

1. `:513` `getActiveProfile()` is facade-lock turn L1 (`profile/service.ts:519-525`).
2. `:526` `addDappSession(...)` takes no profile; `dapp-session/service.ts:202` `captureExecutionFence()` is turn L2 (`profile/service.ts:535-538`), about three microtask hops later.
3. `Lock` is FIFO (`packages/wallet-core/src/utils/lock.ts:18`); an unlock's phase-3 turn (`profile/service.ts:690`, `:848`) queued between L1 and L2 opens P2's session first, so L2 captures P2 and the row is written with `profileId: fence.profileId` (`dapp-session/service.ts:214`); `approverProfileId` (`discovery-flow.ts:547`) is then P2.
4. The window carries no profile id (`dapp-interaction/spec.ts:104-121`); the worker holds `profileId` from `discovery-flow.ts:113`.
5. Precedent for the fix: `dapp-interaction/service.ts:342-350` captures a fence and refuses when `fence.profileId !== payload.session.profileId`. `addDappSession` is on the RPC `Methods` (`dapp-session/spec.ts:119-125`), so a passed fence would be a forgeable capability; an expected profile id can only narrow.
6. A refused Allow today: `rejectThrottled` (`discovery-flow.ts:249-252`) rejects the discovery with no reason and the standby window closes (`verify-admission.ts:94-97`). Nothing new is shown.
7. Test hosts: `wallet-sdk/background.connect-window.test.ts` (`holdNextProfileRead` 215-225, the fence-read hold at 1180-1200); its fake `addDappSession` (`wallet-sdk/test-services.ts:98`) stamps `profileId: "p1"` whatever the fence says, so a reproducer first makes the fake stamp the fence's profile. `dapp-session/service.test.ts:151-232` holds the deletion pins. Callers and stubs of `addDappSession`: `dapp-session/service.{test,composition.test}.ts`, `network-reset/service.composition.test.ts:213`, `profile/service.integration.test.ts:3815`, `wallet-sdk/session-revocation.composition.test.ts:47`, `background.discovery-race.pins.test.ts:74`, `background.init-order.pins.test.ts:91`, `test-services.ts:98`.

## #730: the pieces at HEAD

All four live, read only by `onboarding/pages/presto.vue`, except `bannerStatus`, which nothing outside tests reads even today (`composables/usePrestoStatus.ts:15,32,44`). `origin/worktree-onboarding-3` (PR #743) deletes `presto.vue`, `presto.test.ts`, `learn.vue`, `fees.vue` and `tests/e2e/helpers/presto-step.ts`, and touches none of the pieces.

| Piece | Where | Readers after #743 |
|---|---|---|
| `"onboarding"` surface (the default), `PERMISSION_BLOCKED_COPY.onboarding`, the long `connectedDetail` | `utils/presto-ui-state.ts:40,100-109,152-161,169`; tests `presto-ui-state.test.ts:83-180` | none; `popup/pages/settings/proving.vue:31` passes `"settings"` |
| `bannerStatus` | `composables/usePrestoStatus.ts`; `usePrestoStatus.test.ts:40,68,74,99` | none |
| `isCustomElement` for `presto-` tags | `vite.config.ts:98-99` | none |
| CSP `style-src` hash `sha256-C0kf…` | `manifest/manifest.config.ts:49-61`; `src/manifest.test.ts:132-172` re-hashes a rendered banner | none |
| Type-role carve-outs and surface | `scripts/type-roles/exceptions.ts:55,61`; `surfaces.expected.json:454-458` | none (unless #743 edits them) |

`@alejoamiras/presto-banners` stays: `presto-ui-state.ts:10` imports `STRINGS` and `stateFromStatus`. `store/listing.md:244` names the banner's `innerHTML` as a linter warning; it stays true only while the `register` entry is bundled.

## Collisions (other lanes, 2026-10-18)

- **onboarding-3 (#743, draft)**: edits `onboarding/pages/{create,import}.vue` (not the notice blocks) and deletes the Presto step. The notice family and #730 wait for it.
- **test-infra-1 arc 3**: moves storage stubs in `settings/developer/index.test.ts`, `onboarding/pages/import.test.ts`, `popup/pages/profile/new.test.ts`, and the `wallet-sdk/background.*` drains (phase 8). **Arc 4** rewrites `incoming-transfer/service.scenarios.test.ts` onto the real repository.
- **dapp-boundary-3 arc 2**: holds the connect path and window; its branch `origin/dapp-boundary-3-arc2` today touches the capabilities window, `dapp-session/capability-meta.ts` and `packages/wallet-bridge`, not `discovery-flow.ts` or `dapp-session/service.ts`.
- **ui-dedupe-1 A4**: `SecretCountdownClose` and `settings/security/export/seed.vue` only. **consent-display-1**, **send-fees-ux**: none of these files.
- Closed known limits in the area: #736 (a settings write applies twice; unchanged here), #682, #478.
