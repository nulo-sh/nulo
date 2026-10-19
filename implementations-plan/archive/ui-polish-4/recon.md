# ui-polish-4 recon

Read at `dev` @ `993b3efc`. One Explore sweep (sonnet) plus the driver's own reads; paths are repo-relative.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| A `Flex` div trigger made a native button with the accent ring | `apps/extension/src/popup/components/modules/send/FeeMethodSelector.vue:44-50,74-84` (`Flex tag="button" type="button"`, `font: inherit`, `outline: 2px solid var(--nulo-accent); outline-offset: 2px` on `:focus-visible`); #827 (open) does the same for Home's Send and Receive | reuse the shape |
| The ring itself | `packages/design/src/ui/Button.vue:185-188`, same two declarations. No shared ring class or token: searched `focus-ring`, `focus-visible`, `outline: 2px`, `--nulo-accent` in `packages/design/src/*.css` | copy the two declarations, as every consumer does |
| `Flex`'s element | `packages/design/src/core/Flex.vue:10-50,79`: `tag` prop, `<component :is="tag">`; `type`, `aria-label` and `data-testid` fall through | reuse |
| An icon-only menu trigger's accessible name | `<button type="button" aria-label="Contact actions">` (`settings/contacts/index.vue:150`), "Token actions" (`tokens/[id].vue:246`), "Session actions", "Authwit actions" | adapt: `aria-label="Log actions"` |
| Dropdown keyboard | `apps/extension/src/components/ui/Dropdown/DropdownRoot.vue`: the slot sits in `<div id="trigger" @click="toggleDropdown">` (`:268`), so a native button's key-made click toggles it; the outside handler skips a path through `#trigger` (`:87-94`) and listens on `mousedown`; Escape `preventDefault` + close, Arrow keys rove `[data-dropdown-item]` (`:223-263`); `focus-trap` with `initialFocus: false` and its default `returnFocusOnDeactivate` | reuse as is |
| Popover keyboard | `packages/design/src/ui/Popover.vue`: opened by the host's `open` prop; Escape closes through a document listener (`:56-58`); no focus trap, no focus return; `useOutside` on `mousedown` only, so a key-made click on the trigger is not "outside". Only consumer: `LogsToolbar.vue` | reuse as is (D2) |
| Body-role menu item | the export item, `LogsToolbar.vue:119-124` (`Icon size 12`, `gap 8`, `Text variant="body"`); `DropdownItem.vue` composes `type--row-title` at 13 px, which bare text takes | reuse its shape for Clear logs |
| Close's look | `Button.vue:150-170` `.wrapper` (`position: relative; overflow: hidden; transition: all 0.2s ease`), `:387-396` `cta_outline` (no `:active` rule); the override is `SecretCountdownClose.vue:54-66`, its class on `:30`; no other reference but `SecretCountdownClose.test.ts:86` | delete the rule and the class |
| The progress bar's clip | `.progress_bar` is absolute in the Button's `position: relative; overflow: hidden` | unchanged |
| Holdings' unknown total | `holdings.vue:102-103` (`unavailable` → `"—"`), `:116-121` `summaryMeta`, `:197` `aria-hidden` on the dash; `.summary_meta` keeps `min-height: 1lh` (`:282-287`). Home: `BalanceView.vue:153-157,276` prints `—` for an unread list. No shared dash constant (searched `EMPTY_VALUE`, `EM_DASH`, `NO_VALUE`, `"—"`) | adapt: the error state joins the dash branch |
| Snapshot states | `useTokenBalanceSnapshot.ts:7,102-104`: `unavailable` only before a first load; live adds and unseen updates still push rows meanwhile (`:52-71`) | a fact the fix must honour |
| Keyboard e2e helpers | `tests/e2e/helpers/pointer-probes.ts`: `tabTo`, `tabAround`, `activeTestId`, `waitForFocus`, `pressEscape`, `focusRing`, `tokenColor`; prior users `send-keyboard.test.ts`, `keyboard-guards.test.ts` | reuse |
| Pictures | `shotSend` (`tests/e2e/fixtures/send-page.ts:224-250`, opt-in `NULO_E2E_SHOT_DIR`, both themes; the directory must exist); 400x600 captures by a scratch spec copied into `tests/e2e/` for the run only (hygiene-3 phase-3, p42-followups-1 phase-1) | reuse the method |
| Type-role ban | `font: inherit` passes (`type-role-ban.test.ts:141-169`; `FeeMethodSelector.vue:76` ships it); `type-role-ban.reviewed.json` is `{}` | no baseline change |

## Tests that read these surfaces

- Unit: `LogsToolbar.test.ts` (clicks `logs-more-trigger`, reads the items), `SecretCountdownClose.test.ts` (`:86` asserts the `countdown_cta` class), `holdings.test.ts` (error cases `:257-310` assert only `holdings-error`), `Dropdown.test.ts`, `Popover.test.ts`.
- Smoke e2e: `viewers-csp.test.ts` is the only logs-window spec (`logs-more-trigger`, `logs-export-csv`, `logs-clear`; no filter testids). The recovery-phrase page is reached by `keyboard-guards.test.ts:81`, `legal-acceptance.test.ts:121` and `import-paths.test.ts:60`; none selects `close-btn`. Holdings: `holdings-add-token.test.ts`, `token-list.test.ts` (smoke), `network/holdings.test.ts`; none reaches the error state or the summary testids.

## Collisions

- #827 (`popup-fixes-1-a2`, open): Home's actions and token rows; no file in common.
- ui-dedupe-2 edits Holdings' row mirror (#839): this lane touches only the summary in `holdings.vue`.
- Closed known limits searched (`logs`, `holdings`, `recovery phrase close`, `keyboard popover`): #724 (Holdings' skeleton across a worker restart) is adjacent and unchanged.
