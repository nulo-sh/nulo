# og-cards-1: phase 2 (the tags, the copy, the docs)

- 2026-11-10: `ChangelogPage.card` carries `{ source, path, alt }`, so the page's `og:image` URL and the build's copy target come from one value; `CARD_WIDTH`/`CARD_HEIGHT` moved to `changelog-pages.ts` (the page declares the size the renderer must produce), which left every card's document hash unchanged (`og:cards` rendered 0).
- The index alt names `releases[0]` (what the page lists), not the newest TOML the card shows: the existing pin "a production page never names a draft" would otherwise red during the promote window (OA2).
- `bun run --cwd apps/landing build` exit 0; `dist/changelog/v1.2.0/index.html` carries the 13 tags, and the three cards in `dist/` are byte-equal to `content/changelog/`.
- `test:all`, first run: one extension test outside this diff (`profile/service.integration.test.ts`, "changeProfilePassword REFUSES when the stored MAC does not cover the dek") timed out at 5 s with load1 at 347 on 188 cores; every other workspace passed, landing 233 passed. A 20-minute wait never saw load1 under 190, so the one retry ran at the load it found (233): exit 0, extension 18146 passed, landing 233 passed.
- Fix loop round 1 (Codex gpt-6.1-sol high, plus one Opus review): accepted all findings, see plan.md § Audit verdicts. Generalizable: `spawnSync` keeps a 1 MiB stdout buffer and on overflow returns status 0 with only `error` set, so a JSON bridge must check `error` and keep its replies small (Bun 1.4.2).
- 2026-11-10, fix loop round 2 (resumed Codex): clean; converged.
