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
