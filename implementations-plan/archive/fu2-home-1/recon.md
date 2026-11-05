# fu2-home-1: recon

Base `1e6c5bc1f` (`origin/dev`). Two Explore agents (Sonnet): a reuse sweep over the six capabilities, and a mapper for Home's hero, the Get started card and onboarding at 240 px. The planner checked each claim used below against the tree, read the lab's frames and the option pictures the owner signed against, and measured the header, Home's hero and onboarding with an uncommitted smoke spec on the armed Chrome build. Paths are under `apps/extension/` unless they name a package.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Switch toast | `src/popup/pages/settings/networks/index.vue:61` and `[id].vue:124`, both `{ kind: "success", label: "Active network updated" }`. `useNetworkActivation` leaves success feedback to the caller. `ToastOptions` already has `sub` (`packages/design/src/composables/toast.ts`); precedent `readyToast` (`src/components/stale-network/copy.ts:158`). | adapt: one helper both pages call |
| Know the target's account has loaded | `activate()` resolves before the account reload: `app.vue`'s `watch(() => appStore.network)` starts `createNetworkSwitchHandler` (`src/popup/network-switch.ts`), which loads accounts and runs `setupActiveAccount`. `app.vue` already awaits that run for the reset path: `accountLoaded: async () => { await nextTick(); await switchRun }` (`createResetCompletion`). `accountStateOf(appStore)` (`src/components/header-account.ts`) is `"shown"` only once the account is the active chain's. | reuse: provide the same wait |
| Receive line | `src/popup/components/popups/ReceivePopup.vue`: name, then `receive-address` (`slice(0,6) ••• slice(-4)`), then Close. The header renders `appStore.network.name` raw. Receive refuses to open while the account loads (`ActionButtonsView.vue`, `accountReady`). | adapt: one `Text` under the address |
| New-account toast | `src/popup/components/popups/NewAccountPopup.vue` `handleCreateAccount`: create, `listOwnAccountRow`, `commitScopeChange` selects it, `setSelectedAccount`, close; no success toast. Opened from Settings › Accounts (`accounts-new-btn`) and the switcher (`accounts-popup-new`). `NewAccountPopup.test.ts` already mocks `openToast`. | adapt |
| Card while the scope is unread | `getStartedView` (`src/utils/get-started.ts:137-150`) is `null` while `funds === "unknown"`; `general.vue:168` mounts the card only for a non-null view. Funds decide only the banner (`hidden && !phraseSaved && funds === "some"`) and, through `feeJuice`, the Fee Juice step. `SettingItem`'s `disabled` makes a row inert at `opacity: 0.5`. | adapt `getStartedView`, `GetStartedCard`, `general.vue` |
| Status word | `Header.vue` chip: `data-status` from `appStore.networkStatus` (`sync`, `Active`, `Inactive`, `InvalidChain`, or unset); dot grey, green, red, red, grey. `aria-label` names the network only. No dropdown exists: the chip opens Manage Networks, whose active row has a green "active" dot and an `Active` badge. | build new: a two-word map |
| Name in place of the address | `showNode` via `useConfigRead` in `Header.vue`; the `(width < 359px)` rule; `NARROW_ACCEPTED` exempts `network-name` (`tests/e2e/fixtures/type-roles.ts:595`). No `@container` rule exists in `src`. | build new: a narrow-width rule |
| Home at 240 px | `pinned-hero.module.css`: `.hero { flex: none }` above `.scroller { overflow-y: auto }` at every width (#633); the token page shares it. `rows.test.ts:1259-1360` pins the hero at 360 and 480 px. | adapt in `general.vue`'s own module |
| Onboarding at 240 px | `src/onboarding/onboarding.scss` `body { min-width: 320px }`; `StepIndicator.vue` grid `repeat(4, 1fr)`; `type-roles.test.ts:1115` runs onboarding create with `narrow: false`. | adapt; gate every route |

Search trail for the absences: `different address`, `network-?menu|NetworkPicker|NetworkSelect|network-?switcher`, `@container|container-type|IntersectionObserver|collaps` (Home path), `\b240\b|sidePanel|narrow|compact` in `src`.

## Measured (Chrome, armed smoke build, base)

| Width | Row content | Label room with the address whole | Chip | Hero | Scroller |
|---|---|---|---|---|---|
| 360 | 320 (24/16 padding, 12 gap) | 89.6 | 69.3 (Alpha) | 222 | 314 |
| 320 | 292 (16/12, 8 gap, chip sides 3) | 77.6 | 57.3 | 227 | 309 |
| 240 | 212 | none: the chip shrinks to its dot | 15.6 | 241 | 295 |

- Name widths in the chip's role: Alpha 39.3, Testnet 53.1, Local Network 100.9. So "LOCAL N…" at 360 px is the row, not the 120 px cap: with the address whole the row is 11.3 px short. At 320 px Alpha and Testnet fit beside the address; Local Network does not.
- The address is 107.4 px (13 `data-lead` characters at 7.8 px, plus 6 px for the copy icon); avatar 34; lock 29.
- At 240 px with the account column gone and 3 px chip sides, Local Network fits with 4 px to spare; with 8 px sides it is 7.9 px short.
- Onboarding at 240 × 700: `body` is 320 px wide, `scrollWidth` 320 against `clientWidth` 240.

## The pictures the owner signed against

The option frames on page 93 came from a capture branch with throwaway prototypes. They fix the readings this plan takes:
- P93-02 D: the switch toast with the line as its sub; Receive with "Your address on Local Network" in grey under the address.
- P93-25 B: the whole card greyed in place (title, count, rows), Hide still dark, Holdings' bars loading below.
- P93-41 C: the toast "Now using Account 2" with the header on Account 2.
- P93-44 C: at 360 the chip reads "LOCAL NETWORK" whole beside a whole address; at 240 the avatar, then the chip with the whole name, then the lock, with no account name or address. The Manage Networks prototype put the word under the active network's name. Both frames overflow the row's right padding (the lock sits 5.5 px from the edge at 360, 6 px at 240), so the prototype found no room; it did not make it.
- P93-62 B: at 360 Home as today (pinned hero, shadow); at 240 Home scrolled with the hero gone off the top, and onboarding's step bar in two rows of two.

## Collisions

- `fu2-onboarding-1` changes the onboarding pages (a phrase check, create and done copy). Whichever lands second runs arc 2's onboarding gate over the other's pages.
- `fu2-send-1` (P93-08) changes Home's in-flight rows; `wrap-3` changes long network names elsewhere. No shared file with arc 1 but `general.vue`.
