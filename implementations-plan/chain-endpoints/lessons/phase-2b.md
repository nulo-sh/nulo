# Phase 2b: viewers in shadow roots, `style-src` without `'unsafe-inline'`

## Release (2026-10-16)

The orchestrator released arc 2b with a correction: its earlier message ("struck: P12-03 was vetoed") was wrong. Page 12's sign-off record (2026-10-15T14:16Z) holds P12-03 = null, the page's value for a veto-list item the owner left standing, as P12-02 and P12-04, both of which shipped; #101's Decision block reads "accepted from the veto list". So A6 and D28 resolve: this arc builds item 15, its PR says `Refs #101`, and the close-out PR says `Closes #101` (D-orch-11). R3 holds nothing (#212 closed by #255 on 2026-10-10); R5 holds nothing (#156 shipped in #534). Branch `chain-endpoints-2b` off `chain-endpoints-close-out` (78d22cca), dev merged at 7697c376.

## Build notes (2026-10-16)

- Presto banner is 1.2.0 now (the plan read 1.1.0). Its `<style>` is still one module constant, 15,999 characters, `sha256-C0kfQfSj0nK8EHJVnIUHaTi2TjSzbRaDjpU61ugGI9o=`; `src/manifest.test.ts` re-hashes it from the element rendered in jsdom with onboarding's attributes.
- jsdom 29 has constructable `CSSStyleSheet` with `replaceSync`, but `ShadowRoot` has no `adoptedStyleSheets`. The helper's assignment becomes an expando, which sends style-mod down its adopted-sheet path as a browser does, so no stub is needed (the plan expected stubs).
- Vitest returns an empty string for any CSS import, `?inline` and `?raw` included, unless `test.css.include` matches the id; a `$`-anchored pattern never matches, because the id carries the query. The unit config now includes `editor-shadow.css` only.
- The JSON window is reachable only from the execute window's `execute-show-json-btn`, with a dApp interaction held in the background's memory: smoke cannot open it without faking the background port. The inline viewer (DataViewerPopup) is reachable in smoke through `import-errors-scroll`.
- Step 7 scan of both new dists: no `style="` or `style='` in any JS or HTML, no `setAttribute("style"`; `createElement("style")` only in style-mod's fallback (not taken where `adoptedStyleSheets` exists) and `<style` only in the banner chunk (hashed). I7 holds.
- A test that mounts LogsViewer must attach it to the document (`attachTo`): its listeners are on `document`, so a detached mount passes a focus case vacuously.

## Panel on the test shape and the seams (2026-10-16)

Codex (gpt-6.1-sol, high, read-only; session `01a14518-cfde-7880-97bf-c8a82af35680`) and an Opus Plan agent, on the same prompt (test placement, the copied rules, testids, the dev server, adversarial ask).
- Both: the split of D33; the verbatim copy with a drift test (D34); the serve-only branch on `command` (D36).
- Codex found D37: focus-trap 8.2.2 / tabbable 6.5.0 skip open shadow roots unless `getShadowRoot` is set, so DataViewerPopup's Tab cycle lost the editor. Accepted.
- Codex: the drift test must pin the exact selector list, not "each carried rule exists somewhere". Accepted.
- Opus: add the two network files that open a viewer to the gate; the `type-roles` fixture's `.cm-editor` clause is dead (its TreeWalker never enters a shadow root); the build guard D38; one comment on why the helper assigns before the editor mounts; a unit pin of the Chrome wrapper's policy. All accepted.
- Split on testids (D35): Codex, host testids plus documented `cm-` classes as one exception; Opus, testids through `EditorView.contentAttributes` and `scrollDOM` with only the search panel excepted. Chose Codex's: one rule for the vendor boundary.

## Probe, shots and computed styles (2b.1-2b.3, 2b.9; 2026-10-16)

A scratch harness outside the repo ran the e2e fixtures against cached armed dists: the base (7697c376 merged) and the arc's build, Chrome and Firefox, at load1 < 150 (one Chrome base pass started at 158). Deviation: step 1's probe ran on the arc's own build rather than a separate scratch extension; it was the same change.
- Positive control (new build, both browsers): the viewers' editors sit in shadow roots with two adopted sheets and no `<style>` in the head; the onboarding's Presto banner paints its hashed `<style>` and it applies (host `display: block`, card radius 20px), with no violation recorded. I6 holds on Firefox.
- Negative control (both browsers): an unhashed `<style>` in the head, one in a shadow root, and a `style` attribute set by script are each refused, and the recorder lists all three (`style-src-elem` twice, `style-src-attr`).
- Rules the editors matched in the base build: the `*` reset, `scrollbar-width`, `::-webkit-scrollbar`, JsonViewer.vue's `::selection` (loaded in every popup document, the logs window included), and with the search panel open `button` and `input`. That is `editor-shadow.css`'s list.
- Shots: logs window, JSON window and DataViewerPopup, both themes, both browsers. Twelve pairs, zero differing pixels. The first data-viewer pair differed in 508 pixels, all in the header's account address behind the scrim (a new random profile each run); the shot is clipped to the viewer since.
- Computed styles of every editor element (search panel open as well): identical, except the `::selection` colour Chrome reports for the two search-panel containers (`rgb(255,255,255)` after, the editor's grey before). Their own text is the spaces between controls under `user-select: none`; every label, button and input matches. Nothing paints it.
- Tab order in DataViewerPopup, base: editor ↔ Close. The arc's build matches with the trap fix (D37).
- `innerText` of the `data-viewer` testid no longer includes the editor's text (Chrome returned only "CLOSE"), so both specs that read it now read the editor's content inside its shadow root.
- The JSON window's payload was answered by a page-level fake of the background port in the harness only; Firefox ignored a preload script there, so the harness patches both `chrome.runtime` and `browser.runtime` after load and routes by hash.

## Dev server (2b.6; 2026-10-16)

`bun run dev` on Chrome, the popup opened from the served extension with a `securitypolicyviolation` listener: with the serve branch the served manifest carries `style-src 'self' 'unsafe-inline'`, the popup renders in IBM Plex Sans and nothing is recorded. With the branch disabled for one run the served manifest carries the hash, the popup falls back to DejaVu Sans and one `style-src-elem` violation is recorded. So D36's branch is needed, and `manifest.test.ts` pins both build modes strict.

## Round 1 and the first smoke run (2026-10-16)

- Codex (session `01a1455f-a401-74f0-9b60-afb170596547`) and Opus: approve with fixes, all accepted (plan § Audit verdicts). Popup `console.info` does reach the logs viewer: `installConsoleForwarding` sends it under source `ui`.
- First Chrome run of the new smoke cases, three failures, none from the arc. A drag probe on the base and the arc's build (scratch, Chrome) gave the same results on both:
  - After a mouse selection, `selectionchange` fires on the document with a non-collapsed selection in both builds, yet three new lines are still followed (gap 0). So "selecting stops the follow", read over several lines, does not hold on the base either. The spec reads the follow off one new line.
  - In DataViewerPopup, a drag over `"account-state"` copies exactly that token in both builds once the popup has settled. The spec had measured while the popup was still animating in, and its copy ran two lines past the token. The spec now waits until the editor's box is still for five frames.
  - The logs window rested 2px from the end once (`< 2` failed); "at the end" is now under 10px, below one line (18.2px).
- A dispatched `ClipboardEvent` replaces `execCommand("copy")`: CodeMirror 6.43.9 fills `clipboardData` from its own selection and checks neither `isTrusted` nor user activation.

## The second smoke run: a regression the unit test could not see (2026-10-16)

- Opening the logs search panel stopped the follow on the base build (one new line: gap 47px, scroll button shown) and not on the arc's (gap 1px). The document's `focusin` log showed why: the base heard `cm-textfield`, the arc only `cm-content`. Focus moving from the content to the search field stays inside one shadow root, and at the document the target and the related target both retarget to the host, so the spec drops the event there before the document hears it. The fix listens on the shadow root, which hears the true target.
- The unit test dispatched `focusin` with no related target, which the document hears either way, so it passed on the broken code. It now dispatches with a related target inside the root; jsdom truncates the path as browsers do, and the document listener fails it (negative control run).
- After a mouse selection, the base build follows the next line too (gap 0px, no scroll button), as the arc does. The plan's "selecting log text stops auto-scroll" is behaviour the wallet does not have, so the arc cannot regress it. An ordered-event probe on the base: the selection does stop the follow, and the new line lands unfollowed with the scroll button shown (gap 19px); about 5 ms later the editor sits at its end with no call from the viewer (gap 0 at the next `selectionchange`), and the viewer's scroll handler, seeing the end, re-arms the follow. A follow-up for the viewer, not this arc.
- The two import-errors cases that failed in this run timed out in `settleLaunchedExtension`, at launch, before any step of theirs ran, with load rising from 139.
- Codex round 2 found the same retargeting one layer out: the snack's focus return stored the card `focusin`'s related target, the editor's host. Every light-DOM reader of a focus event's target or related target sees the host for focus inside a viewer; the fix (D41) reads the departed element from a capturing document `focusout`, whose `composedPath()[0]` is the real one in an open root.

## The whole smoke (2026-10-16)

- `type-roles.test.ts` planted an off-role size with `style="font-size: 12px"` in markup it set through `innerHTML`; `style-src` now refuses the attribute, so the judge saw no off-role size and the case failed in 1.3 s. Step 7 scanned the bundle, not the specs. The size is set through the CSSOM now, which CSP allows; no other spec parses a `style` attribute or adds a `<style>` (the rest write `style.cssText`).
- Network Chrome: the full-screen JSON step failed in `clickByTestId`, which calls `click()` on its target, and `execute-show-json-btn` is an `Icon`, an `<svg>`, which has no `click()`. No spec had clicked it before. The step clicks the element handle with the pointer instead.
- The whole smoke's other failures: on Chrome, contacts-import, legal-acceptance S10 and passkey-retry timed out at launch (`settleLaunchedExtension`) with load at 510; on Firefox, security-reset's purge missed its 15 s budget. None reads a viewer or a style.
- The pointer click failed too, on both browsers: no JSON window opened. A diagnostic run hooked `chrome.windows.create` and a capturing `click` listener in the execute window: Puppeteer returned no bounding box for the `<svg>` and the handle's click raised no click event. The step opens the JSON window at its own URL with the live request id (`?requestId=…#/windows/json`), as `showJson` builds it, and passes on Chrome (28.6 s). The button itself is the execute window's, outside this arc.
