# emoji-grid-1 status

- 2026-11-19 recon: base 846f26379; InterVariable carries U+2B1C; 19 text-default symbols draw as text on this host (recon.md).
- 2026-11-19 design consult (Codex, gpt-6.1-sol high): narrowed selector, fixed 24 role (plan D1, D2).
- 2026-11-19 captures: before frames at 846f26379, Chrome 155 and Firefox 158, light and dark.
- 2026-11-19 arc 1: branch emoji-grid-1-a1 rebased onto origin/dev f336e0f22 (no touched file differs from 846f26379).
- 2026-11-19 gate 1 `bun run lint`: pass (one format fix in EmojiGrid.test.ts first).
- 2026-11-19 gate 2 `bun run typecheck:all`: pass.
- 2026-11-19 gate 3 design tests: 571/571 after re-pinning `base.css.test.ts`'s hash (the new `--font-emoji` line); `gen:tokens` leaves no diff.
- 2026-11-19 gate 4 extension tests (composite/general, windows/verify, three bans): 227 pass, 1 skip (the ban's dump mode).
