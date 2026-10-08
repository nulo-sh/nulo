---
plan: settings-by-task
tier: mid
driver: claude-code
eli5_mode: artifact
code_review: off
claude_model: opus
codex_model: sol
codex_model_slug: gpt-6.1-sol
codex_effort: high
explainer: off
budget: "recon 2 agents; code-review off; codex high"
status: approved
trunk: dev
base: 50540c8
---

# Settings by task

Regroup the Settings hub by what a person came to do, as the owner approved on 2026-10-08: a profile card on top, then Your wallet, Apps and networks, Safety, Preferences, Help and a fenced Danger zone. Two new pages (Lock, Privacy), two renamed pages (Display, Developer), a slimmer Your profile page, a Lock now row that runs the header's lock, and trailing values that show the current state on the hub. Old URLs redirect.

Recon: [recon.md](recon.md). Execution: the owner asked that implementation be orchestrated through subagents. The lead session delegates every code edit to a subagent, reviews each diff, runs the gates and owns commits.

## Outcome & Quality Bar

**For whom.** A wallet owner in the 360x600 popup who opens Settings to do one thing: lock now, back up, change the theme, stop price lookups, find the logs, delete a profile. Second reader: the maintainer who inherits the pages and the e2e suite.

**What excellent looks like.**

1. Each task is one tap from the hub, in the group named for it. The hub shows the current auto-lock time, prices on or off, the theme and Developer Mode without opening a page, and never shows a guessed value: a value appears only after the real one is read, a later change is never overwritten by an older read, and the values are read again when the wallet's background reconnects.
2. Lock now on the Lock page is the header's lock, not a copy: the same 3-second read budget that locks without asking, the same running-transactions confirm, the same abandonment on a session change. It shows even when the page's config reads hang. A lock the person asked for still happens if they leave the page while the read runs, unless running transactions would need the confirm: leaving the page then abandons that decision, and nothing locks.
3. Nothing a person or a test relied on breaks: every old Settings URL lands on its new page behind the same auth guard, every kept testid selects the same control, and Tab visits the hub's rows once each, in the order they appear.
4. A passkey profile sees no control that does nothing for it: no Change password row, no strict mode.

**What good enough looks like.** Page internals move as they are: the known config-toggle bug is preserved and pinned, not fixed. The header's handling of a failed lock request is kept as it is. No settings search, no folding, no new design token. Review uses screenshots, not a visual-regression suite.

## UI impact

Board: "Recommended Settings (approved with changes)", v2. Owner sign-off, 2026-10-08, verbatim:

```
Settings by task: Approve with changes; notes: - Keep the word "Profile"? => Yeah, let's call it Your profile
- Let's just hide change password if it's a passkey profile please.
- For now, let's not add the switch profile stuff.
- Gate Account state: Don't gate it.
- Yes, add lock now.
- Don't fold anything yet (16 rows question)
- I think those on Dispaly / lists make sense
- Strict mode hidden for passkey: sounds good.
```

Owner answers to the draft's Asks 1 to 3, 2026-10-08, verbatim:

```
1. I'd say it's "Never". (2) normal color. (3) yes, don't change the effective date... Or put it under BEFORE_RELEASE of things that need updating.
```

How they resolve: Ask 1, an auto-lock of 0 shows "Never". Ask 2, the Danger zone label keeps the normal group color; the red fence and the red icon carry the danger. Ask 3, no legal edit in this PR: `legal/README.md:27,114` require every change to bump the version and set the effective date to the publication day, so a patch that keeps the date is not allowed. The owner's fallback applies: an entry in `BEFORE-LAUNCH.md` (P3 step 14).

Owner verdict at the approval gate, 2026-10-08, verbatim:

```
A: I'd like to change from minutes to hours, if it's not too complex or risky. I wonder if we already have that code in this repo. B: whateer you think it's best. C: Correct. D: Yes. Approve.
```

The owner delegated B to the lead, who chose the shared two-letter rule ("PR" for "Primary"): one avatar rule across the Header, contacts and the card, no extra code path, and two letters tell profiles apart better than one. How each answer applies: Asks A to D below.

| Surface | Before | After |
|---|---|---|
| Settings hub `/popup/settings` | 12 rows in Identity, Connections, Security, App; "About Nulo" footer link | Profile card (two-letter avatar from the shared rule, "PR" for "Primary" (Ask B), name, "Password profile"/"Passkey profile", chevron); Your wallet (Accounts, Contacts, Tokens); Apps and networks (Connected Apps, Networks, Fee Payments, Proving); Safety (Lock "Auto-lock, strict mode" or "Auto-lock" + a value such as "30 min", "1 h 30 min" or "24 h" (Ask A), or "Never" when auto-lock is off; Back up profile "Keep a copy of this profile"; Change password, password profiles only, no description line); Preferences (Privacy "Prices, explorer" + "Prices on/off"; Display "Theme, layout" + "System/Dark/Light"; Developer "Mode, logs, account state" + "On/Off"); Help (Glossary; About Nulo "Version, contact, legal"); Danger zone, red fence, label in the normal group color (Delete profile, red icon, no description line). 16 rows, 15 for passkey. |
| Profile page | Title "Profile"; Identity (Name, ID); Security (Backup profile, Change password greyed for passkey); Delete profile | Title "Your profile"; Identity (Name, ID, Type "Password"/"Passkey"); nothing else |
| Security page `/settings/security` | Title "Security"; strict mode (all profiles); Auto-lock Timeout; Backup profile row | Lock page `/settings/lock`, title "Lock": Lock now row ("Locks Nulo until you unlock it again", no chevron); strict mode (password profiles only); Auto-lock Timeout |
| Appearance `/settings/appearance` | Title "Appearance"; "Dark Theme"; toggles incl. Show fiat values; "Open popups to to the full height" | Display `/settings/display`, title "Display": "Theme"; same toggles minus fiat; typo fixed; "Lists" label above Show incoming transfers and Hide dust |
| Privacy `/settings/privacy` | (none) | Show fiat values (from Appearance), Block Explorer (from Advanced); copy unchanged |
| Advanced `/settings/advanced` | Title "Advanced Settings"; Block Explorer present | Developer `/settings/developer`, title "Developer"; Block Explorer gone; Account State visible regardless of Developer Mode |
| Backup, Change password, Delete profile, Account State | Back arrow on a cold open: Security, Your profile, Your profile, Advanced | Content unchanged. Cold-open back arrow: Settings, Settings (Ask C), Settings (Ask C), Developer |
| Header | Lock chip | Unchanged copy and behavior |

Icons follow the board's Material names: Lock and Lock now `lock`, Back up `download`, Change password `password`, Privacy `visibility`, Display `palette`, Developer `bolt`, About `info`, Delete profile `delete` in red. Existing rows keep theirs.

Non-visual deviations from the board, recorded here:

- One element carries one testid. The board's testid table lists a new `setting-nav-change-password` and also says `change-password-link-btn` moves to the hub, so both cannot hold. The owner chose at the approval gate (Ask D): the Change password row keeps `change-password-link-btn` and the Back up row keeps `backup-link-btn`, the ids they have today. `setting-nav-change-password` and `setting-nav-backup` are not added (audit findings C8 and S7).
- Each trailing value renders in an element with `data-testid="setting-value"` inside its row. Nothing about it is visible.
- Account State's cold-open back arrow targets `/popup/settings/developer`. The old target would redirect there, so the person sees the same page either way (finding C9, rejected).

Items not on the board were the draft's Asks 1 to 5. Asks 1 to 3 are answered above. Asks A, B, C and D were answered at the approval gate (verdict above, answers under Asks).

## Scope

**In:** the hub, the five pages above, three legacy redirects, the shared lock composable, `SettingItem`'s value prop, `ItemsContainer`'s danger fence, back targets, unit and e2e updates, docs and comments that name the old pages, follow-up re-points, one `BEFORE-LAUNCH.md` entry for the privacy wording.

**Out:** the privacy policy text itself (the `BEFORE-LAUNCH.md` entry schedules it); fixing the config-toggle bug (`follow-ups.md:239`); the strict-mode e2e skip (`follow-ups.md:141`); any visible retry when the worker refuses a lock (Inference 8); profile switching from Settings; settings search; folding; the `.ts`-files-become-routes quirk (recon); moving `advanced/account-state/**` to a new URL.

## Architecture & Implementation

### Proposed architecture

The change stays inside `apps/extension` plus docs. It reuses the existing row and group components and adds two small props, one composable and one pure label module.

- **Lock (C1 composable).** `src/composables/useLockWallet.ts` holds Header's lock logic verbatim: the 3-second read race, the session-change counter, the confirm copy. It receives the profile client from its caller and both callers pass `managers.profile`, the popup's long-lived client, never the Lock page's own `profileService`. A page client is disconnected on unmount, and `ServiceClient.disconnect()` rejects pending requests and fires `onDisconnected` at once (`packages/extension-messaging/src/background/client.ts:80-92`), which would abandon the lock the person asked for. Each caller creates one instance and calls `dispose()` in `onBeforeUnmount`. No module singleton, so each instance closes only its own confirm. Both SFCs import it explicitly from `@/composables/useLockWallet`, so a unit test of either drives the real composable, not a global stub.
- **Rows.** `SettingItem` gains `value`: an element with `data-testid="setting-value"`, rendered before the default chevron. `.icon_wrapper` stays a fixed 20x20 box by default. Only a row that fills `#icon` gets minimum sizes (`min-width`/`min-height: 20px`), so the card's 40px avatar fits and no other row changes.
- **Danger fence.** `ItemsContainer` gains `danger` (boolean): its border becomes `color-mix(in srgb, var(--red) 55%, var(--nulo-border))`, the board's value. The label keeps the normal group color (Ask 2). The red icon goes through `SettingItem`'s `#icon` slot (`<MaterialIcon name="delete" :size="20" color="red" />`), because `iconFillColor` never reaches a material icon. The hub boxes that icon at 20x20 with `overflow: hidden`, so its ligature text cannot widen the row while the icon font loads (Inference 4).
- **Profile card.** No new component: a `SettingItem size="large"` link to `/popup/settings/profile` inside a title-less `ItemsContainer`, with `<AccountAvatar :size="40" data-testid="profile-card-avatar">` in `#icon`. The fallthrough testid replaces the avatar's static `account-avatar`. It inherits link mode, the focus ring, Space activation, and `setting-nav-profile` passes through to the `<a>`. The card passes `profile.name` to `AccountAvatar` unchanged, so the avatar shows the shared two-letter initials, "PR" for "Primary" (Ask B), and needs no new prop.
- **Labels.** `src/utils/settings-labels.ts` maps raw config and profile type to the hub's strings. It lives in `src/utils/`, never under `src/popup/pages/`, where any `.ts` file becomes a route.
- **Hub values.** The hub's existing `ConfigServiceClient` subscribes `onUpdate` and `onConnected` in setup, and the hub starts its first `getProps()` in `onBeforeMount` without awaiting it, beside `startPresto()`, so a hanging config read cannot hold the Proving row's `getLastProveOutcome`. A `reactive` record holds the four raw values; a `computed` passes them through the label module. Each read is fenced: a key that received `onUpdate` after that read started keeps that value when the read answers. The hub reads again on every `onConnected` after the first, because a reconnect keeps the hub mounted (`app.vue:296-304`), and nothing replays the updates sent while the port was down. A generation number drops any answer from a read that a newer read has replaced.
- **Routes.** `git mv` keeps history: `settings/security/index.vue` → `settings/lock.vue`, `settings/appearance.vue` → `settings/display.vue`, `settings/advanced/index.vue` (+ `index.test.ts`) → `settings/developer/index.vue` (+ `index.test.ts`). New `settings/privacy.vue` with the `isAuthRequired` route block. `src/popup/legacy-routes.ts` exports three redirect records; `src/popup/index.ts` pushes them beside the `"/"` redirect.

### Key interfaces

```ts
// src/composables/useLockWallet.ts
export type LockProfileClient = Pick<
	ProfileServiceClient,
	"getSessionHandle" | "lockActiveProfile" | "onActiveProfileChanged" | "onDisconnected"
>
/** Pass `managers.profile`. A page's own client rejects its pending read on unmount. */
export function useLockWallet(profile: LockProfileClient): {
	/** Locks now, or asks first while approved sends run; same contract as the header chip. */
	lock: () => Promise<void>
	/** Idempotent; see the dispose contract below. */
	dispose: () => void
}

// src/utils/settings-labels.ts
export type HubConfig = Partial<Record<"sessionTtl" | "showFiatValues" | "theme" | "developerMode", unknown>>
export type HubValues = Partial<Record<"lock" | "privacy" | "display" | "developer", string>>
export function hubValues(config: HubConfig): HubValues
export function profileTypeLabel(type: ProfileType | undefined): "Password" | "Passkey" | undefined

// src/popup/legacy-routes.ts
export const LEGACY_SETTINGS_REDIRECTS: readonly RouteRecordRaw[] // security→lock, appearance→display, advanced→developer
```

`SettingItem`: `value?: string`, rendered as `<span data-testid="setting-value">` (or equivalent) only when set. `ItemsContainer`: `danger?: boolean`. Both are extension-local (`src/components/ui/Settings/`), not published.

**The `dispose()` contract.**

1. A second call does nothing.
2. It removes both listeners (`onActiveProfileChanged`, `onDisconnected`) from the client at once when no lock decision is pending. A counter tracks pending decisions: `lock()` raises it once it starts a read, and the decision's own `finally` lowers it after the decision resumes and finishes. When `dispose()` found a decision pending, the `finally` that brings the counter to zero removes the listeners. So a session change at any moment before that still abandons every pending decision, including one that arrives between the read's settle and the decision's resume, and a stale handle never marks the popup locked.
3. It closes the confirm only when `cacheStore.confirm.callback` is still this instance's own callback. A confirm that another instance or page opened stays open.
4. A decision pending at `dispose()` keeps running. When its read settles with no confirm needed, it locks (`appStore.isLogined = false`, `lockActiveProfile(handle)`): the person asked to lock, so the composable fails toward locked. When a confirm would be needed, it abandons and no confirm opens: once the decision finishes, its listeners go, and nothing would close that confirm on a session change.
5. The read timer is cleared by the read's own settle (answer, failure or the 3-second expiry), as in `Header.vue:34-44`; the listeners wait for the decision, not the read. `dispose()` does not clear the timer: a read that never answers would then never settle, and the requested lock would never happen. No timer outlives the 3-second budget.
6. A `lock()` call after `dispose()` returns without reading.

Label rules: `sessionTtl` 0 → "Never" (owner, Ask 1). A positive finite number whose minutes `m = ms / 1_000 / 60` (the Lock field's own expression) are whole (owner, Ask A): `m < 60` → `${m} min`; `m % 60 === 0` → `${m / 60} h`; otherwise `${Math.floor(m / 60)} h ${m % 60} min`. So "30 min", "1 h", "1 h 30 min", and "24 h" at the field's maximum of 1440. A positive finite number with a fractional minute, which only storage written outside the app can hold (Fact 20), → `${ms / 1_000 / 60} min`, the Lock page's own expression for its minutes field (`security/index.vue:68,133`), with no rounding, so the hub and the field still agree. The Lock page's minutes field does not change. `showFiatValues` true → "Prices on", false → "Prices off"; `theme` `system|dark|light` → "System"/"Dark"/"Light" (the theme dropdown's own labels); `developerMode` true → "On", false → "Off". Anything else, including not yet read, → no value.

### Data & control flow

- **Hub values.** Setup → `configService.onUpdate.add(onHubUpdate)` and `configService.onConnected.add(onHubConnected)`. Mount → `readHubConfig()`: it takes a new generation number and a fresh fence, then starts `getProps()`, not awaited → when it answers, it returns if a newer read has started since; otherwise each of the four keys not in its fence is copied into `hubConfig` → `hubValues(hubConfig)` → each row's `value`. `onUpdate` copies its key and adds it to the current read's fence. A rejected read leaves the record as it is, so no guessed value renders. `onConnected` fires once when the hub's first request opens the port, and again on every automatic reconnect (`packages/extension-messaging/src/background/client.ts:77,94-97`); the handler ignores the first and calls `readHubConfig()` on each later one. After a worker restart that read returns the config the worker loaded from storage (`wallet/config/store.ts:24`). The hub's `disconnect()` on unmount never reconnects, so the handler needs no removal. `getLastProveOutcome()` runs independently, so the Proving row never waits on config.
- **Lock now.** Click `lock-now-btn` → `lock()` → if not logged in, return → race `[getSessionHandle(), appStore.refreshInFlight()]` against 3 s → if the session changed during the read, abandon → count `appStore.approvedSendsInFlight` (0 when the read did not answer) → 0: `appStore.isLogined = false` and `lockActiveProfile(handle)`; more: fill `cacheStore.confirm` with the header's copy and `popupStore.open("confirm")`. The composable discards `lockActiveProfile`'s promise, as `Header.vue:25-29` does today. `isLogined = false` makes `watchLockStart` bump the scope epoch and close the toast (`locked-state.ts:62`, `scope-epoch.ts:22-25`); nothing there routes. The route to `/popup/auth` comes only from the worker's lock event: `onActiveProfileChanged(undefined)` → `lockedState.onLockEvent` (`app.vue:200-224`). The Lock now row renders outside the page's `isLoading` gate.
- **Legacy URL.** `#/popup/settings/security` → vue-router's `pushWithRedirect` applies the redirect record before it runs any guard (vue-router 5.2.0, `handleRedirectRecord`) → `beforeEach` sees `/popup/settings/lock` and its `isAuthRequired` meta. The redirect keeps the query and hash, and its target is fixed.

### File-level change map

| File | Change |
|---|---|
| `src/composables/useLockWallet.ts` (+ `.test.ts`) | new: Header's lock logic verbatim plus the dispose contract; tests take over Header's behavior cases |
| `src/components/Header.vue` | explicit `import { useLockWallet } from "@/composables/useLockWallet"`; `useLockWallet(managers.profile)`; `dispose()` in `onBeforeUnmount`; `header-lock`, `aria-label`, copy unchanged |
| `src/components/Header.test.ts` | keep the chip pin and one click-locks wiring pin; move the rest |
| `src/components/ui/Settings/SettingItem.vue` | `value` prop with `data-testid="setting-value"`; `.icon_wrapper` fixed 20x20, minimum sizes only when `#icon` is filled |
| `src/components/ui/Settings/ItemsContainer.vue` | `danger` prop |
| `src/components/ui/Settings/Settings.test.ts`, `Settings.stories.ts` | cases and stories for `value`, `danger` and the icon box |
| `src/utils/settings-labels.ts` (+ `.test.ts`) | new pure labels |
| `src/popup/legacy-routes.ts` | new redirect list |
| `apps/extension/scripts/legacy-routes.test.ts` | new: route inventory, `isAuthRequired` meta, the real `createPopupGuard` over the combined routes, the query case |
| `src/popup/index.ts` | `routes.push(...LEGACY_SETTINGS_REDIRECTS)` beside the `"/"` record |
| `src/popup/pages/settings/index.vue` (+ new `index.test.ts`) | hub per spec; fenced, generation-checked config reads, repeated on each reconnect; footer link and `.footer_link` CSS removed |
| `src/popup/pages/settings/security/index.vue` → `lock.vue` (+ new `lock.test.ts`) | `git mv`; title "Lock"; Lock now row outside the load gate, `useLockWallet(managers.profile)` imported explicitly, `dispose()` on unmount; strict mode `v-if` not passkey; Backup row removed |
| `src/popup/pages/settings/appearance.vue` → `display.vue` | `git mv`; title "Display"; "Theme"; typo; fiat toggle removed; `incomingTransfersVisible` out of the toggle loop; `SectionLabel label="Lists"` above it and Hide dust |
| `src/popup/pages/settings/privacy.vue` (+ `privacy.test.ts`) | new: `isAuthRequired` route block; fiat toggle and Block Explorer, binding copied verbatim; testids `explorer-trigger`, `explorer-<id>-btn`, `explorer-none-btn` |
| `src/popup/pages/settings/advanced/index.vue` → `developer/index.vue`, `index.test.ts` → `developer/index.test.ts` | `git mv`; title "Developer"; Block Explorer removed; Account State link testid `setting-nav-advanced-account-state`; test drops its `Dropdown` mock |
| `src/popup/pages/settings/profile/index.vue` | title "Your profile"; Type row `identity-type-row`; Security and Delete groups removed |
| `security/export/index.vue`, `security/change-password.vue`, `security/reset.vue` | `backTo` `/popup/settings` |
| `security/change-password.test.ts` | expect `/popup/settings` |
| `advanced/account-state/index.vue` | `backTo` `/popup/settings/developer` |
| `src/popup/locked-state.ts` | comment: a lock control, not only the header, marks the popup locked |
| `e2e/fixtures/helpers.ts` | `setAdvancedToggle` hash → developer; new `openAccountState(page, section)`; comments at `:851`, `:888`, `:2094` name Developer |
| `e2e/navigation.test.ts` | presence loop on new ids; the About row selected only by `setting-nav-about`, at both `a[href="#/popup/settings/about"]` sites (`:24` presence check, `:71` click) and their two comments (`:23`, `:69`); Tab-lap id set adds `delete-profile-link-btn`, `backup-link-btn` and `change-password-link-btn` (Ask D) |
| `e2e/appearance.test.ts`, `fiat-display.test.ts`, `rows.test.ts`, `security.test.ts`, `sw-resilience.test.ts`, `passkey-backup.test.ts` (comment) | new paths and ids; the `/privacy` comments at `security.test.ts:98-101` and `appearance.test.ts:86-88` lose their "has no page" clause; the test title at `rows.test.ts:403` names Developer; `sw-resilience.test.ts:114,128,148` name the Lock page |
| `e2e/network/{authwit-lifecycle,popup-escape-layered,senders-advanced,selfpay-phase,incoming-arrival,store-captures}.test.ts` | new paths, `openAccountState` |
| `e2e/settings-routes.test.ts` | new: legacy URLs land on new pages; hub values read real config through `setting-value` |
| `e2e/wallet-lock.test.ts` | new test: Lock now locks, then close, reopen, unlock |
| `CLAUDE.md`, `SECURITY.md`, `ARCHITECTURE.md`, `.claude/skills/e2e-testing/SKILL.md`, `.claude/skills/chrome-extension-debug/SKILL.md`, `e2e/PRF-NON-PORTABLE.md`, `e2e/FIREFOX.md` | page names and paths |
| `src/wallet/config/config.ts:24`, `src/popup/pages/settings/contacts/index.vue:126`, `src/popup/components/modules/settings/contacts/useContactImportExport.ts:196`, `src/wallet/services/note/service.test.ts:4` | comments name the new pages |
| `BEFORE-LAUNCH.md` | § 4: an entry due at the release that carries the Privacy page (P3 step 14) |
| `implementations-plan/follow-ups.md` | re-point lines 141 and 239 to the new files |
| `implementations-plan/.gitignore` | the uncommitted `narration.mp3`/`narration.mp4` lines, as their own `chore(plans)` commit |

### Algorithms / non-obvious mechanics

- **Exactly one record per path, behind the same guard.** `scripts/legacy-routes.test.ts` builds the page route tree the way `scripts/pages-options.test.ts` does (`PageContext` with `PAGES_OPTIONS`, then the vue resolver's `getComputedRoutes`). Those records carry each page's `<route>` meta: `addPage` runs the resolver's `hmr.added`, which reads the route block. The test flattens the tree and asserts: no generated path equals a legacy `path`; each legacy `redirect` equals a generated path; `isAuthRequired` is true on lock, privacy, display, developer and profile. It then builds a memory-history router from the generated records (components stubbed) plus `LEGACY_SETTINGS_REDIRECTS`, installs the real `createPopupGuard` with a stub store and profile API, and asserts: locked, each legacy URL ends on `popup-auth`; a passkey profile's deep link to change-password ends on `/popup/settings/profile`; the export and account-state children resolve to their own records; `/popup/settings/security?redirect=https://example.org` ends on `/popup/settings/lock`. `security/reset.vue` is `isAuthRequired: false` on purpose (reachable while locked), so the test does not assert it.
- **Read fence and generation.** Each `readHubConfig()` raises a counter and creates an empty set as the current fence. `onHubUpdate` writes its key and adds it to the current fence. An answer whose generation is no longer the counter is dropped whole; the current read's answer skips every key in its own fence. The fence is fresh per read because a read that starts after an update returns state newer than that update. So no answer, early or late, writes over a value the hub received after that read started.
- **Why `developer/index.vue`.** `git mv` of the page and its colocated test keeps `import ... from "./index.vue"` valid. A file `advanced.vue` beside `advanced/` would become a nested-route parent; nothing named that is created.
- **Tab lap.** `navigation.test.ts` walks 50 Tab presses and compares the hub's stops with DOM order. The id set is every `setting-nav-*` plus the three hub rows whose ids sit outside that prefix: `delete-profile-link-btn`, `backup-link-btn` and `change-password-link-btn` (Ask D). One `querySelectorAll` over that selector list gives DOM order. Header (5 stops), card, 16 rows, bottom nav (4) and the wrap give about 33 presses per lap. If a lap does not fit, raise the press count, never reorder rows. The passkey order is proven by the hub component test.
- **Account State in e2e.** `navigateToSettings(page, "developer", "account-state", x)` cannot work: its third step builds `setting-nav-developer-account-state-<x>`, and account-state keeps its URL and its `setting-nav-advanced-account-state-*` ids. The link gets `setting-nav-advanced-account-state` (the route-segment convention), and `openAccountState(page, x)` clicks Developer, that link, then the child row.
- **Redirects in e2e.** `navigateByHash` waits for the hash it set. On a redirect it can pass on the old hash before the router replaces it, or time out after. The redirect spec sets `location.hash` itself, then calls `waitForHash` (`fixtures/extension.ts:1273`) with the new hash.
- **Config-toggle bug, preserved.** ConfigStore emits `onUpdate` before it persists (`appearance.vue:97-99`, `wallet/config/store.ts:64-66`). On a failed write the page's model already holds the attempted value, so a retry hits `model.value === value` and returns without writing. The split copies this verbatim into Display, Privacy and Developer; `privacy.test.ts` pins it with a `(BUG PIN)` test. The hub shares the root cause (Inference 6).

### Trade-offs & alternatives not taken

- **Config-toggle binding: split verbatim (chosen) vs one shared composable.** `follow-ups.md:239` records the deferral as "dedupe each with its fix". A composable without the fix would move the bug and still need a per-key effects hook (side panel close, developer cascade, explorer toast) that calls back into `updateSetting`. Splitting makes three copies; the follow-up is re-pointed to all three, which raises its weight for the plan that fixes it.
- **Redirects: route records in `index.ts` (chosen) vs `<route>` blocks in stub pages vs `router.replace` in a mounted page.** Records have an in-repo precedent and no extra component. Stub pages would keep `security/index.vue` and `advanced/index.vue` alive as files and are unproven here. A mounted redirect flashes and adds history.
- **Hub as an explicit template (chosen) vs a data array.** Biome's line and complexity budgets read script functions, not templates. The explicit template matches every other settings page and keeps each row's testid greppable. A data-driven hub is plan-alt's approach.
- **Profile card as a `SettingItem` (chosen) vs a new component.** The row already owns link semantics, focus, Space and hover; a scoped CSS relaxation is cheaper than a second implementation of them.
- **Danger label: `ItemsContainer title` (chosen) vs `SectionLabel`.** The hub's other groups use `ItemsContainer`'s 10px label; `SectionLabel` is 12px and would read as a different level.
- **Pending read on dispose: let it finish (chosen) vs cancel it.** Cancelling (codex C2's "invalidate pending work") drops a lock the person asked for when they leave the page during the read (F1). Letting it finish locks when no confirm is needed, and abandons when one would be, since no listener would guard that confirm once the decision ends.
- **Listener lifetime after dispose: until every pending decision finishes (chosen) vs until the read settles vs at once.** Removing them at once lets a session change during the read go unseen. Removing them when the read settles leaves the gap before the decision resumes, and with two overlapping `lock()` calls it leaves the second decision unguarded for up to 3 s (S5). A pending-decision counter closes both gaps.
- **Single PR (chosen) vs two arcs.** An infrastructure-only arc would ship an unused prop, an unused composable caller and redirects to pages that do not exist yet. It is not independently meaningful.

## Security & Adversarial Considerations

- **Threat model.** The popup is an extension page. A web page cannot frame it: `src/manifest.test.ts:45` pins `web_accessible_resources` to undefined. A dApp reaches the wallet only through the wallet-sdk RPC surface, which this change does not touch. The relevant actors are a person at an unlocked browser, and a regression that weakens the lock or a guard.
- **Lock integrity.** Lock now must not be weaker than the chip. One composable runs both, on the same long-lived client (`managers.profile`), so the fail-closed rules hold for both: a read that does not answer in 3 s locks without asking; a session change abandons the decision; the worker closes only the session handle the decision named (`wallet/services/profile/service.ts:903-904`). The Lock page's unmount cannot cancel a lock in flight that needs no confirm, keeps the session listeners until every pending decision finishes, and closes only its own confirm. The row renders outside the config load gate, because `follow-ups.md:141` shows those reads can hang after a worker restart.
- **Lock completion (inherited, unchanged).** Marking the popup locked does not route it: only the worker's lock event does (`app.vue:200-224`). The header discards `lockActiveProfile`'s promise (`Header.vue:25-29`), and the composable keeps that. When the session record cannot be deleted, the worker rejects the request (`service.ts:913-916`); Inference 8 states what the person then sees. A composable test pins the rejection path. A visible failure or retry would be a new UI Ask.
- **Terms sheet.** The sheet is `position: fixed; inset: 0` (`LegalAcceptanceSheet.vue:129-131`) over every auth-required page, so it covers the Lock page and the header chip alike until "Not now", which navigates to `/popup/legal/declined`. After that every page is reachable. `tests/e2e/legal-acceptance.test.ts:287` (S8) proves the header lock still locks after "Not now"; Lock now shares its code path. Lock is never behind `legal.assertCurrent()`. Behavior unchanged; no new test.
- **Redirects.** Three static records with fixed targets, so no open redirect. vue-router carries the query and hash through a redirect record and clears params for a path target (5.2.0, `handleRedirectRecord`); a forwarded query cannot change the destination, and `scripts/legacy-routes.test.ts` asserts that with `?redirect=https://example.org`. The redirect resolves before the guard, so the target's `isAuthRequired` applies; the same test drives the real `createPopupGuard` to prove it.
- **Hidden controls.** Change password stays blocked for passkey on deep links by `route-guard.ts:58`, proven over the generated route. Strict mode is global config; hiding it on a passkey profile removes a control that has no effect there and stops a passkey session from lowering protection for password profiles on the same device.
- **Destructive path.** Delete profile moves one tap closer. The reset page is unchanged and stays the guard: three checkboxes and the exact profile name (`security/reset.vue`).
- **Input and output.** The profile name renders through text interpolation; no `v-html`. No new log line; config values never reach a log.
- **Legal accuracy.** `legal/privacy.md:145` (§ 5.3) tells users the explorer is disabled "in Settings → Advanced". After the move that statement is false. The `BEFORE-LAUNCH.md` entry makes its fix due at the release that carries the Privacy page, with a new version and a publication-day date, as `legal/README.md:27,114` require.
- **Supply chain, crypto, CI privilege.** No new dependency, no lockfile change, no cryptography, no workflow or token change.

## Assumptions

### Facts

1. The hub is a hand-written template with 12 rows and a footer link: `src/popup/pages/settings/index.vue:78-189`.
2. `iconBgColor` is declared and never read; `iconFillColor` reaches only the custom `Icon`; material icons are fixed to secondary: `SettingItem.vue:20-23,109-122,230-237`.
3. `.icon_wrapper` is a fixed 20x20 box: `SettingItem.vue:220-228`. The only `SettingItem` `#icon` caller passes a 20px avatar: `accounts/index.vue:192-194`.
4. Header's lock logic is inline at `Header.vue:25-76`; listeners at `:54-55` and `:259-260`; testid `header-lock` at `:324`.
5. The confirm copy is pinned by `e2e/network/lock-cancels-dapp-send.test.ts:56-60` and `Header.test.ts:153-178`.
6. `navigateByHash` waits for the exact hash it set: `e2e/fixtures/helpers.ts:1586-1600`. `waitForHash` waits for a given hash: `e2e/fixtures/extension.ts:1273`.
7. `navigateToSettings` builds `setting-nav-<segments>` and falls back to `#/popup/settings/<segments>`: `helpers.ts:524-580`.
8. The vue resolver routes `.vue`, `.ts` and `.js` files: `vite-plugin-pages` 0.33.3 `resolveExtensions()`; a route dump lists `/popup/send-amount` and thirteen `windows/*` helpers.
9. The generated paths today include `/popup/settings/security`, `/appearance`, `/advanced` and `/advanced/account-state/*` (route dump).
10. The only in-repo redirect is `routes.push({ path: "/", redirect: "/popup" })`: `src/popup/index.ts:28-31`.
11. `follow-ups.md:239` defers the toggle-binding dedupe with the words "dedupe each with its fix".
12. `--red` text measures 3.56:1 on `--app-bg` and 3.88:1 on `--nulo-surface` in light; 5.13:1 and 4.79:1 in dark (`packages/design/src/theme-contrast.ts`).
13. `legal/privacy.md:145` (Privacy Policy 1.1.1, § 5.3) names "Settings → Advanced" for the explorer. It is the only old page name in `legal/`. Its version history is at `legal/privacy.md:410-416`.
14. `getInitials("Primary")` is "PR" and a one-letter name stays one letter: `src/utils/string.ts:22-27`. The Header avatar shows the account's name: `Header.vue:280`.
15. `lessons.md` is 7 745 bytes of its 8 192-byte budget.
16. origin/dev moved one commit past the base (`e49e4ce`); it touches none of the files in the change map.
17. vue-router 5.2.0 (installed) applies a redirect record in `pushWithRedirect` before `navigate` runs any guard, and keeps `query` and `hash` (`handleRedirectRecord`).
18. `watchLockStart` only bumps the scope epoch and closes the toast (`locked-state.ts:62`, `scope-epoch.ts:22-25`). The route to `/popup/auth` comes from the worker's lock event (`app.vue:200-224`).
19. `lockActiveProfile` throws "Lock did not persist" when the session record survives `close()` (`service.ts:913-916`). `close()` announces the lock first only when an in-memory session was open (`session-manager.ts:412-416`).
20. The Lock page shows `String(ms / 1_000 / 60)` in its minutes field (`security/index.vue:68,133`). The field saves only whole numbers from 0 to 1440 (`subtype="int"`, `MAX_SESSION_TTL`; `packages/design/src/ui/Input.vue:181-194`). A backup never restores `sessionTtl` (`wallet/services/config/spec.ts:15`).
21. `typecheck:all` reads only `src/**` in `apps/extension` (`apps/extension/tsconfig.json` `include`): `tests/e2e/**` and `scripts/**` are not type-checked.
22. `registeredExtension` is a file-scoped fixture (`e2e/fixtures/extension.ts:605-613`), so a test in `wallet-lock.test.ts` starts in the state the previous test left.
23. `tests/e2e/network/lock-cancels-dapp-send.test.ts` and `profile-switch-sweeps-transfer.test.ts` require `NULO_E2E_PROVERLESS=1` and ask for `NULO_E2E_RETRY=0` in their headers.
24. `ServiceClient.onConnected` fires each time the port opens: on the first request, and again on the automatic reconnect after the port drops (`packages/extension-messaging/src/background/client.ts:77,94-97`). A deliberate `disconnect()` does not reconnect (`:80-92`). A reconnect over a resolved route keeps the mounted page (`app.vue:296-304`), and a restarted worker loads config from storage (`wallet/config/store.ts:24`).
25. Header's read clears its timer in `.finally()` (`Header.vue:43`), before the awaiting decision resumes at `:60` and checks the session counter at `:61`. Nothing stops a second click from starting a second read while the first runs (`:57-61`).
26. `e2e/navigation.test.ts` selects the About link by its href, at `:24` and `:71`. E2E tests select only by `data-testid` (`CLAUDE.md`, "E2E selector rule").
27. The auto-import plugin scans `src/composables/` and `src/utils/` and writes `src/types/auto-imports.d.ts` and `src/types/.eslintrc-auto-import.json`, both tracked (`apps/extension/vite.config.ts:103-121`). The new composable and label module change both files.

### Inferences

1. The redirect record and the guard hold together in the built popup: the source orders them (Fact 17), the route test proves it on the generated routes, and the smoke spec proves it end to end.
2. One Tab lap needs about 33 presses, under the test's 50.
3. Adding `onUpdate` and `onConnected` listeners to the hub's client does not disturb `usePrestoCheck`, which only calls `getValue` and `setValue` on it.
4. The fixed 20x20 box stays the default, so every current row in the 26 files that use `SettingItem` renders as before. That includes the first paint while the icon font loads: Material Symbols uses `font-display: block` (`packages/design/src/base.css:42`), so its ligature text is laid out, invisible and wider than 20px, until the font arrives. Only rows that fill `#icon` get minimum sizes: the accounts list's fixed 20px avatar (no change), the card's 40px avatar, and the Delete row's icon, which the hub boxes at 20x20.
5. Config can change while the hub is open: another popup or the side panel can write any key through the worker. So a `getProps()` answer that arrives after an `onUpdate` would overwrite a newer value. The fence prevents that; the hub test covers both orderings.
6. After a failed write the hub shows the attempted value, on this mount and every later one, until the worker restarts. The worker's ConfigStore changes memory before it persists and never rolls back (`wallet/config/store.ts:64-66`), and `getProps()` reads that memory (`wallet/services/config/service.ts:42-44`). Accepted with the toggle bug. A worker restart drops the port, and the hub stays mounted (Fact 24). The reread on reconnect then shows the value the worker loaded from storage, so the attempted value does not outlive the restart, and no update the hub missed while disconnected stays missing.
7. No e2e selects `account-avatar`, so overriding it on the card affects no test.
8. When the worker cannot delete the session record, the person sees one of two things. With an open in-memory session, the lock event fires before the rejection, so the popup shows the lock screen while the stored record survives, and a later worker start may restore the session. On a restarted worker with no in-memory session, no event fires, and the popup stays marked locked on the page it was on. Both are inherited from the header and kept.
9. After `dispose()`, the session listeners stay until every pending lock decision finishes, so a session change in that window abandons each decision as it does today. That includes the moment between a read's settle and its decision's resume (Fact 25), and a second decision that is still reading when the first finishes. Without that, the worker would refuse the stale handle (`service.ts:903-904`) while the popup showed locked. A decision finishes in the same turn its read settles, and `lock()` after `dispose()` starts no read. So the listeners outlive the component by at most the read budget, and only when a decision was pending.

### Asks

The owner answered the draft's Asks 1 to 3 (UI impact), and all four below at the approval gate on 2026-10-08 (verdict quoted under UI impact). Each keeps its question in one line, then its answer.

A. **Auto-lock value above zero.** Minutes as the Lock page's field shows them, or hours from 60 minutes up? Answer: hours. Under 60 minutes the hub shows minutes ("30 min"). A whole number of hours shows hours, such as "1 h" or "24 h" (the longest time the field saves). Any other time shows both ("1 h 30 min"). A time with a fraction of a minute can come only from storage written outside the app. The hub then shows the Lock page field's own text, so the two still agree and nothing is rounded. The Lock page's minutes field does not change. The repo has no duration formatter to reuse, so `settings-labels.ts` holds the rule in a few lines (exact rule under Label rules).

B. **Profile card initials.** One letter as on the board ("P"), or the shared two-letter rule ("PR")? Answer: the shared two-letter rule, "PR" for "Primary". The owner left the choice to the lead. One rule then serves the Header, contacts and the card with no extra code, and two letters tell profiles apart better than one.

C. **Cold-open back arrows.** Do the back arrows of Change password and Delete profile go to Settings on a cold open, now that their rows are on the hub? Answer: yes, Settings.

D. **Test ids on two hub rows.** Do the Change password and Back up rows keep their current test ids? A test id is a hidden name that tests use to find a control, and one control carries only one. Answer: yes. Change password keeps `change-password-link-btn` and Back up keeps `backup-link-btn`. The board's `setting-nav-change-password` and `setting-nav-backup` are not added. Nothing visible changes.

## Phases

### P1 — Shared pieces ✓

Steps:

1. Create `src/composables/useLockWallet.ts`. Copy Header's lock code into it without behavior change.
2. Take the profile client as the parameter. Use the app, cache and popup stores inside.
3. Implement the six points of the dispose contract in Key interfaces.
4. In `Header.vue`, import `useLockWallet` explicitly from `@/composables/useLockWallet`.
5. Call `useLockWallet(managers.profile)` in Header. Call `dispose()` in `onBeforeUnmount`, after the three service disconnects.
6. Move Header's lock behavior tests into `useLockWallet.test.ts`. Keep the chip pin and one click-locks pin in `Header.test.ts`.
7. Write these cases in `useLockWallet.test.ts`, at least 10 in total:
   - not logged in: no read starts;
   - nothing running after a fresh read: it locks at once with the read's handle;
   - one and three running: it asks with the header's copy, and "Lock anyway" locks with the read's handle;
   - a read past 3 s locks without asking, and its late answer changes nothing;
   - a rejected read locks without asking;
   - a session change during the read abandons: no dialog, no lock;
   - a session change closes this instance's open confirm;
   - a confirm owned by someone else stays open on a session change and on `dispose()`;
   - `dispose()` during a read with nothing running: it still locks when the read answers;
   - `dispose()` during a read with sends running: no confirm opens, nothing locks;
   - `dispose()` removes both listeners and closes its own confirm;
   - `dispose()` during a read, then a session change before it settles: nothing locks, and the listeners are gone once the decision finishes;
   - a session change between the read's settle and the decision's resume (fired from a callback chained on the read), with and without `dispose()`: nothing locks;
   - two overlapping `lock()` calls with sends running, then `dispose()`: the first decision abandons and the listeners stay; then sends drop to 0, a session change arrives, and the second read answers: nothing locks, and the listeners go only when the second decision finishes;
   - a second `dispose()` does nothing, and `lock()` after `dispose()` starts no read;
   - two instances on one client: each closes only its own confirm, and disposing one leaves the other working;
   - `lockActiveProfile` rejects: `lock()` resolves, the popup stays marked locked, and nothing retries;
   - with fake timers, no timer is left after the read settles, with or without `dispose()`.
8. In the rejection case, return a rejected promise that the test already handles. Vitest then reports no unhandled rejection.
9. Add `value` to `SettingItem`. Render it in an element with `data-testid="setting-value"`, before the default chevron, with `flex-shrink: 0` and no wrap.
10. Keep `.icon_wrapper` at 20x20. Add a class with `width: auto`, `height: auto`, `min-width: 20px` and `min-height: 20px`. Apply it only when `$slots.icon` is set.
11. Add `danger` to `ItemsContainer`. Set the border to the board's red mix. Do not change the label color.
12. Add cases and stories for `value`, `danger` and the icon box.
13. Create `src/utils/settings-labels.ts` and its test. Cover every label rule. For the auto-lock value, cover 59 minutes ("59 min"), 60 ("1 h"), 90 ("1 h 30 min"), 1440 ("24 h"), a fractional minute (the field's own string), 0 ("Never"), a negative number and "not read" (no value).
14. In tests, import every helper explicitly. Only `vue` and `vue-router` auto-import there, and `Header.test.ts:85` stubs the auto-imported `useToast`.
15. Run `bun run build:chrome` and commit the regenerated `src/types/auto-imports.d.ts` and `src/types/.eslintrc-auto-import.json` (Fact 27). Then run the build a second time.

Validation gate:

- Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/composables/useLockWallet.test.ts src/components/Header.test.ts src/components/ui/Settings/Settings.test.ts src/utils/settings-labels.test.ts`; `bun run test`; `bun run --cwd apps/extension build-storybook`; `bun run build:chrome`.
- Pass criteria: every command exits 0. `useLockWallet.test.ts` reports at least 10 cases. `Header.test.ts` keeps only the chip pin and the wiring pin for the lock. The regenerated `auto-imports.d.ts` and `.eslintrc-auto-import.json` are committed, and the second `bun run build:chrome` leaves `git status` with no change to either. If lint prints 20 diagnostics, rerun Biome on the changed files.
- Layers: lint and typecheck, unit, build (extension and Storybook).

### P2 — Pages, routes, hub

Steps:

1. Run the three `git mv` moves (security index to `lock.vue`, `appearance.vue` to `display.vue`, advanced index and test to `developer/`). Commit them alone.
2. Edit the Lock page. Put the Lock now row first, outside the `isLoading` gate. Hide strict mode for passkey. Remove the Backup row.
3. On the Lock page, import `useLockWallet` explicitly. Call it with `managers.profile`, never with the page's `profileService`. Call `dispose()` in `onBeforeUnmount`, after the two service disconnects.
4. Edit Display. Remove the fiat toggle. Rename the label to "Theme". Fix the typo.
5. On Display, filter `incomingTransfersVisible` out of the toggle `v-for`, as `theme` is today. Render its row after the loop with the same binding.
6. Add `SectionLabel label="Lists"` above the Show incoming transfers row. Keep Hide dust below that row.
7. Create Privacy with the `isAuthRequired` route block. Copy the toggle binding verbatim from Appearance. Move the Block Explorer control and its toast from Developer.
8. Edit Developer. Remove Block Explorer. Set the title. Add `setting-nav-advanced-account-state` to the Account State link.
9. Edit Your profile. Set the title. Add the Type row. Remove the Security and Delete groups.
10. Set the four back targets. Update `change-password.test.ts`.
11. Create `src/popup/legacy-routes.ts`. Push its records in `src/popup/index.ts`.
12. Add `scripts/legacy-routes.test.ts` as described in Algorithms: the inventory, the meta, the real guard and the query case.
13. Rewrite the hub per the UI impact table. Give the Back up row `backup-link-btn` and the Change password row `change-password-link-btn`, the ids they have today (Ask D).
14. In the hub, start the config read without `await`, before the `await` on `getLastProveOutcome()`. Give each read a generation number and its own fence, as in Algorithms. On every `onConnected` after the first, start a new read.
15. On the profile card, pass `profile.name` to `AccountAvatar` unchanged. The avatar's shared rule shows two letters, "PR" for "Primary" (Ask B).
16. Box the Delete row's red icon at 20x20 with `overflow: hidden`.
17. Add `settings/index.test.ts`. Cover row order and testids for password and passkey, and values only after the read.
18. In the same file, cover both orderings of a read's answer and `onUpdate`. Cover a `getProps()` that never answers: the Proving description still renders.
19. In the same file, cover reconnects. A first read rejects, then `onConnected` fires: the values appear. An `onUpdate` shows "Prices off" from a write that never persisted; then a worker restart reconnects, and the new read answers "Prices on": the hub shows "Prices on". Two reads overlap and the older answers last: the newer values stay.
20. In the same file, cover the two-letter card avatar ("PR" for "Primary") and `setting-value` inside the four rows.
21. Add `lock.test.ts`. Cover: passkey hides strict mode; Lock now renders while config reads hang.
22. In `lock.test.ts`, mock `@/composables/useLockWallet`. Assert the argument is `managers.profile`, a click calls `lock`, and unmount calls `dispose`.
23. Add `privacy.test.ts`: the two controls and their testids, and one `(BUG PIN)` test for the toggle bug.
24. Drop the `Dropdown` mock from `developer/index.test.ts`.
25. Run `bun run build:chrome` before you commit, so `auto-imports.d.ts` and the routes regenerate.

Validation gate:

- Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run scripts/legacy-routes.test.ts src/popup/pages/settings/index.test.ts src/popup/pages/settings/lock.test.ts src/popup/pages/settings/privacy.test.ts src/popup/pages/settings/developer/index.test.ts src/popup/pages/settings/security/change-password.test.ts`; `bun run test`; `bun run build:chrome`; `git show --stat -M --format= <rename commit>`.
- Pass criteria: every command exits 0. The rename commit lists exactly three page renames and one test rename, each `R100`. The legacy test fails if you restore `security/index.vue` (check once, then revert). It also fails if you remove `isAuthRequired` from `privacy.vue` (check once, then revert).
- Layers: lint and typecheck, unit, build.

### P3 — E2E and docs

Warning: never run smoke and network in this worktree at the same time. Both kill Chrome loaded from its dist.

Steps:

1. Change `setAdvancedToggle`'s hash to `#/popup/settings/developer`.
2. Add `openAccountState(page, section)`. Use it in the four network callers.
3. Update every old path and id in the blast-radius table of `recon.md`.
4. In `navigation.test.ts`, select the About row only by `setting-nav-about`, at `:24` and `:71`. Add `delete-profile-link-btn`, `backup-link-btn` and `change-password-link-btn` to both lists the Tab-lap test compares. Keep DOM order.
5. Add `e2e/settings-routes.test.ts`. For each old hash, set `location.hash` in the page.
6. Then call `waitForHash` with the new hash. Then wait for a control of the new page.
7. In the same file, read `[data-testid="setting-nav-lock"] [data-testid="setting-value"]` and the other three rows.
8. Expect "30 min", "Prices on", "System" and "Off". Read them before any test in the file changes config.
9. Add a Lock now test to `e2e/wallet-lock.test.ts`. Start with `ensureUnlocked`, because the fixture is shared per file.
10. In that test, open the Lock page, click `lock-now-btn` and wait for the lock screen.
11. Then close the popup, reopen it, wait for `#/popup/auth`, unlock and wait off the auth page.
12. Update the docs and comments in the change map, including the e2e comments and the test title.
13. Re-point `follow-ups.md:141` to the Lock page and `:239` to `display.vue`, `privacy.vue`, `developer/index.vue`.
14. Add an entry to `BEFORE-LAUNCH.md` § 4, after the "Due at the first release" block, in the same form. Use this text:

    ```
    **Due at the release that carries the Privacy page:** privacy § 5.3 says the explorer "can be
    disabled in Settings → Advanced". That control now lives in Settings → Privacy. Ship a new privacy
    version before that release reaches users (procedure above):

    - [ ] `legal/privacy.md` — § 5.3 reads "Settings → Privacy"; the version line and a new history
          row, effective the day it is published
    - [ ] `packages/legal/src/manifest.ts` — the new `privacy` entry, `material: false`, same date
    - [ ] After the deploy, AMO's Privacy policy field carries the new text
          (`apps/extension/store/listing.md` § Privacy policy text)
    ```

Validation gate:

- Commands:
  - `bun run lint`; `bun run typecheck:all`; `bun run test`.
  - `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 bun run build:chrome`, then `NULO_E2E_MIGRATION_FIXTURE=1 bun run test:e2e`.
  - The same flags with `bun run --cwd apps/extension build:firefox`, then `NULO_E2E_BROWSER=firefox NULO_E2E_MIGRATION_FIXTURE=1 bun run test:e2e`.
  - `NULO_E2E_PROVERLESS=1 bun run e2e:agent tests/e2e/network/authwit-lifecycle.test.ts tests/e2e/network/popup-escape-layered.test.ts tests/e2e/network/senders-advanced.test.ts tests/e2e/network/selfpay-phase.test.ts tests/e2e/network/incoming-arrival.test.ts`, then the same with `NULO_E2E_BROWSER=firefox`.
  - `NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 bun run e2e:agent tests/e2e/network/lock-cancels-dapp-send.test.ts tests/e2e/network/profile-switch-sweeps-transfer.test.ts`, then the same with `NULO_E2E_BROWSER=firefox`.
- Pass criteria: every command exits 0. Both smoke runs include `settings-routes.test.ts` and the new `wallet-lock` test as passed, not skipped. The Tab-lap test passes on both browsers. The two lock files pass at retry 0 on both browsers. `typecheck:all` does not read `tests/e2e/**`, so these runs are the only proof of the e2e edits. A failure that looks like a flake passes on a rerun of that file alone; record the rerun in `lessons/phase-3.md`.
- Layers: lint and typecheck, unit, e2e (smoke, both browsers), e2e against the local network (touched files and the two lock files, both browsers).

### P4 — Screenshots and full gates

Warning: do not stage the screenshot spec. Delete it after the capture.

Steps:

1. Write a throwaway spec `e2e/zz-settings-shots.test.ts`. Set the viewport to 360x600 at scale 2.
2. Capture light and dark (set the theme on Display): hub top and bottom for password and passkey, Your profile, Lock for both kinds, Privacy, Display, Developer off and on.
3. Write the images to the session scratchpad. Use `registerPasskeyProfile` from `e2e/fixtures/passkey.ts` for the passkey set.
4. Give the images to the lead. The lead publishes them as a private Artifact and records its link in this plan.
5. Delete the spec. Run the final gates alone, with nothing else running.

Validation gate:

- Commands: `bun run audit:vue`; `bun run check:plans`; `bun run test:ci-gating`; `git status --porcelain`.
- Pass criteria: the first three exit 0. `git status` lists no screenshot spec and no image. The Artifact link is in this plan.
- Layers: lint and typecheck, unit, build, plans gate.

## Decision ledger

| # | Decision | Source | Alternatives considered | Audit outcome |
|---|---|---|---|---|
| 1 | Routes by `git mv` (`lock.vue`, `display.vue`, `developer/index.vue`); new `privacy.vue`; redirects as records from an exported list, pinned by a route-tree test that also checks meta and runs the real guard | lead | `<route>`-block redirects in stub pages; mounted `router.replace`; `lock/index.vue` | kept by both audits; C3 and C4 adopted (test widened, Security corrected) |
| 2 | Export, Change password, Delete profile back → `/popup/settings`; Account State back → `/popup/settings/developer`; `route-guard.ts:58` unchanged | lead, owner via Ask C | keep `/popup/settings/profile`; guard to the hub | Change password and Delete profile → Ask C, owner confirmed Settings; C9 rejected (Account State target is not a UI change) |
| 3 | One testid per element; Back up and Change password keep `backup-link-btn` and `change-password-link-btn` (owner, Ask D); new `setting-nav-{lock,privacy,display,developer,about}`, `lock-now-btn`, `explorer-*`, `setting-nav-advanced-account-state`, `profile-card-avatar`, `identity-type-row`, `setting-value` | lead, owner via Ask D | two testids per element (impossible); the lead decides without the owner (C8's first resolution); `setting-nav-change-password` and `setting-nav-backup` (Ask D's alternative) | C8 superseded by S7 (Ask D, owner kept the existing ids); `setting-value` added (F3) |
| 4 | One C1 lock composable, client passed in, one instance per component, explicit imports | lead | module singleton; Lock page calls the header via an event; a second copy | kept; F10 and F11 adopted; C1 corrected the completion text; see rows 18, 19 and 23 |
| 5 | `SettingItem` `value` prop; hub reads four keys through its existing client; nothing until read; read independent of the Proving row | lead | `#right` slot recipe per row; a Pinia config store | kept; F3, F15 adopted; see rows 20 and 22 |
| 6 | Profile card = `SettingItem size="large"` + `AccountAvatar` in `#icon`, fallthrough testid override; icon box relaxed only for `#icon` rows; `profile.name` passed unchanged, so the avatar shows the shared two-letter initials | lead, refined in draft; avatar rule chosen by the lead, delegated by the owner (Ask B) | new card component; wrapper element; relax the box for every row; one letter, the first code point of the shared rule (the board) | kept; F6 adopted (box rule); F5 → Ask B, answered: the shared two-letter rule |
| 7 | Your profile: Name, ID, Type only | lead | keep a Security group | kept, no finding |
| 8 | Lock page: Lock now first and outside the load gate; strict mode hidden for passkey; Backup row removed; `follow-ups.md:141` stays open | lead, refined in draft | Lock now inside the gate | kept; F1 and F2 adopted (client, dispose on unmount) |
| 9 | Toggle binding split verbatim into three pages, bug pinned once in `privacy.test.ts`, follow-up re-pointed | draft (lead left it open) | one shared composable without the fix (plan-alt) | kept by both audits; C6 restated the bug's reach; F16 adopted (loop split on Display) |
| 10 | Danger zone = `ItemsContainer title="Danger zone" danger`; red icon via `#icon`, boxed at 20x20; label in the normal group color | lead, refined in draft | `SectionLabel`; `iconFillColor` (does not reach material icons); red label (fails AA in light) | owner answered Ask 2 (normal color) |
| 11 | Hub stays an explicit template; About becomes a `SettingItem` row with `setting-nav-about` | lead | data-driven hub (plan-alt) | kept by both audits |
| 12 | E2E on new paths, no reliance on redirects; `openAccountState` helper; one redirect spec with `waitForHash`; one Lock now smoke through reopen and unlock; Tab lap with the kept ids; passkey variants in component tests | lead, refined in draft | keep `navigateToSettings` callers unchanged (impossible) | F3, F4, F12, C10, C11 adopted; S3 adopted (About by `setting-nav-about`, never by href) |
| 13 | Docs and comments updated, including `SECURITY.md`, `ARCHITECTURE.md`, `FIREFOX.md`, `PRF-NON-PORTABLE.md` and the e2e comments; privacy wording scheduled in `BEFORE-LAUNCH.md` | lead, widened in draft | leave stale docs; a 1.1.2 patch in this PR | owner answered Ask 3 (fallback: `BEFORE-LAUNCH.md`); F14 adopted; F9 moot |
| 14 | Throwaway screenshot spec; private Artifact linked from the PR | lead | Storybook page stories; committed captures | kept, no finding |
| 15 | UI impact table plus verbatim sign-off, answers and approval-gate verdict; items off the board are Asks, all answered | lead | none | F8 adopted (no-description rows); C7 → Ask A, answered (hours) |
| 16 | Labels in `src/utils/settings-labels.ts`, never under `src/popup/pages/` (`.ts` files there become routes); auto-lock in minutes under an hour, then hours and minutes; a fractional minute shows the Lock page field's own text | draft, owner via Ask A | colocated helper in the pages dir; minutes only, as the Lock page shows them (the draft's default); `Intl.DurationFormat` (its output depends on locale and style, so it is not the signed copy); rounding a fraction to whole minutes (a product decision the fallback avoids) | kept; C7 and F8 put the format to the owner as Ask A, answered: hours |
| 17 | Single PR into `dev`, title `feat(settings): group settings by task` | lead | two arcs (plan-alt) | kept by both audits; F17 rejected (the `.gitignore` lines ride as their own commit) |
| 18 | Both lock callers pass `managers.profile`; `lock.test.ts` asserts the argument | audit (F1) | the Lock page's own `profileService` (its disconnect on unmount rejects the pending read and abandons the lock) | adopted |
| 19 | `dispose()` contract: idempotent; removes both listeners once no lock decision is pending (row 23); closes only its own confirm; a pending decision finishes and locks, or abandons when a confirm would be needed; the read's timer clears on settle | audit (C2, F2, S5), lead | cancel the pending read (drops the requested lock); clear the timer in `dispose()` (a hung read never settles) | adopted; S5 moved listener removal from the read's settle to the decision's end |
| 20 | Hub reads fenced: a key updated after a read started keeps its update; both orderings tested | audit (C5, F7) | accept the overwrite (premise false) | adopted; the refresh after a reconnect, first rejected, is adopted as row 22 (S4) |
| 21 | Hub value in an element with `data-testid="setting-value"`; e2e reads it under the row's testid | audit (F3) | read row text (breaks the e2e selector rule); `:data-value` on the row | adopted |
| 22 | The hub rereads config on every `onConnected` after the first; each read has a generation number and its own fence, so an older read never overwrites a newer one; tests cover a reconnect after a rejected first read and after a worker restart that drops an unpersisted value | audit (S4) | reread only on mount (a reconnect keeps the hub mounted, so a missed update or an unpersisted value would stay) | adopted |
| 23 | Lock listeners live until every pending lock decision finishes: a counter rises when `lock()` starts a read and falls in that decision's `finally`; after `dispose()`, the `finally` that reaches zero removes them | audit (S5) | remove them in the read's `.finally()` (a gap before the decision resumes, and a second overlapping decision left unguarded); remove them at `dispose()` (a session change during the read goes unseen) | adopted |

Disagreements: codex's first conditions named C8, C9 and C12, and the lead rejected all three. The final fresh codex pass reviewed those rejections. It raised nothing on C9, and it overturned C12 (S1, adopted) and C8 (S7, put to the owner as Ask D, who kept the existing ids). Opus's F17 stays rejected; it was not one of its conditions. None remains open.

## Audit verdicts

- Codex (`gpt-6.1-sol`, high): **conditional approve** (with conditions: address C1–C3, C5 and C10–C12; correct C4 and C6; record owner decisions for C7–C9 and the existing Asks before dependent implementation).
- Fable leg (Opus 5.5, Plan agent): **conditional approve** (with conditions: F1 pin `managers.profile` for both lock callers and test it; F2 dispose closes the instance's own confirm and the Lock page calls dispose; F3 give the hub value a testid and fix the redirect and value spec mechanics; F4 add lock-cancels-dapp-send and profile-switch-sweeps-transfer to the P3 proverless gate; F5 restate Ask 4 accurately; owner answers Asks 1–5, with F8 and F9 folded in, before P2).
- Final fresh codex pass (`gpt-6.1-sol`, high) on the consolidated plan and this ledger: **conditional approve** (with conditions: address S1–S7 and record the owner's answers to A–C before dependent implementation). All seven findings are adopted (second table below). Ask D, added for S7, joined A–C at the approval gate. The owner's answers to A–D are recorded (UI impact and Asks, 2026-10-08), which meets this pass's last condition.

Both audits kept the plan's structure over plan-alt's (unused infrastructure arc, data-driven hub, toggle composable without the fix, stub-page redirects).

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| C1 | High | Lock completion overstated: routing depends on the worker's event, and the header discards the lock request's promise; a persisted session can survive | Adopted. Data & control flow corrected; Security "Lock completion"; Facts 18 and 19; Inference 8; P1 step 7 pins the rejection path. No retry UI (that would be a new Ask). |
| C2 | Medium | `dispose()` has no ownership contract | Adopted with one change: a pending read finishes instead of being invalidated, because cancelling drops the requested lock (F1). Contract in Key interfaces; tests in P1 step 7; ledger 19. |
| C3 | Medium | Route tests do not prove the guard or the meta | Adopted. `scripts/legacy-routes.test.ts` asserts `isAuthRequired` and drives the real `createPopupGuard` (Algorithms; P2 step 12). |
| C4 | Low | "No query forwarding" is false | Adopted. Security "Redirects" corrected (vue-router 5.2.0 is installed, not 5.1.0; same behavior); the `?redirect=https://example.org` case is in the same test. |
| C5 | Medium | A stale snapshot can overwrite a newer event | Adopted: snapshot fence and both orderings (ledger 20; P2 steps 14 and 18). Its "refresh after reconnection" was first rejected; the final pass showed the hub stays mounted across a reconnect, so it is adopted as S4 (ledger 22). |
| C6 | Low | A remount does not repair a failed-write value | Adopted. Inference 6 restated. |
| C7 | Medium | Rounding of positive timeouts is a product decision | Adopted as Ask A. Answered at the approval gate: hours from 60 minutes; a fractional minute keeps the Lock page field's own text, so no rounding rule is added. |
| C8 | Medium | Dropping `setting-nav-change-password` needs owner approval | Superseded by S7: owner exception requested (Ask D); the owner kept `change-password-link-btn` and `backup-link-btn` at the approval gate. First rejected on the ground that testids are the lead's call; the final pass showed the board's testid table names both ids, and the owner's answers do not amend it. |
| C9 | Medium | Account State's back target is an unlisted Ask | Rejected. Not a UI change: the same page shows either way, and the old target would only redirect there. Lead decision, kept. |
| C10 | Medium | The Tab lap skips three kept ids | Adopted (Algorithms "Tab lap"; P3 step 4). |
| C11 | Medium | The Lock now smoke proves less than the header test; no confirm or Terms scenario | Adopted in part. The smoke continues through close, reopen and unlock (P3 steps 9 to 11). The running-send confirm through the new row is one shared code path: composable tests plus the Lock page wiring test cover it, and `network/lock-cancels-dapp-send.test.ts` keeps the header path. Terms: `legal-acceptance.test.ts:287` (S8) already proves the header lock after "Not now"; the Lock page's behavior is unchanged, so no new test (Security "Terms sheet"). |
| C12 | Low | Close-out deletes the phase logs | Superseded by S1: adopted. First rejected on repo practice (`implementations-plan/README.md:10`; 237 of the 238 archived directories hold only `plan.md`). The owner's standing rule that raw phase logs travel into the archive intact wins, and the plans gate allows them. Close-out step 5.1 keeps `lessons/`; its front-matter wording is fixed too. |
| F1 | High | The Lock page might pass its own client, so unmount abandons the lock | Adopted (Proposed architecture; ledger 18; P2 step 3; P2 step 22). |
| F2 | Medium | A Lock page confirm can outlive its listener | Adopted (dispose contract points 3 and 4; P2 step 3; P1 step 7). |
| F3 | Medium | The hub value has no testid; the redirect spec races; the Lock now smoke assumes a state | Adopted (`setting-value`; `waitForHash`; `ensureUnlocked`; P3 steps 5 to 11). |
| F4 | Medium | The P3 gate skips the e2e that drive the lock's confirm path | Adopted (P3 gate, at `NULO_E2E_RETRY=0`, both browsers). |
| F5 | Medium | Ask 4 gave a false reason | Adopted: restated as Ask B. Answered at the approval gate: the shared two-letter rule. |
| F6 | Low | Relaxing the icon box changes every row | Adopted: the box stays fixed except for `#icon` rows. While verifying, the Delete row's red icon turned out to use `#icon` too, so the hub boxes it at 20x20 (Inference 4; P2 step 16). |
| F7 | Low | Inferences 5 and 6 rest on wrong premises | Adopted: both restated. |
| F8 | Low | Ask 1 covers only 0; two rows need "no description" | Adopted: Ask A, answered at the approval gate (hours); the UI table says Change password and Delete profile have no description line. |
| F9 | Low | The legal steps miss the version-history row | Moot: Ask 3 resolved without a legal edit. The `BEFORE-LAUNCH.md` entry names the history row. |
| F10 | Low | An auto-imported composable could be stubbed in tests | Adopted: explicit imports in `Header.vue` and `lock.vue` (P1 step 4; P2 step 3). |
| F11 | Low | The composable test is below the 10-case floor | Adopted: 18 cases listed (P1 step 7). |
| F12 | Low | The Tab lap never sees three rows | Adopted with C10. |
| F13 | Low | P1 gate misses Storybook and the build; typecheck skips e2e | Adopted (P1 gate; P3 pass criteria; Fact 21). |
| F14 | Low | Stale comments and a test title | Adopted (change map). Verification also found `sw-resilience.test.ts:114,128,148`, added. |
| F15 | Low | A hanging config read could freeze the Proving row | Adopted (Hub values; P2 steps 14 and 18). |
| F16 | Low | "Lists" needs the toggle loop split | Adopted (P2 steps 5 and 6). |
| F17 | Low | An unrelated `.gitignore` edit in the worktree | Rejected. The `narration.mp3`/`narration.mp4` lines are required by the plans hygiene rule the lead follows; they ship as their own `chore(plans)` commit in this PR. |

Final fresh codex pass, findings S1–S7:

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| S1 | Medium | C12's rejection conflicts with the owner's rule that raw phase logs travel into the archive intact | Adopted. Close-out step 5.1 keeps `lessons/phase-N.md` intact in the archive and still condenses `plan.md`; C12 superseded. |
| S2 | Low | P1's "no change to `auto-imports.d.ts`" criterion is wrong: the new composable and label module change it | Adopted. P1 step 15 and gate: commit the regenerated declarations, then a second build changes nothing. Verification found `.eslintrc-auto-import.json` regenerates too, so it is in the criterion (Fact 27). |
| S3 | Low | The About row stays selected by its href, which the e2e selector rule forbids | Adopted. Both sites, `navigation.test.ts:24,71`, select `setting-nav-about` (Fact 26; change map; P3 step 4); recon corrected. |
| S4 | Medium | Rejecting a reread after a reconnect leaves hub values stale: the hub stays mounted, a restarted worker loads stored config, and missed updates are not replayed | Adopted. Reread on every `onConnected` after the first, with a fresh fence per read and a generation check (Hub values; Algorithms; P2 steps 14 and 19; Fact 24; Inference 6; ledger 22). The config-toggle write bug stays deferred. |
| S5 | Medium | Removing the lock listeners when the read settles opens a gap before the decision resumes, and leaves an overlapping decision unguarded | Adopted. Pending-decision counter, removal in the outer decision's `finally` (dispose contract points 2, 4 and 5; Inference 9; P1 step 7; ledger 19 and 23). Outcome & Quality Bar item 2 now says leaving the page abandons a decision that needs the confirm. Verified: port events arrive as tasks, so only an `onDisconnected` fired by a synchronous `disconnect()` call can land in the first gap; the overlap gap lasts up to 3 s. |
| S6 | Low | Inference 5 says the hub writes `prestoReached`; the hub calls only `start()` (`settings/index.vue:25,31`), and `check()` writes (`usePrestoCheck.ts:47`) | Adopted. Example removed; another popup or the side panel justifies the fence. |
| S7 | Medium | C8 cannot be rejected by calling the board's testid table non-binding: it lists `setting-nav-change-password` and keeps `change-password-link-btn` | Adopted. Ask D put it to the owner, with the same choice for Back up; the owner kept both existing ids. C8 superseded. |

## Post-implementation

Single-arc plan: steps 1 to 3 run once over the whole diff after P4 is green; then steps 4 and 5; step 6 after the merge. `code_review` is `off`, so no `/code-review` pass runs.

1. **Codex audit.** Run `/codex high` on `gpt-6.1-sol` (pass the slug as `run-codex.sh`'s fifth argument). Send the net diff from the branch's merge base with origin/dev, this plan with its decision ledger, the adversarial and security ask, and the two rules below, verbatim.
2. **Fix loop.** Verify each finding against the repo first. Apply accepted fixes and commit them. Log the round in `lessons/phase-5.md`. Resume the same codex session with the fix diff. Repeat until a round has no new material finding. After three rounds with material findings, stop and report to the owner.
3. **Rules sent with every codex prompt, first and resumed:**
   - No-over-engineering: *"Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."*
   - Comment quality: *"Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."*
4. **Delivery.** Only now open the PR (see Delivery). Never open a PR or a draft earlier.
5. **Close-out**, as the PR's final commits, made after `gh pr create` so the record can cite the PR number:
   1. Condense this plan in place into the repo's archived-record form. Remove the YAML front matter: no archived record has one (all 238 under `implementations-plan/archive/`, the newest being `implementations-plan/archive/ci-gates/plan.md`). Put `## Outcome` first under the title. `implementations-plan/README.md` rule 5 puts the Outcome directly after the front matter; with none left, it comes first. `check:plans` checks only that an h2 named exactly `Outcome` holds Date, Status, Shipped (or Delivered) and Seeds retired (`scripts/ci-cd/plans/structure.ts:41,137-141`), not where it sits. Write Date, Status, Shipped, Open items, and "Seeds retired:" retiring the `/goal` and `/loop` seeds below. Then write Decision, Why, What shipped, and Lessons with anchored headings. Keep the audit verdicts and the ledger's rejected alternatives. Leave `lessons/phase-N.md` as they are: the owner's standing rule is that promotion never deletes the raw logs, which travel into the archive intact. `implementations-plan/README.md:10` describes archived records as `plan.md` plus files live code cites, but the gate forbids nothing more, and its fix for an unlinked `lessons.md` entry is to link an archived lessons log (`scripts/ci-cd/plans/structure.ts:254`). Move what is worth keeping from `recon.md` into `plan.md`, then delete `recon.md`: its line numbers go stale once the change lands, and the owner's archive layout names only `plan.md` and `lessons/`. Drop this plan's link to `recon.md` in the same edit, because the gate fails on a link to a missing plan file. In the same commit, set this plan's status in `implementations-plan/index.md` to `closed, awaiting archive`: the gate flags an active index line whose plan carries an Outcome (`structure.ts:37,159-164`). Commit.
   2. Promote generalizable gotchas to `implementations-plan/lessons.md`, one line each, linking `archive/settings-by-task/plan.md#<anchor>` or the archived `lessons/phase-N.md` that holds the detail. The file has 447 bytes of headroom: merge or retire an entry for each one added, and date anything tied to a tool version.
   3. Move open items to `implementations-plan/follow-ups.md` (or a GitHub issue with a pointer there). The plan cannot close while it owns one.
   4. `git mv implementations-plan/settings-by-task implementations-plan/archive/settings-by-task` in its own commit. Then run `git grep -n 'settings-by-task'` and repair links the extra directory level broke.
   5. Move this plan's line from `implementations-plan/index.md` to `implementations-plan/archive/index.md`, status `completed`. Run `bun run check:plans`. Push, then report and wait: merging is the owner's call.
6. **Teardown after the merge**, without asking. The trigger is `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/settings-by-task/plan.md`. When it succeeds: call `ExitWorktree` with `action: "keep"` if this session entered through `EnterWorktree` (a session resumed inside the worktree has nothing to exit), then run `agent-worktree done settings-by-task --merged` (dev is origin's default branch, so no `--trunk`). Report each removed branch with its last SHA. On a refusal, relay its output and stop; never force. Who notices the merge: a `/loop` session checks on every firing; a `/goal` session arms one background wait right after its wrap-up report (`Bash`, `run_in_background`, maximum timeout: `until git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/settings-by-task/plan.md; do sleep 300; done`) and otherwise runs this step at the start of its next turn.

Post-implementation hardening: not scheduled. The change touches no trust boundary beyond the UI rules above.

## Delivery

| Arc | Phases | Stacks on | `/code-review` |
|---|---|---|---|
| `worktree-settings-by-task` (single PR into `dev`) | P1–P4, then the close-out commits | `dev` | off |

Single-arc: one branch, one PR, plain `gh pr create --base dev`. No stack. Title `feat(settings): group settings by task` (38 characters, under the 93-character budget). The body carries the UI impact table, the owner's sign-off and answers quoted, the A–D answers, the screenshot Artifact link, and the attribution line. The `implementations-plan/.gitignore` narration lines ship as their own `chore(plans)` commit in this PR. Rebase onto origin/dev and rerun the P3 smoke gate before `gh pr create` if dev moved into the touched files. After the PR exists: `gh pr checks --watch`. Merge is a squash, and it is the owner's call.

## Seeds

Final as of the owner's approval, 2026-10-08.

ELI5 companion (private Artifact): https://claude.ai/artifact/G79EP4gNA4c7vW5ojn38AW. Its source is `eli5.src.html`, kept in the lead session's scratchpad and never committed; republish that file to keep this URL.

Recommended: `/goal`. Fallback: `/loop`.

```
/goal All phases marked ✓ in implementations-plan/settings-by-task/plan.md (the per-phase headers in the file — not the chat, not the task list), each ✓ backed by its phase's validation gate (as defined in plan.md) reported passing in the transcript; for each phase the agent has printed `LESSONS_FILE=implementations-plan/settings-by-task/lessons/phase-N.md` in the transcript; plan.md's `code_review` is `off`, so `/code-review` was NOT run; the codex fix loop (`/codex high` on gpt-6.1-sol) converged for the whole diff, evidenced by a resumed codex pass reporting no new material findings, quoted in the transcript; the Delivery section's single PR into dev exists on GitHub, created only AFTER the loop converged (`gh pr view` output in the transcript), including the close-out that archived the plan as the PR's final commits (`git show --stat` of the archive-move commit in the transcript); `bun run test` and `bun run lint` both report exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/settings-by-task forward. Never idle waiting for my input. Delegate every code edit to a subagent and review its diff. Each firing:
1. **Reality check**: read implementations-plan/settings-by-task/plan.md and lessons/ (authoritative state — not the chat), including its Outcome & Quality Bar section: every step is judged against those criteria, not just against "it runs". If that path is gone, the close-out has run: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/settings-by-task/plan.md` succeeds → it merged and the plan is completely done: run the teardown now, without asking — `ExitWorktree` (`keep`) if this session entered the worktree through `EnterWorktree`, then `agent-worktree done settings-by-task --merged` — report what it removed or, if it refused, its output verbatim (never force past a refusal), clear this loop and STOP. Fails → delivered and awaiting my merge: babysit only (CI per step 2, fixes on the branch, keep the Outcome true), never resume a phase or read the archived plan as a task list; once the PR is green, report that once and STOP — later firings repeat only this merge check. A live plan.md that already carries an Outcome section means a close-out was interrupted: finish it. Otherwise, native task list empty (fresh session)? rebuild it from plan.md, one task per remaining step; run `git status` and `git log --oneline -5`. If a PR exists, `gh pr view --json statusCheckRollup` (no --watch). Without a PR, `gh run list --branch $(git branch --show-current) --limit 1 --json status,databaseId`.
2. **Waiting on CI is fine** — confirm it's actually progressing (`gh run watch <run-id>` up to 10 minutes; queued or stuck past that → inspect logs, log it as blocked in lessons). Use the wait productively: review the diff, prep the next phase, strengthen tests. Don't start work that would conflict with the in-flight change. Never run smoke and network e2e at the same time in this worktree.
3. **No task in hand?** Pick the next pending step from plan.md and start it. After each meaningful edit, run `bun run lint` + the touched test files — catch mistakes in-step, not phases later. Then commit → push.
4. **Stuck, or facing a decision you'd normally bring to me?** Don't wait. Call `/codex high` (on gpt-6.1-sol) with full context and go back and forth until you two reach a defensible decision, then act on it. Log every consult + verdict in lessons/phase-N.md. Exception — hard limits stay hard: never merge to main or release branches, never publish or deploy, never expand scope beyond plan.md, never change user-visible copy or layout beyond plan.md's UI impact table and the answered Asks; if the decision requires crossing one, surface it and hold.
5. **Same step failed 5 times?** Stop retrying; reassess the approach with codex, then continue down the agreed path.
6. **Phase green?** "Green" means THE PHASE'S VALIDATION GATE as written in plan.md passes (commands + pass criteria — not generic vibes). Run the full gate, paste the result, mark ✓ in plan.md, file the lessons entry, print `LESSONS_FILE=implementations-plan/settings-by-task/lessons/phase-N.md` in the transcript, advance to the next phase.
7. **All phases ✓ in plan.md?** Close out per plan.md's Post-implementation section: `code_review` is `off`, so no `/code-review`; run the codex audit (`/codex high` on gpt-6.1-sol, net diff from the plan baseline + adversarial / security ask + the plan's no-over-engineering + comment-quality rules) → apply accepted fixes, commit, then RESUME the same codex session with the fix diff for a re-review — loop until a round yields no new material findings (still churning after 3 rounds → surface and stop). Then Delivery per plan.md — the FIRST time any PR is opened: `gh pr create --base dev`. Then the close-out per plan.md's Post-implementation section as the PR's final commits, pushed. Then `gh pr checks --watch`. Then write the wrap-up report: what shipped, every contentious decision codex and I debated — each with ELI5 context (what the question was, the options, why we picked ours) — and open items. Surface and stop — merging completes the plan, and that is my call; the firing after my merge tears the worktree down (step 1).

Keep the native task list current (`TaskUpdate` as steps start/finish; plan.md stays the source of truth).
```
