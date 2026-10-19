# Recon: a11y-errors-1

Read at `dev` `60fde7e7`; `dev` then moved to `2f591ddd` with no `.vue`, `.css` or dependency change. One Explore agent (Sonnet) swept the inventory, the reuse candidates and the tests; the driver checked every row below against the tree.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| An AA text red | `--txt-danger` (#b3261e light, #ff534b dark, `packages/design/src/base.css:96,164`), the `txt-danger` text colour name (`token-contract.ts` `textColors`), `.color--txt-danger` (`utilities.css:291`) | reuse as is |
| Its contrast gate | `theme-contrast.test.ts` § status text: `--txt-danger` on `--app-bg`, `--nulo-surface-low`, `--nulo-surface-high`, both themes, 4.5:1 | reuse; add a pair only for a measured background it lacks |
| Reading SFCs, CSS and templates | `apps/extension/scripts/type-roles/source-scan.ts`: `sourceFiles()` (default policy: `apps/extension/src` and `packages/design/src`, `vue ts js css scss`, skips tests, stories, `.d.ts` and the generated layer), `parseSource`, `walkTemplate`, `staticAttr`, `boundAttr`, `componentName`, `enclosingRule`, `resolveSelector` | reuse as is |
| A content-keyed reviewed list | `copy-dash-ban.test.ts` (`REVIEWED: { file, text, why }[]`, exact text, stale entries fail); `type-role-ban.test.ts` (multiset by file, rule and normalised text) | adapt the pattern; no shared helper exists for it |
| Resolving a token's colour in the browser | `apps/extension/tests/e2e/helpers/pointer-probes.ts:112-114` (a probe element) | reuse in the capture spec |
| Capture helpers (theme flip, settle, readings) | `~/.cache/nulo-backlog/shots-p61/specs/zz-shots-p61-lib.ts` (scratch, never committed) | copy into the scratch spec |
| Reaching error states in smoke | `auth-flows.test.ts:7-23` (lock screen), `keyboard-guards.test.ts:88` (`unlock-error-text`), `security.test.ts:14` (change password), `restore-outcome.test.ts:214-218` (`import-full-backup-error`), `account-import-export.test.ts` (accounts import) | copy flows into the scratch spec |
| An `ErrorText` component | none (searched `ErrorText`, `error_text`, `FieldError` in `apps/extension/src` and `packages/design/src`) | not built (D6) |

## Inventory: every text that renders in `--red`

`T` = `<Text color="red">`; `C` = a stylesheet `color: var(--red)`. Every `T` and `C` row below is error or refusal text and moves to `txt-danger`.

| # | Site | How | What it says |
|---|---|---|---|
| 1 | `components/composite/ProfileNameField.vue:34` | T | the profile name's error |
| 2 | `components/composite/import/ImportFullBackupForm.vue:93` | T | a failed backup import's title |
| 3 | same `:97` | T | its description |
| 4 | same `:198` `.error_tag` | C | the "Error" chip's label (its border, `:199`, stays) |
| 5 | `components/composite/import/ImportSecretForm.vue:143` `.error_tag` | C | the same chip on the phrase import (border `:144` stays) |
| 6 | `popup/pages/settings/accounts/import.vue:204` | T | an account import's error |
| 7 | same `:270` | T | the same, second step |
| 8 | `popup/pages/settings/security/change-password.vue:203` | T | an unexpected failure |
| 9 | same `:255` `.error_text` | C | "Wrong current password" |
| 10 | `popup/windows/verify/index.vue:251` | T | the verify window's refusal |
| 11 | `popup/pages/auth.vue:431` `.error_text` | C | "Wrong password" and the torn-import refusal |
| 12 | `components/composite/SecretUnlockSection.vue:59` `.error_text` | C | "Wrong password" before an export |
| 13 | `popup/pages/settings/security/export/full.vue:462` `.error_text` | C | "Passwords don't match" |
| 14 | `popup/pages/holdings.vue:293` `.error` | C | "Couldn't load holdings" |
| 15 | `popup/components/modules/general/TokenCard.vue:242` `.failed_text` | C | "Couldn't refresh" |
| 16 | `popup/components/modules/general/TokenSeedRow.vue:78` `.reason` | C | "Couldn't set up" / "Couldn't verify" |
| 17 | `popup/components/modules/tx/TxDebugPanel.vue:146` `.error_key` | C | the developer panel's "Error" label |
| 18 | same `:155` `.error_text` | C | the transaction's error (its 30 % red border stays) |
| 19 | `popup/pages/settings/developer/account-state/notes/index.vue:353` `.render_error_label` | C | "RENDER ERROR" |

Paths are under `apps/extension/src/`. Seven `T` and twelve `C` sites; row 11 is one rule for two texts.

**Red text that stays** (not error text):
- `components/composite/CollapsingHeroLayout.vue:194` `.title_main_destructive`: Reset's "Delete Profile" hero, 40 px (`:176`), large text, so AA asks 3:1; `--red` on the light page is 3.56:1.
- `popup/pages/tokens/[id].vue:362` `.hover_red:hover span`: the "Remove token" label while hovered. A hover colour of a destructive row, outside the decision: OA-1.

**Red that is not text, stays**: 16 `<Icon color="red">` and two `ProcessingErrorNote color="red"` (it forwards `color` to its `Icon` only; its text is `secondary`); the stylesheet glyph rules `connected-apps/index.vue:220`, `tokens/[id].vue:361`, `packages/design/src/ui/Banner.vue:119` (all `… svg`); fills, borders and dots (`Header.vue:469,472`, `PrestoStatusCard.vue:114`, `CollapsingHeroLayout.vue:198`, `PasskeyScreen.vue:211`, `IdentityStrip.vue:66`, `ItemsContainer.vue:51`, `RevokeAuthwitsPopup.vue:354`, `notes/index.vue:273`, `Badge.vue:39`, `Input.vue:413`, `ToastManagerBase.vue:251`, the two import chips' borders); `Header.vue:60`'s `"var(--red)"` (a dot's background, `settings/developer/index.vue:151`); `confirm_color: "red"` (a button type); `NotificationManager.vue:12` (a button type).

**Adjacent, out of `--red`**: the log viewer's error lines use `--log-error-color` (`JsonViewer/creator.js:288`), 3.70:1 light and 3.22:1 dark on `--log-error-background` (OA-2). `FormPopup.stories.ts:107` draws a sample error in `var(--red)` (a story; moves with the rest, D7). The playground's `#c33` error text is a test dApp's, out of scope.

## Issue claims checked

- Holds: `--red` (#f03c3c) is 3.56:1 on the light page and 5.13:1 on the dark one; `--txt-danger` is 6.00:1 and 6.24:1; the flagged-token line uses it (`TokenCard.vue:200`, `SelectTokenPopup.vue:192`).
- Does not hold: "23 `color="red"` text sites". `apps/extension/src` has 25 `color="red"` attributes: 7 on `<Text>`, 16 on `<Icon>`, 2 on `ProcessingErrorNote` (icon only). The token, sender and FPC popups' error text is `primary` or `secondary`; only their icons are red. Twelve more error texts are red through a stylesheet, among them the lock screen's "Wrong password" itself.

## Tests and collisions

- No unit, component or e2e test asserts red on any of these texts; every red assertion is on an icon, a button type or data (`Icon.test.ts:29`, `FieldWarning.test.ts:36`, `ProcessingErrorNote.test.ts:72,96`, `Header.test.ts:306`, …). `send-outcome-rows.test.ts:102,128` reads `tx-terminal-subtitle`, already `--txt-danger`.
- Token contrast, before the browser reads it (both themes, `theme-contrast.ts`): `--txt-danger` is 4.64:1 light and 3.89:1 dark on `--nulo-surface-highest`, the only surface under 4.5:1. No moved text is known to sit on it; Phase 4 measures.
- Lane ui-picks-1 (#870) adds `<Text variant="body" color="red" role="alert">` to Send's amount card; unmerged at plan time.
- #743 rewrites onboarding: rows 1, 2-5 render there. Lane leads hold the connect windows: row 10. Each change is one colour token.
- Known limits searched: `gh issue list --state closed --label known-limit --search "contrast"` and `"red"`: none relevant.
