# Phase 3: docs, the end-to-end gates and the review loop

## Gates

- `bun run test:all`: every workspace green.
- Smoke on the armed source builds, retry 0: Chrome 44 pass and 1 Firefox-only skip (`type-roles.test.ts`'s toolbar panel) in 313 s; Firefox 45 pass in 510 s. This arc adds no e2e scenario (D14).
- Network: `fiat-send.test.ts` and `register-token.test.ts`, 3 pass, 117 s including the sandbox boot.

## Codex R1 (gpt-6.1-sol, high, fresh session): approve

Two Low comment findings, both verified: `price-map.ts`'s header said an out-of-band quote could not survive in the cache, but a row a later list's narrower band excludes stays stored and is only never served; the comments above `isValidQuote` and `withinTable` restated their one-line bodies. Both fixed. No functional or security finding.

## Opus diff review (general-purpose, opus, beside R1): conditional approve

Six Low findings, all verified in the tree and accepted: the write-time refusal test proved only the read side, since `withinTable` would drop the bad quote anyway (now it seeds an in-band stored row and asserts the bad reply leaves it; a mutation dropping `inBand` from `isValidQuote` turns it red); `PriceQuote.usd`'s comment still named a per-id band; `PRICE_ID` and `FEED_ID` were one regex spelled twice (now `FEED_ID`, exported once); wallet mode's refusal of a non-object or over-cap map was unstated in `parse.ts` and FORMAT.md; the `feedFault` deviation was unlogged; two fixture comments named a future publish.

## Codex R2 (resume): approve

Verified the eight fixes; the strengthened test separates write-time refusal from read-time filtering. No new finding.

## Codex R3 (resume, over the Privacy 1.2.8 patch): approve

The owner answered OA-1 (A) and OA-2 (the proposed § 5.2 wording) after R2, so the patch landed in this PR. Codex checked it against `legal/README.md`, the archive rule and the Terms 1.2.1 precedent, and the new sentence against the built request (the held list's accepted feeds plus `aztec`). No finding.

## After the PR opened

- CodeQL (`js/incomplete-sanitization`, high) flagged `service.test.ts`'s fixture, which built a `__proto__` row by replacing the first `{` of a JSON string on purpose. It was a false positive, but it would have left an open alert on `dev`. The rows are now joined as literal JSON, and the test still proves an inherited name reads as absent.
