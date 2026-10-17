# docs-1 phase 3: #667

- `getEntropy` names the unknown word's 1-based position (`wordIndex + 1`), never the word.
- Red/green: the new test fails on the base `mnemonic.ts` (the message carries the marker word) and passes with the fix.
- Gate: `bun run lint` 0; `bun run --cwd packages/wallet-core test` 318/318; `bun run test:all` 0; `bun run typecheck:all` 0.
