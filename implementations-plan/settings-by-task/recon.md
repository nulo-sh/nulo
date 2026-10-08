# Recon: settings-by-task

Base: `worktree-settings-by-task` at `50540c8` (origin/dev when the worktree was cut). origin/dev has since gained one commit (`e49e4ce`, send recipient names) that touches none of the files below. Two read-only sweeps (reuse, test blast radius), then a lead re-check of every claim used here against the code. Paths are repo-relative; `src/` means `apps/extension/src/` and `e2e/` means `apps/extension/tests/e2e/`.

## Reuse map

| Capability | Existing code (or absence + search trail) | Verdict |
|---|---|---|
| Hub rows and groups | `src/popup/pages/settings/index.vue:78-185`: hand-written `SettingItem`s inside five `ItemsContainer title=…` blocks. No data array. | reuse-as-is |
| Row trailing value ("30 min") | `SettingItem` has no value prop. Its `#right` slot (`SettingItem.vue:141-151`) *replaces* the chevron, so a value via the slot must redraw the chevron. Searched `SettingItem.vue`, `Settings.test.ts`, `Settings.stories.ts`, `src/popup/pages/settings/**`, `packages/design/src` for `trailing`, `value`, `#right`. | adapt: add a `value` prop rendered before the default chevron |
| Profile card | `AccountAvatar` (`src/components/composite/general/AccountAvatar.vue`, initials square, `data-testid="account-avatar"` on its root). `SettingItem` link mode gives the `<a href>`, focus ring, Space key and divider. Precedent for an avatar in `#icon`: `src/popup/pages/settings/accounts/index.vue:192-194` (size 20). Blocker: `.icon_wrapper` is a fixed 20x20 box (`SettingItem.vue:220-228`); the board's avatar is 40px. | adapt: keep `.icon_wrapper` 20x20 by default and give it `min-width`/`min-height` 20px only when `#icon` is filled, then a `SettingItem size="large"` with the avatar in `#icon` |
| Profile source | `useAppStore().profile: Ref<ProfileInfo \| undefined>` (`src/stores/app.store.ts:145`), `{ id, name, type: "password" \| "passkey" }` (`src/wallet/services/profile/spec.ts:15,48-60`). | reuse-as-is |
| Lock now | All lock logic is inline in `src/components/Header.vue:25-76` (`lockWallet`, `LOCK_READ_BUDGET_MS`, `readForLock`, `sessionChanges`/`confirmLock`, `handleLockWallet`), listeners added at `:54-55`, removed at `:259-260`. Searched non-test `src` for `lockActiveProfile`, `useLock`, `lockWallet`: only Header and the profile service. | adapt: extract a C1 composable |
| Post-lock routing | `watchLockStart` (`src/popup/locked-state.ts:62`, wired at `src/popup/app.vue:174`) reacts to `appStore.isLogined = false` by bumping the scope epoch and closing the toast (`src/popup/scope-epoch.ts:22-25`); it does not route. The route to `/popup/auth` comes only from the worker's lock event (`app.vue:200-224`). Header discards `lockActiveProfile`'s promise (`Header.vue:25-29`), and the worker rejects when the session record survives `close()` (`wallet/services/profile/service.ts:913-916`). | reuse-as-is (limitation inherited) |
| Legacy redirects | Only proven pattern: `routes.push({ path: "/", redirect: "/popup" })` in `src/popup/index.ts:28-31`. No `<route>`-block redirect, `addRoute` or `definePage` anywhere (searched `src`, `scripts`, `vite*.ts`). | adapt: push three records from an exported list |
| Route inventory for a test | `PageContext` from `vite-plugin-pages` 0.33.3 is already driven in a unit test (`apps/extension/scripts/pages-options.test.ts`); its resolver's `getComputedRoutes(ctx)` returns the route tree. | reuse-as-is |
| Hub config reads | `ConfigServiceClient` (`src/wallet/services/config/client.ts`: `getProps()`, `onUpdate`); the hub already owns one (`index.vue:24`, disconnected at `:59`). No Pinia store holds config. | reuse-as-is |
| Value labels | None: no formatter for minutes, theme names or on/off. Lock page shows raw minutes (`security/index.vue:68,133`). | build new: one pure module, so the hub and the profile page share tested labels |
| Danger group | No red-fenced group exists. `ItemsContainer` has no tone; `iconBgColor` is declared (`SettingItem.vue:20-23`) and never read; `iconFillColor` reaches only the custom `Icon` branch, while the `materialIcon` branch hard-codes `color="secondary"` plus `.material_icon` CSS (`SettingItem.vue:109-122,230-237`). `--red` token: `packages/design/src/token-contract.ts:62`. | build new: a `danger` boolean on `ItemsContainer` (border only); red icon through the `#icon` slot |
| Section label "Lists" | `SectionLabel` (`packages/design/src/ui/SectionLabel.vue`), used across settings pages; the board's "Lists" style matches it exactly. | reuse-as-is |
| Page shell | `SettingsPageShell` (title, backTo, gap) on most settings pages; Appearance uses `SubPageHeader` directly. | reuse-as-is |
| Config toggle binding | Two copies of the same pattern: `appearance.vue:36-163`, `advanced/index.vue:74-157` (`settings` map, `updateSetting`, `applySetting`, `onSettingUpdate`, `getProps` at mount). Both carry the open bug in `implementations-plan/follow-ups.md:239`. | adapt (split verbatim; see plan) |
| Block Explorer control | `advanced/index.vue:217-257`, no testid on trigger or items. | adapt: move, add testids |
| Header avatar testid clash | `account-avatar` already repeats on Manage Accounts' hidden rows (`accounts/index.vue:193`). No e2e selects `account-avatar` (only `account-avatar-btn`). A fallthrough `data-testid` on `<AccountAvatar>` replaces the root's static one (Vue merges fallthrough attrs last). | reuse-as-is with an override attribute |
| E2E settings navigation | `navigateToSettings` (`e2e/fixtures/helpers.ts:524-580`) builds `setting-nav-<segments joined by ->`, falling back to `<a href="#/popup/settings/<segments>">`. `navigateByHash` (`:1586-1600`) waits for the exact hash. | adapt: new first segments; one new helper for Account State |
| Screenshots | `shotSend` (`e2e/fixtures/send-page.ts:209-231`) is tied to Send; `network/store-captures.test.ts` needs a sandbox and writes committed captures. | build new: a throwaway smoke spec, never committed |

## Corrections to the raw recon

- **Redirects do not save `navigateByHash` callers.** One sweep said hashes to old paths "stay valid via redirect". `navigateByHash` waits for `location.hash === requested`, so on a redirected hash it can pass on the old hash before the router replaces it, or time out after. Either way it is the wrong wait. Every old-path hash in tests must change, and a redirect spec sets `location.hash` itself and calls `waitForHash` (`e2e/fixtures/extension.ts:1273`) with the new hash.
- **`iconFillColor` does not redden a hub row.** It only reaches the custom `Icon`; hub rows use `materialIcon`, whose color is fixed. Use the `#icon` slot.
- **The account-state child testids are referenced.** `navigateToSettings(page, "advanced", "account-state", "authwits")` builds `setting-nav-advanced-account-state-authwits` in its third step. They are not "unreferenced".
- **`navigateToSettings` cannot stay unchanged for Account State.** With a `developer` first segment its third step looks for `setting-nav-developer-account-state-<x>` or `#/popup/settings/developer/account-state/<x>`; neither exists, because account-state keeps its route and child testids.
- **No `<route>`-block redirect exists in this repo.** The test recon implied one; the plugin supports it, but there is no precedent.
- **Missed doc and legal references.** `legal/privacy.md:145` (Privacy Policy 1.1.1: "the explorer can be disabled in Settings → Advanced"), `SECURITY.md:93,318`, `ARCHITECTURE.md:99`, `e2e/FIREFOX.md:52`, `e2e/PRF-NON-PORTABLE.md:128,150`, `e2e/passkey-backup.test.ts:36`, `src/popup/locked-state.ts` ("The header marks the popup locked…").
- **Red text fails AA in the light theme.** Measured with `packages/design/src/theme-contrast.ts`: `--red` on `--app-bg` is 5.13:1 dark, 3.56:1 light; on `--nulo-surface` 4.79:1 dark, 3.88:1 light. The board colors the "Danger zone" label red.
- **The Tab-lap anchor is the first `setting-nav-*` stop, not the first Tab stop.** Header controls come first in DOM order; the lap starts at the first `setting-nav-profile`.
- **`.ts` files in page directories become routes.** The vue resolver's `resolveExtensions()` is `["vue","ts","js"]`; a route dump shows nine popup helpers (`/popup/send-amount`, `/popup/detail-page`, …) and thirteen `windows/*` helpers routed. Not tracked in `follow-ups.md`; out of scope here. New settings helpers must live outside `src/popup/pages/`.

## Condensed findings

**Hub** (`index.vue`, 254 lines). Groups today: Identity (Profile, Accounts), Connections (Contacts, Networks, Tokens, Fee Payments), Security (Security & Backup, Connected Apps), App (Appearance, Proving, Glossary, Advanced), then a footer `RouterLink` "About Nulo" (`:187-189`, no testid). Proving row: `usePrestoCheck(configService)` + `getLastProveOutcome` (`:23-37`). Hero/title-bar markup and `tab-hero.module.css` composes stay. Whole page sits under `v-if="appStore.isLogined"`. The script has no `lang="ts"`.

**SettingItem.** Modes: `link` (`to`), `external`, `click` (`@click`; a stretched `RowTarget` button is the focus stop and its click bubbles to the root), `inert`. `data-testid` falls through to the root `<a>`/`<div>`. Title and description ellipsize (`:254-280`); a value beside them needs `flex-shrink: 0`.

**Profile page** (`profile/index.vue`): Identity (`identity-name-row` SettingField, `identity-id-row` "ID"), Security (`backup-link-btn`, `change-password-link-btn` disabled for passkey at `:42`), Delete (`delete-profile-link-btn`, `iconBgColor="red"` with no effect). No Type row.

**Security page** (`security/index.vue`): everything sits under `LoadingState v-if="isLoading"` until two `getValue` reads finish (`:130-139`). Strict mode wrapper `setting-strict-security-mode`, toggle `strict-security-toggle`, shown to passkey profiles today. Auto-lock `auto-lock-input`, max 1440 minutes. Backup row `backup-link-btn` (`:197-205`). `follow-ups.md:141`: after unlock plus a worker restart these reads never clear `isLoading`.

**Appearance** (`appearance.vue`): `SubPageHeader title="Appearance"`; theme label "Dark Theme" (`:177`); dropdown labels Dark, Light, System (`:200-212`); toggle loop over `settings` minus theme with testids only for `animations-toggle` and `fiat-values-toggle` (`:222-233`); typo "to to" (`:59`); Hide dust `dust-threshold-input` (`:235-255`). Dead `.item` CSS (`:270-296`). The comment at `:97-99` documents the root of the toggle bug: ConfigStore emits `onUpdate` before it persists.

**Advanced** (`advanced/index.vue`): title "Advanced Settings"; developerMode cascades to indicateFailures and debugMode (`:120-138`); Logs row `settings-logs-row` / `settings-logs-open`; Account State `RouterLink` with no testid (`:207-215`); Block Explorer dropdown with the toast "Default explorer updated" (`:132`). Colocated `index.test.ts` imports `./index.vue` and mocks `@/components/ui/Dropdown`.

**Back targets.** `security/export/index.vue:17` → `/popup/settings/security`; `security/change-password.vue:105` and `security/reset.vue:118` → `/popup/settings/profile`; `advanced/account-state/index.vue:14` → `/popup/settings/advanced`. `SubPageHeader` uses `router.back()` when `window.history.length > 1`, so `backTo` matters on a cold open only. `route-guard.ts:58` sends a passkey profile on a `requirePasswordProfile` route to `/popup/settings/profile` (pinned by `route-guard.test.ts:81`).

**Generated routes today** (route dump via `PageContext`): `/popup/settings/security` ← `security/index.vue`, `/popup/settings/appearance` ← `appearance.vue`, `/popup/settings/advanced` ← `advanced/index.vue`, plus `/popup/settings/advanced/account-state[/notes|authwits|contracts|senders]`. Names drop `-index`. Nothing in non-test `src` navigates by route name.

**Config keys** (`src/wallet/config/config.ts`): `sessionTtl` ms, default 1 800 000, 0 = never; `showFiatValues` default true; `theme` `dark|light|system`, default system; `developerMode` default false; `defaultExplorer` nullable enum `["aztecscan"]`.

**Legal sheet.** `src/utils/legal-sheet.ts:7` never covers `/popup/legal/` and `/popup/settings/security/export`; it covers other auth-required routes until "Not now". New pages need no list change. `call-sites.test.ts` pins `assertCurrent` callers; no settings page calls it.

**Scanners that read new `.vue`/`.ts` files.** `copy-dash-ban.test.ts`, `DottedTerm.scan.test.ts`, `storage-facade-ban.test.ts`, `log-payload-ban.test.ts`, `profile-ui-keys.scan.test.ts`, `toast-call-sites.test.ts`, `a11y-css.test.ts` (lists only `export/full.vue`). The complexity baseline names no settings page and not Header.

**Tests in vitest.** Only `vue` and `vue-router` auto-import in unit tests (`apps/extension/vitest.config.ts`); pages that rely on auto-imported composables or components need explicit imports or stubs. Existing page tests: `glossary.test.ts`, `advanced/index.test.ts`, `security/change-password.test.ts` (pins back push to `/popup/settings/profile` at `:75`), `security/export/*.test.ts`. No tests for the hub, profile, security or appearance pages.

## Blast radius

| Item | Where | Suite | Change |
|---|---|---|---|
| `setting-nav-security` in the presence loop | `e2e/navigation.test.ts:17` | smoke | `lock` (and add `privacy`, `display`, `developer`, `about`) |
| About footer selector `a[href="#/popup/settings/about"]` | `e2e/navigation.test.ts:24` (presence check), `:71` (click), comments `:23`, `:69` | smoke | both sites select `setting-nav-about`: the href would still match the row's `<a>`, but e2e selects only by testid |
| Tab lap: first `setting-nav-profile` to the next, `setting-nav-*` stops equal DOM order | `e2e/navigation.test.ts:249-258` (`tabAround(page, 50)`) | smoke | holds if every `setting-nav-*` row is one stop in DOM order; about 33 presses per lap expected |
| Click under the shown bar lands on `setting-nav-networks` | `e2e/navigation.test.ts:168-205` | smoke | holds (row stays on the hub; the page gets longer) |
| `navigateToSettings(page, "appearance")` | `e2e/appearance.test.ts:9,29,82`, `rows.test.ts:607`, `network/incoming-arrival.test.ts:281`, `network/store-captures.test.ts:129` | smoke, network | `display` |
| `navigateToSettings(page, "appearance")` then `fiat-values-toggle` | `e2e/fiat-display.test.ts:35` | smoke | `privacy` |
| `navigateToSettings(page, "security")` then `setting-strict-security-mode` | `e2e/network/store-captures.test.ts:357-358` (opt-in) | network | `lock`; wrapper testid kept |
| `navigateToSettings(…, "advanced", "account-state", <x>)` | `e2e/network/authwit-lifecycle.test.ts:124`, `network/popup-escape-layered.test.ts:123,170`, `network/senders-advanced.test.ts:134` | network | new helper `openAccountState(page, x)` |
| `#/popup/settings/security` | `e2e/security.test.ts:87,103`, `sw-resilience.test.ts:154` (skipped test) | smoke | `#/popup/settings/lock` |
| `#/popup/settings/appearance` | `e2e/appearance.test.ts:62,91` (`:91` in a skipped test) | smoke | `#/popup/settings/display` |
| `#/popup/settings/advanced` | `e2e/rows.test.ts:409`, `fixtures/helpers.ts:2107` (`setAdvancedToggle`, used by `setDeveloperMode`/`setDebugMode`), `network/selfpay-phase.test.ts:259` | smoke, network | `#/popup/settings/developer` |
| Unchanged hashes | `security/export/**`, `security/change-password`, `security/reset`, `settings/profile`, `settings/about`, `advanced/account-state/**` | both | none |
| Kept testids | `backup-link-btn`, `change-password-link-btn` (both kept, Ask D), `delete-profile-link-btn` (no e2e reference to any of the three), `strict-security-toggle`, `auto-lock-input`, `theme-trigger`, `animations-toggle`, `fiat-values-toggle`, `dust-threshold-input`, `settings-toggle-*`, `settings-logs-row`, `identity-name-row`, `identity-id-row`, `reset-*`, `header-lock` | both | move with their controls |
| Header lock unit tests | `src/components/Header.test.ts:130-234` | unit | behavior tests move to the composable; chip pins stay |
| Developer page test | `src/popup/pages/settings/advanced/index.test.ts` | unit | `git mv` with the page; drop the `Dropdown` mock |
| Change-password back target | `src/popup/pages/settings/security/change-password.test.ts:75` | unit | `/popup/settings` |
| Passkey guard target | `src/popup/route-guard.ts:58`, `route-guard.test.ts:81` | unit | none |
| Lock e2e through the header | `lockWallet`/`lockThroughConfirmDialog` (`fixtures/helpers.ts:51,67`), about 55 callers in 19 files; `network/lock-cancels-dapp-send.test.ts:56-60` pins the confirm copy | both | none; header copy must stay byte-identical |

## CI lanes

A change under `apps/extension/**` triggers every PR lane: `quality-status` (`pr-quick.yml`: commitlint, lint + typecheck, unit tests, both builds, `test:ci-gating` with the plans gate), `extension-smoke-e2e-status` and `extension-smoke-e2e-firefox-status` (3 shards each), `extension-network-e2e-status` and `extension-network-e2e-firefox-status` (5 shards plus the heavy and canary lanes). All five are required on `dev`. `network/selfpay-phase.test.ts` runs in the proverless heavy lane. A new e2e file lands in a shard picked by a hash of its path. `packages/legal/**` is in the smoke and network path filters.

## Commands

- Lint and types: `bun run lint` (Biome, prints only the first 20 diagnostics, plus the complexity baseline), `bun run typecheck:all`.
- Unit: `bun run test` (all of `apps/extension` `src/**` and `scripts/**`); one file: `cd apps/extension && bun --bun vitest run <path>`. `bun run test:components` covers `src/components` only.
- Pre-PR gate: `bun run audit:vue` (typecheck, test and lint in parallel, then a plain `bun run build`, which leaves an unarmed `dist/chrome`).
- Smoke, Chrome: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 bun run build:chrome`, then `NULO_E2E_MIGRATION_FIXTURE=1 bun run test:e2e [files]`.
- Smoke, Firefox: the same flags with `bun run --cwd apps/extension build:firefox`, then `NULO_E2E_BROWSER=firefox NULO_E2E_MIGRATION_FIXTURE=1 bun run test:e2e [files]`. Needs `geckodriver` and the pinned Firefox.
- Network: `NULO_E2E_PROVERLESS=1 bun run e2e:agent <files>` (builds and boots its own sandbox; add `NULO_E2E_BROWSER=firefox` for Firefox).
- Hazards: smoke and network both `pkill` Chrome loaded from this worktree's dist, so never run them together here; never run a heavy suite beside `audit:vue`; rerun a timed test alone before calling it broken.

## Follow-ups that touch this work

- `follow-ups.md:141`: strict-mode opt-out restore has no e2e; the Security page's config reads hang after a worker restart. Stays open; its text must name the Lock page.
- `follow-ups.md:239`: the config-toggle bindings in `appearance.vue` and `advanced/index.vue` hold a write-before-persist bug; "dedupe each with its fix". Stays open; its paths move.
- `follow-ups.md:93`: Settings' title read twice by screen readers. Untouched; the hero stays.
