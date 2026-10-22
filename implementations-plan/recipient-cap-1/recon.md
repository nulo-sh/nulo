# recipient-cap-1 recon

Base: `origin/dev` at `5c35ca934`. Two read-only explorers (sonnet), each claim checked against the tree by the planner.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Cap a list and say how many are left | `apps/extension/src/popup/windows/execute/call-surface.ts:55,68-70` (`MAX_ARG_ROWS`, `{ rows, hidden }`), rendered by `CallArguments.vue:168-170` as `<Text variant="meta" color="tertiary">+N more …</Text>`; `utils/token-order.ts:13,86-89` `capTokenRows` returns `{ shown, overflow }` (Home's three rows, no count printed) | adapt: a `slice` beside its one caller; no shared helper (two existing caps, different shapes, no third caller) |
| Window a list (render only the rows in view) | none. Searched `virtual-scroll`, `vue-virtual`, `useVirtualList`, `virtual-list`, `tanstack/vue-virtual`, `@vueuse`, `virtuali[sz]`, `windowing`, `IntersectionObserver`, `content-visibility` over `apps/`, `packages/`, every `package.json` and `bun.lock`. `@vueuse/core` is no dependency of `apps/extension` (only an optional peer of `unplugin-auto-import`, `bun.lock:2384`) | build new, only if picked: list-perf-1's committed design (`worktree-list-perf-1` at `1a4231073`, Phase 2: `suggestion-window.ts`, `::before`/`::after` spacers, `aria-setsize`/`aria-posinset`) is the reference |
| Count wording and plurals | no `pluralize`, `formatCount` or `Intl.PluralRules` under `apps/extension/src` or `packages/design`; `components/stale-network/copy.ts:11` writes both forms by hand | build new: an inline ternary |
| A status line next to a listbox | none: `RecipientField.vue` is the only `role="listbox"`/`option`/`combobox` (`:234,238,254,267`); live regions exist at `StatusCard.vue:11` and `GetStartedCard.vue:29` | build new: the line sits outside the listbox (a listbox owns only `option`/`group`) |
| Type role for a secondary line | `caption` + `tertiary` for hints (`FeeCostReadout.vue:82`, `FeeSettingsCard.vue:457`); `meta` is mono, kept for addresses | reuse `caption` |
| Seeding many contacts in e2e | `tests/e2e/send-keyboard.test.ts:26-42` writes plaintext rows in one `chrome.storage.local.set`; `sealed-storage.test.ts:56-64` writes 2,000; the contact service reads legacy plaintext rows until the next unlock seals them (`wallet/services/contact/service.ts:60-76`, `wallet/storage/sealed-entity-storage.ts:117-118`) | reuse |
| Shots in both themes | `tests/e2e/fixtures/shots.ts` (`shotSend`, `settleThemeTransitions`; opt-in by `NULO_E2E_SHOT_DIR`) | reuse |

## Facts the plan rests on

- Candidates are `[...contacts, ...appStore.accounts]` (`apps/extension/src/popup/pages/send.vue:225`); `matchRecipients` keeps that order (`recipient-search.ts:12-18`) and is called only from `RecipientField.vue:50`. A cap on the first N therefore drops the profile's own accounts first when contacts fill it.
- The listbox is also the absolutely positioned box (`RecipientField.vue:247-258`, `.contacts_wrapper` `:307-319`, `max-height: 160px` with `box-sizing: border-box`, `packages/design/src/base.css:213`), so a line outside the listbox needs a wrapper that takes the position and the border.
- `moveHighlight` wraps over the rows it is given and scrolls the target with `scrollIntoView({ block: "nearest" })` (`RecipientField.vue:153-160`); Enter with no highlight picks row 0 (`:163-170`).
- The fade is 0.15 s (`base.css:297-305`).
- The popup is 360 × 600 (`base.css:68-69`); e2e opens it at that viewport (`tests/e2e/fixtures/wallet-pages.ts:140`).

## Tests that see the list

- `RecipientField.test.ts`: every case uses two to four candidates; counts at `:56`, `:64`, `:271-274`, `:341`; wrap and last-row cases at `:278-301`, `:345-360`. A cap of four or more rows breaks none of them.
- Smoke `send-keyboard.test.ts:117-167`: three contacts plus "Account 1" ("four rows, more than the list shows"); asserts `rows: 4, scrolls: true`, Up wraps to row 3 and scrolls it into view, a held Enter picks once, the scrolling list is no Tab stop. `type-roles.test.ts:975-995` types "Ali" and sweeps the field's roles. No network spec counts suggestions.
- The bans: `copy-dash-ban.test.ts` refuses `/\S\s*—\s*\S/` in template text; `red-text-ban.test.ts` refuses red on text; `type-role-ban.test.ts` refuses a face, case, tracking or a size outside a role (its reviewed list is `{}`), and a `trimAddress(` outside a mono role (`scripts/type-roles/identifier-sites.expected.json` lists this file's one site).

## Collisions

- **list-perf-1** (`worktree-list-perf-1`, plan committed at `1a4231073`, Codex approve r3, awaiting the orchestrator) plans #1037 too: its Phase 2 windows this same list as "no UI change", with `Closes #1037`, and adds a smoke scenario to `send-keyboard.test.ts`. The two plans cannot both close #1037.
- **#1027** (ui-cosmetics-1, draft) edits `packages/design/src/core/Icon.vue`, not `RecipientField.vue`; `RecipientField.vue` renders no `Icon` in its rows (the warning icon sits in the invalid hint). No file overlap with this lane.
- **#1026** and **#1063** touch no file this lane edits.
- Closed known limits searched: `gh issue list --state closed --label known-limit --search "recipient"`: #704 (type roles of a tx sender, unrelated) and #640 (ellipsis selection, unrelated).
