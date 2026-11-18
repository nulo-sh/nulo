# switch-names-1: recon

Read by hand at b22893f42 (nine sites; no Explore agents needed).

- `git grep -n "<Toggle" -- apps/extension/src` outside stories and tests: nine tags, listed in `plan.md` § The sites. Seven carry no `aria-label` or `aria-labelledby`; connected apps passes its row title as `aria-label`; `PermissionRow` passes its `switchLabel` prop.
- `packages/design/src/ui/Toggle.vue`: single root `div role="switch"`, no `aria-*` props, so attributes fall through to it. Its default `data-testid="toggle-switch"` is overridden by a caller's.
- `apps/extension/src/components/ui/Settings/SettingControlRow.vue`: title is a `Text` sibling with no id; the root takes fallthrough attributes. Users with a switch: display (two tags), privacy (two), lock, connected apps.
- `apps/extension/src/popup/pages/settings/developer/index.vue`: inline rows, title `Text` per row; already uses `useId()` for its Logs row.
- `apps/extension/src/components/ConfirmPopup.vue`: toggle row with a label `Text` and an optional description; `requestConfirm` callers are in-wallet only.
- Tests: every settings page test calls `expectOwnedRows` (`apps/extension/tests/helpers/settings-rows.ts`) and stubs `Toggle` (`Toggle: true`, or a local component in `privacy.test.ts`); `ConfirmPopup.test.ts` stubs it as a checkbox. No accessible-name helper or `dom-accessibility-api` dependency exists.
- Static guards parse SFCs through `apps/extension/scripts/type-roles/source-scan.ts` (`sourceFiles`, `parseSource`, `walkElements`), as `icon-names.test.ts` does.
- E2E readers of these switches: `appearance`, `fiat-display`, `firefox-sidebar`, `contacts`, `received-fee-privacy`, `navigation`, `sw-resilience`, `settings-routes`, `type-roles`; through `fixtures/auth.ts` and `fixtures/settings.ts`: `extension-restart`, `rows`, `settings-crud` (smoke), plus network files the change cannot reach (selectors and clicks are unchanged).
- Closed known limits searched (`toggle`, `switch accessible name`): none in this area.
