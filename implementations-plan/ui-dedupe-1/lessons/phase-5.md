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
- Mutation run, first pass: 17 mutations of the hook's branches and of three parents' wrappers; one stayed green (Send without `append`), closed by the id-reuse Send case. That pass did not drop a parent's option, so it proved the hook's rules but not which view chose which (Opus, round 1).
- Second pass, after round 1: 27 mutations, the 17 plus every option each view passes removed or swapped (Holdings' six, Select token's three, Send's two). Each turns a case red. The new page cases still pass over the base pages (118/118).

## Review round 1 (2026-10-18)

- Codex (gpt-6.1-sol, high, read-only, session `01a14c83-34c6-7d52-8135-37e147e01115`): `findings`, one P3: the hook's doc promised the dirty refetch and the keep rule unconditionally, and three page comments restated their options. Fixed in `f5c7e92f`. No behaviour regression found; Codex traced Home's defaults, Holdings, Select token and Send against base in memory.
- Opus (general-purpose): `findings`, no behaviour difference. F1: Send's id-reuse case passed under `replace` too; it now asserts the selected token keeps its amount before the other token's row is read. F2: the parents' option choices had no page case; added below. Nits: the `mapRow` doc, a vacuous assertion in the `off` case, a test title naming a caller, D510's wording and two traces it lacked, the plan's § A5 body still naming `replaceOnAdded` (now points at D507–D509).
- Network `send-picker` on Chrome ran during the round at `f5c7e92f` (its build finished before the mutation pass edited any file): 1/1 in 191 s.
