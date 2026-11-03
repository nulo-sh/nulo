# Phase 3: docs, the end-to-end gates and the review loop

## Gates

- `bun run test:all`: every workspace green.
- Smoke on the armed source builds, retry 0: Chrome 44 pass and 1 Firefox-only skip (`type-roles.test.ts`'s toolbar panel) in 313 s; Firefox 45 pass in 510 s. This arc adds no e2e scenario (D14).
- Network: `fiat-send.test.ts` and `register-token.test.ts`, 3 pass, 117 s including the sandbox boot.

## Codex R1 (gpt-6.1-sol, high, fresh session): approve

Two Low comment findings, both verified: `price-map.ts`'s header said an out-of-band quote could not survive in the cache, but a row a later list's narrower band excludes stays stored and is only never served; the comments above `isValidQuote` and `withinTable` restated their one-line bodies. Both fixed. No functional or security finding.
