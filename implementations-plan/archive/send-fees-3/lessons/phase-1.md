# Phase 1: before pictures

- The capture spec and its config live outside the repo. A config there cannot resolve `vitest/config`, and a spec there cannot resolve `vitest`: the config spreads the smoke config's object (`test.dir` set to the capture directory) and the spec imports `vitest` and every fixture by absolute path into the worktree.
- With the node stand-in (400 at once), Send's fee read on a fresh private account comes back without a balance: the card shows "Couldn't check your private gas. Pick a fee source to continue." (a hold), not a failure line. A failure line ("Couldn't load fee data. Retrying in the background.") needs the read to time out: the spec redirects the Testnet origin to a silent `listenClaimed` listener before opening Send.
- The smoke wallet holds no token balance, so Send's amount field is disabled (`AmountCard.vue`, `:disabled="!tokenBalanceByType"`); a seeded balance row did not enable it. The "amount typed" state is proven by `FeeCostReadout.test.ts` and `send.test.ts`, not pictured.
- Run: base 993b3efc + plan, armed Chrome build; 3 tests green; 14 PNGs (7 states, light and dark), each opened and checked.
