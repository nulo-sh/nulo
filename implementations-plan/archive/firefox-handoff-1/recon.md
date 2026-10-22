# firefox-handoff-1: recon

Base `dev` @ `1362efab8` (#964 merged). One Explore sweep (sonnet) over eight capabilities, then a read of the files it named. Paths are under `apps/extension/` unless they start with `packages/`.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Panel hand-off to a window | `src/utils/own-window.ts`: `OWN_WINDOW_ROUTES` (:17), `captureOwnWindow` (:46), per-flow session key `nulo:own-window:<flow>` (:37), `leavePanelFor` (:194), `closeOwnWindow` (:200), `postAuthRoute` (:130); `openOwnWindow` already reads the panel's browser window as `anchor` (:151) | reuse; add card mode, the opener id, the record |
| Reopen the panel after a window | `src/wallet/utils/toolbar-popup.ts`: `openToolbarPopup` (:26, a refusal is a debug line), `armPopupReturn` + `focusReturns` (:71-101, waits up to `POPUP_RETURN_FOCUS_MS` = 3 s for the target window's focus), `OPEN_TOOLBAR_POPUP` handler with a sender check (:54-64), registered in `src/wallet/index.ts:42` | adapt: share `focusReturns`, add one message beside the existing one |
| A landing page for the next panel open | none: `default_popup` is `src/popup/index.html#/popup/general` (`manifest/manifest.config.ts:26`); `postAuthRoute` returns `pageAwaitingAuth \|\| ownRoute \|\| Home`. Searched `setPopup`, `pendingRoute`, `landingRoute`, `resumeRoute`, `initialRoute` | build new (the record) |
| One-shot read | none atomic; `restore-outcome.ts:38` locks a local read-modify-write; `own-window.ts` get-then-remove at :114 and :181. Searched `consume`, `takeOnce`, `one-shot` | build new, get then remove |
| Session key registration | `stored-shapes.scan.test.ts:21-60` `NOT_LOCAL_STORAGE`: the `nulo:own-window:` prefix is owned by `own-window.ts`; message types are `kind: "message"` (`nulo:open-toolbar-popup`) | reuse the prefix; register the message |
| Header-less window | `Header.vue:171` hides on `route.meta.hideHeader`; `accounts/import.vue` and `restore-again.vue` set `hideHeader` and `showBottomNav: false`; Contacts sets neither | adapt: hide the header in a card window |
| A card | `StatusCard.vue` (spinner, no actions), `PasskeyScreen.vue` (passkey glyph, hero title), `TakeoverLayout.vue` (full takeover): none matches the picked picture (`p79-ho-card`: icon, title, line, two buttons) | build new L3 `HandoffCard.vue`, type roles as `StatusCard` |
| Snack replay | `packages/design/src/composables/toast.ts`: a module singleton `toast` ref; `toast-call-sites.test.ts` accepts one object literal whose kind is a literal or a ternary of two | reuse; read the snack on screen, replay with a ternary kind |
| The three flows | contacts `useContactImportExport.ts:158-221` (pick, selection popup via the global `PopupManager`, writes, outcome snack :438-463); account import `accounts/import.vue:64-152` (pick, password, preview, name, confirm, then Accounts); Restore again `useRestoreAgain.ts:108-223` (pick, decrypt, restore, done snack, `end` → `leave`) | adapt each page; flows unchanged |

## Conventions to match

- Own-window logic lives only in `own-window.ts`; pages import from it. A refusal (focus, `openPopup`, a registration) is a `console.debug`, never an error.
- Background message handlers register at module scope (a message that wakes the background reaches only its first run's listeners) and take window ids from the sender, never from trust in the message alone.
- Page tests mock `@/utils/own-window` with `importOriginal` and `vi.fn`s; e2e selects by `data-testid` only.

## Collisions

- #889 (`firefox-sidebar-1-a1`, open): edits `browser-surface.ts` and `app.vue`; with "Open as Side Panel" on, the toolbar button has no popup, so no panel hand-off starts. Merge `origin/dev` before the PR if it lands first.
- #986 (draft): every page down to 240 px; the card window is 380 px and never the sidebar.
- `forgetThisWindow` (`own-window.ts:78`) removes only flow keys: the record's key must not be a flow key.
- `followOwnRoute` releases a flow on any route but the flow's and the lock screen's: a card window must not navigate before it hands back.
- `pickFile` (`src/utils/files.ts:105`) clicks 50 ms after the press for contacts (`delay`); #964's Mac check passed with it.
