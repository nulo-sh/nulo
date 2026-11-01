# Phase 2: the playground exercises the fields; one e2e scenario

- **Gate (2026-11-01).**
  - `cd apps/playground && bun test`: 3 pass. `bun run lint`: exit 0. `bun run typecheck:all`: exit 0.
  - The five network files, proverless (D12), each run at `--retry=0` with 9 of 9 green:
    - Chrome: 449 s wall-clock, 331 s of tests.
    - Firefox: 486 s wall-clock, 402 s of tests.
  - On Firefox, the sandbox node logs a world-state FATAL after the run, while it is being stopped. That is teardown, not a test failure.
- **Scenario runtime** (vitest's per-file duration, estimate 120-150 s): Chrome 48.6 s and Firefox 51.8 s proverless; Chrome 72.5 s prover-ON.
- **Red with each fix reverted** (Chrome, prover-ON):
  - With `dapp-send-executor.ts` at `51ea220b1`, the wait step reads `pending`: `expected [ 'checkpointed', 'proven', …(1) ] to include 'pending'`.
  - With the five strategies and the discoverer at `51ea220b1`, the additional-scope step fails at estimate. The execute window shows "Couldn't estimate fee. Try again." (`screenshots/before-execute.png`), and the dApp gets the wallet's constant error.
- **The after capture** (`screenshots/after-execute.png`) shows the window estimating. The discovered authorization reads "Lets Second call Transfer Private To Private on …": today's discovery labels the request with the sender, which is OA-1's question. Because this run's token is not in the wallet's list, the call line is the generic one.
- **Captures** come from a temporary, uncommitted screenshot step in the test, under an env flag. The committed test takes no screenshot.
- **Suite envelope before** (the e2e-testing skill's method, PR runs of another branch): Chrome 15 min (run 41347333880) and Firefox 19 min (run 41347333848).
- **Fix loop.** Codex R1 came back `clean`. Beside it, the Opus review found that a failed wait's error, which quotes the transaction hash and the node's reason, reached the `error` log line (D14), and that the scope list formed after the build's task completed. Both were fixed. With the category conversion removed, both new rows fail. Codex R2 verified the fix and raised the retrying client's transport logging, which is #432, a known limit the owner kept on 2026-10-15. Codex R3 came back `clean`.
