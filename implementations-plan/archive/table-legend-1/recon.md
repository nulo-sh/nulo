# table-legend-1 recon

Read by the planner at `449baa5ec`, no agents (one component).

- `apps/extension/src/components/composite/capabilities/DetailsTable.vue`: `COLUMNS` holds `[key, glyph, has]` for six columns (`play`, `add`, `send`, `search`, `mail-lock`, `code` since #1835); the head is `aria-hidden`; each row's `RowTarget` is labelled by a hidden span reading "{name}: {keys}" in lower case; the footnote shows unless `foot` is false. The narrow drawing is an `@container details-table (width < 330px)` rule in which `.table > *` spans the whole grid.
- Callers: the capabilities window (`popup/windows/capabilities/index.vue`, folded, footnote on) and the connected app page (`popup/pages/settings/connected-apps/[id].vue`, `bare`, footnote only when a row lists a function name). On the page the table is the last element.
- The prototype `c09ff1da9` (never pushed) drew E2 as a `type--caption` flex row of 12 px glyphs and words under the rows, `aria-hidden`, keyed off a capture-only `look()` switch and a `COLUMN_WORDS` map.
- Tests reading the table: `DetailsTable.test.ts`, the window's `index.test.ts` (S1 and the spoken-row cases), the page's `[id].test.ts` (Permissions). All mount the real `Icon` and use wire-shaped addresses.
- E2e reading the table: network `cap-window.test.ts` (the window; its 12 px scroll pin has Details closed), `type-roles-windows.test.ts` (the window and the page). `connect-check-window`, `connect-every-site`, `connect-verify-mismatch` read the page above the table; smoke `type-roles.test.ts` sweeps the connected-apps list.
- The capture kit: local branch `worktree-connected-app-2` at `782858322`, `apps/extension/capture/ca2/` (Vite over the app's config with four client fakes, puppeteer at 400 px, 2x, port claimed in the registry).
