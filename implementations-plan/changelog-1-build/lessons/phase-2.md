# Phase 2

- `src/page.test.ts` now runs `build-changelog.ts` before `vite build` and requires `changelog/index.html` and `changelog/v1.2.0/index.html`.
- Captures (scratch script, registry-claimed port, production CSP): twelve frames, no horizontal scroll; no-script and reduced-motion show every card; Tab reaches both index links with the 2 px ring.
- First phone captures were 25 px off the signed frames in card padding: Vite emits `changelog.css` before `page.css`, so `.plate`'s padding beat the mobile `.k-card` rule at equal specificity. Fixed with `.cl .k-card`; the remaining 25 px is the dropped footer label.
- First smoke run refused at setup: `dist/chrome` was the plain build `audit:vue` had left, not the armed smoke build; rebuilt armed and reran.
- Fix loop round 1 (Codex gpt-6.1-sol high, fresh session; Opus 5.5 diff review beside it):
  1. Both: a raw `<p>` block in the notes keeps a literal `"`, and the stripped lead went unescaped into the meta description, so `<p>0;url=…" http-equiv="refresh</p>` built a meta refresh (demonstrated in the generator output). Fixed: the shell encodes `"`; regression test on that payload.
  2. Both: a TOML syntax error did not name its file (demonstrated). Fixed: the parse error is prefixed with the file.
  3. Opus: `&mdash;` passed the source-only em dash check (demonstrated). Fixed: the check reads the rendered notes. An unclosed lead `<p>` is refused too.
  4. Codex: comments that restated the sheet's structure, and a long check comment. Trimmed.
- Fix loop round 2 (Codex, resumed): one finding, demonstrated: a raw HTML block keeps `&mdash;`/`&#8212;`/`&#x2014;` as written, past the rendered literal check. Fixed: the check matches the dash and its entity forms; regression case.
- Fix loop round 3 (Codex, resumed; the last round the cap allows): one finding, demonstrated: `&#8212` with no semicolon in a raw HTML block still displayed an em dash. Fixed at the cause, not by another pattern: Bun's markdown text decodes every reference and re-escapes only `&amp;` `&lt;` `&gt;` `&quot;`, so the notes now refuse any other reference (raw HTML only), with a control that markdown text keeps its `&`, quotes and decoded references. The cap stops the loop here; the fix is proven by its tests, not re-reviewed.
