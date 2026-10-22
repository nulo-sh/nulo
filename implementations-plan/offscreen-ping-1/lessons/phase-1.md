# Phase 1: reproducers, red first

Base code `5711a1bc3` (plan commit `ec62417f6` on top changes no code).

`cd apps/extension && bun --bun vitest run src/wallet/services/pxe/busy-document.test.ts src/wallet/utils/offscreen.test.ts`, 2026-10-22: 2 failed, 27 passed.

- `offscreen.test.ts` › "a document this worker heard answer is not pinged again": `expected "vi.fn()" to not be called with arguments: [ 'OFFSCREEN_PING' ]` (1 call). The worker pinged a document whose READY it had heard.
- `busy-document.test.ts` › "a busy document finishes the call it runs and the next one": `expected "vi.fn()" to not be called at all` on `closeDocument` at +4.1 s (1 call). The missed 3 s ping closed the document A was running on.

Both fail on their assertion, not on a timeout; the offscreen case drives its pass to the end first, so nothing leaks into later cases.
