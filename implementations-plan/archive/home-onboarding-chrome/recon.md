# home-onboarding-chrome: recon

Base: `origin/dev` at `36c43155` (carries send-queue-activity arc 3b, #344). Three Explore agents (sonnet), read-only, plus the planner's own reads. Paths are repo-relative; `E/` is `apps/extension/`.

## Reuse map

| Capability needed | Existing code found | Verdict |
|---|---|---|
| Token-scoped rows (#130) | `RecentActivityView.vue` scopes per token in three places: journal by `op.tokenId === token.id` (`journalRecordOnThisView`, `:296-300`), incoming by `inc.tokenId === token.id` (`recent-activity-rows.ts:55-63`), txs by `tx.calls?.some(c => c.contract === token.contract)` (`:78-80`). History builds its rows with `buildActivityRows` (`E/src/utils/activity-rows.ts:49-65`). | adapt: one pure token predicate in `activity-rows.ts`, applied by History after `buildActivityRows` |
| Numeric id in a route query (#130) | `E/src/popup/pages/send.vue:629-631` (`Number(route.query.tokenId)`, checked against `tokens`); `settings/security/export/account.vue:75-90` (a query watcher) | reuse the pattern |
| A removable chip (#130) | `@nulo/design` `Badge` (`packages/design/src/ui/Badge.vue`): slot only, no close control. `RowAction` (24x24 glyph button with a required `label`). No removable chip, pill or filter anywhere (searched `chip|pill|removable|dismiss` in `E/src/popup`, `E/src/components/ui`, `packages/design/src`). | adapt: a `Badge` holding the symbol and a close button, in `activity.vue` (one caller; no new component) |
| Section header rule (#132) | `RecentActivityView.vue:858-861` `.section_header { padding-bottom: 8px; border-bottom: 1px solid var(--hairline-soft) }`, used at `:771` (feed header) and `:846` (token-page empty state). `TokensView.vue:440` has its own `.section_header` with `padding-bottom: 0` and no rule. | edit in place |
| Stored theme in onboarding (#133) | `ConfigServiceClient` (`E/src/wallet/services/config/client.ts`) already used in onboarding (`onboarding/pages/presto.vue:10,24`); `persistThemeHint`, `isPrefersDarkScheme` (`E/src/utils/general.ts:2-18`); popup's apply code `E/src/popup/app.vue:100-108` duplicates onboarding's `E/src/onboarding/app.vue:25-33`. | adapt: one shared apply function in `utils/general.ts`, used by both |
| Route move with redirects (#135) | `E/src/popup/legacy-routes.ts` (three exact-path records) and its test `legacy-routes.test.ts` (builds the real route tree from `PAGES_OPTIONS`). | reuse the record shape |
| Focus an open window instead of a duplicate (#149) | `E/src/wallet/utils/onboarding-tab.ts:39-67` (id in `chrome.storage.session`, `get` then focus, else create and store); `settings/developer/index.vue:33-58` (logs window: stored id, `windows.get` then `update`); `WindowManager.focus` (`E/src/wallet/services/window-manager/window-manager.ts:166-175`, `{ focused: true, drawAttention: true, state: "normal" }`, service-worker only). | adapt `onboarding-tab.ts`'s pattern inside `own-window.ts` |
| Firefox detection (#156) | `isFirefox()` (`E/src/utils/browser-surface.ts:2-4`, auto-imported) | reuse |
| Permission check and request (#156) | none: no `chrome.permissions` call anywhere (searched `permissions\.(contains\|request\|remove\|onAdded\|onRemoved)`, `browser\.permissions`, `chrome\.permissions` in `apps`, `packages`). | build new: one small composable |
| A warning with an action button (#156) | `Banner` (`packages/design/src/ui/Banner.vue`; `action: { name, callback, testId }`, rendered in `vertical` direction); prior art `send.vue:685`, `AsyncListStatus.vue:15`. Its action button has no `:focus-visible` rule, and `base.css:260-264` removes every button's outline; the design `Button` (`Button.vue:173-174`) and `RowAction` (`RowAction.vue:46-49`) carry the accent ring | reuse `Banner` for the text, the design `Button` for the action |
| Presto probe after a grant (#156) | `usePrestoCheck` (`E/src/composables/usePrestoCheck.ts:21-53`: `start`, `check`, `dispose`) | reuse |
| Store frame scroll (#170) | `clearAmountLine` (`E/tests/e2e/network/store-captures.test.ts:293-310`), `scrollToFit` (`:257-263`) | edit in place |
| Shared focus ring or announcer (#244) | none (searched `focus-ring`, `useAnnouncer`, `announce`, `--nulo-focus`); 68 `:focus-visible` lines in `E/src` and `packages/design/src` (about 63 rules in about 45 files); polite regions at `TransactionAwaitingCard.vue:80`, `TransactionTerminalCard.vue:57`, `FeeSettingsCard.vue:927`, `security/export/full.vue:579`, `windows/verify/index.vue:268`, plus `ToastManagerBase.vue:126` | no arc (see plan) |

## Per issue: what holds at `36c43155`

### #130 History opens unfiltered from a token page
- Holds. The link is at `RecentActivityView.vue:773` (`to="/popup/activity"`, testid `activity-view-all`), inside the non-empty branch that opens at `:759`. The issue's `:765` is stale.
- The page-13 build note says History filters "by tokenId (the same check `journalRecordInScope` uses for `props.token`)". That does not hold: `journalRecordInScope` (`activity-rows.ts:94-101`) checks account, profile and network only. The token check is `journalRecordOnThisView` (`RecentActivityView.vue:296-300`). Txs carry no `tokenId` (`E/src/wallet/services/transaction/spec.ts:39`, only `calls[].contract`); the token page matches them by contract.
- `token.id` is a number (a storage row id, `token/spec.ts:13`); the token page's URL is `/popup/tokens/${token.id}`. The symbol is `token.symbol`.
- `activity.vue` reads no route today, builds `activityRows` with `buildActivityRows` (`:111-121`), presents incoming rows to the arrivals service (`:128`) and renders `TransactionsList` or the empty state "No transactions yet" (`:192-207`). The hero is hand-built from `tab-hero.module.css` (`:179-188`), not `CollapsingHeroLayout`.
- `arrivals.present` (`E/src/composables/useArrivals.ts:411-418`) acts only on records the list judged while rendering, so presenting the filtered rows is the faithful reading of "shown".
- `activity.test.ts` mounts without a router (`:144,180,209,294,308,315`); `RecentActivityView.test.ts:562-588` asserts the link's `href` is `/popup/activity`.
- E2E: `E/tests/e2e/home-links.test.ts` (smoke) walks Home's and the token page's View history and asserts `waitForHash(page, "#/popup/activity")` (`:74`, `:88`); `waitForHash` is an exact match (`E/tests/e2e/fixtures/extension.ts:1353-1355`).

### #132 Home's section header
- Holds at `:858-861` (the issue's `:850-853` is stale). The class also draws the token page's feed header and its empty-state header (`:846`), so one CSS edit changes three places on two screens. History has no such header.

### #133 Onboarding ignores the stored theme
- Holds, and is worse than stated: `onboarding/app.vue:34` applies `"system"` at setup and `persistThemeHint("system")` overwrites the pre-paint hint `theme-boot.js` read (`E/public/theme-boot.js:11`). The popup never writes the hint before its config read (`popup/app.vue:355-374`).
- Onboarding already runs service clients (`onboarding/index.ts:28`, `presto.vue:24`). Settings → Display is auth-required, so a person cannot change the theme inside onboarding; the popup can be open beside it.
- After a reset, `chrome.storage` is cleared and the hint survives (`presto.vue:39-43`); the config read must win over the hint.
- `presto.vue:33` reads `html[theme]` once at setup for the banner.
- No unit test covers either app shell's theme code. E2E: `E/tests/e2e/appearance.test.ts` (`setTheme`, `fixtures/helpers.ts:1535-1550`); Firefox cannot emulate `prefers-color-scheme` (`E/tests/e2e/FIREFOX.md:53`), so a test sets an explicit light or dark.

### #135 Account State route
- Holds. Pages under `E/src/popup/pages/settings/advanced/account-state/` (`index.vue`, `notes/`, `authwits/`, `contracts/`, `senders/` with `senders/index.test.ts`); no `advanced/index.vue`. The Developer link is `developer/index.vue:194-198` (testid `setting-nav-advanced-account-state`); children link at `account-state/index.vue:18,27,36,45` and back-link at `authwits:137`, `notes:206`, `senders:99`, `contracts:63`.
- `legacy-routes.test.ts:74-78` pins the three records; `:107-114` pins that the five `advanced/account-state…` paths keep their own page (must be rewritten).
- Precedent: `settings/security/export/**` keeps its old prefix under the `security` → `lock` redirect.
- E2E: `openAccountState` (`E/tests/e2e/fixtures/helpers.ts:565-575`, comment says Account State keeps its `advanced/` URL and ids); hard-coded hashes in `network/senders-advanced.test.ts:41`, `network/backup-import-stalled-network.test.ts:48`, `network/receive-unregistered.test.ts:38`; callers `network/authwit-lifecycle.test.ts:124`, `network/popup-escape-layered.test.ts:123,170`, `network/senders-advanced.test.ts:143`; `settings-routes.test.ts:35` (smoke).

### #149 Duplicate own window on Firefox
- Holds. `moveToOwnWindow` (`E/src/utils/own-window.ts:50-68`) always calls `windows.create`; module state lives in the dying panel's document. Callers: `security/export/full.vue:500-503`, `import.vue:166-176`, both gated on `passkeyNeedsOwnWindow()` (Firefox toolbar panel only).
- The manifest has no `tabs` permission, so a page cannot read another window's tab URL to match it; a stored window id is the available key.
- Unit: `own-window.test.ts` stubs `windows.create/getCurrent` only. E2E: `E/tests/e2e/passkey-toolbar-panel.test.ts` (Firefox), `armPanelDeath`.

### #156 Firefox Presto permission
- Holds as an absence: nothing checks, requests or listens for permissions.
- `host_permissions` (`E/manifest/manifest.config.ts:24`) carries `https://127.0.0.1/*` and `http://127.0.0.1/*` in the shared manifest; the Firefox build spreads it (`manifest.firefox.config.ts:19-48`). Presto is `127.0.0.1:59833` (HTTP) and `:59834` (HTTPS) (`E/src/presto/config.ts:11-13`).
- MDN (`manifest.json/host_permissions`): from Firefox 127 the install prompt shows host permissions, but an update that adds host permissions does not show them; users can revoke them; an extension "can request them using `permissions.request`". MDN's `permissions/request` page names only `optional_permissions`. Whether Firefox 153 accepts a request for an origin listed only in `host_permissions` is unverified here.
- Presto's server answers every origin with CORS (`~/projects/presto` `packages/presto/core/src/server.rs:383-393`, `allow_origin(Any)`), so CORS is not what fails. Presto's `docs/PLATFORM_SUPPORT.md:76-78` says Firefox 153 enables Local Network Access by default and the SDK reports a denial as `permission-blocked`. The wallet's `strict_min_version` is 153.
- Existing copy for `permission-blocked` points at the address bar's site permissions (`E/src/utils/presto-ui-state.ts:91-106,190-191,223-224`), which an extension page does not have.
- Pages: onboarding `E/src/onboarding/pages/presto.vue` (status card `onboarding-presto-status`, retry `onboarding-presto-retry`); Settings → Proving `E/src/popup/pages/settings/proving.vue` (`settings-proving-status`, rows via `SettingItem`). `PrestoStatusCard` has one action (retry).
- `E/src/manifest.test.ts:78-82` pins the shared manifest's host permissions and that nothing is optional; the Firefox block is `:133-165`. Chain-endpoints arcs 2a and 2b edit `manifest.config.ts:52-60` (CSP) and `manifest.test.ts:122-124`; neither touches `host_permissions`, `permissions` or the Firefox config.
- E2E: `E/tests/e2e/onboarding-tab.test.ts:27-38` (`gotoPrestoStep`), `E/tests/e2e/fixtures/presto.ts:29-40` (`interceptHealth`, below TLS, blind to permissions), `E/tests/e2e/settings-proving.test.ts`. `FIREFOX_ONLY` (`fixtures/browser/index.ts:211-214`). `FIREFOX_LAUNCH_PREFS` "holds what users run with" (`fixtures/browser/firefox.ts:261-273`); test-only prefs ride a launch option (the egress guard's prefs). No helper accepts a browser permission prompt (FIREFOX.md `:36`, `:78`).

### #170 Store Send frame
- The `clearAmountLine` failure holds as described (`store-captures.test.ts:293-310`: `need` 35 px against `room` 18 px). The file is opt-in (`:385`, `STORE_CAPTURES`, Chrome only) and never runs in CI.
- A second red, recorded in the issue's comment (2026-10-10, at `6201f8b`): `fillPrivateSend` (`:187-190`) expects the strip's `you` cell `hidden` and the sandbox shows `unknown`. Nothing touched `publish-facts.ts` or that expectation since (`git log 6201f8b..HEAD`). `you` is `hidden` only for a protocol-derived fee contract (`E/src/components/composite/send/publish-facts.ts:79-92`); `isProtocol` is derived per chain from the deterministic FPC addresses (`E/src/wallet/services/fpc/service.ts:95-113`).
- Committed captures: `E/store/captures/{approve,history,home,security,send}.png`, one commit (`e1c75331`). `E/scripts/store-art.ts` frames them.

### #181 Security capture
- Verified: the `security` capture frames Settings → Lock (`store-captures.test.ts:354-358`; `legacy-routes.ts:8`). Struck by the owner; nothing is built.

### #154, #160
- Owner Mac checks (`window-manager.ts:167-171`; `E/src/utils/files.ts:29,98`, `FIREFOX.md:42`). Not built.

### #242, #244
- #242 is already decision record P9-05 (page 9, lane send-queue-activity), unsigned; its surfaces are Send's and the design package's, none of this lane's files.
- #244's trigger (a ring change, or a new announcer some work needs) is not met by this lane: its two new controls are existing primitives that already carry the accent ring (`RowAction`, the design `Button`), and it adds no announcer. Adding a ring to `Banner`'s own action would be a ring change, and is not made.

## Collision and reservation notes

- `RecentActivityView.vue` (R5): send-queue-activity arcs 1b, 2, 4, 5 may still edit it (their plan, `implementations-plan/send-queue-activity/plan.md:239`). This lane's arc 1 edits only `:79`, `:773` and `:858-861` there.
- `manifest.config.ts` (R5, #101 before #156): arc 2 does not edit it (see plan § R5).
- `store-captures.test.ts`: e2e-harness-gaps is merged; no other lane holds it.
- Open issues read: `gh issue list --state open --limit 200` (2026-10-13); no other open issue owns these surfaces.
