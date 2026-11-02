# fu2-copy-1: phases 3 and 4 (arcs 2 and 3)

## Build

- Arc 2: tests red on the base copy (row text, glyph, spoken name), green after D7. `findAllComponents` on a `DOMWrapper` types its result loosely enough that `typecheck` refused an implicit `any`; reading the card's icons and filtering by the row's element is typed and reads the same.
- Arc 3: the ten entries pinned word for word in `glossary.test.ts` and the page test, red before, green after. The dotted term's hidden definition is part of the note's `textContent`, so the page test's note assertion now starts after "Proofs".

## Pictures

- The smoke harness shows Get started greyed until the funds load; `waitForHomeReminders` (the fixture `security-backup.test.ts` uses) waits for that, and the spoken name can be read only then, since a pending row is inert.
- A long Settings page clips an element screenshot under its sticky header; a viewport as tall as the list gives the whole Glossary.

## Review

- **Round 1, Codex** (gpt-6.1-sol, high, session 01a19df8): approve, no finding.
- **Round 1, Opus 5.5** (general-purpose): approve, two nits, both taken: the label comment overclaimed; a `computed` reading `useSlots()` can go stale, so the label is read at render.
- **Round 2, Codex** (resumed): approve.
- **Net pass, Codex** (fresh, gpt-6.1-sol, high, session 01a19e0a; arc 1's squash plus this branch, with the standard's two verbatim rules): approve. The label comment shortened (`9c538396a`, comment-only: both rebuilt bundles are byte-identical to the ones the smoke suite ran). Comment nits on arc 1's merged files rejected as settled; strict mode's sentence lives in two signed places, each pinned, with no wrong output.
- The arc rounds' prompts omitted the standard's two verbatim rules; the net pass carried them.
