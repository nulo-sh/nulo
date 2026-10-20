# square-corners-1: recon

Base: `dev` @ `e6a68cd5`. One Explore agent (Sonnet) plus the planner's own reads. Search trail for every absence claim is in the row.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| The notice card's shape | `apps/extension/src/components/NotificationManager.vue:109-118`, `.card { … border-radius: 16px; }`, a local literal. Mounted by `popup/app.vue:578` and `onboarding/app.vue:105`; every `notificationStore.create` caller renders it (popup `pages/import.vue:139`, `pages/profile/new.vue:75`; onboarding `pages/import.vue:103,113`, `pages/create.vue:63`). | adapt: delete the declaration |
| A radius or shape token | none. `grep -rnE "radius\|shape"` over `packages/design/src` (`tokens.ts`, `token-contract.ts`, `base.css`, `utilities.css`, `internal/`): no hit. | none needed for arc 1 |
| A written "no rounded corners" rule | none in docs. `grep -rniE "rounded\|radius\|brutalist\|square corner"` over `*.md` (CHANGELOG, node_modules, archive excluded): only `CLAUDE.md`'s `BrutalistTitle`. One code comment: `components/composite/general/AccountAvatar.vue:19` "Brutalist: a flat grey square (no color, no rounded corners)". Practice: 15 explicit `border-radius: 0` (Button's seven variants, Input, the popups' shared sheet, ReceivePopup, RevokeAuthwitsPopup, EmojiGrid, ActionButtonsView, two developer pages). | cite in OA-1 |
| Seeing the radius in a component test | unavailable under the current config: `apps/extension/vitest.config.ts:31-33` processes CSS only for `JsonViewer/editor-shadow.css`, so `$style.card` reaches jsdom with no rule. jsdom itself computes a stylesheet radius (Codex probe: `16px`); enabling it means CSS config and a mount for one invariant. `a11y-css.test.ts:1-4` pins rules in their sources. No component test reads an applied style; the three `getComputedStyle` uses mock it. | rejected (D2) |
| A source reader for style guards | `apps/extension/scripts/type-roles/source-scan.ts`: `parseSource(file, source?)` (`.vue` through `@vue/compiler-sfc`, each `<style>` a postcss root), `walkElements`, `staticAttr`, `boundAttr`, `enclosingRule`, `resolveSelector`, `REPO_ROOT`. Used by `red-text-ban`, `type-role-ban`, `copy-dash-ban`, `a11y-css`. | reuse as is |
| A tree-wide ban with a reviewed list | `apps/extension/src/utils/red-text-ban.test.ts`: `sourceFiles(POLICY)`, a stylesheet pass over `walkDecls`, an inline `REVIEWED: {file, text, why}[]` matched as a multiset, `open` and `stale` both asserted empty, a `test.each` of positive and negative snippets. | the model for OA-1's proposed guard; not built in arc 1 (lane brief) |
| Theme flips in pictures | `apps/extension/tests/e2e/fixtures/shots.ts:7` `settleThemeTransitions`: waits out the 0.2 s colour fades a flip starts. | reuse as is |
| An awaiting card in a smoke launch | `tests/e2e/helpers/activity-seeds.ts:260` `seedJournalRecord` writes terminal records only (`terminalAt: at`, stage `failed`/`cancelled`); awaiting cards need `terminalAt === null` (`RecentActivityView.vue:327`); the Focus button also needs an approval window (`TransactionAwaitingCard.vue:57`), Cancel only a stage before `submitting`. | write a scratch row, do not widen the helper |
| A capture harness for the notice | `~/.cache/nulo-backlog/exists-notice-1/capture/` (scratch, outside the repo): a vitest config over `vitest.e2e.config.ts`, a spec that registers a passkey profile, locks, imports the same passkey and shoots the notice at 400x600 in both themes. Onboarding's notice: `tests/e2e/import-errors-scroll.test.ts:56-75` (`onErrorsScreen`, a full-backup import with one unrestored network, "Import completed with errors"). | adapt into this lane's scratch dir |

## The issue's claims against the tree

#928's values and files hold; four of its line numbers drifted, and its count is eight declarations in six files besides the card. It misses the JSON viewer's editor theme (below).

| Surface | Issue says | Tree (`e6a68cd5`) | What the radius rounds |
|---|---|---|---|
| Notice card | `NotificationManager.vue:115`, 16px | holds | the card |
| Popover | `Popover.vue:126`, 10px | `packages/design/src/ui/Popover.vue:194`, 10px | the panel; its only users are the logs viewer's filter menus (`LogsToolbar.vue`, `LogsViewer.vue`) |
| Window shell | `window-shell.module.css:38`, 8px | holds | the bordered frame of the logs and JSON windows (`popup/windows/logger`, `popup/windows/json`, through `composes`) |
| JSON viewer | `JsonViewer.vue:146`, `:166`, 5px | holds | the copy icon, on hover, white at 10%, so visible in dark only (`:153`); the full-screen icon renders only with `requestId` (`:104`), which no mount passes: dormant. The viewer opens from the import error viewer, restore-again, revoke authwits, the developer pages (`DataViewerPopup`) and the JSON window |
| Logs toolbar | `LogsToolbar.vue:148`, `:191` | `:173` (6px, `.filter_button`, bordered), `:222` (4px, `.filter_content_item`) | the Source, Level and Log actions (⋯) buttons; each row in their menus, Export CSV and Clear logs included (`:136-149`) |
| Awaiting card | `TransactionAwaitingCard.vue:167`, 4px | holds | the focus ring of its Focus and Cancel buttons (`.action_btn:focus-visible`) |
| Boot banner | `popup/app.vue:613`, 4px | `popup/app.vue:644` | the bordered RETRY button shown when the wallet cannot start |

Out of scope, as the issue says: `Spinner.vue:40` (100px on a fixed box, a circle) and the DevTools banner string at `popup/app.vue:516` (24px, a `console.log` `%c` style, never drawn in the wallet). Also circles, not in the issue: the scroll button `LogsViewer.vue:345`, the badges `TransactionCardLayout.vue:222` and `PasskeyScreen.vue:180`, the dots `GasBalanceCard.vue:199`, `TokensView.vue:445`, `settings/developer/index.vue:215`, `settings/networks/index.vue:99` (all 50%). No SVG `rx`/`ry` and no `:style` radius (grep `\brx=\|\bry=`). A case-sensitive grep for `radius` in `.ts`/`.js` missed camelCase: `components/JsonViewer/creator.js` sets eleven live `borderRadius` values in the CodeMirror themes (found by the Opus audit, `grep -in radius`):

| `creator.js` | Value | Drawn? |
|---|---|---|
| `:95` `.cm-selectionMatch` | 2px | yes: the outline on other matches of a selected word (`highlightSelectionMatches()`, `JsonViewer.vue:59`) |
| `:103` `.cm-panel.cm-search`, `:107` `.cm-textfield`, `:111` `.cm-button` | 6px, 3px, 3px | yes: the JSON viewer's search box (Ctrl/Cmd-F, `searchKeymap`, `:61`) |
| `:26` cursor, `:125`/`:138`/`:182` autocomplete, `:200`/`:214` lint | 5px, 6px, 4px, 5px, 6px, 4px | no: `drawSelection` is off, autocomplete and lint are not loaded |
| `:265` the logs scrollbar thumb | 4px | no in Chrome: the scroller sets `scrollbar-width` (`:253`), which wins over `::-webkit-scrollbar` |

The editor library's own base theme also rounds `.cm-button` by 1px (`@codemirror/view` 6.43.9, `dist/index.cjs:7054`; found by Codex). The JSON theme overrides it (3px); the logs theme does not, so the logs window's search buttons are 1px today, and deleting the JSON override leaves 1px, so squaring needs an explicit `0`. Outside the wallet: landing's three 50% dots; `apps/extension/store/templates/` artwork (not shipped UI).

## Open work and neighbours

- #915 (exists-notice-1, open) changes the notice's words, not `NotificationManager.vue`; its report routed the corners here. No shared file.
- #743 (onboarding-3) edits onboarding pages; not `NotificationManager.vue` or `onboarding/app.vue`'s mount. No shared file with arc 1.
- viewer-followups-1 works in `LogsViewer.vue` and `viewers-csp.test.ts`; OA-1's logs surfaces sit beside it (`LogsToolbar.vue`, `JsonViewer.vue`). Relevant to a later arc, not arc 1.
- `gh issue list --state closed --label known-limit --search "radius corner rounded"`: none.
