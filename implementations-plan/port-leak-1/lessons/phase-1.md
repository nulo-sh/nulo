# port-leak-1: phase 1

- Reproducer first: A and both B orders red against the base page (two account clients built, network and account never disconnected; chain 2's reads after leaving). Green after the change. With the fence removed, only B order (2) is red: it is the test that proves the fence.
- Gate red once: `bun run lint` refused `fetchAccounts` at cognitive complexity 21 (the base was at the budget, 15; each fence check adds its nesting). Fixed by moving the grouping to `addressesByChain` and a `continue` for a chain with no network (13); no suppression. `typecheck:all` refused the fixture's `accounts: []` (inferred `never[]`); typed `string[]`.
- E2E at retry 0, one run at a time: `type-roles-windows`, `connect-check-window`, `authwit-variants`, 11/11 on Chrome (340 s wall) and on Firefox (404 s wall).
