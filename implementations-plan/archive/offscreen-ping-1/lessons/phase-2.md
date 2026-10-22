# Phase 2: the fix

## Adapting `offscreen.test.ts`

The first run after the fix failed 17 cases. Two causes, both expected by the plan:

- Trust leaked across cases (module state persists within a file) and within a case after its own READY, so cases that expect a ping saw none. Fixed by the `beforeEach` reset and the five marks (plan steps 2-3).
- The eight string pins read `String(e)` of the old plain `Error`. Each now reads the message of an `RpcTimeoutError` instance and fails on any other type; the expected strings are unchanged.

No assertion was removed; the one at "healthy frame is reused" gained `expect(sendMessage).toHaveBeenCalledWith(OFFSCREEN_PING)`.

## Mutations

Each new case was run against the fix with one mechanism removed (`bun --bun vitest run` on both files, 34 cases):

| Mutation | Red |
|---|---|
| `onTerminal` never marks | stops answering, token-scoped timeout, failed send |
| `markOffscreenUnanswered` clears whatever is current | token-scoped timeout, the U2 mark case |
| `onTerminal` forwards the whole tag to super | forwards the tag |
| Every terminal marks (answered errors too) | five cases, the Phase 1 busy case among them |

## Gate

- `bun run lint`, `bun run typecheck:all`: exit 0 (the one Biome warning in `offscreen.test.ts:27` predates this arc).
- `bun --bun vitest run src/wallet/utils/offscreen.test.ts src/wallet/services/pxe/`: 76 passed.
- `bun run test`: 907 files, 15,003 tests passed.
- `bun run test:all` at load 127: two extension cases failed, neither reachable from this change. `operation-estimate-reuse.pins.test.ts` timed out at 5 s; `send-order.composition.test.ts` read `pending` where its wait expects `queued` (it uses a stub PXE client, type import only). Both passed 3/3 alone and inside `bun run test`.
- `bun run test:all` rerun at load 127-177: exit 0, extension 15,003 passed.
