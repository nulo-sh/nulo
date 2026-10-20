# viewer-followups-1: recon

Base: `origin/dev` at `817cce9d` plus viewer-flake-1's arc 2 (#925, branch `viewer-flake-1-a2`, read with `git show`), the planned base. One Sonnet explorer (the reuse sweep), the driver's reading of `@codemirror/view` 6.43.9 and `@codemirror/search` 6.7.1, and the probes in [lessons/phase-0.md](lessons/phase-0.md). Line numbers are arc 2's.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| A viewer-caused scroll that cannot read as the reader's | `scrollToBottom` (`LogsViewer.vue:123-133`): `lastScrollTop = Number.POSITIVE_INFINITY` after its dispatch; the next scroll event resets it (`:103-115`) | reuse the pin in `scrollToTargetLog` (`:149-158`); no helper (D3) |
| A pending viewer scroll that a held line must not replace | `holdPlace` (`:81-88`): `snapshotPending`, cleared by a `requestMeasure` read; while set, a line adds no snapshot and CodeMirror maps the pending target through it | reuse the same flag for the deep link's target (D4) |
| Unit rows on the follow rule | `LogsViewer.test.ts`: `followingAtEnd()`, `held()`, `scrollTo`, `followsNext`, the stub `EditorView` with writable `scrollDOM` geometry and a recorded `dispatch` | adapt: a sibling `openedAtLatest()` builder; no stub change |
| A unit mount with a URL query | none: no test under `apps/extension/src` sets `location.search`, `pushState` or `replaceState`; `popup/pages/auth.test.ts:176-218` sets only `location.hash` | build new: `history.replaceState` before the mount, restored in `afterEach` |
| `logId` producers and consumers | producer `popup/pages/settings/developer/index.vue:44-47` (`cacheStore.failureLog.id`, set by `Header.vue:68-95` on a failure); consumer `LogsViewer.vue:279-283` only; no committed test of the deep link | the unit rows are the first |
| E2E steps for the search case | `gapToEnd`, `logLines`, `middleLine`, `expectHeld`, `filledLogs` (`viewers-csp.test.ts`); `pointerClick` (`helpers/legal-drivers.ts:181-206`, hit-tests the centre first); no helper clicks `logs-scroll-btn` or focuses the search field | reuse all; the refocus stays inline in the one case |
| Other readers of the follow state | `lastScrollTop`, `SCROLL_DISABLE_THRESHOLD`, `updateShouldAutoScroll`, `holdPlace`, `scrollToBottom`: `LogsViewer.vue` only; `SCROLLED_AWAY = 20` mirrors the threshold in `viewers-csp.test.ts`; `JsonViewer.vue` has none | n/a |

## CodeMirror mechanics (`dist/index.js`)

- The end anchor fires only when the content height changes by more than a pixel during a measure: `measure` anchors at the bottom when `isScrolledToBottom` held (`:778-782`, `:8155-8159`), then scrolls by the height map's change (`:8226-8240`). A panel shrinks the scroller (`clientHeight`), not the height map, so F3 at rest moves nothing (probe P921a).
- `EditorView.update` maps a pending scroll target through every later transaction's changes and replaces it with a later `scrollIntoView` effect (`:7994-8007`). `scrollSnapshot()` is such an effect.
- The search panel's first open dispatches `togglePanel` with `appendConfig` (`@codemirror/search` `:1001-1018`); `mount()` selects the field inside that update (`:1165-1167`), so the `focusin` stop runs before CodeMirror measures.
- In a read-only editor the panel builds no replace field, so `.cm-search .cm-textfield` is the search field.

## Open work, known limits, overlaps

- Closed known limits on the viewer: #919 (KL-1, Firefox's `selectionchange` lag), #920 (KL-2, a reader's scroll down the viewer cannot tell from its own follow). Neither changes here; #920 gains a comment (plan § Decision ledger, D5).
- Open: #921, #922, #923 (this lane); #849 closes with arc 2.
- Overlaps: viewer-flake-1's arc 2 (#925) rewrites the same two files and adds ledger row 63 to the `e2e-testing` skill; this lane starts only once it is on `dev`. encryption-at-rest-1 (#924) touches storage and the logging policy, not the viewer.
- `e2e-testing` § Runtime budget: a changed scenario reports its measured runtime and each browser's file wall-clock before and after in the PR body; never a per-test `retry`.
