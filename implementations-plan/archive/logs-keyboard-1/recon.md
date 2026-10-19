# logs-keyboard-1: recon

One Explore sweep (Sonnet) at `d0551f7a`, verified by the driver, plus one browser spike (below).

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Close a panel on Tab or focus leaving | None closes on Tab. `ToastManagerBase.vue:94-136` has the only `focusout` + `relatedTarget` check; `DropdownRoot.vue:155-185` and `Popup.vue:65-100` trap Tab (the opposite). Searched `focusout\|relatedTarget\|"Tab"\|shiftKey\|focusin\|focus-trap` over `apps/extension/src`, `packages/design/src` | build new, in `Popover.vue` |
| Remember the trigger's control | `Popover.vue:51-52,71-72` keeps `opener`, read before the content mounts; Escape uses it (`:58-65`) | reuse as is |
| Toggle row as a native control | `ImportContactsPopup.vue:220` and `AccountSelectRow.vue:59` bind `aria-pressed` on a button; the design `Checkbox` is a `div role="checkbox"` drawing an 18 px box (`packages/design/src/ui/Checkbox.vue`), unlike the rows' 12 px `square`/`square-check` glyph | adapt: `Flex tag="button"` + `aria-pressed`, as the toolbar's triggers |
| Refuse a held Enter | `refuseRepeatEnter` (`apps/extension/src/composables/usePopupEntity.ts:7`), used by `DappApprovalFooter.vue:60` | reuse as is |
| Focus into the panel on open | Source: the design `Input`'s `autofocus` focuses on every mount (`Input.vue:168-172`); Level: nothing | build new, in `Popover.vue` |
| Tabbable query | No helper in source; the test-local `nativeTab` (`Popup.snackbar.test.ts:35-42`) uses `button, a[href], input, [tabindex]`, `tabIndex >= 0`, not `:disabled`. `tabbable` is only a transitive dependency of `focus-trap` (`bun.lock`); `@nulo/design` declares neither | build new, local to `Popover.vue` |
| Row focus ring | Each component declares its own; inset rows use `outline-offset: -2px` (`settings-row.module.css:35`, `SettingItem.vue:223`) | adapt |
| E2E probes | `helpers/pointer-probes.ts`: `activeTestId`, `waitForFocus`, `tabTo`, `pressEscape`, `focusRing`, `tokenColor`; `viewers-csp.test.ts:430-487`: `expectAccentRing`, `tabStep`, `openAndEscape`, `openLogs` | reuse as is |

## Facts the plan rests on

- `Popover` has one consumer, `LogsToolbar.vue:38` (auto-registered through `apps/extension/scripts/design-resolver.ts:25`); the rest are its story, test and `mount-all.test.ts`.
- `#popover` precedes the header and the routed window in the app shell's DOM (`apps/extension/src/popup/app.vue:545,558,574`), so a panel's controls sit before the toolbar in DOM order (the sweep had it after the app root; the driver corrected it).
- The toolbar's Tab order is Source, Level, more; after more comes the CodeMirror host (shadow DOM, `LogsViewer.vue:293-305`).
- `.filter_content_item` also styles the more menu's two `DropdownItem`s (`LogsToolbar.vue:130,136`).
- `closePopover("source")` clears the search on every close (`useLogFilters.ts:91-94`); `selectAll` inverts `allOptionsSelected[kind]` (`:81-86`).
- The only logs e2e is `viewers-csp.test.ts`; lane viewer-flake-1 (#849) edits the same file.
- No closed `known-limit` issue covers this area (`gh issue list --state closed --label known-limit --search "popover OR logs filter OR tab order"`).

## Spike: the hand-off in a real browser

A scratch page (prev, trigger, next, then a panel of two buttons at the end of the body) under Puppeteer 25.8 on Chrome 152 and Firefox (BiDi), headless, both alike:

- Focusing the trigger inside the Tab keydown, without `preventDefault()`, moves focus on to `next`, even with a microtask hiding the panel before the default action.
- Shift+Tab with `preventDefault()` and the trigger focused leaves focus on the trigger.
- A panel control focused by script after Enter on the trigger matches `:focus-visible`; after a mouse click on the trigger it does not.
