# Phase 2: keep the sides on an import

- `send.vue`: `keepAmountFor` renamed `keepFormFor`; both init functions take `keepSide` and skip only the default; the watcher passes the mark's verdict to both and clears the amount only without it. No complexity change (the `!keepSide &&` joins an existing `&&` chain).
- `bun run test src/popup`: 189 files, 3295 tests green, U1's two rows included. `bun run lint` and `bun run typecheck:all` exit 0.
- Network e2e `send-picker.test.ts`, retry 0: Chrome green, file 62.8 s (import case 17.4 s, the other 45.0 s); Firefox green, file 77.7 s (import case 19.7 s, the other 56.4 s). Firefox's stall watchdog logged a 24.1 s silence, below its limit.
- Smoke, retry 0, armed builds: Chrome green (`send-keyboard` 43.9 s, `token-list` 21.5 s, `send-fee-privacy` 26.0 s, `send-picker-add` 10.8 s); Firefox green (73.6 s, 41.3 s, 31.1 s, 18.5 s). The `token-list.test.ts` filter also matches `shipped-token-list.test.ts`, which skips itself without its env.
- `bun run test:all`: every workspace exit 0.
- Review loop: Codex round 1 approve (no finding); Opus approve with two comment fixes, applied; Codex round 2 (resumed) approve. Converged in two rounds.
- `origin/dev` merged (fee-race-1's arc 1, #1344): it touches the execute window and dApp services, not `send.vue`; the one conflict was both lanes' line in `implementations-plan/index.md`, kept both.
