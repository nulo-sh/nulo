# Phase 8: window and card

- `#508`'s card (`d461b059`) already split `send_transaction` from `aztec_sendTx`; the grant's group sits in a `<template v-if>` around the Payload row, since a `v-for` between `v-if` and `v-else-if` breaks the chain.
- `OperationActionRow` gains `hideArgs`: the send card sets it; a `simulate_transaction` card keeps its argument text, as it renders no grant group.
- `full` covers every branch a grant reaches: the explicit sender, the recipient, the nonce, decoded parameters and raw rows (a text row now carries `full` too). The `this account` sender is left as is: only a call read with caller context reaches it, and the grant card passes none (documented on the prop).
- Row names: under `full` the name keeps its width (`flex-shrink: 0`) up to half the row, so a whole value cannot squeeze `FROM:` onto two lines, and a 32-glyph ABI name still breaks inside the card.
- The refusal's tooltip is `rawNotice(reason)`, the card notice's one source (OA-G1 A).
- A `.fixture.ts` is in the identifier inventory's producer scan (it skips only `*.test.*` and stories), so the grant op lives in its test file; a fixture carrying `kind: "send_transaction" as const,` or `kind: "add_public_authwit",` re-pins two producer sets.
- `identifier-sites.expected.json`: two full-print entries added (sender, recipient, state "a grant on a registered token"), five re-keyed to their new branches and expressions.
- Mutations: dropping `approve()`'s grant guard reds 6 window cases; feeding the refusal through `processingError` reds 5.
- Gate: `bun run audit:vue` 0 (804 files), `bun run test:all` 0, `scripts/complexity-baseline/manifest.json` unchanged.
