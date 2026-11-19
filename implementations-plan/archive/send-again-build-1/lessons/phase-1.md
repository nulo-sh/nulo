# Phase 1: the build, its review and its gates

- The build spec's amount hook (`update:modelValue`) failed its first USD case: a dollar figure reaches the model only after the card's 250 ms conversion. The card's own `edit` event replaced it (plan D2a).
- A test named `TransferType.PrivateToPrivate`, which the enum lacks (`Private` is member 0): the record parsed with no sides and offered no row. Vitest does not typecheck; `typecheck:all` caught the other two slips.
- Codex consult, one bounded pass at `97dd4759e`: three findings, all accepted (plan § Audit verdicts). Fixes at the next commit, each test run red on the code before it.
- Gates at `97dd4759e`: smoke `send-keyboard.test.ts` Chrome 6/6 (55 s), Firefox 6/6 (123 s); network `fee-methods.test.ts` Chrome 8/8 (414 s), Firefox 8/8 (768 s). The fixes' head is covered by the reruns the PR body lists.
