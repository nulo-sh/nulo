# exec-prices-1 phase 1 (arc A1)

- Lint caught a format-only diff twice (a long cast, a helper moved to file scope): `biome format --write` on the file, then commit. The pre-commit hook refuses an unformatted staged file.
- Red/green: with only `usePrices.ts` taken from `e7192fa8d`, 9 tests red: seven window tests on `[reads, refreshes]` (`[1, 1]` for `[1, 0]`), the two `usePrices` window-mode tests on the cache read (quotes not adopted, `settled` false). Restored: green.
- `send.integration.test.ts` builds two price clients on Send, the page's then the card's (parent setup runs before the child's); the success control pins `[1, 1]` refreshes, then `[2, 2]` after a reconnect.
- Fix loop: Codex round 1 findings (guard P2 + comment P3s), Opus review findings (same P2 + P3s); Codex round 2 clean.
