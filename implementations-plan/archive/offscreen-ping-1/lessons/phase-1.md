# Phase 1: reproducers, red first

Base code `5711a1bc3` (plan commit `ec62417f6` on top changes no code).

`cd apps/extension && bun --bun vitest run src/wallet/services/pxe/busy-document.test.ts src/wallet/utils/offscreen.test.ts`, 2026-10-22: 2 failed, 27 passed.

- `offscreen.test.ts` › "a document this worker heard answer is not pinged again": `expected "vi.fn()" to not be called with arguments: [ 'OFFSCREEN_PING' ]` (1 call). The worker pinged a document whose READY it had heard.
- `busy-document.test.ts` › "a busy document finishes the call it runs and the next one": `expected "vi.fn()" to not be called at all` on `closeDocument` at +4.1 s (1 call). The missed 3 s ping closed the document A was running on.

Both fail on their assertion, not on a timeout; the offscreen case drives its pass to the end first, so nothing leaks into later cases.

**Corrected in review (Codex impl r1 #1).** The busy case above made the document busy before A was sent, so on base A waited on its own ping and ran on the replacement: it proved the replacement, not that a running call was stranded. The case now lets A reach the wire (asserted) and holds the thread on it. Re-run on base (`offscreen.ts` and `pxe/client.ts` from `5711a1bc3`, the two token exports stubbed): red on `closeDocument` at `busy-document.test.ts:178`, 1 call, with A on the wire first.
