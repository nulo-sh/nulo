# fit-gate-1 recon

Base: `origin/dev` at `60ecd6cc3` (fit-240-2's #1025 included). One Explore sweep (sonnet), a scratch probe of the 240 px pass on both browsers, and a gutter measurement. The probe was a logging-only patch to `fixtures/type-roles.ts`, never committed.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| The 240 px pass | `expectFitsNarrow` → `expectFits` → `expectLaidOut` + `expectInsideView`, then `textFates` (`apps/extension/tests/e2e/fixtures/type-roles.ts:541-756`) | adapt: the two readers this issue names |
| A reviewed, content-keyed list with a reason per entry | `NARROW_ACCEPTED` and `FLOOR_EXCEPTIONS` (`{ testid, why }`, matched by the nearest `data-testid`); no test pins either list's entries as still used | reuse the shape only if an entry exists (D1) |
| A planted page that proves a gate | `FATES_HTML` / `FATES_STYLES` test (`apps/extension/tests/e2e/type-roles.test.ts:302-360`): a fixed host on Home, CSSOM styles (CSP refuses parsed `style=`), removed in `finally` | reuse the pattern |
| A scroller test in the readers | `overflowX` `auto\|scroll` in `pastBox` (`type-roles.ts:170`), `scrolledInView` (`:545`), `textFates`' `scrolls` (`:606`); `clippingAncestors` (`:182`) counts any `overflowX !== "visible"` | adapt `scrolledInView` and `span` |
| A model of a 17 px classic scrollbar | `CLASSIC_SCROLLBAR_PX` + `widestWordOverruns` (`security-backup.test.ts:13-47`, padding added to the `scrollbar-gutter: stable` ancestor) | not used (D3) |
| Shadow-root traversal in the gate | none (search: `shadowRoot\|attachShadow` under `tests/`); the logs check reads the editor's box inside its shadow root itself (`viewers-csp.test.ts:608-650`) | keep the light DOM only (D2) |
| The narrow layout pattern for a row whose trailing box does not fit | Developer → Notes' card header (`notes/index.vue`, #986): `flex-wrap: wrap; row-gap: 6px`, the trailing box `margin-left: auto`, under `@media (width < 359px)` | reuse for both fits |

## Scrollers in the source

- No source rule sets `overflow-x: auto|scroll` or `overflow-inline` alone; every scroller comes from the `overflow: auto` shorthand or `overflow-y` (search: `overflow(-x|-y|-inline|-block)?\s*:` over `apps/extension/src` and `packages/*/src`, `*.vue|css|ts|tsx`; inline `:style` hits are stories and tests only).
- Every light-DOM scroller is vertical by intent: page wrappers (`CollapsingHeroLayout` `collapsing-hero-scroller`, `settings-page.module.css`, `settings/index.vue`, `holdings.vue`, `send.vue`, `detail-page.module.css`, `activity.vue`, `auth.vue`, `window-shell.module.css` `.scroll_area`), `pinned-hero` `home-scroller`, `TakeoverLayout`, `PasskeyScreen`, `LegalAcceptanceSheet`, `legal/declined.vue`, `PopupCard`'s `.wrapper`, four lists (`ImportContactsPopup`, `RecipientField`, `StaleNetworkConfirm`, `LogsToolbar`'s source list), and the JSON viewer's host (`JsonViewer.vue:134`, its editor at 100%). Each computes `overflow-x: auto` because its `overflow-y` is `auto`.
- Sideways on purpose: the CodeMirror `.cm-scroller` of the logs viewer (`logs-editor`) and the JSON viewer (`json-editor`), each inside a shadow root (`.cm-line` is `white-space: pre`).
- The capabilities Details table is no scroller: it sits in `cap-scroll-area` and its narrow grid shrinks its mark columns to 15 px before it would overflow (`DetailsTable.vue:186-189`).

## Scrollbars

- `packages/design/src/base.css:217-226` sets `* { scrollbar-width: none }` and `*::-webkit-scrollbar { display: none }`; `base.css.test.ts` pins the file by hash and names that rule. The viewers' shadow CSS repeats it.
- Measured with classic scrollbars forced (Chrome 152 without Puppeteer's default `--hide-scrollbars`; Firefox 153 with `ui.useOverlayScrollbars` 0), a 240 px `overflow: auto; scrollbar-gutter: stable` box: 15 px / 12 px taken without the rule, **0 px with it**; a `scrollbar-width: thin` box still takes 10 px / 6 px. Only `LogsToolbar.vue:224` opts into `thin`: with classic scrollbars forced in the logs window's 240 px test, its source list's bar takes 10 / 6 px (client 174 / 178 of 184), every row fits (`scrollWidth` = `clientWidth`), and the test passes on both browsers.
- Puppeteer 25.8.0 adds `--hide-scrollbars` in headless (`ChromeLauncher.js:204`); the Firefox launch sets no scrollbar pref.

## The probe at 240 px (every file that calls the pass, retry 0)

Smoke: `type-roles`, `rows`, `legal-acceptance`, `restore-outcome`, `registration`, `viewers-csp` (61 narrow checks per browser). Network (proverless, `e2e:agent`): `type-roles-windows`, `in-flight-send-guard`, `cancel-mid-prove` (23 per browser). All green, as on `dev`.

A light-DOM element with `overflow-x` `auto|scroll` and `scrollWidth > clientWidth`, identical on Chrome and Firefox:

| Surface | Scroller | scrollWidth / clientWidth | What sits past its edge |
|---|---|---|---|
| Token metadata popup (`token-menu-metadata`) | `PopupCard`'s `.wrapper` | 243 / 240 | two capability icons (`square-cross`, 12 px), right edge 242.6: the rows whose key is `hasPrivateToPublicTransfers` / `hasPublicToPrivateTransfers` |
| Developer → Account state → Senders | the settings page wrapper | 259 / 240 | a `sender-row`'s copy and delete actions (56 px), right edge 259.4 |

- The logs window's `.cm-scroller` scrolls sideways (1615 / 238 Chrome, 1616 / 232 Firefox), inside its shadow root.
- fit-240-2's six checks (`backup-imported-account`, `passkey-backup`, `security-backup`, on `60ecd6cc3`): no sideways scroller and no excused box, on both browsers.
- Boxes past the view that `scrolledInView` excuses (Chrome smoke): the two token-metadata icons only, both on the right; nothing on the left, nothing hidden.
- A 17 px gutter modelled on every vertical scroller (Chrome smoke): 13 of 56 checks would turn red (an activity title row, contact addresses, the chosen recipient). Moot: no gutter is ever drawn (§ Scrollbars).

## Open work and collisions

- #1023 is the issue. #1022's backup half landed as #1025 (fit-240-2): `backup-imported-account`, `passkey-backup` and `security-backup` call `expectFitsNarrow` and must pass under the repaired rule unedited. #1022's hand-off windows belong to firefox-handoff-1.
- Known limits read: #625 (a 32-character token symbol can widen a send or receive row), #1005 (a placeholder below 360 px). Neither collides.
