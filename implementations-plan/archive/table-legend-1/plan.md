---
plan: table-legend-1
tier: light (thinned by the lane brief: no plan audit round, one Codex pass over plan and diff)
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: connected-app-build-1-a2 at 449baa5ec (dev at b22893f42 plus #1854)
status: completed
---

## Outcome

- **Date:** 2026-11-18.
- **Status:** completed in one arc. It ships in #1866 (`feat(capabilities): a legend names the details table's six icons`), a draft stacked on #1854, which carries this close-out. It lands on the orchestrator's read of its captures against the owner's E2 frames, after a rebase onto `dev` once #1854 lands.
- **Shipped:** one `aria-hidden` legend line under the Details table's rows, the head's six glyphs each beside its column's word, in `type--caption`, on the capabilities window's table and the connected app page's (P186-01 = E2). `COLUMNS` carries the words, and the spoken names lower-case them, so no row's words changed.
- **Gates** (retry 0): lint, typecheck:all, the named unit run (16 files, 398 passed) and check:plans green at `653a1f0eb`. Smoke `type-roles` Chrome 14 + 1 skipped and Firefox 15; network `type-roles-windows` + `cap-window` Chrome 11 and Firefox 10 + 1 skipped, at `d6fff21d0`.
- **Rebased onto #1854's page-189 table** (`9a47bd855`; `d6fff21d0` and `653a1f0eb` became `263e687e9` and `fe4d25de4`), no change to the legend: from 290 px to 330 px the head and each row keep one line, below 290 px the split stays, and the legend measures two 40 px lines with nothing past the table's edge at the window's 400 px, the page's 360 px body and the 240 px sidebar (three words a line there). Gates at `59faf9113`, retry 0: lint, typecheck:all, the named unit run (16 files, 402 passed, 1 skipped), check:plans, smoke `type-roles` Chrome 14 + 1 skipped and Firefox 15.
- **Deviations:**
  - The PR is a draft on `connected-app-build-1-a2`, not ready on `dev` (the spawn's instruction; #1854 had not landed).
  - The close-out took the PR's base, which had not moved, rather than `origin/dev`, so the stacked diff stays the legend alone. `dev`'s `index.md` and `lessons.md` were unchanged against that base; its `archive/index.md` gained one line (`switch-names-1`), which merges by union.
  - The capture's window view sets `data-fills-window`, as the capabilities route does ([`lessons/phase-1.md`](lessons/phase-1.md)).
- **Lessons:** none promoted (`lessons.md` sits at its budget; the capture widths are in `lessons/phase-1.md`).
- **Known limits:** none.
- **Open items:** none.
- **Seeds retired:** the `/goal` and `/loop` seeds under Seeds.

# table-legend-1: a legend line names the Details table's six icons

One arc, one PR; it changes what users see, so it does not land on its own. No issue owns it (searched "legend details table icons"; no closed `known-limit` on "details table"), so the PR carries no `Closes`. Recon: [`recon.md`](recon.md). Owner asks: none ([`OWNER-ASKS.md`](OWNER-ASKS.md)).

## The owner's pick (the sign-off)

Decision page 186, signed 2026-11-18 at 17:32 UTC at dev `8ff0e6489`, no note. It answers the owner's page-185 note: "Also, aren't we missing the chips / labels explaining what each icon is / means that we added to the capabilities pop-up?"

- **P186-01 = E2.** The question: "Words for the Details table's six icons, in the pop-up and on the connected app page: none, as today, the words spoken only (today); a legend line under the table naming each glyph once (E2); or the column's word written above each glyph in the head (E1)". As the page put it: "One legend line under the Details rows naming each glyph once (Simulate, Add, Transact, Details, Events, Code), 40 px taller; the rows and the head unchanged. With E3 shipped, the legend names no glyph that another cell also uses. The lighter of the two."
- The frames the owner saw (the pop-up's table at 400 px) were drawn before #1835 swapped two glyphs; this arc draws today's: the send arrow for Transact, the magnifier for Details.

## Decision ledger

| ID | Decision | Why, and the alternatives |
|---|---|---|
| D1 | `DetailsTable.vue` draws one `div` (`data-testid="cap-details-legend"`) after the rows and before the footnote: for each column, in the head's order, the head's glyph at 12 px beside the column's word. It draws wherever the table draws: the window's opened fold and the page's bare table, with or without the footnote. | The pick, as the prototype `c09ff1da9` drew it. One component, so one change lands on both screens. In the narrow drawing (below 330 px) `.table > *` already spans the whole grid, so the legend needs no rule of its own there. |
| D2 | The words are the columns' own: `COLUMNS` carries each column's word (`Simulate`, `Add`, `Transact`, `Details`, `Events`, `Code`) in place of its lower-case key, and the spoken name lower-cases it, so every row still reads exactly what it reads today. | One list of six words, not a second map beside the keys (the prototype's `COLUMN_WORDS`). Rejected: capitalising a key in the template (a string trick that hides the word). |
| D3 | The legend is `type--caption` (11 px body face, the prototype's role), in `--nulo-secondary`, the head's colour, text and glyph; a wrapping flex row, 4 px between lines and 12 px between items, 8 px under the last row; each item keeps its glyph and word together. No new role, no size or weight outside the role. | The frames the owner picked. Measured wraps: two lines at the window's 400 px and the page's 360 px body (D7 records the heights). |
| D4 | **Accessibility call (the owner's 2026-10-19 delegation):** the legend is `aria-hidden="true"`. | It keys the head's glyphs, which are `aria-hidden`; each row's target already speaks "{name}: {columns}" with the same words. Read aloud, it would be six words after the last row with nothing to attach them to: a second reading, and no meaning lost by skipping it. Argued with Codex in the review pass (verdict under Audit verdicts). |
| D5 | Tests (component, jsdom): `DetailsTable.test.ts` one case, the legend after the last row and before the footnote, the six words in column order beside today's glyphs (`play`, `add`, `send`, `search`, `mail-lock`, `code`), equal to the head's glyphs, `aria-hidden`, and drawn bare without a footnote too; the window's S1 Details case and the page's two grant cases read the same six pairs on their own tables. Every fixture address is wire-shaped (0x and 64 hex characters), as the three files already are. The spoken-name cases stay as they are: they prove D2 changed no row's words. | The brief's test list; the never-happens side is the unchanged rows and head (the existing cases), the success control the legend's pairs. |
| D6 | No e2e scenario added. Local e2e: smoke `type-roles.test.ts`; network `type-roles-windows.test.ts` and `cap-window.test.ts` (the specs that open the window's table; `type-roles-windows` also opens the page's); Chrome and Firefox. `connect-*` read the page above its table, which is the page's last element, so the legend cannot move them. | The lane brief's gate list. `cap-window`'s 12 px scroll pin is measured with Details closed, where the legend does not draw. |
| D7 | Captures through the capture page of `782858322` (the real page under Vite over fake clients), copied in uncommitted and removed after the run; the window frame mounts the window's `DetailsTable` from `buildDetailsTable` in the window's chain of widths (a full-width host, 16 px padding), opened, as connected-app-build-1 arc 2 did. 2x, light and dark, into the lane's scratch `shots/`: `tl1-window` (400 px), `tl1-page` (the many-permission grant, 360 px body), `tl1-page-one` (the read-only grant), with `captions.json`. | The lane brief. No extension build, no sandbox. |

## UI impact

- **The capabilities window, Details opened** (`DetailsTable.vue`). Before: the head's six glyphs, then the rows, then the footnote. After: one legend line under the rows naming each glyph once (Simulate, Add, Transact, Details, Events, Code), above the footnote; the rows and the head unchanged. Sign-off: P186-01 = E2, quoted above.
- **Settings → Connected apps → an app's page, its Permissions table** (the same component, drawn bare). The same legend under the rows; above the footnote when it shows, last when it does not. Sign-off: the same pick, which names both screens.

## Security & Adversarial Considerations

The legend draws six constant words and six constant glyphs: no dApp string, address or stored value reaches it, so an app cannot change what it says or hide a column. The row targets' spoken names keep their words (D2), so nothing a screen reader hears about a grant changes. No service, stored shape, RPC, permission or log line changes; `@nulo/wallet-sdk-schema-patch` is untouched.

## Phase 1: the legend, its tests, captures

Change map:

- `apps/extension/src/components/composite/capabilities/DetailsTable.vue`: D1 to D4.
- `apps/extension/src/components/composite/capabilities/DetailsTable.test.ts`: D5's legend case.
- `apps/extension/src/popup/windows/capabilities/index.test.ts`: S1's Details case reads the legend.
- `apps/extension/src/popup/pages/settings/connected-apps/[id].test.ts`: both grant cases read the legend.

Gate, at retry 0, once, in order (pass: every command exits 0, counts recorded in `STATUS.md`):

1. `bun run lint`; `bun run typecheck:all`.
2. From `apps/extension`: `bun run test -- src/components/composite/capabilities src/popup/windows/capabilities src/popup/pages/settings/connected-apps src/popup/components/modules/settings/connected-apps type-role-ban copy-dash-ban red-text-ban`.
3. `bun run check:plans` after staging.
4. Smoke, from `apps/extension`: `bun run test:e2e -- tests/e2e/type-roles.test.ts --retry=0`, then the same with `NULO_E2E_BROWSER=firefox`.
5. Network, from the root: `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/type-roles-windows.test.ts tests/e2e/network/cap-window.test.ts`, then the same with `NULO_E2E_BROWSER=firefox`.
6. Captures (D7), measured heights in `captions.json`.

## Post-implementation

[`README.md` § Post-implementation standard](../../README.md#post-implementation-standard) at `449baa5ec`, step 2 as bounded work: ONE Codex pass (`run-codex.sh`, gpt-6.1-sol, high, read-only) over this plan and the net diff against `connected-app-build-1-a2`, carrying the step's two rules verbatim, the adversarial ask and D4's question; targeted verification of what it finds; a second round only if it finds something. No Opus review (the lane brief's Proportion).

## Delivery

- Branch `table-legend-1-a1` off `worktree-table-legend-1`, carrying the plan commit. One PR, opened as a **draft** with `--base connected-app-build-1-a2` (the spawn's instruction, overriding the lane brief's "against dev, ready": #1854 has not landed, so the diff reads as the legend alone). CI's e2e lanes do not run on that base; the local gates are the proof until the orchestrator rebases onto dev and marks it ready.
- Title (≤ 92): `feat(capabilities): a legend names the details table's six icons`. No `Closes`. The body quotes P186-01 as the sign-off, states D4 as an accessibility call under the 2026-10-19 delegation, lists the tests, the e2e runs with counts per browser, the Codex verdict, and embeds the captures beside the owner's E2 frames by blob URL (committed under `pr-captures/table-legend-1/` in one commit, removed in the next).
- Close-out in the same PR's final commits: Outcome, `STATUS.md` deleted, `git mv` into `archive/`, index line moved. The trunk merge before it takes the PR's base (`origin/connected-app-build-1-a2`), not `origin/dev`, so the stacked diff stays the legend alone; `dev`'s `index.md` and `lessons.md` are read for what landed. Merging, landing and teardown are the orchestrator's.

## Seeds

- `/goal`: Build table-legend-1 per `implementations-plan/table-legend-1/plan.md`: Phase 1 green, captures, one Codex pass, draft PR on `connected-app-build-1-a2` with captures and close-out; stop before merge.
- `/loop`: Check the table-legend-1 PR's checks and the orchestrator's word; never merge.

## Audit verdicts

- Plan audit: none (the lane brief's Proportion thins it to the one pass below).
- **Codex, one pass over the plan and the net diff (gpt-6.1-sol, high, read-only), at `d6fff21d0`: approve with comment cleanup.** No functional or security finding: the legend's words and glyphs are constants, and the grant predicates, escaping and sanitising are unchanged.
  - D4 upheld: keep `aria-hidden`. Each row's native button already carries its full permission name through `aria-labelledby`, and the exact-string spoken-name cases cover all six words; exposed, the legend would add six unassociated words and possibly unnamed images (`Icon` renders `role="img"`); a list adds no relationship, `role="presentation"` would leave the text exposed.
  - D2 upheld: the capitalised words in `COLUMNS`, lower-cased only for the spoken names, are simple and correct; no second map.
  - Accepted, fixed in `653a1f0eb`: the `COLUMNS` doc-comment back to its one sentence, and the two test doc-comments over the legend fixtures deleted (each restated its code). Verified: the four touched test files green (103 tests), Biome clean. No second round: the fix is comments only.
