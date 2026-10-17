# Phase 2: one chain check per dispatch

- D2 as planned: one `await this.resolveNetwork(ctx)` after `enforceScopeFor`, before `routeHandlerMethod`.
- Harness: 32 tests failed on the shared empty `stubNetwork`, as the plan predicted. Six construction sites moved to a `servingNetwork` reader; their assertions did not change. Two sites keep the empty reader because `4901` is their answer. The profile-anchoring pin now lists both anchored reads (the dispatch check and the operation build) instead of one.
- New `describe`: seven routes refused on an empty reader with no collaborator touched, the same seven answered on a served chain reaching exactly their collaborators, the mid-batch recheck (three reads), and the capability-before-chain precedence row. Red/green: with D2 removed, the seven refusal rows and the batch test fail.
- Gate: `bun run lint` 0, `bun run typecheck:all` 0, `bun run --cwd packages/wallet-bridge test` 17 files, 766 tests passed.
