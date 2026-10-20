# viewer-flake-1: recon

Base: `origin/dev` at `ce48691e`. One Sonnet explorer (reuse sweep), plus the driver's reading of `@codemirror/view` 6.43.9 and the probes in [lessons/phase-0.md](lessons/phase-0.md).

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Hold the view's place through a change | `holdPlace` in `apps/extension/src/components/JsonViewer/LogsViewer.vue:81-86`: one `scrollSnapshot()` per CodeMirror measure, guarded by `snapshotPending` | reuse as is (a stop-time snapshot was tried and rejected, plan § Alternatives) |
| Stop and resume the follow | `disableAutoScroll`, `enableAutoScroll`, `updateShouldAutoScroll` (`lastScrollTop`, `movedDown`), `scrollToBottom` (`LogsViewer.vue:88-127`) | adapt: `scrollToBottom` sets the reference its own scroll lands at; the stops stay |
| Unit tests of the follow rule | `LogsViewer.test.ts`: "LogsViewer auto-scroll around the search panel" (`focusInEditor`), "LogsViewer follow after a hold" (`held`, `scrollTo`, `followsNext`); the stub `EditorView` (`:45-62`, writable `scrollDOM` geometry) | adapt: the same `scrollTo` / `followsNext` shape, plus a selection-stop helper; no stub change |
| An e2e wait on "the editor settled" | `gapToEnd` in `tests/e2e/viewers-csp.test.ts:31-54` (two frames with no `.cm-content` mutation, 5 s give-up); the double-`requestAnimationFrame` of `lineTop` (`:220`); `pollUntil` (`fixtures/poll.ts`) | reuse the two-frame wait for the hold's baseline |
| Follow check latch | `armFollowCheck` / `followedSinceArmed` (`viewers-csp.test.ts:102-147`) | adapt: read after the viewer's own listener |
| Selection hold baseline | `middleLine`, `selectAcross`, `expectHeld` (`viewers-csp.test.ts:193-273`) | adapt: `selectAcross` returns where the line stands once the follow due at the viewer's stop has settled |
| Another follow-the-end component | none. Searched `isAtBottom|atBottom|stickToBottom|autoScroll|followTail|scrollHeight` over `apps/extension/src`: only `LogsViewer`, `CollapsingHeroLayout.vue`, `snackInset.ts` (IntersectionObserver insets) | n/a |
| A shared two-frame helper | none: the double-`requestAnimationFrame` wait is inline in `viewers-csp.test.ts` (3 sites); `fixtures/code-editor.ts` has only `readEditorStyles`, `editorText` | build none: the change reuses the file's own loop |

## CodeMirror mechanics the fix rests on (`@codemirror/view` 6.43.9, `dist/index.js`)

- `DOMObserver.listenForScroll` (`:7292-7320`) walks from `contentDOM` up and adds its `onScroll` to every element, `.cm-scroller` included, when the view is built: before the viewer's own `scroll` listener (`LogsViewer.vue:260`).
- `onScroll` → `onScrollChanged` → `view.measure()` synchronously while the editor intersects (`:7194-7205`); CodeMirror re-registers its scroll listeners only when the editor's ancestor chain changes (`:7176-7178`, `:7314-7318`), which this window never does. That measure applies a pending `scrollIntoView` target (`:8219-8223`), so a follow still due lands inside the scroll event, before the viewer's listener reads the gap. A capture-phase listener runs before both.
- `measure` keeps a view resting within 4 px of its end at its end (`isScrolledToBottom`, `:778-782`, `:8156-8159`, `:8226-8240`) unless a scroll target replaces it; `viewState.update` anchors at the bottom whenever the last measure found it there (`:6287-6299`).
- `scrollSnapshot()` reads `scrollTop` against the current height map (`:8675-8679`). After a trim's dispatch and before a measure it anchors 100 lines off; this is why `holdPlace` takes one per measure.
- A selection set in the DOM is read by `DOMObserver` and dispatched with `scrollIntoView: false`, unless a keyboard `select` came within 50 ms (`:4306-4316`); a pointer drag dispatches `select.pointer` with no scroll (`:4825-4833`).

## Open work and known limits

- `gh issue list --state closed --label known-limit --search "logs viewer"`: none for the viewer (#322 is a send-chaos seed).
- Open issues on the viewer or this file: #849 only. #616 (the rule) and #749 (another wait in this file) are closed.
- Collision: ui-polish-4 changes the logs window's toolbar triggers (#810, #823) in `LogsToolbar.vue`; this lane does not touch the toolbar.
- Neither file is in `scripts/complexity-baseline/manifest.json`; neither carries a `biome-ignore`.
