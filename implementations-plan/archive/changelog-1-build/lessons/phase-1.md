# Phase 1

- `bun run --cwd apps/landing test`: first run red, `Failed to resolve /src/changelog.ts` from the generated pages; the entry and stylesheet moved into this phase, then green (203 passed, 1 skipped: the launch gate).
- Bun 1.4.2 probes: `Bun.markdown.html` escapes `"` as `&quot;` and `&` as `&amp;` in text, `'` stays raw; `Bun.TOML.parse` reads a bare `date = 2026-11-05` as the string `"2026-11-05"`.
