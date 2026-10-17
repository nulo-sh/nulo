# Phase 2: docs, e2e, "after" shots

## Review loop

- **Round 1, Codex** (`gpt-6.1-sol`, high, session `01a1473a`, started with Phase 2 over the arc diff at `6860b443`): `conditional approve`, 2 findings, both accepted (`27bc817f`).
- **Round 1, Opus** (general-purpose, same diff): `conditional approve`, 8 findings, all accepted, one as OA-5 (`08d42bd1`). The useful catch: a glyph that was a Material `<span>` now matches `svg`-only hover rules, so RowAction's hover colour reached two glyphs it never touched.

## Sheet capture

The `Core / Icon` sheet story overflowed Storybook's popup-width wrapper; `width: max-content` on its grid. Captured from `storybook-static` through puppeteer request interception (no port), light and dark at device scale 2.
