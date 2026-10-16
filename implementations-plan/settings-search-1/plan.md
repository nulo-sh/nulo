---
plan: settings-search-1
tier: light
status: closed; delivered in one PR against dev; OA-1 to OA-5 ship their what-ships-now lines
issues: "#591 (closes)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); one Codex audit (gpt-6.1-sol, high) with resumes; one Opus Plan leg
base: origin/dev at f6bd011a
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date:** 2026-10-16.
- **Status:** delivered in one PR against `dev`, whose final commits are this close-out; merging it closes #591 and this plan. OA-1 to OA-5 ship their "what ships now" lines (OA-1 A, OA-2 "No settings found", OA-3 the tabled synonyms, OA-4 inset, OA-5 an empty field); the orchestrator carries them to decision page 32, and an answer that differs is a follow-up change.
- **Shipped:**
  - `apps/extension/src/utils/settings-search.ts`: the 34 searchable rows, their visibility rules and the matcher (D3). The Settings list, Lock, Privacy, Display and Developer render each row's title, description and testid from it (D1); each page's test checks its rows against it (`tests/helpers/settings-rows.ts`: one element per visible row, exact text, page order, `v-settings-row`; the list's captions and fence in `index.test.ts`).
  - `SettingsSearch.vue` at the top of the Settings list (mockups a and b): results grouped under their captions, the no-result line, real focus over the field and the results (D4), modified keys left to the field.
  - `useSettingsRowHighlight.ts` and `settings-row-highlight.css`: `?row=` read once and replaced away (D2), the matched row scrolled to the centre and outlined for 2.4 s (mockup c), inset in a clipping box (OA-4), with no fade under reduced motion or Disable animations.
  - One smoke scenario in `settings-routes.test.ts`, green on Chrome (1.2 s) and Firefox (2.4 s); screenshots in [screenshots/](screenshots/).
  - `lessons.md`: nothing promoted. It sits at its 8 KiB budget, and the reusable e2e technique (freeze an animation from an observer armed before the action; read a colour through a canvas) stays in [lessons/phase-3.md](lessons/phase-3.md).
- **Dropped, rejected, superseded:**
  - A result for a row on the Settings list leaves one extra history entry for the same page: accepted in D2, noted again by the Opus review, not changed.
  - The Logs row's "1 recent failure" line is not indexed (D6).
  - The sub-pages' captions are their page titles and are not pinned against the registry; the list's captions are.
- **Known limits:** none.
- **Open items:** none.
- **Seeds retired:** the `/goal` and `/loop` seeds below are retired; this plan is a record, not a task list.

# settings-search-1: search in Settings

One arc, one PR against `dev`, `Closes #591`. A field at the top of Settings finds a row by its title, description or a synonym. A result opens the page that holds the row, and that page outlines the row for a moment. The owner signed it on decision page 28 (P28-07 A) and page 29 (P29-05 A, "build it as drawn"); the drawings are mockups a, b and c. Recon: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Issue claims

- Both rows the testers asked for exist: Open as Side Panel (`display.vue:44-52`, Chrome only) and Full-height popups (`:58-62`). The claim holds.
- Mockup b lists Full-height popups above Open as Side Panel; the Display page renders Side Panel first. D3's order (title matches first) reproduces the drawing.

## Outcome & Quality Bar

For a person who knows a setting exists but not which page holds it. Excellent: (1) typing a word they would use ("fullscreen", "theme", "export") finds the row in one step, and the opened page shows that row at once, outlined, in view; (2) the field works from the keyboard alone (first Tab stop of the page, arrows, Enter, Escape), and a person who asks for less motion gets the outline with no fade. Good enough: search covers settings rows, not the contents of lists.

## Architecture & Implementation

- **Registry** `apps/extension/src/utils/settings-search.ts` (pure, no `chrome.*`): the one definition of every searchable row, as `GLOSSARY` is for definitions. `SETTINGS_ROWS` lists 34 rows in display order: the Settings list's 16 rows (not the profile card, whose title is the person's profile name) and the setting rows of Lock (3), Privacy (3), Display (7) and Developer (5). Each row: `id` (`hub-<slug>` or `<page>-<slug>`, matching `^[a-z0-9-]+$`), `page`, `section` (the list's caption, or the sub-page's title, "Display"), `title`, `description` (a string, or a function of the context for Lock and Proving, whose list lines depend on the profile type and on Presto), `synonyms`, `testid`, optional `visible(context)`. `SettingsContext = { sidePanel, passkey, developerMode, provingStatus }`. Exports: `settingsRow(id, context?)` (resolved title, description, testid), `visibleSettingsRows(context)`, `searchSettings(rows, query)` (`null` for a blank query, else groups `{ caption, danger, rows }`). Synonyms: OA-3.
- **Pages render from it** (D1). Display, Privacy and Developer build their `settings` map entries by spreading `settingsRow(id)` next to the page-local model; the `v-for` binds `data-testid` and the directive from the entry. One-off rows (the list's 16, Theme, Hide dust, Show incoming transfers, the Lock rows) bind title, description and testid through `settingsRow`. No text, order or control changes.
- **Field and results** `apps/extension/src/popup/components/modules/settings/SettingsSearch.vue` (L4). Props `modelValue`, `context`. It renders `Input` (`icon="search"`, `clearable`, `@clear`, placeholder "Search settings", `inputTestid="settings-search-input"`), then the groups (`ItemsContainer :title :danger`; rows `SettingItem :to :title :description chevron`, testid `settings-search-result-<id>`) or the no-result line (`<Text variant="body" color="tertiary" data-testid="settings-search-empty">`, words OA-2). A result's `to` is the string `` `${page}?row=${id}` `` (`SettingItem` declares `to: String`).
- **Index wiring** `settings/index.vue`: owns `query`; builds the context (`Boolean(chrome.sidePanel)`, `isPasskey`, `hubConfig.developerMode === true`, `provingDescription`); puts `SettingsSearch` first in `.content`; renders the list with `v-if` only while the query is blank.
- **Highlight** `apps/extension/src/composables/useSettingsRowHighlight.ts` returns `{ vSettingsRow, target }`. An immediate watch on `route.query.row` takes a string as the pending target and calls `router.replace({ path: route.path })` at once: read once, never kept in the URL (new to the codebase; `activity.vue` keeps a lasting filter). The directive's `mounted(el, { value: id, modifiers })` sets `data-settings-row=id`; when `id === target`, it sets `data-highlighted` (`"inset"` with `.inset`), calls `el.scrollIntoView({ block: "center" })` and clears the target. Strict equality only: no lookup table, no selector. The index clears `query` when `target` changes, so its list mounts and the row matches.
- **Outline** One stylesheet, imported by the composable, keyed on `[data-settings-row][data-highlighted]`. Mockup c's `.found` values as keyframes over 2.4 s (the `n-row-glow` length): held, then faded to the row's resting style, with `animation-fill-mode: none`, so nothing outlives the moment and the rows' focus and hover rings stay theirs. Rows inside an `ItemsContainer` (the list's 16 and Lock now) clip anything outside them (`overflow: hidden`), so they take `v-settings-row.inset`: the same colours at `outline-offset: -1px`, no outer shadow (OA-4). Under `prefers-reduced-motion: reduce` and `.noanimations`: `animation-timing-function: step-end`, the outline with no fade, gone after the same moment. The keyframe name must resolve from that attribute rule; the smoke e2e proves it paints.
- **Flow**: type "full" → `searchSettings` → Display group [Full-height popups, Open as Side Panel] → click or Enter → `#/popup/settings/display?row=display-full-height` → the composable reads and clears the query → the rows mount after the config read → the Full-height row scrolls to the centre and fades.

## Decision ledger

| # | Decision | Alternatives rejected, and why |
|---|---|---|
| D1 | Pages render each row's text and testid from the registry; each owning page's existing test mounts it and checks that every visible row's testid renders with the directive's id and its exact title and description, and that no hidden row's testid renders. "A removed row drops out of search with no other edit" reads: the row is its registry entry, and search derives everything from the data. Removing a row deletes that entry and the control that renders it; the mounted check fails if either half stays. | A verified copy (round 1 draft): both legs rejected it; it detects drift instead of removing it and goes against the glossary pattern. Pages iterating registry rows for every control: rewrites five templates into per-id control switches for one future removal. |
| D2 | `?row=<id>`, read by an immediate watch and cleared at once; a local directive marks and outlines the row on mount; one attribute is the style hook; the CSS ends the moment by itself. | `history.state`: survives Back. A class: Vue rewrites `className` when a row's class binding changes. An id → element map: no caller (Opus), since sub-page results mount fresh pages and the list uses `v-if`. A JS timer: a lifecycle. Widening `SettingItem.to` for a same-page `replace`: a contract change for a Back nobody can press on the list. |
| D3 | Fold (`normalize("NFD")`, strip `\p{M}`, lower case); split the query on white space; every term must be a substring of the title, the description or a synonym ("prefix" is a substring, so no rule of its own). Groups in registry order. In a group, rank by the weakest field any term needed (title, then description, then synonym), ties in page order. | Page order alone: contradicts mockup b. Fuzzy scoring: no caller. |
| D4 | Real focus over [field, result links], wrapping, as `DropdownRoot` does. One keydown listener on the component root; every shortcut first returns on `isComposing(e)` or `e.defaultPrevented`. Enter on a link opens it natively; Enter in the field opens the first result and refuses a repeat Enter. Escape with text clears, focuses the field and is cancelled; on an empty field a repeat Escape is cancelled (a held key that cleared the text cannot close the toolbar popup) and a fresh one is left to the browser. | The combobox model (`aria-activedescendant`): it needs an active-row style the mockups do not draw. |
| D5 | A result for a row on the Settings list returns to the list with that row outlined (the decision's literal words). | Opening the row's page: OA-1. |
| D6 | 34 rows. Out: list contents (the brief); the profile card; flow pages; the export page's modes (Full Backup would join mockup b's "full"); About's links; Glossary definitions; the Proving page's status copy. Logs keeps its default line; its "1 recent failure" variant is not indexed. | Indexing the Glossary: definitions are not settings. |
| D7 | Built beside the plan: `settingItemProps(id, context)` binds a `SettingItem`'s title, description and testid in one `v-bind` (the list's 16 rows and Lock now); `settingsQueryTerms` is the one blank-query test, which the matcher and the list's `v-if` share; the tint's last keyframe is left out, so it fades into the row's own background. | A second blank test in `index.vue` (`trim()`): a query of combining marks alone would hide the list and show no results. |

## Phases

### Phase 1: the row registry ✓

- Add `utils/settings-search.ts` and `utils/settings-search.test.ts`. Bind the five pages' row text and testids to it; add the row-root testids the rows lack (`display-row-<slug>`, `privacy-row-<slug>`, `lock-row-auto-lock`, `developer-row-<slug>`; existing ones stay).
- Add `apps/extension/tests/helpers/settings-rows.ts`: `expectOwnedRows(wrapper, page, context)` (each visible row's testid renders with its exact title and description; no hidden row's testid renders). Call it in `settings/index.test.ts` (password and passkey), `display.test.ts` (with and without `chrome.sidePanel`), `privacy.test.ts`, `lock.test.ts` (password and passkey) and `developer/index.test.ts` (developer mode off and on).
- Unit cases: folding ("THÉME" finds Theme); an inner substring; two terms across title and synonym, ranked by the weaker field; a blank query returns `null`; no match returns `[]`; "full" returns [Full-height popups, Open as Side Panel] with `sidePanel` and [Full-height popups] without; each visibility rule hides its row; ids match the pattern and, like testids, are unique; every `page` resolves to a file under `src/popup/pages`.
- **Validation gate.** Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/utils/settings-search.test.ts src/popup/pages/settings`. Pass: exit 0. Then bind one row's description into its title slot and confirm `expectOwnedRows` fails; revert. Layers: typecheck/lint, unit, component.

### Phase 2: the field, the results and the highlight ✓

- Add `SettingsSearch.vue` and its test, `useSettingsRowHighlight.ts` with its stylesheet and test, and the index wiring. Put the directive on every registry row; `expectOwnedRows` also requires `data-settings-row` on the testid's element.
- Extend `utils/a11y-css.test.ts`: the two `step-end` stops and `animation-fill-mode: none`.
- `SettingsSearch.test.ts`: "full" renders the Display caption and the two rows in order, with testids and `to`; without `sidePanel`, one row; "zzz" renders the no-result line and no row; a blank query renders neither. Keys: ArrowDown from the field focuses the first result and wraps to the field; ArrowUp from the field focuses the last; Escape clears, focuses the field and is cancelled; a fresh Escape on an empty field is not cancelled (success control) and a repeat one is; a composing ArrowDown or Escape does nothing; Enter in the field pushes the first result's `to`, a repeat or composing Enter pushes nothing.
- `useSettingsRowHighlight.test.ts` (at least 10 cases, CLAUDE.md § Vue component test conventions): the matching row is outlined and scrolled to the centre while its sibling is not; `.inset` sets `"inset"`; an unknown id outlines nothing and the query is still cleared; no query means no `replace`; an array query is ignored and cleared; a row behind a `v-if` that flips later still matches; the target is consumed once; a query that arrives on a mounted page matches the row that mounts next; the attribute survives a real `SettingItem` re-render whose `value` changes; the `replace` passes the auth route guard.
- `settings/index.test.ts`: the input is the first focusable element inside `settings-page`; a non-blank query unmounts every list row (the existing row-list assertion stays green on a blank query); `?row=hub-display` clears the query and outlines `setting-nav-display`.
- **Validation gate.** Commands: `bun run lint`; `bun run typecheck:all`; `bun run test:all`. Pass: exit 0 each. Layers: typecheck/lint, unit, component.

### Phase 3: the smoke e2e and the docs ✓

- `tests/e2e/settings-routes.test.ts`, one scenario. It types "full" and reads the result testids in order: Chrome `[…display-full-height, …display-side-panel]`, Firefox `[…display-full-height]` (branch on `isFirefox` in the spec). Before the click it arms a `MutationObserver` in the page that, when an element gains `data-highlighted`, pauses that element's animations at time 0 and disconnects (the spec also disconnects it in its `finally`). It clicks Full-height popups and waits for `#/popup/settings/display` with no query. Then it checks `display-row-full-height` carries `data-highlighted`, lies inside its scroller's visible rectangle, and shows a solid outline with a non-transparent colour; no 2.4 s window bounds the reads. No console or page errors. Failure mode: the hand-off through the real router, the row mounting after the real config read, the real `chrome.sidePanel` per browser, and the CSS painting. No cheaper layer has these. Estimate 10 s per browser; record the measured time.
- Docs: the registry's header comment names it the one place a searchable row registers, with the testid and `v-settings-row` rule; `index.vue` points there in one line.
- Take light and dark screenshots of the three mockup states, plus a list row outlined inset (OA-4), for the PR.
- **Validation gate.** Warning: run e2e only while `load1 < 150`. Commands: `bun run audit:vue`. Then, per browser (`chrome`, then `firefox` with `NULO_E2E_BROWSER=firefox`; focus moves): `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<browser>`, then `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/settings-routes.test.ts --retry=0`. Pass: exit 0 each; the file's wall-clock recorded. Layers: all of the above plus smoke e2e on both browsers.

## UI impact

- **Settings list**: the search field at the top (mockup a, P29-05 A); results under captions in place of the list (mockup b); the no-result line, which the lane brief allows as "one plain line" (words OA-2); Back from a result shows an empty field (OA-5).
- **Display, Privacy, Lock, Developer and the Settings list**: the row outlined for a moment on arrival (mockup c, P29-05 A); inset inside a bordered list (OA-4).
- No row's text, order or control changes. Copy: "Search settings"; no dotted term; no em dash.

## Security & Adversarial Considerations

- **Route input.** `?row=` is compared by strict equality with the ids rendered on the page. It is never a selector, HTML, an object key or a log value; an unknown or array value is cleared. Only extension pages set the popup's hash today (no `web_accessible_resources`, `src/manifest.test.ts:60`); the check holds without that. The outline starts nothing: no focus move, no toggle, no navigation.
- **Query text** stays in component state. It is never logged, stored, sent or echoed; matching uses literal `includes`. The only patterns are constant (`/\p{M}/gu`, `/\s+/`), with no ReDoS shape.
- No new permission, storage key, message, dependency or crypto.

## Assumptions

- **Facts**: F1 the list's sections and rows, `index.vue:113-278`; F2 Display renders its rows only after the config read (`display.vue:173`); F3 `Input`'s clear emits `clear`, not `update:modelValue`, as `authwits/index.vue:170-176` handles; F4 hash history over `vite-plugin-pages` (`popup/index.ts:12,44`); F5 `index.test.ts:127` selects rows by `setting-nav-*` and `*-link-btn`, so result testids take another prefix; F6 `ItemsContainer`'s `.wrapper` clips (`overflow: hidden`), and `SettingItem` draws its focus ring inset (`outline-offset: -2px`); F7 `.noanimations` stops transitions only (`base.css:377`); keyframe stops are pinned in `a11y-css.test.ts`; F8 jsdom has no `scrollIntoView` (`tests/vitest.setup.ts:27-31`); F9 `SettingItem` declares `to: String` (`SettingItem.vue:40`).
- **Inferences**: I1 `SettingItem` rows match mockup b's metrics; the screenshots check it. I2 `data-highlighted` survives a row's re-render: Codex reproduced it across a class update on `SettingItem`'s root shape, and a phase 2 case pins it with a real `value` change. I3 a `router.replace` from a page's immediate watch is safe (Codex reproduced it; a phase 2 case pins it with the guard).
- **Asks**: OA-1 to OA-5 in OWNER-ASKS.md. Each has a "what ships now" line, and the arc ships that line if the ask is still open.

## Delivery

Single arc on `worktree-settings-search-1`: one PR against `dev`, no stack (D-orch-1). Title: `feat(settings): find a setting by its title, description or a synonym` (68 characters). The PR opens only after the phase gates pass and the Codex loop converges. Body: what and why; both Decision blocks quoted from #591; the screenshots; the validation runs with outcomes; the smoke suite's wall-clock per browser before and after, measured as the `e2e-testing` skill's § Runtime budget says; `Closes #591`. Open it without labels; add `e2e:extension-smoke` afterwards only if the path filter skipped smoke. Then `gh pr checks <n> --watch`. Parallel lanes: none.

## Post-implementation

Follow [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) as it reads at `f6bd011a`. Specific to this plan:

- Step 1 is absent (`code_review: off`).
- Step 2 runs once, over the net diff from `f6bd011a`, after phase 3 is green: `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh` per round; on a quota or 401 error, retry once with `CODEX_ACCOUNT=alejo-icloud`. Hard stop at three rounds. Log each round in `lessons/phase-3.md`.
- Step 4, the close-out, comes as the PR's final commits and deletes `STATUS.md`.
- Step 5, the teardown: `agent-worktree done settings-search-1 --merged` once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/settings-search-1/plan.md` succeeds. A `/loop` session checks this on every firing; a `/goal` session arms one background wait after its wrap-up report.
- Approval boundaries: a fix that adds persistent state, a lifecycle, a protocol or a public contract stops for approval. A visible change beyond the UI impact lines goes to OWNER-ASKS.md.

## Audit verdicts

| Round | Leg | Verdict | Resolution |
|---|---|---|---|
| 1 | Codex (gpt-6.1-sol, high) | reject: D1 keeps a copy; object `to` breaks `SettingItem`'s prop; smoke needs the armed build | All 7 accepted: D1 flipped; string `to`; armed builds per browser; inset outline (OA-4); composition and repeat-Escape guards; the e2e reads paint and position; F4 corrected, a tenth composable case |
| 1 | Opus 5.5 Plan | conditional approve: OA-4; fill mode none; string `to`; `v-if`, no map; D1 re-decided | All 9 accepted: map dropped, D3 multi-term rank, OA-5, `test:all` alone, owning-pages pin dropped, "first Tab stop" scoped |
| 2 | Codex (resume) | conditional approve: keep rendered-text checks; capture the animation deterministically | Both accepted: `expectOwnedRows` checks exact title and description; the e2e pauses the animation from an observer armed before the click; I2 reworded |
| 3 | Codex (resume) | **approve** | No new material defect or regression |
| Impl 1 | Codex (gpt-6.1-sol, high), net diff from `f6bd011a` | approve: 2 P3 | Both accepted: `expectOwnedRows` requires exactly one element per visible row (a duplicate escaped `find()`); three narrating comments deleted (`SettingsSearch.vue` header and `stops()`, `index.vue`'s `searchContext`) |
| Impl 1 | Opus 5.5, final diff | conditional approve: 2 findings | Both accepted: `expectOwnedRows` checks the rows' page order (ties rank by it) and `index.test.ts` checks each list row's caption and fence against its `section`; a modified arrow or Enter (Shift+ArrowUp selects) is left to the field. Noted, not raised: a list result leaves one extra history entry (D2 accepted it) |

## Seeds

```
/goal All three phases of implementations-plan/settings-search-1/plan.md marked ✓, each backed by its validation gate reported passing in the transcript; LESSONS_FILE=implementations-plan/settings-search-1/lessons/phase-N.md printed per phase; /code-review NOT run (code_review: off); the Codex fix loop over the net diff from f6bd011a converged (a resumed gpt-6.1-sol pass reporting no new material finding, quoted); one PR against dev exists (gh pr view output), created after the loop, carrying the close-out commit that archived the plan (git show --stat); bun run test:all and bun run lint exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/settings-search-1 forward per its plan.md (read it and lessons/ first; plan.md is the state). Archived path present on dev → teardown per Post-implementation, then stop. PR open → babysit checks only. Otherwise take the next unchecked phase, run its validation gate, mark ✓, log lessons. Decide with Codex (gpt-6.1-sol, high) instead of waiting; never merge, never change what a person sees beyond the UI impact lines. Same step failed 5 times → reassess with Codex.
```
