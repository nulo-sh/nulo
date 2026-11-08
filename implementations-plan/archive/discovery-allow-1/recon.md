# discovery-allow-1: recon

Read at `4d6bce025` (origin/dev). Two Sonnet explorers (a reuse sweep over nine capabilities, a map of the discovery flow), then direct reads. Paths are under `apps/extension/` unless they start with a package or a repo-root file.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| A sealed per-profile row | `dappRegistrations`: root in `src/wallet/services/dapp-session/spec.ts:18`, class `RegistrationAllowance` (`registration-allowance.ts`), built in `DappSessionService`'s constructor (`service.ts:118`), purged in `purgeForProfile` (`service.ts:516`); `STORES` entry with `PROFILE_ROW_LAYOUT` (`src/wallet/storage/stores.ts:177,190`); `sealedDescribed` entry (`stored-shapes.ts:244`) | adapt: a sibling class and root in the same service |
| The flow's switch point | `runDiscoveryPopup` (`src/wallet/services/wallet-sdk/discovery-flow.ts:360`): the `(origin, chainId)` registration, then `discover(...)`, freshness, `admitVerifyWindow`, `persistAndApprove` | adapt: one choice after the registration |
| A token spent by a connection no person paced | `autoApproveExistingSession` (`consumesToken: true`); `admitVerifyWindow` hard-codes `false` (`:247`) | adapt: a parameter |
| A Toggle row with a confirm | `lock.vue` strict mode (`SettingControlRow` + `Toggle`, confirm on the OFF side); `useConfirm().askConfirm` returns a boolean | adapt: confirm on the ON side |
| Settings search | `SETTINGS_ROWS` (`src/utils/settings-search.ts`), `settingsRow`, `v-settings-row`, `expectOwnedRows` (`tests/helpers/settings-rows.ts`) | reuse; Connected Apps gets its first owned row |
| Dotted terms | `DottedTerm.vue` (key, `position`, `testid`), `GLOSSARY` + `GLOSSARY_SECTIONS` (`src/utils/glossary.ts`), signed strings in `glossary.test.ts`, page order in `popup/pages/settings/glossary.test.ts`; `DottedTerm.scan.test.ts` checks literal keys and ≤ 100 characters | reuse; two entries added |
| A glyph + title + sub-line row, no switch | `PermissionRow.vue` (no `switchLabel` means no switch, no Tab stop) in `ItemsContainer` under `SectionLabel`, as `PermissionGroup.vue` composes it | reuse |
| A quiet underlined text button | none shared; `GetStartedCard.vue` `.hide` (label-section role, secondary, underline, 4 px offset) and `BackupReminderBanner.vue`'s focus ring | build new: one CSS-module class in the window |
| Content under the footer's buttons | `DappApprovalFooter.vue` (shared by the discover, capabilities and execute windows) has no slot | adapt: one optional slot |
| A confirm inside a window | windows are routes of the popup app, which mounts `PopupManager` and `ConfirmPopup` (`src/popup/app.vue`); no window opens one today; shots-p117a's frame a4-02 rendered it | reuse, proven by the arc 2 e2e |
| E2E | `connectPlayground` and `approveConnect` wait for the connect window; `connect-check-window.test.ts` shoots `connect-discover` through `shotSend` (`tests/e2e/fixtures/shots.ts`, active with `NULO_E2E_SHOT_DIR`); no e2e pins the window's text | adapt: one new network file for arc 2 |
| A record of an origin refused at the emoji check | none: `refuseVerification` (`service.ts:427`) deletes the rows and emits; `verification-hold.ts` keeps nothing across a worker restart | build new, in the same sealed row (see the plan's D3) |

Absence trails: `allowAll|autoApprove|allow every|every site|approve-all` over `src` (only the per-session auto-approve); `text-decoration: underline` over `src` and `packages/design/src` (ad hoc classes only); `requestConfirm|askConfirm|popupStore|<Popup` under `src/popup/windows` (none); `discover-scope|Allowing lets|Make sure you trust` over `tests/` (none); `refuseVerification|onVerificationRefused` (two listeners, neither stores anything).

## Facts the plan rests on

1. A non-keyed sealed root serves a plaintext JSON row as a legacy row until its service calls `sealLegacy` (`src/wallet/storage/sealed-entity-storage.ts:5`, `decode` at `:537`). A new root read through `get` would therefore honour a plaintext row a storage writer put there.
2. `handleSecureDiscovery` has 79 of its 80 non-blank lines; `persistAndApprove` 75. Neither can take new lines.
3. The session lookup at `discovery-flow.ts:131` must stay the last yield before the registration at `:373` (`background.discovery-race.pins.test.ts`); an await after the registration keeps that.
4. `DappInteractionService.settleDiscovery` passes only `approved === true` from the window (`dapp-interaction/service.ts:336`, pinned by `service.test.ts:1017`).
5. `legal/call-sites.test.ts` pins `discovery-flow.ts` as an `assertCurrent` caller; the Terms read stays there.
6. A sealed row with no row keys in the worker reads as absent and refuses a write (`WalletLockedError`); `refuseVerification` must work while locked (raw rows).
7. `SEALED_ROOTS` derives from `STORES` (`stores.ts:241`): the keyless deletion sweep (`sealed-roots.ts`) and the root census (`root-census.test.ts`) pick a new sealed root up with no edit. `tests/e2e/helpers/profile-chaos/checkers.ts` `FAMILY_GROUPS` needs an entry (pinned by `scripts/e2e/profile-chaos-model.test.ts`).
8. Backups are slice-based (`backup-migration-registry.ts`); a root no slice maps to never enters a backup.
9. Docs that state the old behaviour: `SECURITY.md:249` ("discovery requires user approval via popup"), `ARCHITECTURE.md:183` (auto-approve only on an active session), `legal/privacy.md` § 5.7 ("learns what you approve"); the sealed-root lists in `CLAUDE.md` (Never migratable), `ARCHITECTURE.md:129`, `SECURITY.md:~402`.

## Collisions

- Open PRs #1664 and #1687 (on hold) bump `legal/privacy.md`; a privacy edit here takes the next free version when it lands.
- No open issue covers this feature. Closed known limits in the area: #883, #927, #1061, #943, #967 (a storage writer can put back an earlier authentic dApp-session row: the same rollback class applies to the new row).
