# Reading a dApp's call arguments on the approval card

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: a display-only decode of dApp call arguments in `apps/extension/src/wallet/services/execution/call-decoder.ts`, its types in `packages/wallet-bridge/src/decoded-call.ts`, and the card's reading order in `apps/extension/src/popup/windows/execute/call-surface.ts` and `CallArguments.vue`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Restore a readable execute-window approval card without loosening what the earlier approval hardening tightened: nothing is guessed. Each call is read in a fixed precedence, never a merge:

1. The wallet's own transfer and mint vocabulary, only on a contract the wallet registered as a token and only when the decoded function spells the same roles, order and kinds.
2. The contract interface the PXE holds, decoded by a display-only service-worker RPC. The function name comes from the selector, and the app's own `name` counts only when the wire carries no selector.
3. An explicit "can't read" warning with one line of reason, and the trimmed raw fields behind a toggle that starts closed.

The same argument block serves requested calls, discovered authorizations (behind their existing "Show details") and the create-authwit call intent. Execution is untouched: the decode feeds the display only, and execution still reads the stored request.

## Why

The hardening had replaced the parsed payload with raw 32-byte wire fields printed as untrimmed addresses, clipped by the card, and mints no longer matched the vocabulary. Every audit approved it and nobody looked at the screen, which is why the repository now requires explicit owner sign-off for any change to what a user sees.

A malicious dApp controls every byte of the request, so the worst a wrong reading may do is mislead, never change what executes. That drives the rules: the selector decides the name; a wire field (`0x` plus 64 hex) is an integer, never an address; token units apply only to the wallet's own vocabulary, because the wallet cannot know what a non-vocabulary function denominates and a wrong symbol is worse than none; a hidden sender or missing caller context never claims a sender, so the reading falls through instead.

Decoding in the popup was rejected: artifacts are large, the popup would need the ABI codec bundle, and the service worker already holds the PXE. The RPC returns a small projected tree instead.

The flat layout (group label, full-width call stack, key-left and value-right rows) was chosen over a folded headline variant. An empty "no added authorizations" line was removed, since a card should not announce what is absent.

## What shipped

- Mint recognition beside the descriptor-derived transfer vocabulary in `apps/extension/src/utils/token-transfer-vocabulary.ts` and `apps/extension/src/utils/transfer-intent.ts`, with wire fields read as integers.
- `decodeCallsForDisplay` on the execution service: at most 64 calls per request and 256 arguments per call, a check that the network belongs to the active profile, one cached artifact lookup per address, and a typed reason for every failure, so a hostile call cannot blank the card.
- Display bounds: strings that reach the DOM lose control and bidi-override characters, a requested call shows at most 32 raw rows (the rest stay in the JSON view), and a discovered authorization lists every row because the JSON view cannot show it.
- Component tests fed with wire-shaped arguments (`OperationCard.fallback.test.ts`, `call-surface.test.ts`, `call-decoder.test.ts`), so a card that only works on friendly values cannot pass.
- Open choices left at their defaults: discovered-authorization arguments stay collapsed, and Confirm is not gated on the decode finishing.
