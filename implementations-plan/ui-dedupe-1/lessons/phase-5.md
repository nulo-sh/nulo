# Phase 5 (arc A5): lessons

## Release check (2026-10-18)

- Branch `ui-dedupe-1-a5` off `dev` at `46df7df9`; A3 merged as #737, #678 and #707 merged. Lockfile unchanged.
- Recon's #548 table rebuilt: #678 changed Holdings' total and meta pricing and BalanceView's tap-to-copy, #707 did not touch Select token. No mirror rule moved.
- A finer read than recon's table found what it had folded away: Holdings and Select token have no dirty refetch; Holdings gates a known-id update by scope (CRUD's `accept`); Select token's no-scope load sends no request and fences the read still out; Holdings reads twice on mount (setup, then the first connect); `onConnected` fires in a task after Ready, the first connect included (`packages/extension-messaging/src/background/client.ts`).
- Codex consult (gpt-6.1-sol, high, read-only, session `01a14c71-04f7-7f23-a142-524fc0ab38a5`): F1 and D-a to D-f, D-h, D-i agree; D-g rejected. Send's Added cannot converge on chain scope and id dedupe: a token id is reused after the highest token is deleted (`nextNumericId`, max+1), and a balance id after a worker restart (`allocateIdAvoiding` forgets the fenced ids). Both verified in the tree. Send keeps its rule as `added: "append"`, pinned by a new Send case.
- Codex also qualified D-e: Holdings' no-account read settled a microtask later under CRUD. Nothing renders between, so it converges (D510).

## Implementation (2026-10-18)

- The hook passed Biome's cognitive budget only with `land()` kept as its own function; the event handlers moved to a module-level `tokenBalanceEvents()` to keep the hook under 80 lines.
- `send.test.ts`'s balance-client mock has no `onConnected`, so `reconnect: "off"` must not touch it, in `dispose()` too.
- Proof the new page cases test the pages, not the change: with the base `holdings.vue`, `send.vue` (and `send-balance-events.ts`) and `SelectTokenPopup.vue` restored over the new tests, all three suites stay green (113/113, Select token 16/16, Send 80/80).
- Mutation run: 17 mutations of the hook's options and the parents' wiring each turn a case red. The first run left one green (Send without `append`); the id-reuse Send case closed it.
