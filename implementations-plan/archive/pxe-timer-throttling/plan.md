# PXE host as a frame

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: On Firefox the PXE page is an iframe of the background page, in `apps/extension/src/wallet/utils/offscreen.ts`, with the host-state spec `apps/extension/tests/e2e/network/pxe-host-state.test.ts`, the restart spec `apps/extension/tests/e2e/network/firefox-background-restart.test.ts` and a guard in `apps/extension/scripts/e2e/firefox-driver.test.ts`. The background-kill follow-through is [firefox-background-kill](../firefox-background-kill/plan.md).
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Firefox hosts the PXE page as an `<iframe>` appended to the background page, not as a minimized window. Chrome's offscreen document is untouched. The three launch preferences that disabled timer throttling in the e2e suite are deleted, so the suite runs under the throttling users have. A guard test fails if a launch preference whose key mentions a timeout or throttling returns.

## Why

Firefox has no offscreen API, so the PXE lived in a minimized window. Firefox clamps a hidden window's timers to one per second, and the Aztec JSON-RPC client sends every batch through `setTimeout(sendBatch, 0)`, so every node call cost a second. A dApp send took about 26 seconds against about 3 with throttling off, and about 88 against 66 with in-browser proving. The prover itself was unaffected, and the suite hid the problem with the three preferences.

Throttling keys on document visibility. The background page is visible and a frame inherits that, so native timers behave natively with no timer replaced and upstream batching untouched.

Rejected: a worker-backed timer shim (it fragmented RPC batches, patched the engine host and left the window), patching the batch timer in the Aztec package (a per-version patch on the update pin surface), shipping Firefox as Manifest V2 (a second build pipeline), and silent audio to exempt the window (a tab audio indicator).

The frame lives at most as long as the background page. When the background ends, the wallet comes back locked, as strict security mode does on both browsers, and the PXE cold-starts on the first request after unlock. The background's periodic storage heartbeat is what keeps a Firefox event page alive, and a live frame keeps nothing alive by itself.

## What shipped

- The three Firefox branches (create, close, already-running) rewritten onto a frame. A token per frame, matched against the sender URL on the ready and pong messages, replaces the old per-background token, adopt broadcast and self-close listener, because a frame cannot outlive its parent document.
- A host-state check on both browsers: exactly one PXE host after a settled send, reporting `visible`, plus a built-manifest assertion that no web-accessible pattern matches the PXE page.
- A restart spec on Firefox: after the background is terminated, no frames remain, and after unlock a dApp reconnect and a send settle on exactly one new frame.
- The host and its lifetime rule documented in `ARCHITECTURE.md` and `apps/extension/tests/e2e/FIREFOX.md`.
