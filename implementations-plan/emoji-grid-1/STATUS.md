# emoji-grid-1 status

- 2026-11-19 recon: base 846f26379; InterVariable carries U+2B1C; 19 text-default symbols draw as text on this host (recon.md).
- 2026-11-19 design consult (Codex, gpt-6.1-sol high): narrowed selector, fixed 24 role (plan D1, D2).
- 2026-11-19 captures: before frames at 846f26379, Chrome 155 and Firefox 158, light and dark.
- 2026-11-19 arc 1: branch emoji-grid-1-a1 rebased onto origin/dev f336e0f22 (no touched file differs from 846f26379).
- 2026-11-19 gate 1 `bun run lint`: pass (one format fix in EmojiGrid.test.ts first).
- 2026-11-19 gate 2 `bun run typecheck:all`: pass.
- 2026-11-19 gate 3 design tests: 571/571 after re-pinning `base.css.test.ts`'s hash (the new `--font-emoji` line); `gen:tokens` leaves no diff.
- 2026-11-19 gate 4 extension tests (composite/general, windows/verify, three bans): 227 pass, 1 skip (the ban's dump mode).
- 2026-11-19 gate 5 `bun run check:plans`: pass.
- 2026-11-19 Codex pass (gpt-6.1-sol high) at a3875a2de: approve with changes; 3 findings, fixes in 0389a6078; verify round: approve.
- 2026-11-19 gates 1-4 rerun at 0389a6078: lint, typecheck, design 572/572, extension 227 pass + 1 skip.
- 2026-11-19 gate 6 smoke `type-roles.test.ts`: Chrome 14 pass + 1 skip (the Firefox-only panel test), 134 s, build of c36769373 (only comments, test names and `\u` escapes differ at 0389a6078); Firefox 15/15, 165 s, at 0389a6078.
- 2026-11-19 gate 8 captures: before at 846f26379, after at c36769373, Chrome 155 and Firefox 158, light and dark.
- 2026-11-19 gate 7 network (connect-check-window, connect-verify-mismatch, type-roles-windows) at 0389a6078: Chrome 10/10, 331 s; Firefox 10/10, 454 s.
